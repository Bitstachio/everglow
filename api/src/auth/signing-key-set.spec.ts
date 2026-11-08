import { generateKeyPairSync, KeyObject } from "crypto";
import { createServer, Server, ServerResponse } from "http";
import { AddressInfo } from "net";
import { ConfigService } from "@nestjs/config";
import { mockDeep } from "jest-mock-extended";
import { PinoLogger } from "nestjs-pino";
import {
  SIGNING_KEYS_COOLDOWN_MS,
  SIGNING_KEYS_MAX_AGE_MS,
  SIGNING_KEYS_RETRY_MS,
  SigningKeySet,
} from "./signing-key-set";
import { SigningKeysUnavailableError } from "./signing-keys-unavailable.error";

// jwks-rsa's jose can't load under Jest; see testing/jose-stand-in.ts.
jest.mock(require.resolve("jose", { paths: [require.resolve("jwks-rsa")] }), () =>
  jest.requireActual<typeof import("./testing/jose-stand-in")>("./testing/jose-stand-in"),
);

/** Against a local JWKS server that counts its fetches, with the clock under the test's control. */
describe("SigningKeySet", () => {
  const firstKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const secondKey = generateKeyPairSync("rsa", { modulusLength: 2048 });

  let server: Server;
  let jwksUri: string;
  let fetches: number;
  let answer: (res: ServerResponse) => void;
  let clock: number;
  let keySet: SigningKeySet;

  const pemOf = (key: KeyObject) => key.export({ format: "pem", type: "spki" });

  const serving =
    (...keys: [string, KeyObject][]) =>
    (res: ServerResponse) => {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          keys: keys.map(([kid, key]) => ({ ...key.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" })),
        }),
      );
    };

  const failing = (res: ServerResponse) => {
    res.statusCode = 503;
    res.end();
  };

  const advance = (ms: number) => {
    clock += ms;
  };

  /** Lets a background refresh started by keyFor reach the server and finish. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  beforeAll(async () => {
    server = createServer((_req, res) => {
      fetches += 1;
      answer(res);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    jwksUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/.well-known/jwks.json`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    fetches = 0;
    answer = serving(["first", firstKey.publicKey]);
    clock = Date.now();
    jest.spyOn(Date, "now").mockImplementation(() => clock);
    const config = { getOrThrow: () => jwksUri } as unknown as ConfigService;
    keySet = new SigningKeySet(config, mockDeep<PinoLogger>());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("loads the key set at boot, and answers from it without fetching again", async () => {
    keySet.onApplicationBootstrap();
    await settle();

    await expect(keySet.keyFor("first")).resolves.toBe(pemOf(firstKey.publicKey));
    await expect(keySet.keyFor("first")).resolves.toBe(pemOf(firstKey.publicKey));
    expect(fetches).toBe(1);
  });

  it("doesn't fail boot when the warm-up fetch fails, and the first token after the retry window loads it", async () => {
    answer = failing;
    expect(() => keySet.onApplicationBootstrap()).not.toThrow();
    await settle();
    answer = serving(["first", firstKey.publicKey]);

    // Inside the retry window: still nothing loaded, and no fetch.
    await expect(keySet.keyFor("first")).rejects.toBeInstanceOf(SigningKeysUnavailableError);
    expect(fetches).toBe(1);

    advance(SIGNING_KEYS_RETRY_MS);
    await expect(keySet.keyFor("first")).resolves.toBe(pemOf(firstKey.publicKey));
    expect(fetches).toBe(2);
  });

  it("shares one fetch between the requests that arrive before any key set is loaded", async () => {
    const keys = await Promise.all(Array.from({ length: 10 }, () => keySet.keyFor("first")));

    expect(new Set(keys)).toEqual(new Set([pemOf(firstKey.publicKey)]));
    expect(fetches).toBe(1);
  });

  it("answers 503's error when no key set was ever loaded, naming why", async () => {
    answer = failing;

    await expect(keySet.keyFor("first")).rejects.toEqual(
      expect.objectContaining({ name: "SigningKeysUnavailableError", message: "JwksError: Service Unavailable" }),
    );
  });

  describe("a flood of unknown key ids", () => {
    beforeEach(async () => {
      await keySet.keyFor("first");
      expect(fetches).toBe(1);
    });

    it("is refused without a fetch inside the cooldown", async () => {
      for (let i = 0; i < 100; i += 1) {
        await expect(keySet.keyFor(`forged-${i}`)).rejects.toMatchObject({ name: "SigningKeyNotFoundError" });
      }

      expect(fetches).toBe(1);
    });

    it("spends one fetch per cooldown at most, however many arrive at once", async () => {
      for (let window = 1; window <= 3; window += 1) {
        advance(SIGNING_KEYS_COOLDOWN_MS);
        const verdicts = await Promise.allSettled(Array.from({ length: 50 }, (_, i) => keySet.keyFor(`forged-${i}`)));
        expect(verdicts.every((verdict) => verdict.status === "rejected")).toBe(true);
        expect(fetches).toBe(1 + window);
      }
    });

    it("doesn't stop the real key from working", async () => {
      await Promise.allSettled(Array.from({ length: 50 }, (_, i) => keySet.keyFor(`forged-${i}`)));
      advance(SIGNING_KEYS_COOLDOWN_MS);
      await Promise.allSettled(Array.from({ length: 50 }, (_, i) => keySet.keyFor(`forged-${i}`)));

      await expect(keySet.keyFor("first")).resolves.toBe(pemOf(firstKey.publicKey));
    });
  });

  describe("when Auth0 rotates its key", () => {
    beforeEach(async () => {
      await keySet.keyFor("first");
      answer = serving(["first", firstKey.publicKey], ["second", secondKey.publicKey]);
    });

    it("refuses the new key id until the cooldown since the last fetch is over", async () => {
      await expect(keySet.keyFor("second")).rejects.toMatchObject({ name: "SigningKeyNotFoundError" });
      expect(fetches).toBe(1);
    });

    it("picks up the new key on the first token after the cooldown, and the old one keeps working", async () => {
      advance(SIGNING_KEYS_COOLDOWN_MS);

      await expect(keySet.keyFor("second")).resolves.toBe(pemOf(secondKey.publicKey));
      await expect(keySet.keyFor("first")).resolves.toBe(pemOf(firstKey.publicKey));
      expect(fetches).toBe(2);
    });
  });

  it("refreshes an old key set behind a request, so a key Auth0 removed stops working", async () => {
    await keySet.keyFor("first");
    answer = serving(["second", secondKey.publicKey]);
    advance(SIGNING_KEYS_MAX_AGE_MS);

    // Answered from the old set; the refresh runs behind it.
    await expect(keySet.keyFor("first")).resolves.toBe(pemOf(firstKey.publicKey));
    await settle();

    expect(fetches).toBe(2);
    await expect(keySet.keyFor("first")).rejects.toMatchObject({ name: "SigningKeyNotFoundError" });
    await expect(keySet.keyFor("second")).resolves.toBe(pemOf(secondKey.publicKey));
  });

  it("keeps the key set it has when a refresh fails", async () => {
    await keySet.keyFor("first");
    answer = failing;
    advance(SIGNING_KEYS_COOLDOWN_MS);

    await expect(keySet.keyFor("unknown")).rejects.toMatchObject({ name: "SigningKeyNotFoundError" });
    await expect(keySet.keyFor("first")).resolves.toBe(pemOf(firstKey.publicKey));
    expect(fetches).toBe(2);
  });

  it("refuses a token that names no key id, without fetching", async () => {
    await expect(keySet.keyFor(undefined)).rejects.toMatchObject({ name: "SigningKeyNotFoundError" });
    expect(fetches).toBe(0);
  });
});
