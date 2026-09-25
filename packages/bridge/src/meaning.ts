import { toolName } from "./infer.js";
import type { BridgeAction, Risk } from "./types.js";

const EXTERNAL = [
  "send", "email", "mail", "sms", "message", "invite", "notify", "notification", "publish", "tweet", "share",
  "pay", "payment", "charge", "checkout", "purchase", "buy", "order", "transfer", "refund", "withdraw", "payout",
  "invoice", "bill", "subscribe", "book", "reserve", "donate", "tip", "contact", "reply", "comment", "post",
];
const DESTRUCTIVE = [
  "delete", "remove", "destroy", "cancel", "revoke", "archive", "purge", "drop", "reset", "clear", "terminate",
  "deactivate", "disable", "ban", "void", "unsubscribe", "close", "reject",
];
// POST endpoints that only look things up (search APIs, GraphQL-style queries).
const READ_VERBS = ["search", "find", "list", "get", "fetch", "load", "query", "lookup", "check", "validate", "preview", "count"];

const WHY: Record<Risk, string> = {
  read: "Only reads data.",
  write: "Changes data in the app.",
  destructive: "Deletes, cancels or revokes something. It may not be recoverable.",
  external:
    "Reaches people or money outside the app (sends a message, charges, publishes, places an order). It usually can't be undone.",
};

/** Words in an action's name, path, hint and labels: `sendInvoice /api/v2/x` → send, invoice, api, v2, x. */
export function words(...parts: Array<string | undefined>): string[] {
  return parts
    .filter((p): p is string => Boolean(p))
    .join(" ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export function classifyRisk(method: string, vocabulary: string[], firstWord = vocabulary[0]): Risk {
  const has = (list: string[]) => vocabulary.some((w) => list.some((v) => w === v || (w.startsWith(v) && w.length <= v.length + 3)));
  if (method === "GET") return "read";
  if (method === "DELETE") return "destructive";
  // A POST named for a lookup (searchOrders, getQuote) reads, whatever it looks up.
  if (method === "POST" && READ_VERBS.includes(firstWord ?? "")) return "read";
  if (has(DESTRUCTIVE)) return "destructive";
  if (has(EXTERNAL)) return "external";
  return "write";
}

export function whyRisky(risk: Risk): string {
  return WHY[risk];
}

/** "sendInvoice" → "Send invoice". */
export function humanize(name: string): string {
  const text = words(name).join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export interface EndpointClues {
  hint?: string;
  message?: string;
}

/**
 * Gives an action a name and description a person (or an AI) can act on, and
 * a risk level, from whatever the app itself reveals: the function name the
 * call sits in, what the app says after it, the form's heading and button.
 */
export function explain(action: BridgeAction, clues: EndpointClues = {}): BridgeAction {
  const endpoint = `${action.target.kind === "api" ? (action.target.callMethod ?? action.method) : action.method} ${action.path}`;
  // A generated "POST /api/x" label says nothing; its "post" would read as publishing.
  const descriptive = action.label !== `${action.method} ${action.path}` ? action.label : undefined;
  const name = clues.hint ?? descriptive;
  const vocabulary = words(clues.hint, descriptive, action.path);
  const risk = action.risk ?? classifyRisk(action.method, vocabulary, name ? words(name)[0] : undefined);

  if (action.target.kind === "api" && clues.hint) {
    // A one-word name ("list", "save") says what but not to what; add the resource.
    const resource = action.path
      .split("/")
      .filter((seg) => seg && !seg.startsWith(":") && !/^(api|v\d+|rest|rpc|_api|ajax|json)$/i.test(seg))
      .pop();
    const name = words(clues.hint).length === 1 && resource ? `${clues.hint}_${resource}` : clues.hint;
    const facts = [
      `${endpoint}, called by the app's ${clues.hint}().`,
      clues.message ? `Afterwards the app shows: "${clues.message}".` : "",
      whyRisky(risk),
    ];
    return {
      ...action,
      actionId: toolName(name),
      label: humanize(name),
      description: facts.filter(Boolean).join(" "),
      risk,
    };
  }
  const base = action.description ? `${action.description} ` : "";
  return {
    ...action,
    description: `${base}${action.target.kind === "api" ? `(${endpoint}) ` : ""}${whyRisky(risk)}`.trim(),
    risk,
  };
}

/**
 * Your corrections, kept apart from the discovered map so a rescan doesn't
 * lose them. Keyed by "METHOD /path" (what the app calls), not by tool name.
 */
export interface LabelOverride {
  name?: string;
  label?: string;
  description?: string;
  risk?: Risk;
  hidden?: boolean;
}

export type Labels = Record<string, LabelOverride>;

export function endpointKey(action: BridgeAction): string {
  return `${action.method} ${action.path}`;
}

export function applyLabels(actions: BridgeAction[], labels: Labels): BridgeAction[] {
  const out: BridgeAction[] = [];
  for (const action of actions) {
    const o = labels[endpointKey(action)];
    if (!o) {
      out.push(action);
      continue;
    }
    if (o.hidden) continue;
    out.push({
      ...action,
      ...(o.name && { actionId: toolName(o.name) }),
      ...(o.label && { label: o.label }),
      ...(o.description && { description: o.description }),
      ...(o.risk && { risk: o.risk }),
    });
  }
  return out;
}

/** A labels file listing every action, ready to edit. */
export function labelsTemplate(actions: BridgeAction[], existing: Labels = {}): Labels {
  const out: Labels = {};
  for (const a of actions) {
    out[endpointKey(a)] = existing[endpointKey(a)] ?? {
      name: a.actionId,
      label: a.label,
      ...(a.description && { description: a.description }),
      ...(a.risk && { risk: a.risk }),
    };
  }
  return out;
}
