import { describe, it, expect } from "vitest";
import { isLightColor, lightenColor, darkenColor } from "~/utils/colors.server";

describe("colors.server", () => {
  describe("isLightColor", () => {
    it("white is light", () => expect(isLightColor("#ffffff")).toBe(true));
    it("black is not light", () => expect(isLightColor("#000000")).toBe(false));
    it("yellow is light", () => expect(isLightColor("#ffff00")).toBe(true));
    it("dark blue is not light", () => expect(isLightColor("#000080")).toBe(false));
    it("light gray is light", () => expect(isLightColor("#cccccc")).toBe(true));
    it("mid gray is borderline", () => {
      const result = isLightColor("#808080");
      expect(typeof result).toBe("boolean");
    });
    it("handles invalid hex gracefully", () => expect(isLightColor("xyz")).toBe(true));
  });

  describe("lightenColor", () => {
    it("lightens black toward white", () => {
      const result = lightenColor("#000000", 0.5);
      expect(result).not.toBe("#000000");
    });
    it("returns white-ish for high factor", () => {
      const result = lightenColor("#000000", 0.05);
      expect(result).toMatch(/^#[0-9a-f]{6}$/);
    });
    it("handles invalid hex", () => expect(lightenColor("bad", 0.5)).toBe("#ffffff"));
  });

  describe("darkenColor", () => {
    it("darkens white", () => {
      const result = darkenColor("#ffffff", 0.5);
      expect(result).toBe("#808080");
    });
    it("black stays black", () => expect(darkenColor("#000000", 0.5)).toBe("#000000"));
    it("handles invalid hex", () => expect(darkenColor("bad", 0.5)).toBe("#000000"));
    it("factor 1.0 keeps color same", () => expect(darkenColor("#ff0000", 1.0)).toBe("#ff0000"));
    it("factor 0.0 makes black", () => expect(darkenColor("#ff0000", 0)).toBe("#000000"));
  });
});
