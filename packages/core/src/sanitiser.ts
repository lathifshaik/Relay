export interface SecretPattern {
  name: string;
  regex: RegExp;
}

export const DEFAULT_SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: "openai-key", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "anthropic-key", regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { name: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "stripe-live", regex: /\b(?:sk|pk|rk)_live_[A-Za-z0-9]{20,}\b/g },
  { name: "stripe-test", regex: /\b(?:sk|pk|rk)_test_[A-Za-z0-9]{20,}\b/g },
  { name: "github-token", regex: /\bghp_[A-Za-z0-9]{36}\b/g },
  { name: "jwt", regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g },
  {
    name: "pem-block",
    regex: /-----BEGIN [A-Z ]+-----[\s\S]+?-----END [A-Z ]+-----/g,
  },
  {
    name: "connection-string",
    regex: /\b(?:postgres|postgresql|mysql|mongodb|mongodb\+srv|redis|amqp):\/\/[^\s"'`]+/g,
  },
  // 40+ contiguous hex catches SHA-1 / SHA-256 / hex-encoded secrets but skips UUIDs (which contain dashes).
  { name: "long-hex", regex: /\b[a-fA-F0-9]{40,}\b/g },
];

const REDACTION = "[REDACTED]";

export function sanitiseString(input: string, patterns = DEFAULT_SECRET_PATTERNS): string {
  let out = input;
  for (const p of patterns) {
    out = out.replace(p.regex, REDACTION);
  }
  return out;
}

export function sanitiseValue(value: unknown, patterns = DEFAULT_SECRET_PATTERNS): unknown {
  if (typeof value === "string") return sanitiseString(value, patterns);
  if (Array.isArray(value)) return value.map((v) => sanitiseValue(v, patterns));
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitiseValue(v, patterns);
    }
    return out;
  }
  return value;
}

export interface SanitisedError {
  error: string;
  requestId?: string;
  message?: string;
}

export function sanitiseError(err: unknown, requestId?: string): SanitisedError {
  const code =
    err instanceof Error && err.name && err.name !== "Error" ? err.name : "INTERNAL_ERROR";
  const result: SanitisedError = { error: code };
  if (requestId !== undefined) result.requestId = requestId;
  return result;
}
