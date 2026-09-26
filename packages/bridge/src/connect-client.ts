import type { Session } from "./session.js";

export interface ConnectPrompt {
  userCode: string;
  /** Page where the person approves, with the code filled in. */
  url: string;
  expiresInSeconds: number;
}

export interface ConnectClientOptions {
  agentName?: string;
  /** Action ids to ask for; all the site allows when omitted. */
  scope?: string[];
  /** Show the person where to go. */
  onPrompt: (prompt: ConnectPrompt) => void;
  sleep?: (ms: number) => Promise<void>;
}

/** Whether the site offers Relay's agent connect flow (advertised in /.well-known/relay.json). */
export async function supportsConnect(session: Session, origin: string): Promise<string | undefined> {
  const res = await session.request(`${origin}/.well-known/relay.json`).catch(() => undefined);
  if (!res || res.status >= 400) return undefined;
  try {
    const json = JSON.parse(res.text) as { connect?: unknown };
    return typeof json.connect === "string" ? new URL(json.connect, origin).toString() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Connects to a Relay site the way a TV app signs in (RFC 8628): ask for a
 * code, have the person approve it on the site, then collect a token scoped
 * to what they allowed. The person's password never passes through here.
 */
export async function connectWithRelay(
  session: Session,
  connectUrl: string,
  opts: ConnectClientOptions,
): Promise<{ token: string; scope: string[]; expiresInSeconds: number }> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const json = { "content-type": "application/json" };
  const started = await session.request(connectUrl, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ agentName: opts.agentName ?? "relay-bridge", ...(opts.scope && { scope: opts.scope }) }),
  });
  if (started.status !== 200) throw new Error(`the site refused to start connecting (${started.status}): ${started.text.slice(0, 200)}`);
  const grant = JSON.parse(started.text) as {
    device_code: string;
    user_code: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
  };
  opts.onPrompt({ userCode: grant.user_code, url: grant.verification_uri_complete, expiresInSeconds: grant.expires_in });

  const tokenUrl = `${connectUrl.replace(/\/$/, "")}/token`;
  let interval = grant.interval;
  const deadline = Date.now() + grant.expires_in * 1000;
  while (Date.now() < deadline) {
    await sleep(interval * 1000);
    const res = await session.request(tokenUrl, { method: "POST", headers: json, body: JSON.stringify({ device_code: grant.device_code }) });
    const body = JSON.parse(res.text) as { error?: string; access_token?: string; scope?: string; expires_in?: number };
    if (res.status === 200 && body.access_token) {
      return { token: body.access_token, scope: (body.scope ?? "").split(" ").filter(Boolean), expiresInSeconds: body.expires_in ?? 0 };
    }
    if (body.error === "slow_down") interval += 5;
    else if (body.error === "access_denied") throw new Error("the request was denied on the site");
    else if (body.error === "expired_token") break;
    else if (body.error !== "authorization_pending") throw new Error(`connecting failed: ${body.error ?? res.status}`);
  }
  throw new Error("the code expired before it was approved; run login again");
}
