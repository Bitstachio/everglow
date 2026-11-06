import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwksClient, SigningKeyNotFoundError } from "jwks-rsa";
import { PinoLogger } from "nestjs-pino";
import { SigningKeysUnavailableError } from "./signing-keys-unavailable.error";

/**
 * Once a key set is loaded, at most one fetch per this window, however many
 * unknown key ids arrive. A key Auth0 rotated in is picked up by the first
 * token that names it after the window.
 */
export const SIGNING_KEYS_COOLDOWN_MS = 30_000;
/** Until a key set has loaded at all, a failed fetch is retried after this, so a blip at boot heals quickly. */
export const SIGNING_KEYS_RETRY_MS = 5_000;
/** A loaded set is refreshed in the background after this, so a key Auth0 revoked stops being accepted. */
export const SIGNING_KEYS_MAX_AGE_MS = 10 * 60_000;
/** How long one fetch of the key set may take. */
export const SIGNING_KEYS_FETCH_TIMEOUT_MS = 5_000;

/** Where the key set comes from: jwks-rsa's client, or a stand-in in tests. */
export type SigningKeySource = Pick<JwksClient, "getSigningKeys">;

/**
 * Auth0's signing keys, held whole and looked up by key id locally (the
 * semantics of jose's `createRemoteJWKSet`). A token naming a key id the set
 * doesn't have costs no fetch while the set is fresh: it is refused, and only
 * after `SIGNING_KEYS_COOLDOWN_MS` may such a token trigger one refetch. So a
 * flood of forged key ids can't spend fetches the real key needs, and can't
 * reach Auth0 more than twice a minute.
 *
 * Fetches are single-flight: concurrent callers share one. A refresh that
 * fails keeps the set already loaded. Only when no set has ever loaded is a
 * token uncheckable, which is `SigningKeysUnavailableError` and a 503.
 */
@Injectable()
export class SigningKeySet implements OnApplicationBootstrap {
  private readonly source: SigningKeySource;
  private keys?: ReadonlyMap<string, string>;
  private loadedAt = 0;
  private lastFetchAt = Number.NEGATIVE_INFINITY;
  private lastFailure?: Error;
  private inFlight?: Promise<void>;

  constructor(
    configService: ConfigService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SigningKeySet.name);
    this.source = new JwksClient({
      jwksUri: configService.getOrThrow<string>("auth0.jwksUri"),
      // This class is the cache and the limit; jwks-rsa's per-kid ones are what it replaces.
      cache: false,
      rateLimit: false,
      timeout: SIGNING_KEYS_FETCH_TIMEOUT_MS,
    });
  }

  /** Warm-up: load the set before the first token needs it. A failure is logged, and the first token retries. */
  onApplicationBootstrap(): void {
    this.refresh().catch(() => undefined);
  }

  /**
   * The public key (PEM) for `kid`. Rejects with `SigningKeyNotFoundError`
   * (the token's fault, a 401) or `SigningKeysUnavailableError` (no set could
   * ever be loaded, ours, a 503).
   */
  async keyFor(kid: string | undefined): Promise<string> {
    if (kid === undefined) {
      // Auth0 always names the key. A token that doesn't is not one of its.
      throw new SigningKeyNotFoundError("The token names no signing key (no kid)");
    }

    if (!this.keys) {
      await this.refresh();
    } else if (!this.keys.has(kid)) {
      // Possibly a rotation: refetch if the cooldown allows. A failure keeps the set we have.
      await this.refresh().catch(() => undefined);
    } else if (Date.now() - this.loadedAt >= SIGNING_KEYS_MAX_AGE_MS) {
      // Known key, old set: answer now and refresh behind this request.
      this.refresh().catch(() => undefined);
    }

    const key = this.keys?.get(kid);
    if (!key) throw new SigningKeyNotFoundError(`Unable to find a signing key that matches '${kid}'`);
    return key;
  }

  /** One fetch at a time, and none within the cooldown (or the retry window, before any set has loaded). */
  private refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;

    const wait = this.keys ? SIGNING_KEYS_COOLDOWN_MS : SIGNING_KEYS_RETRY_MS;
    if (Date.now() - this.lastFetchAt < wait) {
      return this.keys || !this.lastFailure
        ? Promise.resolve()
        : Promise.reject(new SigningKeysUnavailableError(this.lastFailure));
    }

    this.lastFetchAt = Date.now();
    this.inFlight = this.fetch().finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  private async fetch(): Promise<void> {
    let signingKeys: Awaited<ReturnType<SigningKeySource["getSigningKeys"]>>;
    try {
      signingKeys = await this.source.getSigningKeys();
    } catch (error) {
      // Duck-typed: a Node network error isn't always `instanceof Error` here (Jest runs code in another realm).
      const failure = typeof (error as Error)?.message === "string" ? (error as Error) : new Error(String(error));
      this.lastFailure = failure;
      this.logger.warn(
        { event: "auth.signing_keys.fetch_failed", err: failure, keySetLoaded: this.keys !== undefined },
        this.keys
          ? "Couldn't refresh Auth0's signing keys; keeping the set loaded"
          : "Couldn't fetch Auth0's signing keys",
      );
      throw new SigningKeysUnavailableError(failure);
    }

    const keys = new Map<string, string>();
    for (const key of signingKeys) {
      if (key.kid) keys.set(key.kid, key.getPublicKey());
    }

    const previous = this.keys ? [...this.keys.keys()].sort().join(" ") : undefined;
    const current = [...keys.keys()].sort().join(" ");
    this.keys = keys;
    this.loadedAt = Date.now();
    this.lastFailure = undefined;
    if (previous !== current) {
      this.logger.info({ event: "auth.signing_keys.loaded", keyIds: [...keys.keys()] }, "Loaded Auth0's signing keys");
    }
  }
}
