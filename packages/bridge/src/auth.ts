import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseHtml } from "./html.js";
import type { SessionResponse } from "./session.js";

/** A signed-in session the user handed over: their cookie, or an API token. */
export interface SavedSession {
  cookie?: string;
  token?: string;
  savedAt: string;
}

const LOGIN_PATH = /(^|\/)(log-?in|sign-?in|signin|auth|sso|oauth|session\/new|users\/sign_in|account\/login)(\/|$)/i;

export function sessionFile(dir: string, siteUrl: string): string {
  const { host } = new URL(siteUrl);
  return path.join(dir, `${host.replace(/[^A-Za-z0-9.-]/g, "_")}.session.json`);
}

export async function loadSession(dir: string, siteUrl: string): Promise<SavedSession | undefined> {
  try {
    const saved = JSON.parse(await readFile(sessionFile(dir, siteUrl), "utf8")) as SavedSession;
    return saved.cookie || saved.token ? saved : undefined;
  } catch {
    return undefined;
  }
}

/** Stored readable by the current user only: it is as good as their login. */
export async function saveSession(dir: string, siteUrl: string, session: Omit<SavedSession, "savedAt">): Promise<string> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = sessionFile(dir, siteUrl);
  await writeFile(file, `${JSON.stringify({ ...session, savedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
  return file;
}

export async function forgetSession(dir: string, siteUrl: string): Promise<void> {
  await rm(sessionFile(dir, siteUrl), { force: true });
}

/**
 * Reads what a user pasted: a `Cookie:` header or its value, an
 * `Authorization: Bearer …` header, or a bare API token.
 */
export function parsePastedSession(input: string): Omit<SavedSession, "savedAt"> | undefined {
  const text = input.trim().replace(/^cookie:\s*/i, "").replace(/^authorization:\s*/i, "");
  if (!text) return undefined;
  const bearer = /^bearer\s+(\S+)$/i.exec(text);
  if (bearer) return { token: bearer[1] as string };
  if (text.includes("=")) return { cookie: text };
  if (/^\S+$/.test(text)) return { token: text };
  return undefined;
}

/**
 * Whether a response means the user isn't signed in (any more): a 401, a
 * redirect to a login page, or a login form where the page used to be.
 */
export function looksSignedOut(res: SessionResponse): boolean {
  if (res.status === 401) return true;
  const asked = new URL(res.requestUrl).pathname;
  if (LOGIN_PATH.test(asked)) return false;
  if (LOGIN_PATH.test(new URL(res.url).pathname)) return true;
  if (res.contentType.includes("html") && res.status < 400) {
    const forms = parseHtml(res.text, res.url).forms;
    return forms.length > 0 && forms.every((f) => f.hasPassword);
  }
  return false;
}

export function signedOutMessage(siteUrl: string): string {
  const { origin, host } = new URL(siteUrl);
  return (
    `You're not signed in to ${host} (or the session expired). Tell the user to log in to ${origin} in their browser, ` +
    `then run: relay-bridge login ${origin}`
  );
}
