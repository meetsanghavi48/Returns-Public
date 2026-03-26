import { SANDBOX_CONFIG as C } from './config'

console.log('\n' + '='.repeat(60))
console.log('SANDBOX TEST READINESS REPORT')
console.log('='.repeat(60))

const providers = [
  { name: 'Razorpay', type: 'Payment', ready: !!process.env.RAZORPAY_TEST_KEY_ID, note: C.razorpay.howToGetKeys },
  { name: 'RazorpayX', type: 'Payment', ready: !!process.env.RAZORPAYX_TEST_KEY_ID, note: C.razorpayX.sandboxNote },
  { name: 'Stripe', type: 'Payment', ready: !!process.env.STRIPE_TEST_SECRET, note: C.stripe.howToGetKeys },
  { name: 'Cashfree', type: 'Payment', ready: !!process.env.CASHFREE_TEST_CLIENT_ID, note: C.cashfree.howToGetKeys },
  { name: 'Easebuzz', type: 'Payment', ready: !!process.env.EASEBUZZ_TEST_KEY, note: C.easebuzz.howToGetKeys },
  { name: 'PayU', type: 'Payment', ready: true, note: 'Public test creds: gtKFFx / eCwWELxi' },
  { name: 'Adyen', type: 'Payment', ready: !!process.env.ADYEN_TEST_API_KEY, note: C.adyen.howToGetKeys },
  { name: 'PayTm', type: 'Payment', ready: !!process.env.PAYTM_TEST_MID, note: C.paytm.howToGetKeys },
  { name: 'Tap', type: 'Payment', ready: !!process.env.TAP_TEST_SECRET, note: C.tap.howToGetKeys },
  { name: 'Yotpo', type: 'Payment', ready: !!process.env.YOTPO_API_KEY, note: C.yotpo.howToGetKeys },
  { name: 'Delhivery', type: 'Logistics', ready: true, note: 'Token available' },
  { name: 'Shiprocket', type: 'Logistics', ready: !!process.env.SHIPROCKET_TEST_EMAIL, note: C.shiprocket.howToGetKeys },
  { name: 'Shippo', type: 'Logistics', ready: !!process.env.SHIPPO_TEST_TOKEN, note: C.shippo.howToGetKeys },
  { name: 'ShipStation', type: 'Logistics', ready: !!process.env.SHIPSTATION_SANDBOX_KEY, note: C.shipstation.howToGetKeys },
  { name: 'FedEx', type: 'Logistics', ready: !!process.env.FEDEX_TEST_CLIENT_ID, note: C.fedex.howToGetKeys },
  { name: 'DHL', type: 'Logistics', ready: !!process.env.DHL_TEST_API_KEY, note: C.dhl.howToGetKeys },
  { name: 'Canada Post', type: 'Logistics', ready: !!process.env.CANADA_POST_TEST_USERNAME, note: C.canadaPost.howToGetKeys },
  { name: 'Australia Post', type: 'Logistics', ready: !!process.env.AUSPOST_TEST_API_KEY, note: C.australiaPost.howToGetKeys },
  { name: 'Sendcloud', type: 'Logistics', ready: !!process.env.SENDCLOUD_TEST_PUBLIC_KEY, note: C.sendcloud.howToGetKeys },
  { name: 'EasyParcel', type: 'Logistics', ready: !!process.env.EASYPARCEL_API_KEY, note: C.easyparcel.howToGetKeys },
  { name: 'Easyship', type: 'Logistics', ready: !!process.env.EASYSHIP_TEST_TOKEN, note: C.easyship.howToGetKeys },
  { name: 'BlueDart', type: 'Logistics', ready: !!process.env.BLUEDART_TEST_LOGIN, note: C.bluedart.contactEmail },
  { name: 'DTDC', type: 'Logistics', ready: false, note: C.dtdc.contactEmail },
  { name: 'Shadowfax', type: 'Logistics', ready: false, note: C.shadowfax.contactEmail },
  { name: 'NimbusPost', type: 'Logistics', ready: false, note: C.nimbuspost.contactEmail },
  { name: 'XpressBees', type: 'Logistics', ready: false, note: C.xpressbees.contactEmail },
]

const ready = providers.filter(p => p.ready)
const notReady = providers.filter(p => !p.ready)

console.log(`\n\u2705 READY TO TEST (${ready.length}):`)
ready.forEach(p => console.log(`  ${p.type.padEnd(10)} | ${p.name}: ${p.note}`))

console.log(`\n\u23ED\uFE0F  NOT YET SET UP (${notReady.length}):`)
notReady.forEach(p => console.log(`  ${p.type.padEnd(10)} | ${p.name}: ${p.note}`))

console.log('\n' + '='.repeat(60))
console.log(`COVERAGE: ${Math.round(ready.length / providers.length * 100)}% of providers ready`)
console.log('='.repeat(60) + '\n')
