export type Change =
  | { path: string; from: unknown; to: unknown }
  | { path: string; added: unknown }
  | { path: string; removed: unknown };

const MAX_CHANGES = 50;
const WORTH_IT = 0.7;

/**
 * Remembers the last reply for each read so a repeat read can send only what
 * changed. Writes are never cached.
 */
export class ReadMemory {
  private readonly last = new Map<string, unknown>();

  /**
   * Returns what to send: `{ unchanged: true }`, `{ changes }`, or the full
   * value when there is nothing to compare with or a diff would not be smaller.
   */
  compare(key: string, value: unknown): { unchanged: true } | { changes: Change[] } | { full: unknown } {
    const previous = this.last.get(key);
    this.last.set(key, value);
    if (previous === undefined) return { full: value };
    if (deepEqual(previous, value)) return { unchanged: true };
    const changes: Change[] = [];
    diff(previous, value, "", changes);
    if (changes.length > MAX_CHANGES || size(changes) > size(value) * WORTH_IT) return { full: value };
    return { changes };
  }

  forget(): void {
    this.last.clear();
  }
}

export function diff(a: unknown, b: unknown, path: string, out: Change[]): void {
  if (deepEqual(a, b)) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (isKeyedList(a) && isKeyedList(b)) return diffKeyedList(a, b, path, out);
    if (a.every(isScalar) && b.every(isScalar)) return diffScalarList(a, b, path, out);
    out.push({ path: path || "$", from: a, to: b });
    return;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const child = path ? `${path}.${key}` : key;
      if (!(key in b)) out.push({ path: child, removed: a[key] });
      else if (!(key in a)) out.push({ path: child, added: b[key] });
      else diff(a[key], b[key], child, out);
    }
    return;
  }
  if (typeof a === "string" && typeof b === "string" && a.includes("\n") && b.includes("\n")) {
    return diffLines(a, b, path, out);
  }
  out.push({ path: path || "$", from: a, to: b });
}

function diffKeyedList(a: Array<Record<string, unknown>>, b: Array<Record<string, unknown>>, path: string, out: Change[]): void {
  const key = listKey(a[0] ?? b[0] ?? {}) as string;
  const before = new Map(a.map((item) => [String(item[key]), item]));
  const after = new Map(b.map((item) => [String(item[key]), item]));
  for (const [id, item] of after) {
    const old = before.get(id);
    if (old === undefined) out.push({ path: path || "$", added: item });
    else diff(old, item, `${path}[${key}=${id}]`, out);
  }
  for (const [id] of before) {
    if (!after.has(id)) out.push({ path: path || "$", removed: { [key]: before.get(id)?.[key] } });
  }
}

function diffScalarList(a: unknown[], b: unknown[], path: string, out: Change[]): void {
  const remaining = [...a];
  for (const item of b) {
    const i = remaining.findIndex((x) => x === item);
    if (i >= 0) remaining.splice(i, 1);
    else out.push({ path: path || "$", added: item });
  }
  for (const item of remaining) out.push({ path: path || "$", removed: item });
}

function diffLines(a: string, b: string, path: string, out: Change[]): void {
  diffScalarList(a.split("\n"), b.split("\n"), path || "text", out);
}

/** A list of records that each carry an id-like field, so items can be matched across reads. */
function isKeyedList(list: unknown[]): list is Array<Record<string, unknown>> {
  if (list.length === 0 || !list.every(isPlainObject)) return false;
  const key = listKey(list[0] as Record<string, unknown>);
  if (!key) return false;
  const ids = list.map((item) => (item as Record<string, unknown>)[key]);
  return ids.every(isScalar) && new Set(ids.map(String)).size === ids.length;
}

function listKey(item: Record<string, unknown>): string | undefined {
  return ["id", "_id", "uuid", "key", "slug"].find((k) => isScalar(item[k]));
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => k in b && deepEqual(a[k], b[k]));
  }
  return false;
}

function isScalar(v: unknown): v is string | number | boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function size(v: unknown): number {
  return JSON.stringify(v ?? null).length;
}
