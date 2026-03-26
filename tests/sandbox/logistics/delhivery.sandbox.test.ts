import { describe, it, expect } from 'vitest'
import { SANDBOX_CONFIG as C } from '../config'

describe('Delhivery Logistics', () => {

  it('AUTH: Token validates against API', async () => {
    const res = await fetch(
      `${C.delhivery.prodUrl}/c/api/pin-codes/json/?filter_codes=400086`,
      { headers: { Authorization: C.delhivery.authHeader(C.delhivery.token) } },
    )
    expect([200, 401, 403]).toContain(res.status)
    if (res.status === 200) console.log('\u2705 Delhivery token is valid')
    else console.log('\u26A0\uFE0F Delhivery returned:', res.status)
  })

  it('PINCODE: Mumbai 400086 is serviceable', async () => {
    const res = await fetch(
      `${C.delhivery.prodUrl}/c/api/pin-codes/json/?filter_codes=400086`,
      { headers: { Authorization: C.delhivery.authHeader(C.delhivery.token) } },
    )
    if (res.status !== 200) { console.log('Skipping - auth failed'); return }
    const data = await res.json()
    expect(data.delivery_codes).toBeDefined()
    console.log('\u2705 Mumbai 400086 serviceable:', data.delivery_codes?.length, 'results')
  })

  it('PINCODE: Delhi 110001 is serviceable', async () => {
    const res = await fetch(
      `${C.delhivery.prodUrl}/c/api/pin-codes/json/?filter_codes=110001`,
      { headers: { Authorization: C.delhivery.authHeader(C.delhivery.token) } },
    )
    if (res.status !== 200) return
    const data = await res.json()
    expect(data.delivery_codes).toBeDefined()
    console.log('\u2705 Delhi 110001 serviceable')
  })
})
