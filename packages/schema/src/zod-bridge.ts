import type { IOField } from "@relay/core";
import type { ZodTypeAny } from "zod";

interface ZodDefLike {
  typeName: string;
  description?: string;
  checks?: Array<{ kind: string; value?: number }>;
  innerType?: ZodTypeAny;
  type?: ZodTypeAny;
  shape?: () => Record<string, ZodTypeAny> | Record<string, ZodTypeAny>;
  values?: readonly string[];
  schema?: ZodTypeAny;
}

function defOf(schema: ZodTypeAny): ZodDefLike {
  return (schema as unknown as { _def: ZodDefLike })._def;
}

export function zodToIOField(schema: ZodTypeAny): IOField {
  const def = defOf(schema);

  if (def.typeName === "ZodOptional" || def.typeName === "ZodDefault" || def.typeName === "ZodNullable") {
    const inner = def.innerType;
    if (!inner) throw new Error(`Zod ${def.typeName} missing innerType`);
    const field = zodToIOField(inner);
    return { ...field, required: false };
  }

  if (def.typeName === "ZodEffects") {
    const inner = def.schema;
    if (!inner) throw new Error("Zod ZodEffects missing schema");
    return zodToIOField(inner);
  }

  const required = true;
  const description = def.description;

  switch (def.typeName) {
    case "ZodString": {
      const field: IOField = { type: "string", required };
      const min = numericCheck(def.checks, "min");
      const max = numericCheck(def.checks, "max");
      if (min !== undefined) field.min = min;
      if (max !== undefined) field.max = max;
      if (description !== undefined) field.description = description;
      return field;
    }
    case "ZodNumber": {
      const isInt = def.checks?.some((c) => c.kind === "int");
      const field: IOField = { type: isInt ? "integer" : "number", required };
      const min = numericCheck(def.checks, "min");
      const max = numericCheck(def.checks, "max");
      if (min !== undefined) field.min = min;
      if (max !== undefined) field.max = max;
      if (description !== undefined) field.description = description;
      return field;
    }
    case "ZodBoolean": {
      const field: IOField = { type: "boolean", required };
      if (description !== undefined) field.description = description;
      return field;
    }
    case "ZodEnum": {
      const field: IOField = { type: "enum", required, enum: def.values ?? [] };
      if (description !== undefined) field.description = description;
      return field;
    }
    case "ZodArray": {
      const items = def.type;
      if (!items) throw new Error("Zod ZodArray missing item type");
      const field: IOField = { type: "array", required, items: zodToIOField(items) };
      if (description !== undefined) field.description = description;
      return field;
    }
    case "ZodObject": {
      const properties = zodObjectToInputs(schema);
      const field: IOField = { type: "object", required, properties };
      if (description !== undefined) field.description = description;
      return field;
    }
    default:
      throw new Error(`zodToIOField: unsupported Zod type "${def.typeName}"`);
  }
}

export function zodObjectToInputs(schema: ZodTypeAny): Record<string, IOField> {
  const def = defOf(schema);
  if (def.typeName !== "ZodObject") {
    throw new Error(`zodObjectToInputs: expected ZodObject, got "${def.typeName}"`);
  }
  const rawShape = typeof def.shape === "function" ? def.shape() : def.shape;
  if (!rawShape) throw new Error("Zod ZodObject missing shape");
  const out: Record<string, IOField> = {};
  for (const [key, sub] of Object.entries(rawShape)) {
    out[key] = zodToIOField(sub);
  }
  return out;
}

function numericCheck(
  checks: ZodDefLike["checks"],
  kind: "min" | "max",
): number | undefined {
  const c = checks?.find((x) => x.kind === kind);
  return typeof c?.value === "number" ? c.value : undefined;
}
