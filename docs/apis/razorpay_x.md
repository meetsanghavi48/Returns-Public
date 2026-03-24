# RazorpayX Payout API

RazorpayX is used for making payouts to customer bank accounts and UPI addresses.
It is NOT used for regular payment refunds (use Razorpay Refund API for that).

## Overview

- **Base URL:** `https://api.razorpay.com/v1`
- **Auth:** HTTP Basic Auth — `key_id:key_secret` (base64-encoded)
- **Credentials needed:** `keyId`, `keySecret`, `accountNumber`

## Refund Flow (Contact → Fund Account → Payout)

### Step 1: Create Contact

Creates a contact representing the customer who will receive the payout.

```
POST /contacts
```

**Request Body:**

| Field          | Type   | Required | Description                           |
|----------------|--------|----------|---------------------------------------|
| name           | string | Yes      | Contact name                          |
| email          | string | No       | Contact email                         |
| contact        | string | No       | Contact phone (E.164 format)          |
| type           | string | No       | One of: customer, vendor, employee, self |
| reference_id   | string | No       | Your internal reference ID            |
| notes          | object | No       | Key-value pairs (max 15)              |

**Response:** `201 Created`

```json
{
  "id": "cont_ABC123",
  "entity": "contact",
  "name": "Customer Name",
  "contact": "+919876543210",
  "email": "customer@example.com",
  "type": "customer",
  "reference_id": "ORD-12345",
  "active": true
}
```

### Step 2: Create Fund Account

Links a bank account or VPA to a contact.

```
POST /fund_accounts
```

**Request Body (Bank Account):**

| Field                      | Type   | Required | Description              |
|----------------------------|--------|----------|--------------------------|
| contact_id                 | string | Yes      | ID from Step 1           |
| account_type               | string | Yes      | `bank_account`           |
| bank_account.name          | string | Yes      | Account holder name      |
| bank_account.ifsc          | string | Yes      | IFSC code                |
| bank_account.account_number| string | Yes      | Bank account number      |

**Request Body (UPI/VPA):**

| Field          | Type   | Required | Description              |
|----------------|--------|----------|--------------------------|
| contact_id     | string | Yes      | ID from Step 1           |
| account_type   | string | Yes      | `vpa`                    |
| vpa.address    | string | Yes      | UPI VPA (e.g. user@upi)  |

**Response:** `201 Created`

```json
{
  "id": "fa_ABC123",
  "entity": "fund_account",
  "contact_id": "cont_ABC123",
  "account_type": "bank_account",
  "bank_account": {
    "ifsc": "HDFC0000001",
    "bank_name": "HDFC Bank",
    "name": "Customer Name",
    "account_number": "1234567890"
  },
  "active": true
}
```

### Step 3: Create Payout

Creates a payout from your RazorpayX account to the fund account.

```
POST /payouts
```

**Request Body:**

| Field                 | Type    | Required | Description                                      |
|-----------------------|---------|----------|--------------------------------------------------|
| account_number        | string  | Yes      | Your RazorpayX account number                    |
| fund_account_id       | string  | Yes      | ID from Step 2                                   |
| amount                | integer | Yes      | Amount in smallest currency unit (paise for INR)  |
| currency              | string  | Yes      | `INR`                                            |
| mode                  | string  | Yes      | `NEFT`, `RTGS`, `IMPS`, or `UPI`                 |
| purpose               | string  | Yes      | One of: refund, cashback, payout, salary, utility bill, vendor bill |
| queue_if_low_balance  | boolean | No       | Queue payout if balance is low (default: false)   |
| reference_id          | string  | No       | Your internal reference                           |
| narration             | string  | No       | Short description (max 30 chars)                  |
| notes                 | object  | No       | Key-value pairs (max 15)                          |

**Payout Modes:**

| Mode | Description                  | Settlement Time     |
|------|------------------------------|---------------------|
| IMPS | Immediate Payment Service    | Instant (24/7)      |
| NEFT | National Electronic Fund Transfer | 30 min - 2 hrs  |
| RTGS | Real Time Gross Settlement   | 30 min (min 2L INR) |
| UPI  | Unified Payments Interface   | Instant             |

**Response:** `200 OK`

```json
{
  "id": "pout_ABC123",
  "entity": "payout",
  "fund_account_id": "fa_ABC123",
  "amount": 10000,
  "currency": "INR",
  "status": "processing",
  "mode": "IMPS",
  "purpose": "refund",
  "utr": null,
  "reference_id": "ORD-12345",
  "failure_reason": null,
  "created_at": 1690000000
}
```

## Get Payout Status

```
GET /payouts/{payout_id}
```

**Response:** Same as create payout response.

## Payout Statuses

| Status      | Description                                      | Maps to RefundResult |
|-------------|--------------------------------------------------|----------------------|
| queued      | Payout is queued (low balance)                   | pending              |
| pending     | Payout is being prepared                         | pending              |
| processing  | Payout is being processed by bank                | pending              |
| processed   | Payout completed successfully                    | processed            |
| reversed    | Payout was reversed by bank                      | failed               |
| cancelled   | Payout was cancelled                             | failed               |
| rejected    | Payout was rejected                              | failed               |

## Validate Credentials

```
GET /contacts?count=1
```

A simple authenticated request to verify the key pair works. Returns 200 if valid.

## Error Response Format

```json
{
  "error": {
    "code": "BAD_REQUEST_ERROR",
    "description": "The amount must be at least INR 1.00.",
    "source": "business",
    "step": "payment_initiation",
    "reason": "input_validation_failed"
  }
}
```

## Adapter Metadata Fields

When calling `processRefund`, pass these in `params.metadata`:

**For bank transfer refund:**
- `accountHolderName` (string) — beneficiary name
- `ifsc` (string) — IFSC code
- `accountNumber` (string) — bank account number
- `payoutMode` (string, optional) — `NEFT`, `RTGS`, or `IMPS` (default: `IMPS`)

**For UPI refund:**
- `vpa` (string) — UPI VPA address (e.g. `user@upi`)
