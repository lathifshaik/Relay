import { describe, expect, it } from "vitest";
import type { IOField } from "../src/action-graph.js";
import { projectOutput } from "../src/projection.js";

const orderSchema: Record<string, IOField> = {
  order_id: { type: "string" },
  status: { type: "string" },
};

describe("projectOutput", () => {
  it("strips fields not declared in the schema", () => {
    const result = projectOutput(orderSchema, {
      order_id: "ord_1",
      status: "paid",
      internal_db_id: 42,
      stripe_secret: "sk_live_abcdefghijklmnopqrstuv",
    });
    expect(result).toEqual({ order_id: "ord_1", status: "paid" });
  });

  it("sanitises declared fields too", () => {
    const result = projectOutput({ key: { type: "string" } }, {
      key: "sk-abcdefghijklmnopqrstuvwxyz",
    });
    expect(result["key"]).toBe("[REDACTED]");
  });

  it("returns empty object for non-object output", () => {
    expect(projectOutput(orderSchema, null)).toEqual({});
    expect(projectOutput(orderSchema, "string")).toEqual({});
  });
});
