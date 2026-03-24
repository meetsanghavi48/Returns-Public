// TODO: Research full Ecom Express API at https://integration.ecomexpress.in
// TODO: API documentation and endpoints need to be confirmed via https://integration.ecomexpress.in

import {
  LogisticsAdapter,
  type PickupParams,
  type PickupResult,
  type TrackingResult,
  type ServiceabilityResult,
  type CredentialField,
} from "./base";

// TODO: Confirm base URLs from https://integration.ecomexpress.in
const _API_BASE = "https://api.ecomexpress.in";
const _INTEGRATION_BASE = "https://integration.ecomexpress.in";

export class EcomExpressAdapter extends LogisticsAdapter {
  readonly key = "ecom_express";
  readonly displayName = "Ecom Express";
  readonly region = "IN";
  readonly logoUrl = "/images/logistics/ecom_express.png";

  readonly credentialFields: CredentialField[] = [
    {
      key: "username",
      label: "Username",
      type: "text",
      required: true,
      placeholder: "Enter your Ecom Express username",
      helpText: "Your Ecom Express API username",
    },
    {
      key: "password",
      label: "Password",
      type: "password",
      required: true,
      placeholder: "Enter your Ecom Express password",
      helpText: "Your Ecom Express API password",
    },
  ];

  // TODO: Implement using Ecom Express API - https://integration.ecomexpress.in
  createPickup(
    _params: PickupParams,
    _credentials: Record<string, string>,
  ): Promise<PickupResult> {
    throw new Error("Not implemented: Ecom Express createPickup");
  }

  // TODO: Implement using Ecom Express API - https://integration.ecomexpress.in
  trackShipment(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    throw new Error("Not implemented: Ecom Express trackShipment");
  }

  // TODO: Implement using Ecom Express API - https://integration.ecomexpress.in
  checkServiceability(
    _originPin: string,
    _destPin: string,
    _credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    throw new Error("Not implemented: Ecom Express checkServiceability");
  }

  // TODO: Implement using Ecom Express API - https://integration.ecomexpress.in
  validateCredentials(
    _credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    throw new Error("Not implemented: Ecom Express validateCredentials");
  }

  // TODO: Implement using Ecom Express API - https://integration.ecomexpress.in
  cancelPickup(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    throw new Error("Not implemented: Ecom Express cancelPickup");
  }
}
