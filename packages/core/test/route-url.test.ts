import { describe, expect, it } from "vitest";
import { buildRouteUrl } from "../src/route-url.js";

describe("buildRouteUrl", () => {
  it("fills path placeholders and URL-encodes them", () => {
    expect(buildRouteUrl("/todos/:id", "PATCH", { id: "a b", done: true })).toBe("/todos/a%20b");
  });

  it("moves remaining inputs into the query for GET", () => {
    expect(buildRouteUrl("/users/:id/posts", "GET", { id: 7, limit: 5, tag: ["a", "b"] })).toBe(
      "/users/7/posts?limit=5&tag=a&tag=b",
    );
  });

  it("serialises nested objects as JSON in the query", () => {
    expect(buildRouteUrl("/search", "DELETE", { filter: { a: 1 } })).toBe(
      "/search?filter=%7B%22a%22%3A1%7D",
    );
  });

  it("leaves unfilled placeholders alone and never adds a query for body methods", () => {
    expect(buildRouteUrl("/todos/:id", "POST", { title: "x" })).toBe("/todos/:id");
  });
});
