import {
  LogisticsAdapter,
  type CredentialField,
  type PickupParams,
  type PickupResult,
  type TrackingEvent,
  type TrackingResult,
  type ServiceabilityResult,
} from "./base";

const API_BASE = "https://ws.aramex.net/ShippingAPI.V2";

function buildClientInfo(credentials: Record<string, string>) {
  return {
    UserName: credentials.username || "",
    Password: credentials.password || "",
    Version: "v1.0",
    AccountNumber: credentials.accountNumber || "",
    AccountPin: credentials.accountPin || "",
    AccountEntity: credentials.accountEntity || "",
    AccountCountryCode: credentials.accountCountryCode || "",
    Source: 24,
  };
}

async function aramexFetch(
  urlPath: string,
  body: unknown,
): Promise<any> {
  const url = API_BASE + urlPath;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const opts: RequestInit = {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  };

  const response = await fetch(url, opts);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text, status: response.status };
  }
}

export class AramexAdapter extends LogisticsAdapter {
  readonly key = "aramex";
  readonly displayName = "Aramex";
  readonly region = "GCC";
  readonly logoUrl = "/logos/aramex.svg";

  readonly credentialFields: CredentialField[] = [
    {
      key: "username",
      label: "Username",
      type: "text",
      required: true,
      placeholder: "Enter your username",
      helpText: "Your Aramex API username",
    },
    {
      key: "password",
      label: "Password",
      type: "password",
      required: true,
      placeholder: "Enter your password",
      helpText: "Your Aramex API password",
    },
    {
      key: "accountNumber",
      label: "Account Number",
      type: "text",
      required: true,
      placeholder: "Enter your account number",
      helpText: "Your Aramex shipper account number",
    },
    {
      key: "accountPin",
      label: "Account PIN",
      type: "password",
      required: true,
      placeholder: "Enter your account PIN",
      helpText: "Your Aramex account PIN",
    },
    {
      key: "accountEntity",
      label: "Account Entity",
      type: "text",
      required: true,
      placeholder: "Enter your account entity",
      helpText: "e.g. AMM for Amman, DXB for Dubai",
    },
    {
      key: "accountCountryCode",
      label: "Account Country Code",
      type: "text",
      required: true,
      placeholder: "Enter your account country code",
      helpText: "e.g. JO, AE, SA",
    },
  ];

  async createPickup(
    params: PickupParams,
    credentials: Record<string, string>,
  ): Promise<PickupResult> {
    const clientInfo = buildClientInfo(credentials);

    const totalWeight = Math.max(params.weight / 1000, 0.5);
    const totalQty = params.items.reduce((sum, i) => sum + i.quantity, 0) || 1;
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
      ClientInfo: clientInfo,
      LabelInfo: {
        ReportID: 9201,
        ReportType: "URL",
      },
      Shipments: [
        {
          Reference1: `RET-${params.orderNumber}-${params.returnId}`,
          Reference2: params.returnId,
          Shipper: {
            Reference1: params.orderNumber,
            AccountNumber: credentials.accountNumber,
            PartyAddress: {
              Line1: (params.senderAddress || "N/A").slice(0, 200),
              City: params.senderCity || "",
              StateOrProvinceCode: params.senderState || "",
              PostCode: params.senderPincode || "",
              CountryCode: (params.senderCountry || "AE").slice(0, 2),
            },
            Contact: {
              Department: "",
              PersonName: (params.senderName || "Customer").slice(0, 50),
              Title: "",
              CompanyName: (params.senderName || "Customer").slice(0, 50),
              PhoneNumber1: params.senderPhone.replace(/[^0-9+]/g, "") || "0000000000",
              CellPhone: params.senderPhone.replace(/[^0-9+]/g, "") || "0000000000",
              EmailAddress: "",
            },
          },
          Consignee: {
            Reference1: params.orderNumber,
            AccountNumber: "",
            PartyAddress: {
              Line1: (params.receiverAddress || "N/A").slice(0, 200),
              City: params.receiverCity || "",
              StateOrProvinceCode: params.receiverState || "",
              PostCode: params.receiverPincode || "",
              CountryCode: (params.receiverCountry || "AE").slice(0, 2),
            },
            Contact: {
              Department: "",
              PersonName: (params.receiverName || "Warehouse").slice(0, 50),
              Title: "",
              CompanyName: (params.receiverName || "Warehouse").slice(0, 50),
              PhoneNumber1: params.receiverPhone.replace(/[^0-9+]/g, "") || "0000000000",
              CellPhone: params.receiverPhone.replace(/[^0-9+]/g, "") || "0000000000",
              EmailAddress: "",
            },
          },
          ThirdParty: {
            Reference1: "",
            AccountNumber: "",
            PartyAddress: {
              Line1: "",
              City: "",
              CountryCode: "",
            },
            Contact: {
              Department: "",
              PersonName: "",
              Title: "",
              CompanyName: "",
              PhoneNumber1: "",
              EmailAddress: "",
            },
          },
          Details: {
            Dimensions: {
              Length: params.length || 30,
              Width: params.breadth || 25,
              Height: params.height || 10,
            },
            ActualWeight: { Unit: "KG", Value: totalWeight },
            ChargeableWeight: { Unit: "KG", Value: totalWeight },
            DescriptionOfGoods: productsDesc,
            GoodsOriginCountry: (params.senderCountry || "AE").slice(0, 2),
            NumberOfPieces: totalQty,
            ProductGroup: "EXP",
            ProductType: "PPX",
            PaymentType: "P",
            Items: params.items.map((item) => ({
              PackageType: "Box",
              Quantity: item.quantity,
              Weight: { Unit: "KG", Value: Math.max((params.weight / 1000) / totalQty, 0.1) },
              Comments: item.name.slice(0, 100),
              Reference: item.sku,
              CustomsValue: { CurrencyCode: "AED", Value: item.price },
            })),
          },
        },
      ],
      Transaction: {
        Reference1: params.orderNumber,
        Reference2: params.returnId,
        Reference3: "",
        Reference4: "",
        Reference5: "",
      },
    };

    try {
      const data = await aramexFetch(
        "/Shipping/Service_1_0.svc/json/CreateShipments",
        payload,
      );

      const shipment = data?.Shipments?.[0];
      const awb = shipment?.ID || shipment?.AirwayBillNumber;

      if (awb && !data?.HasErrors) {
        const labelUrl = shipment?.ShipmentLabel?.LabelURL || undefined;

        return {
          success: true,
          awb: String(awb),
          trackingUrl: `https://www.aramex.com/us/en/track/results?ShipmentNumber=${awb}`,
          labelUrl,
          rawResponse: data,
        };
      }

      const notifications = data?.Notifications || [];
      const errMsg =
        notifications.map((n: any) => n.Message).join("; ") ||
        data?.HasErrors?.toString() ||
        JSON.stringify(data).slice(0, 300);

      return {
        success: false,
        error: errMsg || "Aramex did not return an AWB",
        rawResponse: data,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to create Aramex shipment",
      };
    }
  }

  async trackShipment(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    const clientInfo = buildClientInfo(credentials);

    const payload = {
      ClientInfo: clientInfo,
      GetLastTrackingUpdateOnly: false,
      Shipments: [awb],
      Transaction: {
        Reference1: "",
        Reference2: "",
        Reference3: "",
        Reference4: "",
        Reference5: "",
      },
    };

    try {
      const data = await aramexFetch(
        "/Tracking/Service_1_0.svc/json/TrackShipments",
        payload,
      );

      const results = data?.TrackingResults || [];
      const result = results[0];

      if (!result || data?.HasErrors) {
        const notifications = data?.Notifications || [];
        return {
          success: false,
          awb,
          currentStatus: "Unknown",
          currentStatusCode: "",
          events: [],
          isDelivered: false,
          error:
            notifications.map((n: any) => n.Message).join("; ") ||
            "No tracking data found",
          rawResponse: data,
        };
      }

      const scanEvents: any[] = result?.Value || [];
      const events: TrackingEvent[] = scanEvents.map((event: any) => ({
        timestamp: event.UpdateDateTime || "",
        status: event.UpdateDescription || "",
        statusCode: event.UpdateCode || "",
        location: event.UpdateLocation || "",
        description: event.Comments || event.UpdateDescription || "",
      }));

      const latestEvent = events[0];
      const currentStatus = latestEvent?.status || "In Transit";
      const currentStatusCode = latestEvent?.statusCode || "";
      const isDelivered =
        currentStatus.toLowerCase().includes("delivered") ||
        currentStatusCode === "SH005";

      return {
        success: true,
        awb,
        currentStatus,
        currentStatusCode,
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
        error: err.message || "Failed to track shipment",
      };
    }
  }

  async checkServiceability(
    originPin: string,
    destPin: string,
    credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    const clientInfo = buildClientInfo(credentials);

    const payload = {
      ClientInfo: clientInfo,
      CountryCode: credentials.accountCountryCode || "AE",
      State: "",
      NameStartsWith: destPin,
      Transaction: {
        Reference1: "",
        Reference2: "",
        Reference3: "",
        Reference4: "",
        Reference5: "",
      },
    };

    try {
      const data = await aramexFetch(
        "/Location/Service_1_0.svc/json/FetchCities",
        payload,
      );

      const cities = data?.Cities || [];

      if (!cities.length || data?.HasErrors) {
        return {
          serviceable: false,
          error: `No serviceable cities found for ${destPin}`,
        };
      }

      return {
        serviceable: true,
        codAvailable: false,
      };
    } catch (err: any) {
      return {
        serviceable: false,
        error: err.message || "Failed to check serviceability",
      };
    }
  }

  async validateCredentials(
    credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    const { username, password: pwd, accountNumber } = credentials;

    if (!username) {
      return { valid: false, error: "Username is required" };
    }
    if (!pwd) {
      return { valid: false, error: "Password is required" };
    }
    if (!accountNumber) {
      return { valid: false, error: "Account number is required" };
    }

    const clientInfo = buildClientInfo(credentials);

    try {
      // Validate by tracking a dummy waybill - auth errors mean invalid credentials
      const data = await aramexFetch(
        "/Tracking/Service_1_0.svc/json/TrackShipments",
        {
          ClientInfo: clientInfo,
          GetLastTrackingUpdateOnly: true,
          Shipments: ["0000000000"],
          Transaction: {
            Reference1: "",
            Reference2: "",
            Reference3: "",
            Reference4: "",
            Reference5: "",
          },
        },
      );

      if (data?.raw && typeof data.raw === "string") {
        const lower = data.raw.toLowerCase();
        if (
          lower.includes("unauthorized") ||
          lower.includes("forbidden") ||
          lower.includes("invalid credentials")
        ) {
          return { valid: false, error: "Invalid credentials" };
        }
      }

      if (data?.status === 401 || data?.status === 403) {
        return { valid: false, error: "Invalid credentials" };
      }

      // Check Aramex-specific error notifications for auth failures
      const notifications = data?.Notifications || [];
      const authError = notifications.find(
        (n: any) =>
          n.Code === "ERR01" ||
          (n.Message || "").toLowerCase().includes("invalid") ||
          (n.Message || "").toLowerCase().includes("unauthorized"),
      );

      if (authError) {
        return { valid: false, error: authError.Message || "Invalid credentials" };
      }

      // If we get a response (even with no tracking data), credentials are valid
      return { valid: true };
    } catch (err: any) {
      return {
        valid: false,
        error: err.message || "Failed to validate credentials",
      };
    }
  }

  async cancelPickup(
    awb: string,
    credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    const clientInfo = buildClientInfo(credentials);

    const payload = {
      ClientInfo: clientInfo,
      PickupGUID: awb,
      Transaction: {
        Reference1: "",
        Reference2: "",
        Reference3: "",
        Reference4: "",
        Reference5: "",
      },
    };

    try {
      // Aramex uses CreatePickup for scheduling and CancelPickup for cancellation
      const data = await aramexFetch(
        "/Shipping/Service_1_0.svc/json/CancelPickup",
        payload,
      );

      if (!data?.HasErrors) {
        return { success: true };
      }

      const notifications = data?.Notifications || [];
      const errMsg =
        notifications.map((n: any) => n.Message).join("; ") ||
        JSON.stringify(data).slice(0, 300);

      return { success: false, error: errMsg || "Failed to cancel pickup" };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || "Failed to cancel pickup",
      };
    }
  }
}
