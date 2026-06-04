import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export interface TokenClaims {
  sub: string;
  scope: readonly string[];
  iat: number;
  exp: number;
  jti: string;
}

export interface IssueTokenOptions {
  subject: string;
  scope: readonly string[];
  ttlSeconds?: number;
  signingKey: string;
}

export interface TokenStore {
  isRevoked(jti: string): Promise<boolean> | boolean;
  revoke(jti: string): Promise<void> | void;
}

export class MemoryTokenStore implements TokenStore {
  private revoked = new Set<string>();
  isRevoked(jti: string): boolean {
    return this.revoked.has(jti);
  }
  revoke(jti: string): void {
    this.revoked.add(jti);
  }
}

const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour
const MAX_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

const HEADER_B64 = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));

export function issueToken(opts: IssueTokenOptions): string {
  if (!opts.signingKey) throw new Error("issueToken: signingKey is required");
  const ttl = clamp(opts.ttlSeconds ?? DEFAULT_TTL_SECONDS, 1, MAX_TTL_SECONDS);
  const now = Math.floor(Date.now() / 1000);
  const claims: TokenClaims = {
    sub: opts.subject,
    scope: [...opts.scope],
    iat: now,
    exp: now + ttl,
    jti: randomBytes(16).toString("hex"),
  };
  const payload = b64url(JSON.stringify(claims));
  const signed = `${HEADER_B64}.${payload}`;
  const sig = b64url(createHmac("sha256", opts.signingKey).update(signed).digest());
  return `${signed}.${sig}`;
}

export type VerifyResult =
  | { ok: true; claims: TokenClaims }
  | { ok: false; reason: "malformed" | "bad-signature" | "expired" | "revoked" };

export async function verifyToken(
  token: string,
  signingKey: string,
  store?: TokenStore,
): Promise<VerifyResult> {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [header, payload, sig] = parts as [string, string, string];

  if (header !== HEADER_B64) return { ok: false, reason: "malformed" };

  const expectedSig = b64url(createHmac("sha256", signingKey).update(`${header}.${payload}`).digest());
  if (!constantTimeEquals(sig, expectedSig)) return { ok: false, reason: "bad-signature" };

  let claims: TokenClaims;
  try {
    claims = JSON.parse(b64urlDecode(payload)) as TokenClaims;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (
    typeof claims.sub !== "string" ||
    !Array.isArray(claims.scope) ||
    typeof claims.iat !== "number" ||
    typeof claims.exp !== "number" ||
    typeof claims.jti !== "string"
  ) {
    return { ok: false, reason: "malformed" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (claims.exp <= now) return { ok: false, reason: "expired" };

  if (store && (await store.isRevoked(claims.jti))) {
    return { ok: false, reason: "revoked" };
  }

  return { ok: true, claims };
}

export function hasScope(claims: TokenClaims, actionId: string): boolean {
  return claims.scope.includes(actionId) || claims.scope.includes("*");
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function b64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function constantTimeEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
