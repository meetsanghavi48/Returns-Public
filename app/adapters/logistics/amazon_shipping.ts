import {
  LogisticsAdapter,
  CredentialField,
  PickupParams,
  PickupResult,
  TrackingResult,
  ServiceabilityResult,
} from "./base";

export class AmazonShippingAdapter extends LogisticsAdapter {
  readonly key = "amazon_shipping";
  readonly displayName = "Amazon Shipping";
  readonly region = "IN";
  readonly logoUrl = "/logos/amazon-shipping.svg";

  readonly credentialFields: CredentialField[] = [
    {
      key: "accessKey",
      label: "Access Key",
      type: "password",
      required: true,
      placeholder: "Enter your Amazon Shipping access key",
    },
    {
      key: "secretKey",
      label: "Secret Key",
      type: "password",
      required: true,
      placeholder: "Enter your Amazon Shipping secret key",
    },
    {
      key: "merchantId",
      label: "Merchant ID",
      type: "text",
      required: true,
      placeholder: "Enter your Amazon merchant ID",
    },
  ];

  async createPickup(
    _params: PickupParams,
    _credentials: Record<string, string>,
  ): Promise<PickupResult> {
    throw new Error("Not implemented: AmazonShipping createPickup");
  }

  async trackShipment(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<TrackingResult> {
    throw new Error("Not implemented: AmazonShipping trackShipment");
  }

  async checkServiceability(
    _originPin: string,
    _destPin: string,
    _credentials: Record<string, string>,
  ): Promise<ServiceabilityResult> {
    throw new Error("Not implemented: AmazonShipping checkServiceability");
  }

  async validateCredentials(
    _credentials: Record<string, string>,
  ): Promise<{ valid: boolean; error?: string }> {
    throw new Error("Not implemented: AmazonShipping validateCredentials");
  }

  async cancelPickup(
    _awb: string,
    _credentials: Record<string, string>,
  ): Promise<{ success: boolean; error?: string }> {
    throw new Error("Not implemented: AmazonShipping cancelPickup");
  }
}
