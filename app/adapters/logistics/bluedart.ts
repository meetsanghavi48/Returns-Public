import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingEvent,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

const API_BASE = "https://apigateway.bluedart.com";

async function bluedartFetch(
  loginId: string,
  licenceKey: string,
  method: string,
  urlPath: string,
  body?: unknown,
): Promise<any> {
  const url = API_BASE + urlPath;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-LoginId": loginId,
    "X-LicenceKey": licenceKey,
  };
  const opts: RequestInit = { method, headers };

  if (body) {
    opts.body = JSON.stringify(body);
  }

  const response = await fetch(url, opts);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, status: response.status };
  }
}

export class BluedartAdapter extends LogisticsAdapter {
  readonly key = "bluedart";
  readonly displayName = "Bluedart";
  readonly region = "IN";
  readonly logoUrl = "https://www.google.com/s2/favicons?domain=bluedart.com&sz=64";

  readonly credentialFields: CredentialField[] = [
    {
      key: "login_id",
      label: "Login ID",
      type: "text",
      required: true,
      placeholder: "Your Bluedart Login ID",
      helpText: "Login ID provided during Bluedart API onboarding",
    },
    {
      key: "licence_key",
      label: "Licence Key",
      type: "password",
      required: true,
      placeholder: "Your Bluedart Licence Key",
      helpText: "Licence key from Bluedart / DHL eCommerce API portal",
    },
    {
      key: "customer_code",
      label: "Customer Code",
      type: "text",
      required: true,
      placeholder: "Your Bluedart Customer Code",
      helpText: "Customer code assigned by Bluedart",
    },
  ];

  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const { login_id, licence_key, customer_code } = credentials;

    const totalQty = params.items.reduce((sum, i) => sum + i.quantity, 0) || 1;
    const totalWeight = Math.max(params.weight / 1000, 0.5);
    const totalAmount = params.items.reduce(
      (sum, i) => sum + i.price * i.quantity,
      0,
    );
    const productsDesc =
      params.items
        .map((i) => `${i.name} x${i.quantity}`)
        .join(", ")
        .slice(0, 200) || "Return Shipment";

    const payload = {
      Request: {
        Consignee: {
          ConsigneeName: params.receiverName.slice(0, 50) || "Warehouse",
          ConsigneeAddress1: params.receiverAddress.slice(0, 100),
          ConsigneePincode: params.receiverPincode,
          ConsigneePhone: params.receiverPhone.replace(/[^0-9]/g, "").slice(-10),
          ConsigneeCity: params.receiverCity,
          ConsigneeState: params.receiverState,
        },
        Shipper: {
          CustomerCode: customer_code,
          CustomerName: params.senderName.slice(0, 50) || "Customer",
          CustomerAddress1: params.senderAddress.slice(0, 100),
          CustomerPincode: params.senderPincode,
          CustomerPhone: params.senderPhone.replace(/[^0-9]/g, "").slice(-10),
          CustomerCity: params.senderCity,
          CustomerState: params.senderState,
        },
        Services: {
          ActualWeight: totalWeight,
          CollectableAmount: params.paymentMode === "cod" ? totalAmount : 0,
          Quantity: totalQty,
          ProductCode: "A",
          ProductType: "Dutiables",
          DeclaredValue: totalAmount,
          CreditReferenceNo: `${params.orderNumber}_${params.returnId}`,
          PickupDate: new Date().toISOString().split("T")[0],
          PieceCount: totalQty,
          Dimensions: {
            Length: params.length || 30,
            Breadth: params.breadth || 25,
            Height: params.height || 10,
          },
          CommodityDetail1: productsDesc,
        },
      },
    };

    try {
      const data = await bluedartFetch(
        login_id,
        licence_key,
        "POST",
        "/in/transportation/shipment/v1/RegisterWaybill",
        payload,
      );

      const awb =
        data?.RegisterWaybillResult?.AWBNo ||
        data?.AWBNo ||
        data?.waybill ||
        data?.awb_number;

      if (awb) {
        return {
          success: true,
          awb: String(awb),
          trackingUrl: `https://www.bluedart.com/tracking/${awb}`,
          rawResponse: data,
        };
      }

      const errMsg =
        data?.RegisterWaybillResult?.ErrorMessage ||
        data?.error?.message ||
        data?.message ||
        JSON.stringify(data).slice(0, 300);

      return {
        success: false,
        error: errMsg || "Bluedart did not return an AWB number",
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to create Bluedart pickup",
      };
    }
  }

  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const { login_id, licence_key } = credentials;

    try {
      const data = await bluedartFetch(
        login_id,
        licence_key,
        "GET",
        `/in/transportation/tracking/v1/GetTrackingByWaybill?WaybillNo=${encodeURIComponent(awb)}`,
      );

      const trackingData =
        data?.GetTrackingByWaybillResult || data?.TrackingResult || data;

      const scans: any[] =
        trackingData?.ScanDetails ||
        trackingData?.scans ||
        trackingData?.Scans ||
        [];

      const events: TrackingEvent[] = scans.map((scan: any) => ({
        timestamp: scan.ScanDate || scan.DateTime || scan.timestamp || "",
        status: scan.Scan || scan.Status || scan.Activity || "",
        statusCode: scan.ScanCode || scan.StatusCode || "",
        location: scan.ScannedLocation || scan.Location || scan.ScanLocation || "",
        description: scan.Instructions || scan.Scan || scan.Activity || "",
      }));

      const currentStatus =
        trackingData?.Status || trackingData?.CurrentStatus || "In Transit";
      const currentStatusCode =
        trackingData?.StatusCode || trackingData?.CurrentStatusCode || "";
      const isDelivered =
        currentStatus.toLowerCase().includes("delivered") ||
        currentStatusCode === "DL" ||
        currentStatusCode === "DEL";

      return {
        success: true,
        awb,
        currentStatus,
        currentStatusCode,
        estimatedDelivery: trackingData?.ExpectedDeliveryDate || undefined,
        events,
        isDelivered,
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        awb,
        currentStatus: "Error",
        currentStatusCode: "",
        events: [],
        isDelivered: false,
        error: err.message || "Failed to track Bluedart shipment",
      };
    }
  }

  async checkServiceability(
    originPin: string,
    destPin: string,
    credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    const { login_id, licence_key, customer_code } = credentials;

    try {
      const data = await bluedartFetch(
        login_id,
        licence_key,
        "GET",
        `/in/transportation/serviceability/v1/GetServiceability?pinCode=${encodeURIComponent(destPin)}&originPinCode=${encodeURIComponent(originPin)}&customerCode=${encodeURIComponent(customer_code)}&productCode=A`,
      );

      const result =
        data?.GetServiceabilityResult ||
        data?.ServiceabilityResult ||
        data;

      if (!result) {
        return {
          serviceable: false,
          error: `No serviceability data returned for ${originPin} -> ${destPin}`,
        };
      }

      const serviceable =
        result?.IsServiceable === true ||
        result?.isServiceable === true ||
        result?.Serviceable === "Y" ||
        result?.serviceable === true;

      const estimatedDays = result?.EstimatedDays
        ? parseInt(String(result.EstimatedDays), 10)
        : result?.TransitDays
          ? parseInt(String(result.TransitDays), 10)
          : undefined;

      const codAvailable =
        result?.CodAvailable === true ||
        result?.CODAvailable === "Y" ||
        result?.codAvailable === true;

      return {
        serviceable,
        estimatedDays: estimatedDays || undefined,
        codAvailable,
      };
    } catch (err: any) {
      return {
        serviceable: false,
        error: err.message || "Failed to check Bluedart serviceability",
      };
    }
  }

  async validateCredentials(
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    const { login_id, licence_key, customer_code } = credentials;

    if (!login_id) {
      return { valid: false, error: "Login ID is required" };
    }
    if (!licence_key) {
      return { valid: false, error: "Licence Key is required" };
    }
    if (!customer_code) {
      return { valid: false, error: "Customer Code is required" };
    }

    try {
      // Use a lightweight serviceability check to validate credentials
      const data = await bluedartFetch(
        login_id,
        licence_key,
        "GET",
        `/in/transportation/serviceability/v1/GetServiceability?pinCode=110001&originPinCode=400001&customerCode=${encodeURIComponent(customer_code)}&productCode=A`,
      );

      if (data?.raw && typeof data.raw === "string") {
        const lower = data.raw.toLowerCase();
        if (
          lower.includes("unauthorized") ||
          lower.includes("forbidden") ||
          lower.includes("invalid") ||
          lower.includes("authentication")
        ) {
          return { valid: false, error: "Invalid credentials" };
        }
      }

      if (data?.status === 401 || data?.status === 403) {
        return { valid: false, error: "Invalid Login ID or Licence Key" };
      }

      return { valid: true };
    } catch (err: any) {
      return {
        valid: false,
        error: err.message || "Failed to validate Bluedart credentials",
      };
    }
  }

  async cancelPickup(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    const { login_id, licence_key, customer_code } = credentials;

    try {
      const data = await bluedartFetch(
        login_id,
        licence_key,
        "POST",
        "/in/transportation/shipment/v1/CancelShipment",
        {
          Request: {
            AWBNo: awb,
            CustomerCode: customer_code,
          },
        },
      );

      const result = data?.CancelShipmentResult || data;

      if (
        result?.Status === true ||
        result?.status === true ||
        result?.success === true ||
        result?.IsCancelled === true
      ) {
        return { success: true };
      }

      if (data?.raw && typeof data.raw === "string") {
        const lower = data.raw.toLowerCase();
        if (lower.includes("success") || lower.includes("cancelled") || lower.includes("canceled")) {
          return { success: true };
        }
      }

      const errMsg =
        result?.ErrorMessage ||
        result?.error ||
        result?.message ||
        (typeof data?.raw === "string" ? data.raw.slice(0, 200) : undefined) ||
        "Cancellation response unclear";

      return { success: false, error: errMsg };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to cancel Bluedart pickup",
      };
    }
  }
}
