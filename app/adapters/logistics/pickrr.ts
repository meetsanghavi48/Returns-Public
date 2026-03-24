import {
  LogisticsAdapter,
  CredentialField,
  PickupParams,
  PickupResult,
  TrackingResult,
  ServiceabilityResult,
} from "./base";

/**
 * Pickrr logistics adapter stub.
 * Note: Pickrr has been acquired by Shiprocket.
 */
export class PickrrAdapter extends LogisticsAdapter {
  readonly key = "pickrr";
  readonly displayName = "Pickrr";
  readonly region = "IN";
  readonly logoUrl = "/logos/pickrr.png";
  readonly credentialFields: CredentialField[] = [
    {
      key: "authToken",
      label: "Auth Token",
      type: "password",
      required: true,
      placeholder: "Enter your Pickrr auth token",
    },
  ];

  async createPickup(
    _params: PickupParams,
    _credentials: Record<string, string>,
  ): Promise<PickupResult> {
    throw new Error("Not implemented: Pickrr createPickup");
  }

  async trackShipment(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    throw new Error("Not implemented: Pickrr trackShipment");
  }

  async checkServiceability(
    _originPin: string,
    _destPin: string,
    _credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    throw new Error("Not implemented: Pickrr checkServiceability");
  }

  async validateCredentials(
    _credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    throw new Error("Not implemented: Pickrr validateCredentials");
  }

  async cancelPickup(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    throw new Error("Not implemented: Pickrr cancelPickup");
  }
}
