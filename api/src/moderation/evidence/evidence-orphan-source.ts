import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { OrphanSource, OrphanSourceRegistry } from "src/storage/orphan-source.registry";
import { EVIDENCE_S3_KEY_PREFIX, isEvidenceS3Key } from "./evidence.constants";

/**
 * Registers evidence/ with the S3 orphan reconciler. A copy is made before
 * its ReportEvidence row points at it, so a copy whose row update failed, or
 * whose report was purged while its delete failed, is an object nothing
 * references: an orphan.
 */
@Injectable()
export class EvidenceOrphanSource implements OrphanSource, OnModuleInit {
  readonly prefix = EVIDENCE_S3_KEY_PREFIX;
  // A copy exists a moment before its row is updated; give it a day.
  readonly minObjectAgeMs = 24 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: OrphanSourceRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  isOwnedKey(key: string): boolean {
    return isEvidenceS3Key(key);
  }

  // ReportEvidence.evidenceS3Key is unique: an index probe per key, one round trip.
  async findReferencedKeys(keys: string[]): Promise<string[]> {
    const rows = await this.prisma.reportEvidence.findMany({
      where: { evidenceS3Key: { in: keys } },
      select: { evidenceS3Key: true },
    });
    return rows.flatMap((row) => (row.evidenceS3Key ? [row.evidenceS3Key] : []));
  }
}
