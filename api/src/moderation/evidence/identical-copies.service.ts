import { forwardRef, Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  PhotoStatus,
  Prisma,
  ReportActorRole,
  ReportClosedReason,
  ReportEscalation,
  ReportHoldReason,
  ReportQueue,
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { deleteObjectsWithDerivatives } from "src/photos/photo-object-deletion";
import { PHOTO_HASH_TIMEOUT_MS } from "src/photos/photos.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { CHILD_SAFETY_HOLD_DAYS } from "../moderation.constants";
import { escalationAlertFields, escalationLogName } from "../report-escalation";
import { EvidenceService } from "./evidence.service";

/** Copies removed per transaction: one linked report each, then one photo delete and one S3 batch. */
export const IDENTICAL_COPIES_CHUNK_SIZE = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The actioned reports whose image counts as removed, so that its identical
 * copies go with it (docs/moderation.md §7):
 * - any actioned intimate-image report, as the TAKE IT DOWN Act asks;
 * - a child-safety report on a photo the platform removed with a verdict on
 *   it. Stricter, because a match is held and pages about the person who
 *   uploaded it: a report closed because its whole event was deleted, or one
 *   about an event's cover, never judged that image.
 */
export const REMOVED_IMAGE_REPORTS: Prisma.ReportWhereInput = {
  status: ReportStatus.ACTIONED,
  OR: [
    { reason: ReportReason.NON_CONSENSUAL_INTIMATE_IMAGE },
    {
      reason: ReportReason.CHILD_SAFETY,
      targetType: ReportTargetType.PHOTO,
      closedByRole: ReportActorRole.PLATFORM,
      closedReason: { in: [ReportClosedReason.PHOTO_REMOVED, ReportClosedReason.MEMBER_REMOVED] },
    },
  ],
};

/** The escalation reason a copy's report carries, by the removed image's reason. */
const COPY_ESCALATION: Partial<Record<ReportReason, ReportEscalation>> = {
  [ReportReason.NON_CONSENSUAL_INTIMATE_IMAGE]: ReportEscalation.INTIMATE_IMAGE,
  [ReportReason.CHILD_SAFETY]: ReportEscalation.CHILD_SAFETY,
};

/** An actioned report of a removed image, the one its identical copies are removed under. */
interface RemovedImage {
  id: string;
  reason: ReportReason;
  resolvedById: string | null;
  holdUntil: Date | null;
  holdReason: ReportHoldReason | null;
  evidence: { id: string; sha256: string | null; objectS3Key: string | null } | null;
}

/** A copy's linked report, as its alert names it. */
type LinkedReport = { id: string; eventId: string };

type Copy = {
  id: string;
  eventId: string;
  s3Key: string;
  contentType: string;
  sizeBytes: number;
  addedById: string | null;
  event: { title: string };
};

/**
 * Identical copies of a removed image (docs/moderation.md §7): an intimate
 * image, which the TAKE IT DOWN Act asks for reasonable efforts to remove, or
 * a child-safety image, which must not stay up anywhere once the platform has
 * removed it. Every photo records the SHA-256 of its bytes at confirm, so
 * when the platform actions such a report (REMOVED_IMAGE_REPORTS), every
 * READY photo with the same hash, in any event, goes with it, and confirm
 * refuses the same bytes for as long as the report is kept.
 *
 * Each copy is removed under its own report, linked to the removal by its
 * hash and its moderator: an ACTIONED platform report written in the same
 * transaction that deletes the photo row, with an evidence snapshot, so the
 * copy goes through `preserveBeforeDelete` like any reported photo, keeps the
 * hash for the refusal, and is purged on the same retention clock. A copy's
 * row is deleted rather than hidden: an actioned photo is gone for everyone,
 * from lists, counts and thumbnails alike, without a new hidden state for
 * `PhotoVisibilityService` to learn.
 *
 * A child-safety copy's report is held for a year from its own removal, so
 * its evidence copy is kept for NCMEC and Cybertip.ca, and it pages: whoever
 * uploaded the copy is someone the platform has to look at, and may have to
 * report.
 */
@Injectable()
export class IdenticalCopiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly configService: ConfigService,
    // EvidenceService calls removeCopies from discardImages; this calls back
    // for snapshots and quarantine. Both live in EvidenceModule.
    @Inject(forwardRef(() => EvidenceService))
    private readonly evidenceService: EvidenceService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /**
   * Which of these hashes are of a removed image (REMOVED_IMAGE_REPORTS: an
   * intimate image, or a child-safety photo the platform removed), each with
   * the report that removed it: one closed within the retention window, or
   * still held. The hash lives exactly as long as the report. Confirm refuses
   * these bytes, and the hash backfill removes them as copies.
   */
  async findRemovedImages(hashes: string[], now: Date = new Date()): Promise<Map<string, string>> {
    const unique = [...new Set(hashes)];
    if (unique.length === 0) return new Map();

    const retentionDays = this.configService.getOrThrow<number>("moderation.reportRetentionDays");
    const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
    const rows = await this.prisma.reportEvidence.findMany({
      where: {
        sha256: { in: unique },
        report: {
          AND: [REMOVED_IMAGE_REPORTS, { OR: [{ resolvedAt: { gte: cutoff } }, { holdUntil: { gt: now } }] }],
        },
      },
      select: { sha256: true, reportId: true },
    });

    const removed = new Map<string, string>();
    for (const row of rows) if (row.sha256 && !removed.has(row.sha256)) removed.set(row.sha256, row.reportId);
    return removed;
  }

  /**
   * For the reports among these whose image counts as removed
   * (REMOVED_IMAGE_REPORTS), removes every READY photo with the same hash.
   * Returns the ids of the reports this closed: the linked report of each
   * copy and any OPEN report on it, so the caller discards their evidence as
   * it does the original's (an intimate image's goes; a child-safety image's
   * stays for its hold). Other reports are left alone. A report whose hash is
   * unknown removes nothing.
   */
  async removeCopies(reportIds: string[], now: Date = new Date()): Promise<string[]> {
    if (reportIds.length === 0) return [];

    const removedImages: RemovedImage[] = await this.prisma.report.findMany({
      where: { AND: [{ id: { in: reportIds } }, REMOVED_IMAGE_REPORTS] },
      select: {
        id: true,
        reason: true,
        resolvedById: true,
        holdUntil: true,
        holdReason: true,
        evidence: { select: { id: true, sha256: true, objectS3Key: true } },
      },
    });

    const closed: string[] = [];
    for (const removedImage of removedImages) {
      const sha256 = await this.hashOf(removedImage);
      if (!sha256) continue;
      closed.push(...(await this.removeCopiesOf(removedImage, sha256, now)));
    }
    return closed;
  }

  /**
   * The hash S3 computed while quarantining the image, or, when that copy
   * failed and the original was kept for the evidence job, the original's,
   * recorded on the snapshot so confirm can refuse it too.
   */
  private async hashOf(removedImage: RemovedImage): Promise<string | null> {
    const { evidence } = removedImage;
    if (evidence?.sha256) return evidence.sha256;
    if (!evidence?.objectS3Key) return null;

    try {
      const sha256 = await this.s3Service.sha256OfObject(evidence.objectS3Key, { timeoutMs: PHOTO_HASH_TIMEOUT_MS });
      await this.prisma.reportEvidence.update({ where: { id: evidence.id }, data: { sha256 } });
      return sha256;
    } catch (error) {
      this.logger.error(
        { err: error as Error, event: "report.identical_copies.hash_failed", reportId: removedImage.id },
        "Removed image could not be hashed; its identical copies were not looked for",
      );
      return null;
    }
  }

  private async removeCopiesOf(removedImage: RemovedImage, sha256: string, now: Date): Promise<string[]> {
    const closed: string[] = [];
    let count = 0;

    // Each round deletes the rows it found, so the next finds the rest.
    for (;;) {
      const copies: Copy[] = await this.prisma.photo.findMany({
        where: { sha256, status: PhotoStatus.READY },
        orderBy: { id: "asc" },
        take: IDENTICAL_COPIES_CHUNK_SIZE,
        select: {
          id: true,
          eventId: true,
          s3Key: true,
          contentType: true,
          sizeBytes: true,
          addedById: true,
          event: { select: { title: true } },
        },
      });
      if (copies.length === 0) break;

      const { linked, settled } = await this.prisma.$transaction((tx) =>
        this.removeRows(tx, removedImage, copies, sha256, now),
      );
      closed.push(...linked.map((report) => report.id), ...settled);
      this.alertOnChildSafetyCopies(removedImage, linked);
      await this.deleteObjects(copies, removedImage.id);
      count += copies.length;
      if (copies.length < IDENTICAL_COPIES_CHUNK_SIZE) break;
    }

    this.logger.info(
      {
        event: "report.identical_copies_removed",
        reportId: removedImage.id,
        reason: removedImage.reason,
        count,
        audit: true,
      },
      "Identical copies of a removed image removed",
    );
    return closed;
  }

  /**
   * One linked, already-actioned report per copy, with its snapshot; the
   * copies' OPEN reports close as the platform's verdict; then the rows go,
   * which hides every copy at once.
   */
  private async removeRows(
    tx: Prisma.TransactionClient,
    removedImage: RemovedImage,
    copies: Copy[],
    sha256: string,
    now: Date,
  ): Promise<{ linked: LinkedReport[]; settled: string[] }> {
    const closedBy = {
      closedByRole: ReportActorRole.PLATFORM,
      resolvedById: removedImage.resolvedById,
      resolvedAt: now,
    };
    const escalation = COPY_ESCALATION[removedImage.reason];
    const hold = this.copyHold(removedImage, now);
    const linked: LinkedReport[] = [];
    for (const copy of copies) {
      const report = await tx.report.create({
        data: {
          eventId: copy.eventId,
          eventTitle: copy.event.title,
          reporterId: null,
          targetType: ReportTargetType.PHOTO,
          photoId: copy.id,
          reportedUserId: copy.addedById,
          reason: removedImage.reason,
          queue: ReportQueue.PLATFORM,
          escalationReasons: escalation ? [escalation] : [],
          escalatedAt: now,
          status: ReportStatus.ACTIONED,
          closedReason: ReportClosedReason.PHOTO_REMOVED,
          ...hold,
          ...closedBy,
        },
        select: { id: true },
      });
      await this.evidenceService.writeSnapshot(tx, report.id, {
        objectS3Key: copy.s3Key,
        contentType: copy.contentType,
        sizeBytes: copy.sizeBytes,
        subjectUserId: copy.addedById,
      });
      await tx.reportEvidence.update({ where: { reportId: report.id }, data: { sha256 } });
      linked.push({ id: report.id, eventId: copy.eventId });
    }

    const copyIds = copies.map((copy) => copy.id);
    const settled = await tx.report.updateManyAndReturn({
      where: { photoId: { in: copyIds }, status: ReportStatus.OPEN },
      data: { status: ReportStatus.ACTIONED, closedReason: ReportClosedReason.PHOTO_REMOVED, ...closedBy },
      select: { id: true },
    });
    await tx.photo.deleteMany({ where: { id: { in: copyIds } } });

    return { linked, settled: settled.map((report) => report.id) };
  }

  /**
   * The hold a copy's report gets. A child-safety copy is held a year from
   * now, or for as long as the removed image is held if that is longer, so
   * its evidence copy outlives the copy for the authorities
   * (docs/moderation.md §7). Any other copy shares the removed image's hold
   * (law enforcement, child safety, legal advice).
   */
  private copyHold(
    removedImage: RemovedImage,
    now: Date,
  ): { holdUntil: Date | null; holdReason: ReportHoldReason | null } {
    if (removedImage.reason !== ReportReason.CHILD_SAFETY) {
      return { holdUntil: removedImage.holdUntil, holdReason: removedImage.holdReason };
    }
    const floor = new Date(now.getTime() + CHILD_SAFETY_HOLD_DAYS * DAY_MS);
    if (removedImage.holdUntil && removedImage.holdUntil > floor) {
      return {
        holdUntil: removedImage.holdUntil,
        holdReason: removedImage.holdReason ?? ReportHoldReason.CHILD_SAFETY,
      };
    }
    return { holdUntil: floor, holdReason: ReportHoldReason.CHILD_SAFETY };
  }

  /**
   * One `report.escalated` page per child-safety copy, as for any new
   * child-safety report (docs/moderation.md §9): whoever uploaded it is
   * someone the platform has to look at, and may have to report to NCMEC or
   * Cybertip.ca. The copy is already removed; the decision about its
   * uploader is still open. Logged once the transaction has committed.
   */
  private alertOnChildSafetyCopies(removedImage: RemovedImage, linked: LinkedReport[]): void {
    if (removedImage.reason !== ReportReason.CHILD_SAFETY) return;
    const escalationReasons = [escalationLogName(ReportEscalation.CHILD_SAFETY)];
    for (const report of linked) {
      this.logger.warn(
        escalationAlertFields(
          { id: report.id, eventId: report.eventId, reason: removedImage.reason, queue: ReportQueue.PLATFORM },
          escalationReasons,
        ),
        "Identical copy of a removed child-safety image needs platform attention",
      );
    }
  }

  /**
   * Best effort, like a verdict's photo delete: the rows are gone, so what is
   * left is storage, which the orphan reconciler also covers. Each copy is
   * quarantined under its linked report first.
   */
  private async deleteObjects(copies: Copy[], reportId: string): Promise<void> {
    const keys = copies.map((copy) => copy.s3Key);
    try {
      const { deletable } = await this.evidenceService.preserveBeforeDelete(keys);
      const outcome = await deleteObjectsWithDerivatives(this.s3Service, deletable);
      if (outcome.failed.length === 0) return;
      this.logger.warn(
        { event: "report.identical_copies.objects_retained", reportId, failed: outcome.failed.length },
        "Some identical copies' objects could not be deleted; the orphan reconciler will reclaim them",
      );
    } catch (error) {
      this.logger.warn(
        { err: error as Error, event: "report.identical_copies.objects_retained", reportId, failed: keys.length },
        "Identical copies' objects could not be deleted; the orphan reconciler will reclaim them",
      );
    }
  }
}
