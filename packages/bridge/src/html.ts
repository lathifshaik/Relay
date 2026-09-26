import { type HTMLElement, parse } from "node-html-parser";

export interface HtmlField {
  name: string;
  tag: string;
  type: string;
  value: string;
  required: boolean;
  label: string;
  options: string[];
  checked: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
}

export interface HtmlForm {
  index: number;
  name: string;
  /** Absolute URL the form submits to. */
  action: string;
  method: "GET" | "POST";
  hasPassword: boolean;
  /** The form names where it submits (`action`/`method`); without either, JavaScript handles it. */
  native: boolean;
  fields: HtmlField[];
}

export interface HtmlPage {
  title: string;
  text: string;
  links: Array<{ text: string; href: string }>;
  forms: HtmlForm[];
  scriptUrls: string[];
  inlineScripts: string[];
  /** <meta name="csrf-token"> and friends, which apps copy into request headers. */
  csrfToken?: string;
}

const MAX_TEXT_CHARS = 8_000;

export function parseHtml(html: string, pageUrl: string): HtmlPage {
  const root = parse(html, { comment: false });
  const resolve = (href: string) => {
    try {
      return new URL(href, pageUrl).toString();
    } catch {
      return undefined;
    }
  };

  const links: HtmlPage["links"] = [];
  const seen = new Set<string>();
  for (const a of root.querySelectorAll("a[href]")) {
    const href = resolve(a.getAttribute("href") ?? "");
    if (!href || !href.startsWith("http") || seen.has(href)) continue;
    seen.add(href);
    links.push({ text: clean(a.text), href });
  }

  const scriptUrls: string[] = [];
  const inlineScripts: string[] = [];
  for (const s of root.querySelectorAll("script")) {
    const src = s.getAttribute("src");
    const type = s.getAttribute("type") ?? "";
    if (src) {
      const url = resolve(src);
      if (url) scriptUrls.push(url);
    } else if (!type || /javascript|module/i.test(type)) {
      inlineScripts.push(s.text);
    }
  }
  for (const l of root.querySelectorAll('link[rel="modulepreload"], link[rel="preload"][as="script"]')) {
    const url = resolve(l.getAttribute("href") ?? "");
    if (url) scriptUrls.push(url);
  }

  const csrfMeta = root.querySelector(
    'meta[name="csrf-token"], meta[name="_csrf"], meta[name="csrf_token"], meta[name="xsrf-token"]',
  );

  const page: HtmlPage = {
    title: clean(root.querySelector("title")?.text ?? ""),
    text: readableText(root),
    links,
    forms: root.querySelectorAll("form").map((f, i) => parseForm(f, i, root, resolve, pageUrl)),
    scriptUrls: [...new Set(scriptUrls)],
    inlineScripts,
  };
  const csrf = csrfMeta?.getAttribute("content");
  if (csrf) page.csrfToken = csrf;
  return page;
}

function parseForm(
  form: HTMLElement,
  index: number,
  root: HTMLElement,
  resolve: (href: string) => string | undefined,
  pageUrl: string,
): HtmlForm {
  const labels = new Map<string, string>();
  for (const l of root.querySelectorAll("label[for]")) labels.set(l.getAttribute("for") ?? "", clean(l.text));

  const fields: HtmlField[] = [];
  for (const el of form.querySelectorAll("input, select, textarea")) {
    const name = el.getAttribute("name");
    if (!name || el.hasAttribute("disabled")) continue;
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute("type") ?? (tag === "input" ? "text" : tag)).toLowerCase();
    const id = el.getAttribute("id") ?? "";
    const wrapping = el.closest("label");
    const field: HtmlField = {
      name,
      tag,
      type,
      value:
        tag === "textarea"
          ? el.text
          : tag === "select"
            ? (el.querySelector("option[selected]") ?? el.querySelector("option"))?.getAttribute("value") ?? ""
            : el.getAttribute("value") ?? "",
      required: el.hasAttribute("required"),
      label:
        labels.get(id) ||
        (wrapping ? clean(wrapping.text) : "") ||
        el.getAttribute("aria-label") ||
        el.getAttribute("placeholder") ||
        "",
      options:
        tag === "select"
          ? el.querySelectorAll("option").map((o) => o.getAttribute("value") ?? clean(o.text))
          : type === "radio"
            ? [el.getAttribute("value") ?? "on"]
            : [],
      checked: el.hasAttribute("checked"),
    };
    for (const [attr, key] of [
      ["min", "min"],
      ["max", "max"],
      ["minlength", "minLength"],
      ["maxlength", "maxLength"],
    ] as const) {
      const n = Number(el.getAttribute(attr));
      if (el.hasAttribute(attr) && !Number.isNaN(n)) field[key] = n;
    }
    fields.push(field);
  }

  const submit = form.querySelector('button[type="submit"], button:not([type]), input[type="submit"]');
  const heading =
    clean(form.querySelector("legend, h1, h2, h3")?.text ?? "") ||
    clean(form.closest("section")?.querySelector("h1, h2, h3")?.text ?? "");

  return {
    index,
    name:
      form.getAttribute("aria-label") ||
      form.getAttribute("id") ||
      form.getAttribute("name") ||
      heading ||
      clean(submit?.text ?? "") ||
      submit?.getAttribute("value") ||
      "",
    action: resolve(form.getAttribute("action") ?? "") ?? pageUrl,
    method: (form.getAttribute("method") ?? "get").toUpperCase() === "POST" ? "POST" : "GET",
    hasPassword: form.querySelector('input[type="password"]') !== null,
    native: form.hasAttribute("action") || form.hasAttribute("method"),
    fields,
  };
}

/**
 * A page as lines of text: its readable text, then one `text → path` line per
 * link. Lines are what layout learning and change tracking work on.
 */
export function pageLines(page: HtmlPage, pageUrl: string): string[] {
  const origin = new URL(pageUrl).origin;
  const links = page.links.slice(0, 80).map((l) => {
    const url = new URL(l.href);
    const where = url.origin === origin ? `${url.pathname}${url.search}` : l.href;
    return `[${l.text || "link"}] → ${where}`;
  });
  return [...(page.text ? page.text.split("\n") : []), ...links];
}

/** Plain text of an HTML document, for handing to an agent. */
export function htmlToText(html: string): string {
  return readableText(parse(html, { comment: false }));
}

function readableText(root: HTMLElement): string {
  const body = root.querySelector("main") ?? root.querySelector("body") ?? root;
  for (const el of body.querySelectorAll("script, style, noscript, svg, template")) el.remove();
  const blocks = /^(p|div|li|tr|h[1-6]|section|article|header|footer|br|dt|dd|pre|blockquote|table|ul|ol|form|label)$/i;
  const lines: string[] = [];
  let current = "";
  const walk = (node: HTMLElement) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        current += child.text;
      } else if (child.nodeType === 1) {
        const el = child as HTMLElement;
        const isBlock = blocks.test(el.tagName ?? "");
        if (isBlock) flush();
        walk(el);
        if (isBlock) flush();
      }
    }
  };
  const flush = () => {
    const line = clean(current);
    if (line) lines.push(line);
    current = "";
  };
  walk(body);
  flush();
  const text = lines.join("\n");
  return text.length > MAX_TEXT_CHARS ? `${text.slice(0, MAX_TEXT_CHARS)}\n…[truncated]` : text;
}

function clean(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
