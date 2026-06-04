import type { IOField } from "./action-graph.js";

export interface ValidationError {
  error: "RELAY_VALIDATION_FAILED";
  field: string;
  expected: string;
  received: string;
  suggestion: string;
}

export type ValidationResult<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: ValidationError };

export function validateInput(
  schema: Record<string, IOField>,
  input: unknown,
): ValidationResult<Record<string, unknown>> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return fail("$", "object", describe(input), "Pass inputs as a JSON object");
  }
  const data = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(schema)) {
    const has = Object.prototype.hasOwnProperty.call(data, name);
    if (!has) {
      if (field.required) {
        return fail(name, expectedFor(field), "missing", `Provide a ${field.type} for "${name}"`);
      }
      continue;
    }
    const fieldResult = validateField(name, field, data[name]);
    if (!fieldResult.ok) return fieldResult;
    out[name] = fieldResult.value;
  }
  return { ok: true, value: out };
}

function validateField(path: string, field: IOField, value: unknown): ValidationResult {
  switch (field.type) {
    case "string":
      return validateString(path, field, value);
    case "integer":
      return validateInteger(path, field, value);
    case "number":
      return validateNumber(path, field, value);
    case "boolean":
      return validateBoolean(path, value);
    case "enum":
      return validateEnum(path, field, value);
    case "array":
      return validateArray(path, field, value);
    case "object":
      return validateObject(path, field, value);
  }
}

function validateString(path: string, field: IOField, value: unknown): ValidationResult {
  if (typeof value !== "string") {
    return fail(path, "string", describe(value), `Pass "${path}" as a string`);
  }
  if (field.min !== undefined && value.length < field.min) {
    return fail(
      path,
      `string of length >= ${field.min}`,
      `string of length ${value.length}`,
      `Pass a longer string for "${path}"`,
    );
  }
  if (field.max !== undefined && value.length > field.max) {
    return fail(
      path,
      `string of length <= ${field.max}`,
      `string of length ${value.length}`,
      `Pass a shorter string for "${path}"`,
    );
  }
  return { ok: true, value };
}

function validateInteger(path: string, field: IOField, value: unknown): ValidationResult {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return fail(path, expectedFor(field), describe(value), `Pass "${path}" as an integer, e.g. 5`);
  }
  return checkRange(path, field, value);
}

function validateNumber(path: string, field: IOField, value: unknown): ValidationResult {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fail(path, expectedFor(field), describe(value), `Pass "${path}" as a number`);
  }
  return checkRange(path, field, value);
}

function checkRange(path: string, field: IOField, value: number): ValidationResult<number> {
  if (field.min !== undefined && value < field.min) {
    return fail(path, expectedFor(field), `${value}`, `Pass a value >= ${field.min}`);
  }
  if (field.max !== undefined && value > field.max) {
    return fail(path, expectedFor(field), `${value}`, `Pass a value <= ${field.max}`);
  }
  return { ok: true, value };
}

function validateBoolean(path: string, value: unknown): ValidationResult {
  if (typeof value !== "boolean") {
    return fail(path, "boolean", describe(value), `Pass "${path}" as true or false`);
  }
  return { ok: true, value };
}

function validateEnum(path: string, field: IOField, value: unknown): ValidationResult {
  const allowed = field.enum ?? [];
  if (typeof value !== "string" || !allowed.includes(value)) {
    return fail(
      path,
      `one of [${allowed.join(", ")}]`,
      describe(value),
      `Use one of: ${allowed.join(", ")}`,
    );
  }
  return { ok: true, value };
}

function validateArray(path: string, field: IOField, value: unknown): ValidationResult {
  if (!Array.isArray(value)) {
    return fail(path, "array", describe(value), `Pass "${path}" as an array`);
  }
  if (!field.items) return { ok: true, value };
  const out: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    const r = validateField(`${path}[${i}]`, field.items, value[i]);
    if (!r.ok) return r;
    out.push(r.value);
  }
  return { ok: true, value: out };
}

function validateObject(path: string, field: IOField, value: unknown): ValidationResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return fail(path, "object", describe(value), `Pass "${path}" as a JSON object`);
  }
  if (!field.properties) return { ok: true, value };
  const data = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [name, sub] of Object.entries(field.properties)) {
    const has = Object.prototype.hasOwnProperty.call(data, name);
    if (!has) {
      if (sub.required) {
        return fail(
          `${path}.${name}`,
          expectedFor(sub),
          "missing",
          `Provide a ${sub.type} for "${path}.${name}"`,
        );
      }
      continue;
    }
    const r = validateField(`${path}.${name}`, sub, data[name]);
    if (!r.ok) return r;
    out[name] = r.value;
  }
  return { ok: true, value: out };
}

function expectedFor(field: IOField): string {
  if (field.type === "integer" || field.type === "number") {
    if (field.min !== undefined && field.max !== undefined) {
      return `${field.type} between ${field.min} and ${field.max}`;
    }
    if (field.min !== undefined) return `${field.type} >= ${field.min}`;
    if (field.max !== undefined) return `${field.type} <= ${field.max}`;
  }
  if (field.type === "enum") return `one of [${(field.enum ?? []).join(", ")}]`;
  return field.type;
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";
  if (typeof value === "string") return `string: ${JSON.stringify(value)}`;
  return `${typeof value}: ${JSON.stringify(value)}`;
}

function fail(
  field: string,
  expected: string,
  received: string,
  suggestion: string,
): { ok: false; error: ValidationError } {
  return {
    ok: false,
    error: { error: "RELAY_VALIDATION_FAILED", field, expected, received, suggestion },
  };
}
