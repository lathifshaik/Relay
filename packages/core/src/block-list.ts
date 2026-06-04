export const DEFAULT_BLOCKED_PATTERNS: readonly RegExp[] = [
  /(^|\/)bank(\/|$)/i,
  /(^|\/)payment[s]?(\/|$)/i,
  /(^|\/)card[s]?(\/|$)/i,
  /(^|\/)admin(\/|$)/i,
  /(^|\/)password[s]?(\/|$)/i,
  /(^|\/)pii(\/|$)/i,
  /(^|\/)internal(\/|$)/i,
  /(^|\/)token[s]?(\/|$)/i,
  /(^|\/)secret[s]?(\/|$)/i,
];

export interface BlockListConfig {
  blocked: RegExp[];
  allowed: RegExp[];
}

export function createBlockList(
  extraBlocked: RegExp[] = [],
  extraAllowed: RegExp[] = [],
): BlockListConfig {
  return {
    blocked: [...DEFAULT_BLOCKED_PATTERNS, ...extraBlocked],
    allowed: [...extraAllowed],
  };
}

export function isBlocked(path: string, config: BlockListConfig): boolean {
  if (config.allowed.some((re) => re.test(path))) return false;
  return config.blocked.some((re) => re.test(path));
}
