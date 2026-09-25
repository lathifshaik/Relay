import { randomBytes } from "node:crypto";
import { whyRisky } from "./meaning.js";
import type { BridgeAction, Risk } from "./types.js";

/**
 * Which actions need a second, confirmed call:
 * - `risky` (default): destructive and external ones
 * - `writes`: anything that isn't a read
 * - `none`: nothing (the MCP client's own approval still applies)
 */
export type ConfirmPolicy = "risky" | "writes" | "none";

const TTL_MS = 5 * 60 * 1000;

export function needsConfirmation(risk: Risk | undefined, policy: ConfirmPolicy): boolean {
  const r = risk ?? "write";
  if (policy === "none" || r === "read") return false;
  return policy === "writes" || r === "destructive" || r === "external";
}

/**
 * Issues single-use codes bound to one action and its exact inputs, so an
 * agent must stop, show the user what will happen, and call again unchanged.
 */
export class Confirmations {
  private readonly pending = new Map<string, { actionId: string; inputs: string; expires: number }>();

  issue(action: BridgeAction, inputs: Record<string, unknown>): { code: string; preview: Record<string, unknown> } {
    this.sweep();
    const code = randomBytes(4).toString("hex");
    this.pending.set(code, { actionId: action.actionId, inputs: stable(inputs), expires: Date.now() + TTL_MS });
    return {
      code,
      preview: {
        confirmationRequired: true,
        action: action.label,
        does: whyRisky(action.risk ?? "write"),
        request: `${action.method} ${action.path}`,
        inputs,
        next: `Show this to the user and ask whether to go ahead. Only if they agree, call ${action.actionId} again with the same inputs and "_confirm": "${code}". The code expires in 5 minutes.`,
      },
    };
  }

  /** True once per code, for the same action and identical inputs. */
  redeem(code: unknown, action: BridgeAction, inputs: Record<string, unknown>): boolean {
    if (typeof code !== "string") return false;
    const entry = this.pending.get(code);
    if (!entry || entry.expires < Date.now()) return false;
    if (entry.actionId !== action.actionId || entry.inputs !== stable(inputs)) return false;
    this.pending.delete(code);
    return true;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [code, entry] of this.pending) if (entry.expires < now) this.pending.delete(code);
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
