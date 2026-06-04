import { describe, expect, it } from "vitest";
import { createBlockList, isBlocked } from "../src/block-list.js";

describe("default block list", () => {
  const blockList = createBlockList();

  it.each([
    ["/admin"],
    ["/api/admin/users"],
    ["/bank/transfer"],
    ["/payment/charge"],
    ["/cards"],
    ["/internal/metrics"],
    ["/auth/token"],
    ["/secrets/db"],
    ["/users/password"],
    ["/api/pii/export"],
  ])("blocks %s", (path) => {
    expect(isBlocked(path, blockList)).toBe(true);
  });

  it.each([["/orders"], ["/products"], ["/search"], ["/cart"]])(
    "allows %s",
    (path) => {
      expect(isBlocked(path, blockList)).toBe(false);
    },
  );
});

describe("explicit allow override", () => {
  it("allow rule wins over block rule", () => {
    const blockList = createBlockList([], [/^\/admin\/public$/]);
    expect(isBlocked("/admin/public", blockList)).toBe(false);
    expect(isBlocked("/admin/secret", blockList)).toBe(true);
  });
});
