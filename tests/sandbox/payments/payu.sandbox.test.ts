import { describe, it, expect } from 'vitest'
import { SANDBOX_CONFIG as C } from '../config'
import crypto from 'crypto'

describe('PayU Test Environment (Public Test Creds)', () => {

  it('PUBLIC CREDS: PayU test key and salt are correct', () => {
    expect(C.payu.merchantKey).toBe('gtKFFx')
    expect(C.payu.merchantSalt).toBe('eCwWELxi')
    console.log('\u2705 PayU public test creds confirmed')
  })

  it('HASH: Generate valid SHA-512 hash for test transaction', () => {
    const txnId = `TEST_${Date.now()}`
    const hashStr = `${C.payu.merchantKey}|${txnId}|49.95|Return Refund|${C.customer.name}|${C.customer.email}|||||||||||${C.payu.merchantSalt}`
    const hash = crypto.createHash('sha512').update(hashStr).digest('hex')
    expect(hash).toHaveLength(128)
    console.log('\u2705 PayU hash generated:', hash.substring(0, 20) + '...')
  })

  it('TEST CARD: PayU test card format is correct', () => {
    expect(C.payu.testCard).toBe('5123456789012346')
    expect(C.payu.testCvv).toBe('123')
    expect(C.payu.testExpiry).toBe('05/30')
    expect(C.payu.testOtp).toBe('123456')
  })
})
