export class JwtPayloadDto {
  sub: string;
  iat?: number;
  exp?: number;
  /** The Auth0 application the token was issued to; must be the mobile app's (`AUTH0_NATIVE_CLIENT_ID`). */
  azp?: string;
  /** Auth0's grant type; `client-credentials` marks a machine-to-machine token, which is refused. */
  gty?: string;
}
