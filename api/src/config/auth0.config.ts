import { registerAs } from "@nestjs/config";

export default registerAs("auth0", () => {
  const domain = process.env.AUTH0_DOMAIN;

  return {
    domain,
    audience: process.env.AUTH0_AUDIENCE,
    issuer: domain ? `https://${domain}/` : undefined,
    jwksUri: domain ? `https://${domain}/.well-known/jwks.json` : undefined,
    // Machine-to-Machine app credentials for Auth0 Management API (delete user, etc.)
    managementClientId: process.env.AUTH0_MANAGEMENT_CLIENT_ID,
    managementClientSecret: process.env.AUTH0_MANAGEMENT_CLIENT_SECRET,
  };
});
