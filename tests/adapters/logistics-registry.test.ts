import { describe, it, expect } from "vitest";
import { logisticsRegistry } from "~/adapters/logistics";
import { LogisticsAdapter } from "~/adapters/logistics/base";

describe("logisticsRegistry", () => {
  it("has all expected adapters registered (>= 35)", () => {
    const adapters = logisticsRegistry.list();
    expect(adapters.length).toBeGreaterThanOrEqual(35);
  });

  it("get() returns correct adapter entry by key", () => {
    const entry = logisticsRegistry.get("delhivery");
    expect(entry).toBeDefined();
    expect(entry!.key).toBe("delhivery");
    expect(entry!.displayName).toBe("Delhivery");
  });

  it("getAdapter() returns an instance of LogisticsAdapter", () => {
    const adapter = logisticsRegistry.getAdapter("delhivery");
    expect(adapter).toBeDefined();
    expect(adapter).toBeInstanceOf(LogisticsAdapter);
  });

  it("list() returns all registered adapters", () => {
    const adapters = logisticsRegistry.list();
    expect(Array.isArray(adapters)).toBe(true);
    expect(adapters.length).toBeGreaterThan(0);

    const keys = adapters.map((a) => a.key);
    expect(keys).toContain("delhivery");
    expect(keys).toContain("shiprocket");
    expect(keys).toContain("fedex");
    expect(keys).toContain("dhl");
  });

  it('listByRegion("IN") returns Indian adapters', () => {
    const indianAdapters = logisticsRegistry.listByRegion("IN");
    expect(indianAdapters.length).toBeGreaterThan(0);

    // All returned adapters should be IN or global
    for (const adapter of indianAdapters) {
      expect(["IN", "global"]).toContain(adapter.region);
    }
  });

  it('listByRegion("global") returns global adapters', () => {
    const globalAdapters = logisticsRegistry.listByRegion("global");
    expect(globalAdapters.length).toBeGreaterThan(0);

    for (const adapter of globalAdapters) {
      expect(adapter.region).toBe("global");
    }
  });

  it("get() with unknown key returns undefined", () => {
    const entry = logisticsRegistry.get("nonexistent_adapter_xyz");
    expect(entry).toBeUndefined();
  });
});
