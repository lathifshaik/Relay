import { describe, expect, it } from "vitest";
import type { IOField } from "../src/action-graph.js";
import { validateInput } from "../src/validator.js";

const intField: IOField = { type: "integer", min: 1, max: 99, required: true };
const stringField: IOField = { type: "string", required: true };

describe("validateInput — top level", () => {
  it("rejects non-object input", () => {
    const r = validateInput({}, "not an object");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.field).toBe("$");
      expect(r.error.expected).toBe("object");
    }
  });

  it("rejects array as input", () => {
    const r = validateInput({}, [1, 2, 3]);
    expect(r.ok).toBe(false);
  });

  it("accepts empty schema with empty input", () => {
    const r = validateInput({}, {});
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({});
  });
});

describe("validateInput — required and optional fields", () => {
  it("rejects missing required field with self-correctable error", () => {
    const r = validateInput({ quantity: intField }, {});
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.field).toBe("quantity");
      expect(r.error.received).toBe("missing");
      expect(r.error.expected).toContain("integer");
    }
  });

  it("allows missing optional field", () => {
    const r = validateInput(
      { coupon: { type: "string" } },
      {},
    );
    expect(r.ok).toBe(true);
  });
});

describe("validateInput — integer", () => {
  it("rejects string passed where integer expected, matches docs example", () => {
    const r = validateInput({ quantity: intField }, { quantity: "five" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.field).toBe("quantity");
      expect(r.error.expected).toBe("integer between 1 and 99");
      expect(r.error.received).toBe('string: "five"');
      expect(r.error.suggestion).toContain("integer");
    }
  });

  it("rejects float for integer field", () => {
    const r = validateInput({ quantity: intField }, { quantity: 2.5 });
    expect(r.ok).toBe(false);
  });

  it("rejects below min", () => {
    const r = validateInput({ quantity: intField }, { quantity: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.received).toBe("0");
  });

  it("rejects above max", () => {
    const r = validateInput({ quantity: intField }, { quantity: 100 });
    expect(r.ok).toBe(false);
  });

  it("accepts valid integer in range", () => {
    const r = validateInput({ quantity: intField }, { quantity: 5 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ quantity: 5 });
  });
});

describe("validateInput — string", () => {
  it("rejects min-length violation", () => {
    const r = validateInput(
      { name: { type: "string", min: 3, required: true } },
      { name: "ab" },
    );
    expect(r.ok).toBe(false);
  });

  it("rejects max-length violation", () => {
    const r = validateInput(
      { name: { type: "string", max: 3, required: true } },
      { name: "abcd" },
    );
    expect(r.ok).toBe(false);
  });
});

describe("validateInput — boolean / enum / number", () => {
  it("accepts boolean", () => {
    const r = validateInput({ flag: { type: "boolean", required: true } }, { flag: false });
    expect(r.ok).toBe(true);
  });

  it("rejects non-boolean", () => {
    const r = validateInput({ flag: { type: "boolean", required: true } }, { flag: "false" });
    expect(r.ok).toBe(false);
  });

  it("enforces enum membership", () => {
    const r = validateInput(
      { status: { type: "enum", enum: ["pending", "paid"], required: true } },
      { status: "shipped" },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.expected).toContain("pending");
  });

  it("rejects NaN as number", () => {
    const r = validateInput({ amount: { type: "number", required: true } }, { amount: NaN });
    expect(r.ok).toBe(false);
  });
});

describe("validateInput — arrays", () => {
  it("rejects non-array", () => {
    const r = validateInput(
      { ids: { type: "array", items: stringField, required: true } },
      { ids: "not-array" },
    );
    expect(r.ok).toBe(false);
  });

  it("validates each element against item schema", () => {
    const r = validateInput(
      { ids: { type: "array", items: stringField, required: true } },
      { ids: ["a", 2] },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("ids[1]");
  });
});

describe("validateInput — nested objects", () => {
  it("validates required nested field", () => {
    const r = validateInput(
      {
        user: {
          type: "object",
          required: true,
          properties: { id: stringField, age: { type: "integer", required: true } },
        },
      },
      { user: { id: "u1" } },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.field).toBe("user.age");
  });

  it("accepts well-formed nested object", () => {
    const r = validateInput(
      { user: { type: "object", properties: { id: stringField }, required: true } },
      { user: { id: "u1" } },
    );
    expect(r.ok).toBe(true);
  });
});
