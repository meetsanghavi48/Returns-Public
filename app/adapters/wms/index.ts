import { wmsRegistry } from "./registry";

import { UnicommerceAdapter } from "./unicommerce";
import { ZohoInventoryAdapter } from "./zoho_inventory";
import { FyndAdapter } from "./fynd";
import { OmuniAdapter } from "./omuni";
import { VinculumAdapter } from "./vinculum";
import { VinculumMarmetoAdapter } from "./vinculum_marmeto";
import { EasyecomAdapter } from "./easyecom";
import { EasyecomV3Adapter } from "./easyecom_v3";
import { BrowntapeAdapter } from "./browntape";
import { IncreffAdapter } from "./increff";
import { BluecherryAdapter } from "./bluecherry";
import { IdfAdapter } from "./idf";
import { AutomyzeAdapter } from "./automyze";
import { EshopboxAdapter } from "./eshopbox";

// Tier 1 — Real implementations
wmsRegistry.register(new UnicommerceAdapter());
wmsRegistry.register(new ZohoInventoryAdapter());

// Tier 2 — Stubs
wmsRegistry.register(new FyndAdapter());
wmsRegistry.register(new OmuniAdapter());
wmsRegistry.register(new VinculumAdapter());
wmsRegistry.register(new VinculumMarmetoAdapter());
wmsRegistry.register(new EasyecomAdapter());
wmsRegistry.register(new EasyecomV3Adapter());
wmsRegistry.register(new BrowntapeAdapter());
wmsRegistry.register(new IncreffAdapter());
wmsRegistry.register(new BluecherryAdapter());
wmsRegistry.register(new IdfAdapter());
wmsRegistry.register(new AutomyzeAdapter());
wmsRegistry.register(new EshopboxAdapter());

export { wmsRegistry };
export type { WmsAdapterEntry } from "./registry";
export type {
  WmsAdapter,
  WmsReturnParams,
  WmsReturnResult,
  CredentialField,
} from "./base";
