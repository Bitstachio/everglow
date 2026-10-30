import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { OrphanSource, OrphanSourceRegistry } from "src/storage/orphan-source.registry";
import { isPhotoS3Key } from "./photos.constants";

/** The Lambda's derived/ layout. Originals alone are moderation evidence. */
const originalKeyOf = (key: string): string | null => {
  const match = /^derived\/(photos\/.+)\/(thumb\.webp|large\.jpg)$/.exec(key);
  return match && isPhotoS3Key(match[1]) ? match[1] : null;
};

/** Recovers old orphans and writes left behind by interrupted Lambda invocations. */
@Injectable()
export class PhotoDerivativeOrphanSource implements OrphanSource, OnModuleInit {
  readonly prefix = "derived/photos/";

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: OrphanSourceRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  isOwnedKey(key: string): boolean {
    return originalKeyOf(key) !== null;
  }

  async findReferencedKeys(keys: string[]): Promise<string[]> {
    const originals = [...new Set(keys.flatMap((key) => originalKeyOf(key) ?? []))];
    if (originals.length === 0) return [];
    const photos = await this.prisma.photo.findMany({
      where: { s3Key: { in: originals } },
      select: { s3Key: true },
    });
    const referenced = new Set(photos.map((photo) => photo.s3Key));
    return keys.filter((key) => referenced.has(originalKeyOf(key) ?? ""));
  }
}
