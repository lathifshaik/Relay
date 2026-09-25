import { describe, expect, it } from "vitest";
import { apiActionId, fieldFromSample, templatePath, toolName } from "../src/infer.js";

describe("templatePath", () => {
  it("names id segments after the collection before them", () => {
    expect(templatePath("/api/orders/42/items")).toBe("/api/orders/:orderId/items");
  });

  it("recognises UUIDs", () => {
    expect(templatePath("/users/123e4567-e89b-12d3-a456-426614174000")).toBe("/users/:userId");
  });
});

describe("fieldFromSample", () => {
  it("infers nested object and array shapes", () => {
    expect(fieldFromSample({ id: 1, tags: ["a"], price: 1.5 })).toEqual({
      type: "object",
      properties: {
        id: { type: "integer" },
        tags: { type: "array", items: { type: "string" } },
        price: { type: "number" },
      },
    });
  });
});

describe("tool names", () => {
  it("produce MCP-safe action ids", () => {
    expect(apiActionId("GET", "/api/orders/:orderId")).toBe("get_api_orders_by_order_id");
    expect(toolName("Contact Us!")).toBe("contact_us");
    expect(toolName("x".repeat(80))).toHaveLength(64);
  });
});
