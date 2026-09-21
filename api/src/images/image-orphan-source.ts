import { OnModuleInit } from "@nestjs/common";
import { OrphanSource, OrphanSourceRegistry } from "src/storage/orphan-source.registry";
import { buildImageS3KeyPattern, IMAGE_ORPHAN_MIN_AGE_MS } from "./images.constants";

/**
 * Registers one image prefix with the S3 orphan reconciler. A feature extends
 * it with its prefix and the one query that says which keys its table still
 * references; the key shape, the minimum age, and the registration are shared.
 *
 * Image uploads are stateless, so unlike a photo, an image object exists
 * before any row references it. The minimum age is what keeps the reconciler
 * away from an upload that is still waiting for its confirm, even when the
 * configured age is 0.
 */
export abstract class ImageOrphanSource implements OrphanSource, OnModuleInit {
  readonly minObjectAgeMs = IMAGE_ORPHAN_MIN_AGE_MS;
  private readonly keyPattern: RegExp;

  protected constructor(
    readonly prefix: string,
    private readonly registry: OrphanSourceRegistry,
  ) {
    this.keyPattern = buildImageS3KeyPattern(prefix);
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  isOwnedKey(key: string): boolean {
    return this.keyPattern.test(key);
  }

  abstract findReferencedKeys(keys: string[]): Promise<string[]>;
}
