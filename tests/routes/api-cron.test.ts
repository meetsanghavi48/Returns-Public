import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the tracking service
vi.mock("~/services/tracking.server", () => ({
  bulkRefreshTracking: vi.fn(),
}));

describe("api.cron route", () => {
  let action: any;
  let loader: any;
  let bulkRefreshTracking: any;

  beforeEach(async () => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    vi.clearAllMocks();

    const route = await import("~/routes/api.cron");
    action = route.action;
    loader = route.loader;

    bulkRefreshTracking = (await import("~/services/tracking.server")).bulkRefreshTracking;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("action (POST)", () => {
    it("returns 401 when no Authorization header is provided", async () => {
      const request = new Request("http://localhost/api/cron", {
        method: "POST",
      });

      const response = await action({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 401 when Authorization header has wrong token", async () => {
      const request = new Request("http://localhost/api/cron", {
        method: "POST",
        headers: { Authorization: "Bearer wrong-token" },
      });

      const response = await action({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 401 when CRON_SECRET is not set", async () => {
      vi.stubEnv("CRON_SECRET", "");

      const request = new Request("http://localhost/api/cron", {
        method: "POST",
        headers: { Authorization: "Bearer some-token" },
      });

      const response = await action({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("accepts valid Bearer token and returns tracking results", async () => {
      const mockResults = { processed: 5, updated: 2, errors: [] };
      bulkRefreshTracking.mockResolvedValue(mockResults);

      const request = new Request("http://localhost/api/cron", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret" },
      });

      const response = await action({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockResults);
      expect(bulkRefreshTracking).toHaveBeenCalledOnce();
    });

    it("returns 500 when bulkRefreshTracking throws", async () => {
      bulkRefreshTracking.mockRejectedValue(new Error("Tracking service down"));

      const request = new Request("http://localhost/api/cron", {
        method: "POST",
        headers: { Authorization: "Bearer test-cron-secret" },
      });

      const response = await action({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Tracking service down");
    });
  });

  describe("loader (GET)", () => {
    it("returns 401 when secret query param is missing", async () => {
      const request = new Request("http://localhost/api/cron");

      const response = await loader({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 401 when secret query param is wrong", async () => {
      const request = new Request("http://localhost/api/cron?secret=wrong");

      const response = await loader({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe("Unauthorized");
    });

    it("accepts valid secret query param and returns results", async () => {
      const mockResults = { processed: 3, updated: 1, errors: [] };
      bulkRefreshTracking.mockResolvedValue(mockResults);

      const request = new Request("http://localhost/api/cron?secret=test-cron-secret");

      const response = await loader({ request, params: {}, context: {} });
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockResults);
    });
  });
});
