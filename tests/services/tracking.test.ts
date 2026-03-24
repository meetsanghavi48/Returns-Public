import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock prisma
vi.mock("~/db.server", () => ({
  default: {
    returnRequest: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    logisticsConfig: {
      findFirst: vi.fn(),
    },
    returnEvent: {
      create: vi.fn(),
    },
  },
}));

// Mock logistics registry
vi.mock("~/adapters/logistics/registry", () => ({
  logisticsRegistry: {
    getAdapter: vi.fn(),
  },
}));

// Mock encryption
vi.mock("~/utils/encryption.server", () => ({
  decrypt: vi.fn((val: string) => val),
}));

describe("tracking.server", () => {
  let prisma: any;
  let logisticsRegistry: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = (await import("~/db.server")).default;
    logisticsRegistry = (await import("~/adapters/logistics/registry")).logisticsRegistry;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("refreshTrackingForReturn", () => {
    it("returns null when return request does not exist", async () => {
      prisma.returnRequest.findUnique.mockResolvedValue(null);

      const { refreshTrackingForReturn } = await import("~/services/tracking.server");
      const result = await refreshTrackingForReturn("nonexistent-id");

      expect(result).toBeNull();
    });

    it("returns null when return request has no AWB", async () => {
      prisma.returnRequest.findUnique.mockResolvedValue({
        id: "ret-1",
        shop: "test.myshopify.com",
        awb: null,
      });

      const { refreshTrackingForReturn } = await import("~/services/tracking.server");
      const result = await refreshTrackingForReturn("ret-1");

      expect(result).toBeNull();
    });

    it("returns null when no logistics config is found", async () => {
      prisma.returnRequest.findUnique.mockResolvedValue({
        id: "ret-1",
        shop: "test.myshopify.com",
        awb: "1234567890123",
      });
      prisma.logisticsConfig.findFirst.mockResolvedValue(null);

      const { refreshTrackingForReturn } = await import("~/services/tracking.server");
      const result = await refreshTrackingForReturn("ret-1");

      expect(result).toBeNull();
    });

    it("updates tracking status when adapter returns success", async () => {
      prisma.returnRequest.findUnique.mockResolvedValue({
        id: "ret-1",
        shop: "test.myshopify.com",
        awb: "1234567890123",
        awbStatus: "pickup_scheduled",
        status: "pickup_scheduled",
      });
      prisma.logisticsConfig.findFirst.mockResolvedValue({
        providerKey: "delhivery",
        credentials: JSON.stringify({ apiToken: "test-token" }),
      });

      const mockAdapter = {
        trackShipment: vi.fn().mockResolvedValue({
          success: true,
          currentStatus: "In Transit",
          currentStatusCode: "X-PPOM",
          isDelivered: false,
          events: [{ status: "In Transit", location: "Bengaluru", timestamp: "2026-03-22T14:30:00" }],
        }),
      };
      logisticsRegistry.getAdapter.mockReturnValue(mockAdapter);
      prisma.returnRequest.update.mockResolvedValue({});
      prisma.returnEvent.create.mockResolvedValue({});

      const { refreshTrackingForReturn } = await import("~/services/tracking.server");
      const result = await refreshTrackingForReturn("ret-1");

      expect(result).not.toBeNull();
      expect(result!.success).toBe(true);
      expect(result!.statusChanged).toBe(true);
      expect(prisma.returnRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "ret-1" },
          data: expect.objectContaining({
            awbStatus: "In Transit",
            awbStatusCode: "X-PPOM",
            awbFinal: false,
          }),
        })
      );
      expect(prisma.returnEvent.create).toHaveBeenCalled();
    });

    it("does not create event when status has not changed", async () => {
      prisma.returnRequest.findUnique.mockResolvedValue({
        id: "ret-1",
        shop: "test.myshopify.com",
        awb: "1234567890123",
        awbStatus: "In Transit",
        status: "in_transit",
      });
      prisma.logisticsConfig.findFirst.mockResolvedValue({
        providerKey: "delhivery",
        credentials: JSON.stringify({ apiToken: "test-token" }),
      });

      const mockAdapter = {
        trackShipment: vi.fn().mockResolvedValue({
          success: true,
          currentStatus: "In Transit",
          currentStatusCode: "X-PPOM",
          isDelivered: false,
          events: [],
        }),
      };
      logisticsRegistry.getAdapter.mockReturnValue(mockAdapter);
      prisma.returnRequest.update.mockResolvedValue({});

      const { refreshTrackingForReturn } = await import("~/services/tracking.server");
      const result = await refreshTrackingForReturn("ret-1");

      expect(result!.statusChanged).toBe(false);
      expect(prisma.returnEvent.create).not.toHaveBeenCalled();
    });
  });

  describe("bulkRefreshTracking", () => {
    it("processes active returns and returns summary", async () => {
      prisma.returnRequest.findMany.mockResolvedValue([
        { id: "ret-1", shop: "test.myshopify.com", awb: "111", status: "pickup_scheduled" },
        { id: "ret-2", shop: "test.myshopify.com", awb: "222", status: "in_transit" },
      ]);
      // For each call to refreshTrackingForReturn, findUnique will be called
      prisma.returnRequest.findUnique
        .mockResolvedValueOnce({
          id: "ret-1",
          shop: "test.myshopify.com",
          awb: "111",
          awbStatus: "pickup_scheduled",
          status: "pickup_scheduled",
        })
        .mockResolvedValueOnce({
          id: "ret-2",
          shop: "test.myshopify.com",
          awb: "222",
          awbStatus: "in_transit",
          status: "in_transit",
        });
      prisma.logisticsConfig.findFirst.mockResolvedValue({
        providerKey: "delhivery",
        credentials: JSON.stringify({ apiToken: "test-token" }),
      });

      const mockAdapter = {
        trackShipment: vi.fn().mockResolvedValue({
          success: true,
          currentStatus: "In Transit",
          currentStatusCode: "X-PPOM",
          isDelivered: false,
          events: [],
        }),
      };
      logisticsRegistry.getAdapter.mockReturnValue(mockAdapter);
      prisma.returnRequest.update.mockResolvedValue({});

      const { bulkRefreshTracking } = await import("~/services/tracking.server");
      const results = await bulkRefreshTracking();

      expect(results.processed).toBe(2);
      expect(results.errors).toHaveLength(0);
    });

    it("returns empty results when no active returns exist", async () => {
      prisma.returnRequest.findMany.mockResolvedValue([]);

      const { bulkRefreshTracking } = await import("~/services/tracking.server");
      const results = await bulkRefreshTracking();

      expect(results.processed).toBe(0);
      expect(results.updated).toBe(0);
      expect(results.errors).toHaveLength(0);
    });

    it("captures errors without stopping processing", async () => {
      prisma.returnRequest.findMany.mockResolvedValue([
        { id: "ret-1", shop: "test.myshopify.com", awb: "111", status: "pickup_scheduled" },
      ]);
      prisma.returnRequest.findUnique.mockRejectedValue(new Error("DB connection failed"));

      const { bulkRefreshTracking } = await import("~/services/tracking.server");
      const results = await bulkRefreshTracking();

      expect(results.processed).toBe(1);
      expect(results.errors).toHaveLength(1);
      expect(results.errors[0].error).toBe("DB connection failed");
    });
  });
});
