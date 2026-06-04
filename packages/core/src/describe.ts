import type { ActionDef, IOField } from "./action-graph.js";

export type DescribeAnnotation = Partial<
  Pick<
    ActionDef,
    "actionId" | "label" | "description" | "inputs" | "returns" | "relayAccess" | "consentScope" | "tags"
  >
>;

const annotations = new WeakMap<object, DescribeAnnotation>();

export function describe<H extends object>(handler: H, annotation: DescribeAnnotation): H {
  annotations.set(handler, annotation);
  return handler;
}

export function getAnnotation(handler: unknown): DescribeAnnotation | undefined {
  if (handler === null || (typeof handler !== "object" && typeof handler !== "function")) {
    return undefined;
  }
  return annotations.get(handler as object);
}

export function mergeAnnotation(
  defaults: { inputs?: Record<string, IOField>; returns?: Record<string, IOField> },
  annotation: DescribeAnnotation | undefined,
): { inputs: Record<string, IOField>; returns: Record<string, IOField> } & DescribeAnnotation {
  return {
    inputs: annotation?.inputs ?? defaults.inputs ?? {},
    returns: annotation?.returns ?? defaults.returns ?? {},
    ...(annotation?.actionId !== undefined && { actionId: annotation.actionId }),
    ...(annotation?.label !== undefined && { label: annotation.label }),
    ...(annotation?.description !== undefined && { description: annotation.description }),
    ...(annotation?.relayAccess !== undefined && { relayAccess: annotation.relayAccess }),
    ...(annotation?.consentScope !== undefined && { consentScope: annotation.consentScope }),
    ...(annotation?.tags !== undefined && { tags: annotation.tags }),
  };
}
