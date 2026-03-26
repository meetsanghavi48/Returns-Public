import { describe, it, expect } from 'vitest'
import { SANDBOX_CONFIG as C, skipIfMissing } from '../config'

describe('Stripe Sandbox', () => {

  it('AUTH: Test secret key is valid', async () => {
    if (skipIfMissing('Stripe', 'STRIPE_TEST_SECRET')) return
    const res = await fetch(`${C.stripe.baseUrl}/v1/balance`, {
      headers: { Authorization: C.stripe.authHeader() },
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.object).toBe('balance')
    console.log('\u2705 Stripe balance:', JSON.stringify(data.available?.[0]))
  })

  it('PAYMENT METHOD: Create card with test card', async () => {
    if (skipIfMissing('Stripe', 'STRIPE_TEST_SECRET')) return
    const body = new URLSearchParams({
      type: 'card',
      'card[number]': C.stripe.testCards.success,
      'card[exp_month]': '12',
      'card[exp_year]': '2030',
      'card[cvc]': '123',
    })
    const res = await fetch(`${C.stripe.baseUrl}/v1/payment_methods`, {
      method: 'POST',
      headers: { Authorization: C.stripe.authHeader(), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toMatch(/^pm_/)
    console.log('\u2705 Test card payment method:', data.id)
  })

  it('TEST CARDS: Known test card numbers', () => {
    expect(C.stripe.testCards.success).toBe('4242424242424242')
    expect(C.stripe.testCards.decline).toBe('4000000000000002')
    expect(C.stripe.testCards.indian).toBe('4000003560000008')
  })
})
