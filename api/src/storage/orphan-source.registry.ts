import { Injectable } from "@nestjs/common";
import { ORPHAN_SOURCE_ERRORS } from "./storage.constants";

/**
 * One S3 prefix the API owns, described well enough for the orphan reconciler
 * to sweep it: which keys under it the API could have minted, and which of a
 * page of those keys the database still references.
 */
export interface OrphanSource {
  /** Key prefix to list, ending with "/" (e.g. `photos/`). Prefixes must not overlap. */
  readonly prefix: string;
  /**
   * Floor for the reconciler's minimum object age, for prefixes whose objects
   * exist before anything references them (a stateless upload awaiting its
   * confirm). The configured age still applies when it is larger.
   */
  readonly minObjectAgeMs?: number;
  /** True for keys the API could have minted; anything else under the prefix is never touched. */
  isOwnedKey(key: string): boolean;
  /** The subset of `keys` a database row references. Must be one query per call, not one per key. */
  findReferencedKeys(keys: string[]): Promise<string[]>;
}

/**
 * The prefixes the orphan reconciler walks. A feature module registers its
 * source from `onModuleInit`; the reconciler never learns about the feature.
 */
@Injectable()
export class OrphanSourceRegistry {
  private readonly sources: OrphanSource[] = [];

  register(source: OrphanSource): void {
    if (!source.prefix.endsWith("/")) throw new Error(ORPHAN_SOURCE_ERRORS.INVALID_PREFIX(source.prefix));

    // Overlapping prefixes would list the same objects twice and judge them
    // against the wrong table, so a misconfigured source fails the boot.
    const overlapping = this.sources.find(
      ({ prefix }) => prefix.startsWith(source.prefix) || source.prefix.startsWith(prefix),
    );
    if (overlapping) throw new Error(ORPHAN_SOURCE_ERRORS.OVERLAPPING_PREFIX(source.prefix, overlapping.prefix));

    this.sources.push(source);
  }

  getAll(): readonly OrphanSource[] {
    return this.sources;
  }
}
