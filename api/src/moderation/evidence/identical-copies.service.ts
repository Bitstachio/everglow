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
  ReportSource,
  ReportStatus,
  ReportTargetType,
} from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { fileAutomatedReport, logAutomatedReport } from "src/moderation/automated-report";
import { deleteObjectsWithDerivatives } from "src/photos/photo-object-deletion";
import { PHOTO_HASH_TIMEOUT_MS } from "src/photos/photos.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { EvidenceService } from "./evidence.service";

/** Copies removed per transaction: one linked report each, then one photo delete and one S3 batch. */
export const IDENTICAL_COPIES_CHUNK_SIZE = 100;

/** An actioned intimate-image report, the one its identical copies are removed under. */
interface RemovedImage {
  id: string;
  resolvedById: string | null;
  holdUntil: Date | null;
  holdReason: ReportHoldReason | null;
  evidence: { id: string; sha256: string | null; objectS3Key: string | null } | null;
}

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
 * Identical copies of a removed intimate image (docs/moderation.md §7). The
 * TAKE IT DOWN Act asks for reasonable efforts to remove them: every photo
 * records the SHA-256 of its bytes at confirm, so when the platform actions a
 * `NON_CONSENSUAL_INTIMATE_IMAGE` report, every READY photo with the same
 * hash, in any event, goes with it, and confirm refuses the same bytes for as
 * long as the report is kept.
 *
 * Each copy is removed under its own report, linked to the removal by its
 * hash and its moderator: an ACTIONED platform report written in the same
 * transaction that deletes the photo row, with an evidence snapshot, so the
 * copy goes through `preserveBeforeDelete` like any reported photo, keeps the
 * hash for the refusal, and is purged on the same retention clock. A copy's
 * row is deleted rather than hidden: an actioned photo is gone for everyone,
 * from lists, counts and thumbnails alike, without a new hidden state for
 * `PhotoVisibilityService` to learn.
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
   * Which of these hashes are of a removed intimate image, each with the
   * report that removed it: an actioned report closed within the retention
   * window, or one still held. The hash lives exactly as long as the report.
   */
  async findRemovedImages(hashes: string[], now: Date = new Date()): Promise<Map<string, string>> {
    const unique = [...new Set(hashes)];
    if (unique.length === 0) return new Map();

    const retentionDays = this.configService.getOrThrow<number>("moderation.reportRetentionDays");
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.reportEvidence.findMany({
      where: {
        sha256: { in: unique },
        report: {
          reason: ReportReason.NON_CONSENSUAL_INTIMATE_IMAGE,
          status: ReportStatus.ACTIONED,
          OR: [{ resolvedAt: { gte: cutoff } }, { holdUntil: { gt: now } }],
        },
      },
      select: { sha256: true, reportId: true },
    });

    const removed = new Map<string, string>();
    for (const row of rows) if (row.sha256 && !removed.has(row.sha256)) removed.set(row.sha256, row.reportId);
    return removed;
  }

  /**
   * For the actioned intimate-image reports among these, removes every READY
   * photo with the same hash. Returns the ids of the reports this closed: the
   * linked report of each copy and any OPEN report on it, so the caller
   * discards their evidence as it does the original's. Reports for any other
   * reason are left alone. A report whose hash is unknown removes nothing.
   */
  async removeCopies(reportIds: string[], now: Date = new Date()): Promise<string[]> {
    if (reportIds.length === 0) return [];

    const removedImages: RemovedImage[] = await this.prisma.report.findMany({
      where: {
        id: { in: reportIds },
        reason: ReportReason.NON_CONSENSUAL_INTIMATE_IMAGE,
        status: ReportStatus.ACTIONED,
      },
      select: {
        id: true,
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
        "Removed intimate image could not be hashed; its identical copies were not looked for",
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

      closed.push(...(await this.prisma.$transaction((tx) => this.removeRows(tx, removedImage, copies, sha256, now))));
      await this.deleteObjects(copies, removedImage.id);
      count += copies.length;
      if (copies.length < IDENTICAL_COPIES_CHUNK_SIZE) break;
    }

    this.logger.info(
      { event: "report.identical_copies_removed", reportId: removedImage.id, count, audit: true },
      "Identical copies of a removed intimate image removed",
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
  ): Promise<string[]> {
    const closedBy = {
      closedByRole: ReportActorRole.PLATFORM,
      resolvedById: removedImage.resolvedById,
      resolvedAt: now,
    };
    const linked: string[] = [];
    for (const copy of copies) {
      const report = await tx.report.create({
        data: {
          eventId: copy.eventId,
          eventTitle: copy.event.title,
          reporterId: null,
          // Nobody filed it: the platform found the copy (Report_user_source_has_reporter_check).
          source: ReportSource.AUTOMATED,
          targetType: ReportTargetType.PHOTO,
          photoId: copy.id,
          reportedUserId: copy.addedById,
          reason: ReportReason.NON_CONSENSUAL_INTIMATE_IMAGE,
          queue: ReportQueue.PLATFORM,
          escalationReasons: [ReportEscalation.INTIMATE_IMAGE],
          escalatedAt: now,
          status: ReportStatus.ACTIONED,
          closedReason: ReportClosedReason.PHOTO_REMOVED,
          // A hold on the removed image (law enforcement, child safety) holds its copies too.
          holdUntil: removedImage.holdUntil,
          holdReason: removedImage.holdReason,
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
      linked.push(report.id);
    }

    const copyIds = copies.map((copy) => copy.id);
    const settled = await tx.report.updateManyAndReturn({
      where: { photoId: { in: copyIds }, status: ReportStatus.OPEN },
      data: { status: ReportStatus.ACTIONED, closedReason: ReportClosedReason.PHOTO_REMOVED, ...closedBy },
      select: { id: true },
    });
    await tx.photo.deleteMany({ where: { id: { in: copyIds } } });

    return [...linked, ...settled.map((report) => report.id)];
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

  /**
   * Reports someone whose confirm was just refused for the bytes of a removed
   * child-safety image (docs/moderation.md §7): trying to post it again is
   * itself something the platform must see. Files one automated `CHILD_SAFETY`
   * MEMBER report on the uploader, in the event they tried to post to: in the
   * platform's queue, held a year from filing, and paging like any
   * child-safety report. `matches` is `findRemovedImages`' answer: hash to the
   * report that removed it. Matches of intimate images report nothing.
   *
   * The evidence is the hash, the type and size, and the uploader. The refused
   * bytes are not kept: they are the matched report's evidence copy, which is
   * held already, so the caller deletes them as it does any refused upload.
   *
   * One OPEN attempt report per uploader and event: a repeat while one is
   * OPEN files nothing and logs an audit line, so a retrying client doesn't
   * page again and again. Never throws: the refusal stands whatever happens
   * here, and a failure is logged as an error.
   */
  async reportRefusedUploads(
    eventId: string,
    uploaderId: string,
    refused: RefusedUpload[],
    matches: Map<string, string>,
    now: Date = new Date(),
  ): Promise<void> {
    const matchedIds = [...new Set(refused.flatMap((upload) => matches.get(upload.sha256) ?? []))];
    if (matchedIds.length === 0) return;

    try {
      const childSafety = await this.prisma.report.findMany({
        where: { id: { in: matchedIds }, reason: ReportReason.CHILD_SAFETY },
        select: { id: true },
      });
      const matchedReportIds = childSafety.map((report) => report.id);
      if (matchedReportIds.length === 0) return;
      const attempts = refused.filter((upload) => matchedReportIds.includes(matches.get(upload.sha256) ?? ""));

      const open = await this.prisma.report.findFirst({
        where: {
          eventId,
          reportedUserId: uploaderId,
          targetType: ReportTargetType.MEMBER,
          reason: ReportReason.CHILD_SAFETY,
          source: ReportSource.AUTOMATED,
          status: ReportStatus.OPEN,
        },
        select: { id: true },
      });
      if (open) {
        this.logger.info(
          {
            event: "report.removed_image_reupload.repeated",
            reportId: open.id,
            eventId,
            reportedUserId: uploaderId,
            matchedReportIds,
            attempts: attempts.length,
            audit: true,
          },
          "Another re-upload of a removed child-safety image; its OPEN report already covers it",
        );
        return;
      }

      const event = await this.prisma.event.findUnique({ where: { id: eventId }, select: { title: true } });
      const [first] = attempts;
      const report = await this.prisma.$transaction(async (tx) => {
        const filed = await fileAutomatedReport(
          tx,
          this.evidenceService,
          {
            eventId,
            eventTitle: event?.title ?? "",
            targetType: ReportTargetType.MEMBER,
            photoId: null,
            reportedUserId: uploaderId,
            reason: ReportReason.CHILD_SAFETY,
            note: refusedUploadNote(attempts.length, matchedReportIds),
            snapshot: {
              objectS3Key: null,
              contentType: first.contentType,
              sizeBytes: first.sizeBytes,
              subjectUserId: uploaderId,
            },
          },
          now,
        );
        if (filed) await tx.reportEvidence.update({ where: { reportId: filed.id }, data: { sha256: first.sha256 } });
        return filed;
      });
      if (report) logAutomatedReport(this.logger, report, { check: "removed_image_reupload", matchedReportIds });
    } catch (error) {
      this.logger.error(
        { err: error as Error, event: "report.removed_image_reupload.report_failed", eventId, matchedIds },
        "A re-upload of a removed image was refused, but its report could not be filed",
      );
    }
  }
}

/** A refused upload, as its attempt report describes it. */
export interface RefusedUpload {
  sha256: string;
  contentType: string;
  sizeBytes: number;
}

/** The most matched reports a note names; the column holds 500 characters. */
const NOTE_MAX_MATCHED_REPORTS = 8;

/** For the platform's reviewer: what was refused, and which removal it matched. Written by us, never by a user. */
export const refusedUploadNote = (attempts: number, matchedReportIds: string[]): string => {
  const named = matchedReportIds.slice(0, NOTE_MAX_MATCHED_REPORTS).join(", ");
  const more =
    matchedReportIds.length > NOTE_MAX_MATCHED_REPORTS
      ? ` and ${matchedReportIds.length - NOTE_MAX_MATCHED_REPORTS} more`
      : "";
  const photos = attempts === 1 ? "1 photo" : `${attempts} photos`;
  return `Upload refused: ${photos} with the bytes of the child-safety image removed under report ${named}${more}. The refused bytes were not kept; the matched report's evidence copy is the same image.`;
};
