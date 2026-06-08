import { registerAs } from "@nestjs/config";

export default registerAs("auth0", () => {
  const domain = process.env.AUTH0_DOMAIN;

  return {
    domain,
    audience: process.env.AUTH0_AUDIENCE,
    issuer: domain ? `https://${domain}/` : undefined,
    jwksUri: domain ? `https://${domain}/.well-known/jwks.json` : undefined,
  };
});
