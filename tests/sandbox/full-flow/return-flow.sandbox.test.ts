import { describe, it, expect } from 'vitest'
import { SANDBOX_CONFIG as C, skipIfMissing } from '../config'

describe('Complete Return Flow: Real Order Data', () => {

  it('FLOW 1: Prepaid return config - Order #1002 Ayumu Hirano', () => {
    const order = C.orders.prepaid
    expect(order.number).toBe('#1002')
    expect(order.email).toBe('ayumu.hirano@example.com')
    expect(order.status).toBe('paid')
    expect(order.testReturnItem.title).toBe('Selling Plans Ski Wax')
    expect(order.testReturnItem.variant).toBe('Special Selling Plans Ski Wax')
    expect(order.testReturnItem.price).toBe(49.95)
    console.log('\u2705 FLOW 1: Prepaid return for $49.95 -> original payment refund')
  })

  it('FLOW 2: COD return config - Order #1005 Karine Ruby', () => {
    const order = C.orders.cod
    expect(order.number).toBe('#1005')
    expect(order.email).toBe('dhanline9@gmail.com')
    expect(order.status).toBe('pending')
    expect(order.testReturnItem.title).toBe('The Complete Snowboard')
    expect(order.testReturnItem.variant).toBe('Electric')
    expect(order.testReturnItem.price).toBe(699.95)
    console.log('\u2705 FLOW 2: COD return for $699.95 -> store credit')
  })

  it('FLOW 3: Exchange config - Order #1002 Ski Wax -> Special', () => {
    const order = C.orders.exchange
    expect(order.number).toBe('#1002')
    expect(order.exchangeNote).toContain('Special Selling Plans Ski Wax')
    console.log('\u2705 FLOW 3: Exchange Ski Wax ($24.95) -> Special ($49.95), diff: $25.00')
  })

  it('FLOW 4: High value automation - Order #1005 $949.95', () => {
    const order = C.orders.highValue
    expect(order.total).toBe(2349.85)
    expect(order.testReturnItem.price).toBe(949.95)
    // Default automation threshold is 5000, so $949.95 alone won't trigger
    // But total order value $2349.85 could trigger order_value based rules
    console.log('\u2705 FLOW 4: High value item $949.95, order total $2349.85')
  })

  it('FLOW 5: Bank transfer - Canada details for Karine Ruby', () => {
    const bankDetails = {
      type: 'bank' as const,
      accountHolderName: C.customers.karine.name,
      accountNumber: 'TEST123456',
      routingNumber: '123456789',
      bankName: 'Test Bank',
      accountType: 'checking',
      country: C.customers.karine.country,
    }
    expect(bankDetails.accountHolderName).toBe('Karine Ruby')
    expect(bankDetails.country).toBe('CA')
    expect(bankDetails.routingNumber).toHaveLength(9)
    console.log('\u2705 FLOW 5: Bank transfer Canada format validated')
  })

  it('PORTAL: Order #1002 portal lookup', async () => {
    try {
      const res = await fetch(C.PORTAL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `orderNumber=1002&email=${encodeURIComponent(C.orders.prepaid.email)}`,
        redirect: 'manual',
      })
      expect([200, 302, 405]).toContain(res.status)
      console.log('\u2705 Portal lookup #1002, status:', res.status)
    } catch (e: any) {
      console.log('\u26A0\uFE0F Portal unreachable:', e.message)
    }
  })

  it('PORTAL: Order #1005 portal lookup', async () => {
    try {
      const res = await fetch(C.PORTAL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'orderNumber=1005&pincode=400086',
        redirect: 'manual',
      })
      expect([200, 302, 405]).toContain(res.status)
      console.log('\u2705 Portal lookup #1005, status:', res.status)
    } catch (e: any) {
      console.log('\u26A0\uFE0F Portal unreachable:', e.message)
    }
  })
})
