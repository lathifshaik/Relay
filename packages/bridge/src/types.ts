import type { ActionDef, ActionGraph, HttpMethod } from "@relay/core";

/** An action replayed as an HTTP call the app's own pages were seen making. */
export interface ApiTarget {
  kind: "api";
  /** Absolute URL; path segments that looked like ids are `:placeholders`. */
  urlTemplate: string;
  /** HTTP method to call with when it differs from the action's own (e.g. Relay's POST /relay/act). */
  callMethod?: HttpMethod;
}

export type FormFieldKind = "text" | "checkbox" | "radio" | "select";

/** An action performed by filling and submitting a form on a page. */
export interface FormTarget {
  kind: "form";
  pageUrl: string;
  /** Position among the page's forms when it was discovered. */
  formIndex: number;
  fields: Array<{ name: string; kind: FormFieldKind }>;
}

/**
 * How much an action can change:
 * - `read`: only looks things up
 * - `write`: changes data in the app, and can usually be changed back
 * - `destructive`: deletes, cancels or revokes something
 * - `external`: reaches people or money outside the app — sends a message,
 *   charges a card, publishes — and usually can't be undone
 */
export type Risk = "read" | "write" | "destructive" | "external";

export interface BridgeAction extends ActionDef {
  target: ApiTarget | FormTarget;
  risk?: Risk;
}

export interface BridgeGraph extends ActionGraph {
  baseUrl: string;
  /** Pages visited while discovering, as paths. */
  pages: string[];
  actions: BridgeAction[];
}
