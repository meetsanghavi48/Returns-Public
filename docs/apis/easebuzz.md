# Easebuzz Payment Gateway API

## Overview

Easebuzz is an Indian payment gateway. Authentication uses a merchant `key` and `salt` with SHA-512 hash generation on each request. No Bearer tokens or Basic auth -- every request includes a computed `hash` parameter.

## Base URLs

| Environment | Payment URL                      | Dashboard/API URL                          |
|-------------|----------------------------------|--------------------------------------------|
| Test        | https://testpay.easebuzz.in      | https://testdashboard.easebuzz.in          |
| Production  | https://pay.easebuzz.in          | https://dashboard.easebuzz.in              |

Payment initiation uses the `pay` subdomain. Refund, transaction status, and other merchant APIs use the `dashboard` subdomain.

## Authentication (Hash Generation)

All API requests require a `hash` parameter generated using SHA-512.

The hash is computed by joining specific fields with `|` (pipe) separator, appending the salt, and hashing:

```
hashInput = field1|field2|...|fieldN|salt
hash = sha512(hashInput).toLowerCase()
```

Each endpoint has its own hash sequence (documented per endpoint below).

## Credentials Required

- **key** -- Merchant Key (provided by Easebuzz)
- **salt** -- Merchant Salt (provided by Easebuzz, keep secret)
- **environment** -- `test` or `prod`

---

## Endpoints

### 1. Initiate Payment

- **Method:** POST
- **URL:** `{payBaseUrl}/payment/initiateLink`
- **Content-Type:** `application/x-www-form-urlencoded`
- **Hash Sequence:** `key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5|udf6|udf7|udf8|udf9|udf10|salt`

**Parameters:**

| Field       | Type   | Required | Description                     |
|-------------|--------|----------|---------------------------------|
| key         | string | Yes      | Merchant key                    |
| txnid       | string | Yes      | Unique transaction ID           |
| amount      | string | Yes      | Amount (e.g., "99.00")          |
| productinfo | string | Yes      | Product description             |
| firstname   | string | Yes      | Customer first name             |
| email       | string | Yes      | Customer email                  |
| phone       | string | Yes      | Customer phone                  |
| surl        | string | Yes      | Success callback URL            |
| furl        | string | Yes      | Failure callback URL            |
| udf1-udf10  | string | No       | User-defined fields             |
| hash        | string | Yes      | SHA-512 hash                    |

### 2. Refund API (V1)

- **Method:** POST
- **URL:** `{dashboardBaseUrl}/transaction/v1/refund`
- **Content-Type:** `application/x-www-form-urlencoded`
- **Hash Sequence:** `key|txnid|amount|refund_amount|email|phone|salt`

**Parameters:**

| Field         | Type   | Required | Description                              |
|---------------|--------|----------|------------------------------------------|
| key           | string | Yes      | Merchant key                             |
| txnid         | string | Yes      | Original transaction ID                  |
| amount        | string | Yes      | Original paid amount (e.g., "99.00")     |
| refund_amount | string | Yes      | Amount to refund (e.g., "50.00")         |
| email         | string | Yes      | Customer email used in original txn      |
| phone         | string | Yes      | Customer phone used in original txn      |
| hash          | string | Yes      | SHA-512 hash                             |

**Response (JSON):**

```json
{
  "status": 1,
  "data": {
    "txnid": "TXN123",
    "refund_amount": "50.00",
    "refund_id": "REF_12345",
    "status": "refund_queued"
  }
}
```

- `status: 1` = success, `status: 0` = error
- Refund statuses: `refund_queued`, `refunded`, `refund_initiated`, `refund_failed`

### 3. Transaction Status API (V1)

- **Method:** POST
- **URL:** `{dashboardBaseUrl}/transaction/v1/retrieve`
- **Content-Type:** `application/x-www-form-urlencoded`
- **Hash Sequence:** `key|txnid|amount|email|phone|salt`

**Parameters:**

| Field  | Type   | Required | Description             |
|--------|--------|----------|-------------------------|
| key    | string | Yes      | Merchant key            |
| txnid  | string | Yes      | Transaction ID          |
| amount | string | Yes      | Transaction amount      |
| email  | string | Yes      | Customer email          |
| phone  | string | Yes      | Customer phone          |
| hash   | string | Yes      | SHA-512 hash            |

**Response (JSON):**

```json
{
  "status": 1,
  "data": {
    "txnid": "TXN123",
    "amount": "99.00",
    "status": "success",
    "refund_status": "refunded",
    "refund_amount": "50.00"
  }
}
```

Transaction statuses: `success`, `failure`, `pending`, `userCancelled`, `dropped`

### 4. Response Hash Verification

When verifying a response from Easebuzz, the reverse hash is computed:

```
salt|status|udf10|udf9|udf8|udf7|udf6|udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
```

---

## Sources

- PHP Library: https://github.com/easebuzz/paywitheasebuzz-php-lib
- Node.js Library: https://github.com/easebuzz/paywitheasebuzz-nodejs-lib
- Docs: https://docs.easebuzz.in/docs/payment-gateway/25517a49bef7c-refund-api
- Docs: https://docs.easebuzz.in/docs/payment-gateway/910d60e2551c9-transaction-api
- Docs: https://docs.easebuzz.in/docs/payment-gateway/c2ac48618b3bd-refund-api-v2
- Docs: https://docs.easebuzz.in/docs/payment-gateway/de78eba8de53c-refund-status-api
