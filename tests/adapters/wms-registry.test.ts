import { describe, it, expect } from "vitest";
import { wmsRegistry } from "~/adapters/wms";
import { WmsAdapter } from "~/adapters/wms/base";

describe("wmsRegistry", () => {
  it("has all expected adapters registered (>= 12)", () => {
    const adapters = wmsRegistry.list();
    expect(adapters.length).toBeGreaterThanOrEqual(12);
  });

  it("get() returns correct adapter entry by key", () => {
    const entry = wmsRegistry.get("unicommerce");
    expect(entry).toBeDefined();
    expect(entry!.key).toBe("unicommerce");
  });

  it("getAdapter() returns an instance of WmsAdapter", () => {
    const adapter = wmsRegistry.getAdapter("unicommerce");
    expect(adapter).toBeDefined();
    expect(adapter).toBeInstanceOf(WmsAdapter);
  });

  it("list() returns all registered adapters", () => {
    const adapters = wmsRegistry.list();
    expect(Array.isArray(adapters)).toBe(true);
    expect(adapters.length).toBeGreaterThan(0);

    const keys = adapters.map((a) => a.key);
    expect(keys).toContain("unicommerce");
    expect(keys).toContain("zoho_inventory");
  });

  it("get() with unknown key returns undefined", () => {
    const entry = wmsRegistry.get("nonexistent_wms_xyz");
    expect(entry).toBeUndefined();
  });
});
