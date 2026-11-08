import { createPublicKey, JsonWebKey, KeyObject } from "crypto";

/**
 * jose 6 is ESM-only, which Jest's CommonJS runtime can't load (Node can).
 * jwks-rsa imports each key of the key set with jose's `importJWK`; this does
 * the same with Node's crypto, and the rest of jwks-rsa runs as is. Use it as
 * the module factory of a `jest.mock` of the jose that jwks-rsa resolves:
 *
 *   jest.mock(require.resolve("jose", { paths: [require.resolve("jwks-rsa")] }), () =>
 *     jest.requireActual<typeof import("./testing/jose-stand-in")>("./testing/jose-stand-in"),
 *   );
 */
export const importJWK = (jwk: JsonWebKey): Promise<KeyObject> =>
  Promise.resolve(createPublicKey({ key: jwk, format: "jwk" }));
