/* JWT Types */
interface BaseJWTPayload {
  sub: string;         // user.id (cuid)
  username: string;
  name: string,
  role: string | null;
  exp: number;         // expiration timestamp
}

// Explicit payload for your short-lived Access Token
export interface AccessTokenPayload extends BaseJWTPayload {
  tokenVersion: number;
}

// Explicit payload for your long-lived Refresh Token
export interface RefreshTokenPayload extends BaseJWTPayload {
  refreshTokenVersion: number;
}