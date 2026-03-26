export const SANDBOX_CONFIG = {

  // ─── APP ───
  APP_URL: 'https://returns-public.onrender.com',
  SHOP: 'my-returns-test.myshopify.com',
  PORTAL_URL: 'https://returns-public.onrender.com/portal/my-returns-test.myshopify.com',
  SHOPIFY_API_BASE: 'https://my-returns-test.myshopify.com/admin/api/2025-01',

  // ─── REAL CUSTOMER DATA ───
  customers: {
    ayumu: {
      name: 'Ayumu Hirano',
      email: 'ayumu.hirano@example.com',
      phone: '+16135550127',
      address: '31 New Tara Appatment',
      company: 'Blakc',
      city: 'Mumbai',
      state: 'MH',
      pincode: '400086',
      country: 'IN',
      shopifyAddress: 'Meet Sanghavi, Blakc, Ghatkopar West, 31 New Tara Appatment, 400086 Mumbai MH, India',
    },
    karine: {
      name: 'Karine Ruby',
      email: 'dhanline9@gmail.com',
      phone: '+16135550142',
      address: "Box 42 - 151 O'Connor St",
      city: 'Ottawa',
      state: 'ON',
      pincode: 'K2P2L8',
      country: 'CA',
      shippingAddress: 'Ghatkopar West, 400086 Mumbai MH, India',
    },
  },

  // ─── REAL ORDERS ───
  orders: {
    // ORDER #1002 — PREPAID (Paid + Fulfilled + Archived)
    prepaid: {
      number: '#1002',
      email: 'ayumu.hirano@example.com',
      customerName: 'Ayumu Hirano',
      status: 'paid',
      fulfillmentStatus: 'fulfilled',
      items: [
        { title: 'Selling Plans Ski Wax', variant: 'Selling Plans Ski Wax', price: 24.95, qty: 1 },
        { title: 'Selling Plans Ski Wax', variant: 'Special Selling Plans Ski Wax', price: 49.95, qty: 1 },
        { title: 'Selling Plans Ski Wax', variant: 'Sample Selling Plans Ski Wax', price: 9.95, qty: 1 },
        { title: 'The Collection Snowboard: Hydrogen', price: 600.00, qty: 1 },
        { title: 'The Collection Snowboard: Liquid', price: 749.95, qty: 1 },
        { title: 'The Collection Snowboard: Oxygen', price: 1025.00, qty: 1 },
        { title: 'The Compare at Price Snowboard', price: 785.95, qty: 1 },
        { title: 'The Complete Snowboard', variant: 'Ice', price: 699.95, qty: 1 },
      ],
      testReturnItem: { title: 'Selling Plans Ski Wax', variant: 'Special Selling Plans Ski Wax', price: 49.95 },
    },

    // ORDER #1005 — COD (Payment Pending + Fulfilled)
    cod: {
      number: '#1005',
      email: 'dhanline9@gmail.com',
      customerName: 'Karine Ruby',
      status: 'pending',
      fulfillmentStatus: 'fulfilled',
      items: [
        { title: 'The Complete Snowboard', variant: 'Electric', price: 699.95, qty: 1 },
        { title: 'The Complete Snowboard', variant: 'Sunset', price: 699.95, qty: 1 },
        { title: 'The Inventory Not Tracked Snowboard', sku: 'sku-untracked-1', price: 949.95, qty: 1 },
      ],
      total: 2349.85,
      testReturnItem: { title: 'The Complete Snowboard', variant: 'Electric', price: 699.95 },
    },

    // ORDER #1002 — EXCHANGE (already has exchange note)
    exchange: {
      number: '#1002',
      email: 'ayumu.hirano@example.com',
      customerName: 'Ayumu Hirano',
      exchangeNote: 'EXCHANGE REQUEST #1002 — Selling Plans Ski Wax x1 → Special Selling Plans Ski Wax',
    },

    // HIGH VALUE (use #1005 items)
    highValue: {
      number: '#1005',
      email: 'dhanline9@gmail.com',
      customerName: 'Karine Ruby',
      total: 2349.85,
      testReturnItem: { title: 'The Inventory Not Tracked Snowboard', price: 949.95 },
    },
  },

  // ─── LEGACY customer alias (backward compat) ───
  customer: {
    name: 'Ayumu Hirano',
    email: 'ayumu.hirano@example.com',
    phone: '9820899979',
    address: '31 New Tara Apartment, Ghatkopar West',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400086',
    country: 'IN',
    ifsc: 'HDFC0000001',
    accountNumber: '1234567890',
    upi: 'success@razorpay',
  },

  // ─── PAYMENT SANDBOXES ───

  razorpay: {
    name: 'Razorpay',
    baseUrl: 'https://api.razorpay.com/v1',
    sandboxUrl: 'https://api.razorpay.com/v1',
    keyId: process.env.RAZORPAY_TEST_KEY_ID || '',
    keySecret: process.env.RAZORPAY_TEST_KEY_SECRET || '',
    authHeader: () => 'Basic ' + Buffer.from(
      `${process.env.RAZORPAY_TEST_KEY_ID}:${process.env.RAZORPAY_TEST_KEY_SECRET}`
    ).toString('base64'),
    testCards: {
      success: '4111111111111111',
      upiSuccess: 'success@razorpay',
      upiFailure: 'failure@razorpay',
    },
    howToGetKeys: 'Dashboard → Switch to Test Mode → Account & Settings → API Keys → Generate Key',
  },

  razorpayX: {
    name: 'Razorpay X (Payouts)',
    baseUrl: 'https://api.razorpay.com/v1',
    keyId: process.env.RAZORPAYX_TEST_KEY_ID || '',
    keySecret: process.env.RAZORPAYX_TEST_KEY_SECRET || '',
    authHeader: () => 'Basic ' + Buffer.from(
      `${process.env.RAZORPAYX_TEST_KEY_ID}:${process.env.RAZORPAYX_TEST_KEY_SECRET}`
    ).toString('base64'),
    sandboxNote: 'Payouts dont auto-process in test mode - must manually advance states in dashboard',
  },

  stripe: {
    name: 'Stripe',
    baseUrl: 'https://api.stripe.com',
    secretKey: process.env.STRIPE_TEST_SECRET || '',
    publishableKey: process.env.STRIPE_TEST_PK || '',
    authHeader: () => `Bearer ${process.env.STRIPE_TEST_SECRET}`,
    testCards: {
      success: '4242424242424242',
      decline: '4000000000000002',
      requires3DS: '4000002760003184',
      indian: '4000003560000008',
      cvv: 'any 3 digits',
      expiry: 'any future date',
    },
    howToGetKeys: 'Dashboard → Developers → API Keys → Toggle Test mode ON → Reveal test key',
  },

  cashfree: {
    name: 'Cashfree Payouts',
    sandboxUrl: 'https://payout-gamma.cashfree.com',
    prodUrl: 'https://payout-api.cashfree.com',
    clientId: process.env.CASHFREE_TEST_CLIENT_ID || '',
    clientSecret: process.env.CASHFREE_TEST_CLIENT_SECRET || '',
    authHeaders: () => ({
      'X-Client-Id': process.env.CASHFREE_TEST_CLIENT_ID || '',
      'X-Client-Secret': process.env.CASHFREE_TEST_CLIENT_SECRET || '',
    }),
    howToGetKeys: 'Cashfree Dashboard → Switch to Test mode → Developers → Payouts → Copy Client ID & Secret',
  },

  easebuzz: {
    name: 'Easebuzz',
    sandboxUrl: 'https://testpay.easebuzz.in',
    prodUrl: 'https://pay.easebuzz.in',
    merchantKey: process.env.EASEBUZZ_TEST_KEY || '',
    salt: process.env.EASEBUZZ_TEST_SALT || '',
    howToGetKeys: 'Easebuzz Dashboard → Settings → API Credentials → Test Key & Salt',
  },

  payu: {
    name: 'PayU',
    sandboxUrl: 'https://test.payu.in/_payment',
    prodUrl: 'https://secure.payu.in/_payment',
    merchantKey: 'gtKFFx',
    merchantSalt: 'eCwWELxi',
    testCard: '5123456789012346',
    testCvv: '123',
    testExpiry: '05/30',
    testOtp: '123456',
    sandboxNote: 'Public test creds available in docs. Separate test URL. No real money.',
  },

  adyen: {
    name: 'Adyen',
    sandboxUrl: 'https://checkout-test.adyen.com/v71',
    prodUrl: 'https://checkout-live.adyen.com/v71',
    apiKey: process.env.ADYEN_TEST_API_KEY || '',
    merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT || '',
    authHeaders: () => ({ 'X-API-Key': process.env.ADYEN_TEST_API_KEY || '' }),
    testCards: {
      success: '4111111111111111',
      requires3DS: '5212345678901234',
      cvc: '737',
      expiry: '03/30',
    },
    howToGetKeys: 'Adyen Customer Area → Switch to Test → Developers → API Credentials → Generate API Key',
  },

  paytm: {
    name: 'PayTm',
    sandboxUrl: 'https://securegw-stage.paytm.in',
    prodUrl: 'https://securegw.paytm.in',
    mid: process.env.PAYTM_TEST_MID || '',
    key: process.env.PAYTM_TEST_KEY || '',
    howToGetKeys: 'Paytm Dashboard → Developer Settings → Test API Keys (MID + Key)',
  },

  tap: {
    name: 'Tap Payments',
    baseUrl: 'https://api.tap.company/v2',
    secretKey: process.env.TAP_TEST_SECRET || '',
    authHeader: () => `Bearer ${process.env.TAP_TEST_SECRET}`,
    testCards: {
      visa: '4508750015319965',
      cvc: '100',
      expiry: '01/39',
      otp: '1234',
    },
    region: 'MENA',
    howToGetKeys: 'Tap Dashboard → goSell → API Keys (Test + Live)',
  },

  yotpo: {
    name: 'Yotpo Loyalty',
    baseUrl: 'https://loyalty.yotpo.com/api/v2',
    apiKey: process.env.YOTPO_API_KEY || '',
    guid: process.env.YOTPO_GUID || '',
    authHeaders: () => ({
      'x-api-key': process.env.YOTPO_API_KEY || '',
      'x-guid': process.env.YOTPO_GUID || '',
    }),
    howToGetKeys: 'Yotpo Dashboard → Settings → General Settings → Copy API Key & GUID',
  },

  shopifyStoreCredit: {
    name: 'Shopify Store Credit',
    graphqlUrl: 'https://my-returns-test.myshopify.com/admin/api/2025-01/graphql.json',
    accessToken: process.env.TEST_SHOPIFY_TOKEN || '',
    sandboxNote: 'Dev store is free. Full API access.',
  },

  // ─── LOGISTICS SANDBOXES ───

  delhivery: {
    name: 'Delhivery',
    stagingUrl: 'https://staging-express.delhivery.com',
    prodUrl: 'https://track.delhivery.com',
    token: process.env.DELHIVERY_TOKEN || 'bcfa63601f1cf0a2eaee2b06caa25e2134496770',
    pickupLocation: 'Blakc',
    authHeader: (token: string) => `Token ${token}`,
    contactEmail: 'clientservice@delhivery.com',
  },

  shiprocket: {
    name: 'Shiprocket',
    baseUrl: 'https://apiv2.shiprocket.in/v1/external',
    email: process.env.SHIPROCKET_TEST_EMAIL || '',
    password: process.env.SHIPROCKET_TEST_PASSWORD || '',
    howToGetKeys: 'Create separate test account at shiprocket.in → Settings → API → Create API User',
  },

  shippo: {
    name: 'Shippo',
    baseUrl: 'https://api.goshippo.com',
    testToken: process.env.SHIPPO_TEST_TOKEN || '',
    liveToken: process.env.SHIPPO_LIVE_TOKEN || '',
    authHeader: (token: string) => `ShippoToken ${token}`,
    howToGetKeys: 'Shippo Portal → API Configuration → Developer Keys → Create new test key',
  },

  shipstation: {
    name: 'ShipStation',
    baseUrl: 'https://api.shipstation.com/v2',
    sandboxKey: process.env.SHIPSTATION_SANDBOX_KEY || '',
    howToGetKeys: 'Dashboard → API Management → Sandbox Keys tab → Copy sandbox API key',
  },

  fedex: {
    name: 'FedEx',
    sandboxUrl: 'https://apis-sandbox.fedex.com',
    prodUrl: 'https://apis.fedex.com',
    clientId: process.env.FEDEX_TEST_CLIENT_ID || '',
    clientSecret: process.env.FEDEX_TEST_CLIENT_SECRET || '',
    howToGetKeys: 'developer.fedex.com → Create Organization → Create Project → Get Client ID & Secret',
  },

  ups: {
    name: 'UPS',
    sandboxUrl: 'https://wwwcie.ups.com',
    prodUrl: 'https://onlinetools.ups.com',
    clientId: process.env.UPS_TEST_CLIENT_ID || '',
    clientSecret: process.env.UPS_TEST_CLIENT_SECRET || '',
    howToGetKeys: 'UPS Developer Portal → Sign up → Request API access',
  },

  usps: {
    name: 'USPS',
    sandboxUrl: 'https://api-cat.usps.com',
    prodUrl: 'https://api.usps.com',
    clientId: process.env.USPS_TEST_CLIENT_ID || '',
    clientSecret: process.env.USPS_TEST_CLIENT_SECRET || '',
    howToGetKeys: 'developers.usps.com → Register → Create OAuth token',
  },

  dhl: {
    name: 'DHL',
    sandboxUrl: 'https://api-sandbox.dhl.com',
    apiKey: process.env.DHL_TEST_API_KEY || '',
    authHeader: (key: string) => `DHL-API-Key: ${key}`,
    howToGetKeys: 'developer.dhl.com → Register → Select API → Get sandbox credentials',
  },

  canadaPost: {
    name: 'Canada Post',
    sandboxUrl: 'https://ct.soa-gw.canadapost.ca',
    prodUrl: 'https://soa-gw.canadapost.ca',
    username: process.env.CANADA_POST_TEST_USERNAME || '',
    password: process.env.CANADA_POST_TEST_PASSWORD || '',
    howToGetKeys: 'Sign up at Developer Program → Get Development API key for sandbox',
  },

  australiaPost: {
    name: 'Australia Post',
    baseUrl: 'https://api.auspost.com.au',
    apiKey: process.env.AUSPOST_TEST_API_KEY || '',
    howToGetKeys: 'developers.auspost.com.au → Sign up → Get API key → Free trial',
  },

  sendcloud: {
    name: 'Sendcloud',
    baseUrl: 'https://panel.sendcloud.sc/api/v2',
    publicKey: process.env.SENDCLOUD_TEST_PUBLIC_KEY || '',
    secretKey: process.env.SENDCLOUD_TEST_SECRET_KEY || '',
    howToGetKeys: 'Dashboard → Settings → Integrations → Sendcloud API → Connect → Copy keys',
  },

  aramex: { name: 'Aramex', contactEmail: 'aramex.com/developers-solution-center', region: 'UAE/GCC' },
  easyparcel: { name: 'EasyParcel', baseUrl: 'https://api.easyparcel.com', apiKey: process.env.EASYPARCEL_API_KEY || '', howToGetKeys: 'app.easyparcel.com → Integrations → API → Get API key', region: 'SEA' },
  easyship: { name: 'Easyship', baseUrl: 'https://api.easyship.com', apiToken: process.env.EASYSHIP_TEST_TOKEN || '', howToGetKeys: 'Easyship → Settings → API → Generate token' },
  bluedart: { name: 'BlueDart', contactEmail: 'developer.dhl.com', loginId: process.env.BLUEDART_TEST_LOGIN || '', licenceKey: process.env.BLUEDART_TEST_LICENCE || '', customerCode: process.env.BLUEDART_TEST_CUSTOMER_CODE || '' },

  // Contact-required providers
  dtdc: { contactEmail: 'customersupport@dtdc.com' },
  xpressbees: { contactEmail: 'customercare@xpressbees.com', sandboxUrl: 'https://xbclientapi.xpressbees.com' },
  ecomexpress: { contactEmail: 'customercare@ecomexpress.in', sandboxUrl: 'https://integration.ecomexpress.in' },
  shadowfax: { contactEmail: 'hello@shadowfax.in' },
  nimbuspost: { contactEmail: 'tech@nimbuspost.com' },
  pickrr: { contactEmail: 'Contact via pickrr.com' },
  goswift: { contactEmail: 'hello@goswift.in' },
  ithink: { contactEmail: 'sales@ithinklogistics.com' },
  ekart: { contactEmail: 'cs@ekartcourier.com' },
}

// Helper: skip test if provider env vars not set
export function skipIfMissing(provider: string, ...envVars: string[]) {
  const missing = envVars.filter(v => !process.env[v])
  if (missing.length > 0) {
    console.log(`\u23ED\uFE0F  SKIP [${provider}] \u2014 set these env vars to enable: ${missing.join(', ')}`)
    return true
  }
  return false
}

// Aliases
export const C = SANDBOX_CONFIG
