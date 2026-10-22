import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, ReportReason, ReportStatus } from "generated/prisma/client";
import { PinoLogger } from "nestjs-pino";
import { ALERT_EVENTS } from "src/common/logging/alert-events.constants";
import { PrismaService } from "src/prisma/prisma.service";
import { S3Service } from "src/sdk/aws/s3/s3.service";
import { buildEvidenceS3Key } from "./evidence.constants";

/** What a new report was about, as written to its ReportEvidence row. */
export interface EvidenceSnapshot {
  objectS3Key?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
  subjectUserId?: string | null;
  /**
   * Record the subject's current avatar as the reported object: a member
   * report is how a profile photo gets reported (docs/moderation.md §7).
   */
  subjectAvatarIsObject?: boolean;
}

/** Which of the keys a delete path may now delete, and which it must keep. */
export interface PreservedKeys {
  deletable: string[];
  /** Keys whose evidence copy failed: the original stays, and the daily job retries the copy. */
  retained: string[];
}

export interface EvidenceJobResult {
  /** Failed copies retried this run, and how many now have their copy. */
  retried: number;
  quarantined: number;
  /** Closed reports past the retention window, deleted with their evidence. */
  purgedReports: number;
  purgedObjects: number;
  /** Reports whose evidence objects could not be deleted; the next run retries them. */
  purgeFailed: number;
}

type QuarantineCandidate = { id: string; reportId: string; objectS3Key: string | null };

/**
 * Keeps what was reported (docs/moderation.md §7). A report's snapshot is
 * written when it is filed; before any path deletes a reported object, the
 * object is copied to `evidence/{reportId}/…`, so deleting a photo never
 * erases what a report was about. The copies live as long as their report,
 * and the daily evidence job deletes both once the retention window has
 * passed, unless the platform holds the report.
 */
@Injectable()
export class EvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(this.constructor.name);
  }

  /**
   * Writes the snapshot of a report that was just created, in the caller's
   * transaction. The subject's username is copied now, since nothing would
   * say who they were once their account is gone.
   */
  async writeSnapshot(tx: Prisma.TransactionClient, reportId: string, snapshot: EvidenceSnapshot): Promise<void> {
    const subject = snapshot.subjectUserId
      ? await tx.userDetails.findUnique({
          where: { userId: snapshot.subjectUserId },
          select: { username: true, avatarS3Key: true },
        })
      : null;
    const objectS3Key = snapshot.subjectAvatarIsObject ? (subject?.avatarS3Key ?? null) : snapshot.objectS3Key;

    await tx.reportEvidence.create({
      data: {
        reportId,
        objectS3Key: objectS3Key ?? null,
        contentType: snapshot.contentType ?? null,
        sizeBytes: snapshot.sizeBytes ?? null,
        subjectUserId: snapshot.subjectUserId ?? null,
        subjectUsername: subject?.username ?? null,
      },
    });
  }

  /**
   * Call before deleting objects from S3. Copies every reported one that has
   * no evidence copy yet, and says which keys may be deleted. A key whose copy
   * failed must be kept: it stays an object no row points at, the orphan
   * reconciler leaves it alone (findKeysAwaitingQuarantine), and the daily job
   * retries the copy. Never throws.
   */
  async preserveBeforeDelete(keys: string[]): Promise<PreservedKeys> {
    if (keys.length === 0) return { deletable: [], retained: [] };

    let candidates: QuarantineCandidate[];
    try {
      candidates = await this.prisma.reportEvidence.findMany({
        where: { objectS3Key: { in: keys }, evidenceS3Key: null },
        select: { id: true, reportId: true, objectS3Key: true },
      });
    } catch (error) {
      // Without the lookup nothing says which keys are evidence: keep them all.
      this.logger.error(
        { err: error as Error, event: ALERT_EVENTS.REPORT_EVIDENCE_COPY_FAILED, keys: keys.length },
        "Evidence lookup failed; keeping every object of this delete",
      );
      return { deletable: [], retained: keys };
    }

    const retained = new Set<string>();
    for (const candidate of candidates) {
      if (!(await this.quarantine(candidate))) retained.add(candidate.objectS3Key!);
    }

    return { deletable: keys.filter((key) => !retained.has(key)), retained: [...retained] };
  }

  /**
   * For the intimate-image reports among these that were actioned: deletes
   * their evidence copies and forgets the objects they point at, keeping the
   * hash and the metadata. Keeping a copy would undo the removal the person
   * asked for (docs/moderation.md §7). Reports for any other reason, and
   * reports under a hold, keep their evidence. A copy that can't be deleted
   * stays referenced, and goes with the report's purge.
   */
  async discardImages(reportIds: string[], now: Date = new Date()): Promise<void> {
    if (reportIds.length === 0) return;

    const rows = await this.prisma.reportEvidence.findMany({
      where: {
        reportId: { in: reportIds },
        report: {
          reason: ReportReason.NON_CONSENSUAL_INTIMATE_IMAGE,
          status: ReportStatus.ACTIONED,
          OR: [{ holdUntil: null }, { holdUntil: { lt: now } }],
        },
      },
      select: { id: true, reportId: true, evidenceS3Key: true },
    });
    for (const row of rows) {
      try {
        if (row.evidenceS3Key) await this.s3Service.deleteObject(row.evidenceS3Key);
        // Without its key the original no longer counts as needed, so a copy
        // that failed is never retried and the reconciler may take the object.
        await this.prisma.reportEvidence.update({
          where: { id: row.id },
          data: { evidenceS3Key: null, objectS3Key: null, quarantineFailedAt: null },
        });
        this.logger.info(
          { event: "report.evidence.discarded", reportId: row.reportId, audit: true },
          "Intimate image's evidence copy deleted; its hash is kept",
        );
      } catch (error) {
        this.logger.error(
          { err: error as Error, event: ALERT_EVENTS.REPORT_EVIDENCE_COPY_FAILED, reportId: row.reportId },
          "Intimate image's evidence copy could not be deleted",
        );
      }
    }
  }

  /**
   * The subset of `keys` that a report's evidence still needs as the
   * original: its copy failed, or hasn't been made yet. For the orphan
   * sources, so the reconciler never deletes an object that is all a report
   * has left.
   */
  async findKeysAwaitingQuarantine(keys: string[]): Promise<string[]> {
    if (keys.length === 0) return [];

    const rows = await this.prisma.reportEvidence.findMany({
      where: { objectS3Key: { in: keys }, evidenceS3Key: null },
      select: { objectS3Key: true },
    });
    return rows.flatMap((row) => (row.objectS3Key ? [row.objectS3Key] : []));
  }

  /** The daily evidence job: retry failed copies, then purge what is past the retention window. */
  async runEvidenceJob(now: Date = new Date()): Promise<EvidenceJobResult> {
    const batchSize = this.configService.getOrThrow<number>("moderation.evidenceJobBatchSize");
    const result: EvidenceJobResult = {
      retried: 0,
      quarantined: 0,
      purgedReports: 0,
      purgedObjects: 0,
      purgeFailed: 0,
    };

    await this.retryFailedCopies(batchSize, result);
    await this.purgeExpired(now, batchSize, result);

    return result;
  }

  /**
   * Copies again what a delete couldn't, then deletes the original once
   * nothing references it any more: the delete that wanted it gone already
   * happened, and only the copy was holding it back.
   */
  private async retryFailedCopies(batchSize: number, result: EvidenceJobResult): Promise<void> {
    const failed = await this.prisma.reportEvidence.findMany({
      where: { quarantineFailedAt: { not: null }, evidenceS3Key: null, objectS3Key: { not: null } },
      orderBy: { quarantineFailedAt: "asc" },
      take: batchSize,
      select: { id: true, reportId: true, objectS3Key: true },
    });

    for (const candidate of failed) {
      result.retried += 1;
      if (!(await this.quarantine(candidate))) continue;
      result.quarantined += 1;

      const key = candidate.objectS3Key!;
      if (await this.isStillReferenced(key)) continue;
      try {
        await this.s3Service.deleteObject(key);
      } catch {
        // An orphan for the reconciler now: its copy exists, so nothing protects it any more.
      }
    }
  }

  // The original is a live photo or cover again only if a row points at it.
  private async isStillReferenced(key: string): Promise<boolean> {
    const [photo, cover, waiting] = await Promise.all([
      this.prisma.photo.count({ where: { s3Key: key } }),
      this.prisma.event.count({ where: { coverS3Key: key } }),
      this.prisma.reportEvidence.count({ where: { objectS3Key: key, evidenceS3Key: null } }),
    ]);
    return photo + cover + waiting > 0;
  }

  /**
   * Deletes closed reports whose retention window has passed, with their
   * evidence objects, unless the platform holds them. Objects go first: a
   * report whose objects could not be deleted stays, and the next run tries
   * again, so no evidence object is ever left without its row.
   */
  private async purgeExpired(now: Date, batchSize: number, result: EvidenceJobResult): Promise<void> {
    const retentionDays = this.configService.getOrThrow<number>("moderation.reportRetentionDays");
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);

    const expired = await this.prisma.report.findMany({
      where: {
        status: { not: ReportStatus.OPEN },
        resolvedAt: { lt: cutoff },
        OR: [{ holdUntil: null }, { holdUntil: { lt: now } }],
      },
      orderBy: { resolvedAt: "asc" },
      take: batchSize,
      select: { id: true, evidence: { select: { evidenceS3Key: true } } },
    });
    if (expired.length === 0) return;

    const keys = expired.flatMap((report) => (report.evidence?.evidenceS3Key ? [report.evidence.evidenceS3Key] : []));
    let failedKeys = new Set<string>();
    if (keys.length > 0) {
      try {
        const outcome = await this.s3Service.deleteObjects(keys);
        failedKeys = new Set(outcome.failed.map((failure) => failure.key));
        result.purgedObjects += outcome.deleted.length;
      } catch {
        failedKeys = new Set(keys);
      }
    }

    const purgeable = expired.filter(
      (report) => !report.evidence?.evidenceS3Key || !failedKeys.has(report.evidence.evidenceS3Key),
    );
    result.purgeFailed += expired.length - purgeable.length;
    if (purgeable.length === 0) return;

    const { count } = await this.prisma.report.deleteMany({
      where: { id: { in: purgeable.map((report) => report.id) } },
    });
    result.purgedReports += count;
    this.logger.info(
      { event: "report.retention.purged", reports: count, objects: result.purgedObjects, cutoff, audit: true },
      "Reports past the retention window purged",
    );
  }

  private async quarantine(candidate: QuarantineCandidate): Promise<boolean> {
    if (!candidate.objectS3Key) return true;

    const evidenceS3Key = buildEvidenceS3Key(candidate.reportId, candidate.objectS3Key);
    try {
      const { sha256 } = await this.s3Service.copyObject(candidate.objectS3Key, evidenceS3Key);
      await this.prisma.reportEvidence.update({
        where: { id: candidate.id },
        data: { evidenceS3Key, sha256, quarantinedAt: new Date(), quarantineFailedAt: null },
      });
      this.logger.info(
        { event: "report.evidence.quarantined", reportId: candidate.reportId, audit: true },
        "Reported object copied to evidence",
      );
      return true;
    } catch (error) {
      this.logger.error(
        { err: error as Error, event: ALERT_EVENTS.REPORT_EVIDENCE_COPY_FAILED, reportId: candidate.reportId },
        "Reported object could not be copied to evidence; keeping the original",
      );
      await this.prisma.reportEvidence
        .update({ where: { id: candidate.id }, data: { quarantineFailedAt: new Date() } })
        .catch(() => undefined);
      return false;
    }
  }
}
