import { buildRouteUrl, methodHasBody, sanitiseValue } from "@relay/core";
import { htmlToText, parseHtml } from "./html.js";
import { placeholderNames } from "./infer.js";
import type { Session, SessionResponse } from "./session.js";
import type { BridgeAction, FormTarget } from "./types.js";

export interface ActionResult {
  status: number;
  body: unknown;
}

const MAX_TEXT_CHARS = 20_000;

export async function runAction(
  session: Session,
  action: BridgeAction,
  inputs: Record<string, unknown>,
): Promise<ActionResult> {
  const res =
    action.target.kind === "api"
      ? await callApi(session, action.target.urlTemplate, action.target.callMethod ?? action.method, inputs)
      : await submitForm(session, action.target, action.method, inputs);
  return { status: res.status, body: sanitiseValue(readBody(res)) };
}

/** GETs a page of the app and returns it as text, with its links. */
export async function readPage(session: Session, url: string): Promise<ActionResult> {
  const res = await session.request(url);
  if (!res.contentType.includes("html")) return { status: res.status, body: sanitiseValue(readBody(res)) };
  const page = parseHtml(res.text, res.url);
  return {
    status: res.status,
    body: sanitiseValue({
      url: res.url,
      title: page.title,
      text: page.text,
      links: page.links.slice(0, 60).map((l) => ({ text: l.text, url: l.href })),
    }),
  };
}

async function callApi(
  session: Session,
  urlTemplate: string,
  method: string,
  inputs: Record<string, unknown>,
): Promise<SessionResponse> {
  const template = new URL(urlTemplate);
  const url = new URL(buildRouteUrl(template.pathname, method, inputs), template.origin);
  if (!methodHasBody(method)) return session.request(url.toString(), { method });

  const pathParams = new Set(placeholderNames(template.pathname));
  const rest = Object.fromEntries(Object.entries(inputs).filter(([k]) => !pathParams.has(k)));
  // Endpoints whose body shape was unknown take it whole under `body`.
  const keys = Object.keys(rest);
  const payload = keys.length === 1 && keys[0] === "body" ? rest["body"] : rest;
  return session.request(url.toString(), {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function submitForm(
  session: Session,
  target: FormTarget,
  method: string,
  inputs: Record<string, unknown>,
): Promise<SessionResponse> {
  // Load the page fresh so hidden fields (CSRF tokens, ids) are current.
  const pageRes = await session.request(target.pageUrl);
  const page = parseHtml(pageRes.text, pageRes.url);
  const names = new Set(target.fields.map((f) => f.name));
  const form =
    page.forms.find((f) => target.fields.every((tf) => f.fields.some((ff) => ff.name === tf.name))) ??
    page.forms[target.formIndex];
  if (!form) throw new Error(`The form is no longer on ${target.pageUrl}`);

  const data = new URLSearchParams();
  for (const f of form.fields) {
    if (["submit", "button", "reset", "image", "file", "password"].includes(f.type)) continue;
    if (names.has(f.name)) continue;
    if ((f.type === "checkbox" || f.type === "radio") && !f.checked) continue;
    data.append(f.name, f.value);
  }
  for (const field of target.fields) {
    const value = inputs[field.name];
    if (value === undefined) {
      const original = form.fields.find((f) => f.name === field.name && (f.checked || field.kind === "text" || field.kind === "select"));
      if (original) data.append(field.name, original.value);
      continue;
    }
    if (field.kind === "checkbox") {
      if (value === true) data.append(field.name, form.fields.find((f) => f.name === field.name)?.value || "on");
      continue;
    }
    data.append(field.name, String(value));
  }

  if (method === "GET") {
    const url = new URL(form.action);
    url.search = data.toString();
    return session.request(url.toString());
  }
  return session.request(form.action, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: data.toString(),
  });
}

function readBody(res: SessionResponse): unknown {
  if (res.contentType.includes("json")) {
    try {
      return JSON.parse(res.text);
    } catch {
      // fall through to text
    }
  }
  const text = res.contentType.includes("html") ? htmlToText(res.text) : res.text;
  const clipped = text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}\n…[truncated]` : text;
  return { url: res.url, text: clipped };
}
