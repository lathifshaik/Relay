import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodObjectToInputs, zodToIOField } from "../src/zod-bridge.js";

describe("zodToIOField — primitives", () => {
  it("converts z.string()", () => {
    expect(zodToIOField(z.string())).toEqual({ type: "string", required: true });
  });

  it("converts z.string().min(3).max(10)", () => {
    expect(zodToIOField(z.string().min(3).max(10))).toEqual({
      type: "string",
      required: true,
      min: 3,
      max: 10,
    });
  });

  it("converts z.number()", () => {
    expect(zodToIOField(z.number())).toEqual({ type: "number", required: true });
  });

  it("converts z.number().int().min(1).max(99) — matches the docs example", () => {
    expect(zodToIOField(z.number().int().min(1).max(99))).toEqual({
      type: "integer",
      required: true,
      min: 1,
      max: 99,
    });
  });

  it("converts z.boolean()", () => {
    expect(zodToIOField(z.boolean())).toEqual({ type: "boolean", required: true });
  });
});

describe("zodToIOField — modifiers", () => {
  it("marks optional as required:false", () => {
    expect(zodToIOField(z.string().optional())).toEqual({ type: "string", required: false });
  });

  it("preserves description", () => {
    const result = zodToIOField(z.string().describe("the user's email"));
    expect(result.description).toBe("the user's email");
  });

  it("handles z.default()", () => {
    expect(zodToIOField(z.string().default("hi"))).toEqual({ type: "string", required: false });
  });
});

describe("zodToIOField — composites", () => {
  it("converts z.enum", () => {
    expect(zodToIOField(z.enum(["a", "b", "c"]))).toEqual({
      type: "enum",
      required: true,
      enum: ["a", "b", "c"],
    });
  });

  it("converts z.array of strings", () => {
    expect(zodToIOField(z.array(z.string()))).toEqual({
      type: "array",
      required: true,
      items: { type: "string", required: true },
    });
  });

  it("converts nested z.object", () => {
    const schema = z.object({ id: z.string(), age: z.number().int() });
    expect(zodToIOField(schema)).toEqual({
      type: "object",
      required: true,
      properties: {
        id: { type: "string", required: true },
        age: { type: "integer", required: true },
      },
    });
  });
});

describe("zodObjectToInputs", () => {
  it("matches the canonical create_order schema", () => {
    const schema = z.object({
      item_id: z.string(),
      quantity: z.number().int().min(1).max(99),
      coupon: z.string().optional(),
    });
    expect(zodObjectToInputs(schema)).toEqual({
      item_id: { type: "string", required: true },
      quantity: { type: "integer", required: true, min: 1, max: 99 },
      coupon: { type: "string", required: false },
    });
  });

  it("rejects non-object schema", () => {
    expect(() => zodObjectToInputs(z.string())).toThrow(/expected ZodObject/);
  });
});

describe("zodToIOField — unsupported types", () => {
  it("throws for unknown Zod type rather than silently coercing", () => {
    expect(() => zodToIOField(z.date())).toThrow(/unsupported/);
  });
});
