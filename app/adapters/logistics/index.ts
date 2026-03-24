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

// Tier 2 — Regional stubs
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
} from "./base";
