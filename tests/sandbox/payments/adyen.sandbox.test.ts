import { describe, it, expect } from 'vitest'
import { SANDBOX_CONFIG as C, skipIfMissing } from '../config'

describe('Adyen Test Environment', () => {

  it('AUTH: Adyen test API key authenticates', async () => {
    if (skipIfMissing('Adyen', 'ADYEN_TEST_API_KEY', 'ADYEN_MERCHANT_ACCOUNT')) return
    const res = await fetch(`${C.adyen.sandboxUrl}/paymentMethods`, {
      method: 'POST',
      headers: { ...C.adyen.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchantAccount: C.adyen.merchantAccount,
        countryCode: 'IN',
        currency: 'INR',
        amount: { currency: 'INR', value: 4995 },
      }),
    })
    expect([200, 422]).toContain(res.status)
    console.log('\u2705 Adyen sandbox auth, status:', res.status)
  })

  it('INVALID KEY: Returns 401', async () => {
    const res = await fetch(`${C.adyen.sandboxUrl}/paymentMethods`, {
      method: 'POST',
      headers: { 'X-API-Key': 'invalid_key', 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantAccount: 'test', countryCode: 'IN', currency: 'INR', amount: { currency: 'INR', value: 100 } }),
    })
    expect(res.status).toBe(401)
    console.log('\u2705 Invalid Adyen key correctly rejected')
  })

  it('TEST CARDS: Adyen test card numbers', () => {
    expect(C.adyen.testCards.success).toBe('4111111111111111')
    expect(C.adyen.testCards.requires3DS).toBe('5212345678901234')
    expect(C.adyen.testCards.cvc).toBe('737')
  })
})
