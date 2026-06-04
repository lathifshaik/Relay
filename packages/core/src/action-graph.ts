export type FieldType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "array"
  | "object"
  | "enum";

export interface IOField {
  type: FieldType;
  required?: boolean;
  description?: string;
  min?: number;
  max?: number;
  enum?: readonly string[];
  items?: IOField;
  properties?: Record<string, IOField>;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type AccessMode = "allowed" | "denied" | "consent-required";

export interface ActionDef {
  actionId: string;
  method: HttpMethod;
  path: string;
  label: string;
  description?: string;
  inputs: Record<string, IOField>;
  returns: Record<string, IOField>;
  relayAccess: AccessMode;
  consentScope?: string;
  tags?: readonly string[];
}

export interface ActionGraph {
  relayVersion: string;
  appName: string;
  appVersion?: string;
  generatedAt: string;
  actions: ActionDef[];
}

export const RELAY_PROTOCOL_VERSION = "0.1";
