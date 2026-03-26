import { describe, it, expect } from 'vitest'
import { SANDBOX_CONFIG as C, skipIfMissing } from '../config'

describe('Razorpay Sandbox', () => {

  it('AUTH: Valid test keys authenticate', async () => {
    if (skipIfMissing('Razorpay', 'RAZORPAY_TEST_KEY_ID', 'RAZORPAY_TEST_KEY_SECRET')) return
    const res = await fetch(`${C.razorpay.baseUrl}/payments?count=1`, {
      headers: { Authorization: C.razorpay.authHeader() },
    })
    expect([200, 404]).toContain(res.status)
    console.log('\u2705 Razorpay auth successful')
  })

  it('AUTH: Invalid keys return 401', async () => {
    const auth = 'Basic ' + Buffer.from('bad_key:bad_secret').toString('base64')
    const res = await fetch(`${C.razorpay.baseUrl}/payments`, {
      headers: { Authorization: auth },
    })
    expect(res.status).toBe(401)
  })

  it('CREATE ORDER: test order created', async () => {
    if (skipIfMissing('Razorpay', 'RAZORPAY_TEST_KEY_ID', 'RAZORPAY_TEST_KEY_SECRET')) return
    const res = await fetch(`${C.razorpay.baseUrl}/orders`, {
      method: 'POST',
      headers: { Authorization: C.razorpay.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 4995, currency: 'INR', receipt: `rcpt_${Date.now()}` }),
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.id).toMatch(/^order_/)
    expect(data.amount).toBe(4995)
    console.log('\u2705 Test order created:', data.id)
  })

  it('REFUND: List existing refunds', async () => {
    if (skipIfMissing('Razorpay', 'RAZORPAY_TEST_KEY_ID', 'RAZORPAY_TEST_KEY_SECRET')) return
    const res = await fetch(`${C.razorpay.baseUrl}/refunds?count=5`, {
      headers: { Authorization: C.razorpay.authHeader() },
    })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.items)).toBe(true)
    console.log('\u2705 Refunds list:', data.count, 'total')
  })

  it('TEST CARDS: Known test card numbers are correct format', () => {
    expect(C.razorpay.testCards.success).toHaveLength(16)
    expect(C.razorpay.testCards.upiSuccess).toBe('success@razorpay')
    expect(C.razorpay.testCards.upiFailure).toBe('failure@razorpay')
  })
})
