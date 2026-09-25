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

  it("strips undeclared fields inside nested objects", () => {
    const result = projectOutput(
      { user: { type: "object", properties: { id: { type: "string" } } } },
      { user: { id: "u_1", passwordHash: "hunter2" } },
    );
    expect(result).toEqual({ user: { id: "u_1" } });
  });

  it("strips undeclared fields inside array items", () => {
    const result = projectOutput(
      {
        users: {
          type: "array",
          items: { type: "object", properties: { id: { type: "string" } } },
        },
      },
      { users: [{ id: "u_1", email: "a@b.c" }, { id: "u_2", email: "d@e.f" }] },
    );
    expect(result).toEqual({ users: [{ id: "u_1" }, { id: "u_2" }] });
  });

  it("passes nested values through when the schema does not describe them", () => {
    const result = projectOutput(
      { meta: { type: "object" } },
      { meta: { anything: 1 } },
    );
    expect(result).toEqual({ meta: { anything: 1 } });
  });
});
