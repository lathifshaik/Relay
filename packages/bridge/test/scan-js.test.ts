import { describe, expect, it } from "vitest";
import { scanJs } from "../src/scan-js.js";

const ORIGIN = "https://example.com";

function find(source: string, method: string, path: string) {
  return scanJs(source, ORIGIN).find((e) => e.method === method && e.path === path);
}

describe("scanJs", () => {
  it("finds a plain fetch as GET", () => {
    expect(find(`fetch("/api/orders")`, "GET", "/api/orders")?.confident).toBe(true);
  });

  it("turns template-literal pieces into path params", () => {
    expect(find("fetch(`/api/orders/${order.id}`)", "GET", "/api/orders/:id")).toBeDefined();
  });

  it("reads the method and body keys from fetch options", () => {
    const e = find(
      `fetch("/api/orders", { method: "POST", body: JSON.stringify({ title: t, qty }) })`,
      "POST",
      "/api/orders",
    );
    expect(e?.bodyKeys).toEqual(["title", "qty"]);
  });

  it("does not borrow the method of the next call", () => {
    const src = "fetch(`/api/orders/${id}`); fetch(\"/api/orders\", { method: \"POST\" })";
    expect(find(src, "POST", "/api/orders/:id")).toBeUndefined();
  });

  it("takes the method from client.post(...) style calls", () => {
    expect(find(`n.post("/api/items",{name:a})`, "POST", "/api/items")?.bodyKeys).toEqual(["name"]);
  });

  it("keeps bare API-looking strings as low-confidence GETs with query keys", () => {
    const e = find(`const u = "/api/search?q=&page=1";`, "GET", "/api/search");
    expect(e).toMatchObject({ confident: false, queryKeys: ["q", "page"] });
  });

  it("ignores static assets and other sites", () => {
    const src = `fetch("/static/app.js"); fetch("https://other.org/api/x")`;
    expect(scanJs(src, ORIGIN)).toEqual([]);
  });
});
