import type { ActionDef, ActionGraph } from "@relay/core";

/** An action replayed as an HTTP call the app's own pages were seen making. */
export interface ApiTarget {
  kind: "api";
  /** Absolute URL; path segments that looked like ids are `:placeholders`. */
  urlTemplate: string;
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

export interface BridgeAction extends ActionDef {
  target: ApiTarget | FormTarget;
}

export interface BridgeGraph extends ActionGraph {
  baseUrl: string;
  /** Pages visited while discovering, as paths. */
  pages: string[];
  actions: BridgeAction[];
}
