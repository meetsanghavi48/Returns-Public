import { logisticsRegistry } from "./registry";

// Tier 1 — Indian Logistics (real or semi-real implementations)
import { DelhiveryAdapter } from "./delhivery";
import { ShiprocketAdapter } from "./shiprocket";
import { NimbuspostAdapter } from "./nimbuspost";
import { XpressbeesAdapter } from "./xpressbees";
import { ShadowfaxAdapter } from "./shadowfax";
import { DtdcAdapter } from "./dtdc";
import { BluedartAdapter } from "./bluedart";
import { EkartAdapter } from "./ekart";
import { PickrrAdapter } from "./pickrr";
import { EshipzAdapter } from "./eshipz";
import { ShipwayAdapter } from "./shipway";
import { BorzoAdapter } from "./borzo";
import { PorterAdapter } from "./porter";
import { DunzoAdapter } from "./dunzo";
import { LalamoveAdapter } from "./lalamove";
import { AmazonShippingAdapter } from "./amazon_shipping";
import { EcomExpressAdapter } from "./ecom_express";
import { IThinkAdapter } from "./ithink";
import { ShypliteAdapter } from "./shyplite";

// Tier 1 — Global Logistics
import { ShippoAdapter } from "./shippo";
import { EasyPostAdapter } from "./easypost";
import { ShipStationAdapter } from "./shipstation";
import { FedExAdapter } from "./fedex";
import { UPSAdapter } from "./ups";
import { DHLAdapter } from "./dhl";

// Tier 2 — Regional
import { AustraliaPostAdapter } from "./australia_post";
import { RoyalMailAdapter } from "./royal_mail";
import { CanadaPostAdapter } from "./canada_post";
import { PostNLAdapter } from "./postnl";
import { CorreosAdapter } from "./correos";
import { AramexAdapter } from "./aramex";
import { DHLGCCAdapter } from "./dhl_gcc";
import { QuiqupAdapter } from "./quiqup";
import { OTOAdapter } from "./oto";
import { EasyParcelAdapter } from "./easy_parcel";
import { StarlinksAdapter } from "./starlinks";

// Tier 3 — New real implementations
import { ClickPostAdapter } from "./clickpost";
import { SendcloudAdapter } from "./sendcloud";
import { EasyshipAdapter } from "./easyship";
import { USPSAdapter } from "./usps";
import { GoswiftAdapter } from "./goswift";

// Tier 4 — New stubs (contact required for API access)
import { WareIQAdapter } from "./wareiq";
import { HolisolAdapter } from "./holisol";
import { ShipdelightAdapter } from "./shipdelight";
import { ProshipAdapter } from "./proship";
import { OnlineXpressAdapter } from "./onlinexpress";
import { DPDUKAdapter } from "./dpd_uk";
import { DPDGermanyAdapter } from "./dpd_germany";
import { GLSAdapter } from "./gls";
import { CargusAdapter } from "./cargus";
import { EnviaAdapter } from "./envia";

// Tier 5 — Return Prime discovered stubs
import { HFDAdapter } from "./hfd";
import { ShipmondoAdapter } from "./shipmondo";
import { DepoterAdapter } from "./depoter";
import { EShipperAdapter } from "./eshipper";
import { ParceliticsAdapter } from "./parcelitics";
import { EkartLiteAdapter } from "./ekart_lite";
import { VamashipAdapter } from "./vamaship";
import { KwikshipAdapter } from "./kwikship";
import { ShipcluesAdapter } from "./shipclues";
import { QuickshiftAdapter } from "./quickshift";
import { FulfillmentToolsAdapter } from "./fulfillment_tools";
import { ShipMozoAdapter } from "./shipmozo";
import { ShadowfaxV2Adapter } from "./shadowfax_v2";
import { ShippigoAdapter } from "./shippigo";
import { BoxNowAdapter } from "./boxnow";
import { CitilinkAdapter } from "./citilink";
import { Go2StreamAdapter } from "./go2stream";
import { DelhiveryQCV3Adapter } from "./delhivery_qc_v3";
import { VelocityAdapter } from "./velocity";
import { VelocityV2Adapter } from "./velocityv2";
import { OmuniLogisticsAdapter } from "./omuni_logistics";

// Register all logistics adapters
// Indian
logisticsRegistry.register(new DelhiveryAdapter());
logisticsRegistry.register(new ShiprocketAdapter());
logisticsRegistry.register(new NimbuspostAdapter());
logisticsRegistry.register(new XpressbeesAdapter());
logisticsRegistry.register(new ShadowfaxAdapter());
logisticsRegistry.register(new DtdcAdapter());
logisticsRegistry.register(new BluedartAdapter());
logisticsRegistry.register(new EkartAdapter());
logisticsRegistry.register(new PickrrAdapter());
logisticsRegistry.register(new EshipzAdapter());
logisticsRegistry.register(new ShipwayAdapter());
logisticsRegistry.register(new BorzoAdapter());
logisticsRegistry.register(new PorterAdapter());
logisticsRegistry.register(new DunzoAdapter());
logisticsRegistry.register(new LalamoveAdapter());
logisticsRegistry.register(new AmazonShippingAdapter());
logisticsRegistry.register(new EcomExpressAdapter());
logisticsRegistry.register(new IThinkAdapter());
logisticsRegistry.register(new ShypliteAdapter());

// Global
logisticsRegistry.register(new ShippoAdapter());
logisticsRegistry.register(new EasyPostAdapter());
logisticsRegistry.register(new ShipStationAdapter());
logisticsRegistry.register(new FedExAdapter());
logisticsRegistry.register(new UPSAdapter());
logisticsRegistry.register(new DHLAdapter());

// Regional
logisticsRegistry.register(new AustraliaPostAdapter());
logisticsRegistry.register(new RoyalMailAdapter());
logisticsRegistry.register(new CanadaPostAdapter());
logisticsRegistry.register(new PostNLAdapter());
logisticsRegistry.register(new CorreosAdapter());
logisticsRegistry.register(new AramexAdapter());
logisticsRegistry.register(new DHLGCCAdapter());
logisticsRegistry.register(new QuiqupAdapter());
logisticsRegistry.register(new OTOAdapter());
logisticsRegistry.register(new EasyParcelAdapter());
logisticsRegistry.register(new StarlinksAdapter());

// New real implementations
logisticsRegistry.register(new ClickPostAdapter());
logisticsRegistry.register(new SendcloudAdapter());
logisticsRegistry.register(new EasyshipAdapter());
logisticsRegistry.register(new USPSAdapter());
logisticsRegistry.register(new GoswiftAdapter());

// New stubs
logisticsRegistry.register(new WareIQAdapter());
logisticsRegistry.register(new HolisolAdapter());
logisticsRegistry.register(new ShipdelightAdapter());
logisticsRegistry.register(new ProshipAdapter());
logisticsRegistry.register(new OnlineXpressAdapter());
logisticsRegistry.register(new DPDUKAdapter());
logisticsRegistry.register(new DPDGermanyAdapter());
logisticsRegistry.register(new GLSAdapter());
logisticsRegistry.register(new CargusAdapter());
logisticsRegistry.register(new EnviaAdapter());

// Return Prime discovered stubs
logisticsRegistry.register(new HFDAdapter());
logisticsRegistry.register(new ShipmondoAdapter());
logisticsRegistry.register(new DepoterAdapter());
logisticsRegistry.register(new EShipperAdapter());
logisticsRegistry.register(new ParceliticsAdapter());
logisticsRegistry.register(new EkartLiteAdapter());
logisticsRegistry.register(new VamashipAdapter());
logisticsRegistry.register(new KwikshipAdapter());
logisticsRegistry.register(new ShipcluesAdapter());
logisticsRegistry.register(new QuickshiftAdapter());
logisticsRegistry.register(new FulfillmentToolsAdapter());
logisticsRegistry.register(new ShipMozoAdapter());
logisticsRegistry.register(new ShadowfaxV2Adapter());
logisticsRegistry.register(new ShippigoAdapter());
logisticsRegistry.register(new BoxNowAdapter());
logisticsRegistry.register(new CitilinkAdapter());
logisticsRegistry.register(new Go2StreamAdapter());
logisticsRegistry.register(new DelhiveryQCV3Adapter());
logisticsRegistry.register(new VelocityAdapter());
logisticsRegistry.register(new VelocityV2Adapter());
logisticsRegistry.register(new OmuniLogisticsAdapter());

// Re-export for convenience
export { logisticsRegistry } from "./registry";
export { LogisticsAdapter } from "./base";
export type {
  PickupParams,
  PickupResult,
  TrackingEvent,
  TrackingResult,
  ServiceabilityResult,
  CredentialField,
  AdapterMeta,
} from "./base";
