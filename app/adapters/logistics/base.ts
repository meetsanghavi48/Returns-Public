export interface PickupParams {
  returnId: string;
  awb?: string;
  senderName: string;
  senderPhone: string;
  senderAddress: string;
  senderCity: string;
  senderState: string;
  senderPincode: string;
  senderCountry: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  receiverCity: string;
  receiverState: string;
  receiverPincode: string;
  receiverCountry: string;
  weight: number; // grams
  length?: number;
  breadth?: number;
  height?: number;
  items: Array<{
    name: string;
    sku: string;
    quantity: number;
    price: number;
  }>;
  orderNumber: string;
  paymentMode: "prepaid" | "cod";
}

export interface PickupResult {
  success: boolean;
  awb?: string;
  trackingUrl?: string;
  labelUrl?: string;
  estimatedPickup?: string;
  rawResponse?: unknown;
  error?: string;
}

export interface TrackingEvent {
  timestamp: string;
  status: string;
  statusCode: string;
  location: string;
  description: string;
}

export interface TrackingResult {
  success: boolean;
  awb: string;
  currentStatus: string;
  currentStatusCode: string;
  estimatedDelivery?: string;
  events: TrackingEvent[];
  isDelivered: boolean;
  rawResponse?: unknown;
  error?: string;
}

export interface ServiceabilityResult {
  serviceable: boolean;
  estimatedDays?: number;
  codAvailable?: boolean;
  error?: string;
}

export interface CredentialField {
  key: string;
  label: string;
  type: "text" | "password" | "email" | "url" | "select" | "number" | "multiselect";
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: Array<{ label: string; value: string }>;
}

export interface AdapterMeta {
  qcSupport?: boolean;
  contactEmail?: string;
  setupGuideUrl?: string;
}

export abstract class LogisticsAdapter {
  abstract readonly key: string;
  abstract readonly displayName: string;
  abstract readonly region: string;
  abstract readonly logoUrl: string;
  abstract readonly credentialFields: CredentialField[];
  readonly meta: AdapterMeta = {};

  abstract createPickup(params: PickupParams, credentials: Record<string, string>): Promise<PickupResult>;
  abstract trackShipment(awb: string, credentials: Record<string, string>): Promise<TrackingResult>;
  abstract checkServiceability(originPin: string, destPin: string, credentials: Record<string, string>): Promise<ServiceabilityResult>;
  abstract validateCredentials(credentials: Record<string, string>): Promise<{ valid: boolean; error?: string }>;
  abstract cancelPickup(awb: string, credentials: Record<string, string>): Promise<{ success: boolean; error?: string }>;
}
