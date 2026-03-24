# iThink Logistics API

## Auth Method

- **access_token** + **secret_key** included in the `data` object of every POST request body.
- Credentials are provided by the iThink Logistics team.
- No Bearer token or header-based auth; credentials travel in the JSON payload.

## Base URLs

| Environment | Use | Base URL |
|---|---|---|
| Staging | All endpoints | `https://pre-alpha.ithinklogistics.com` |
| Production | Orders, cancel, pincode | `https://my.ithinklogistics.com` |
| Production | Tracking | `https://api.ithinklogistics.com` |

Current API version: **3.0.0** (v2 also available for tracking).

## Key Endpoints

### Create Order / Shipment

- **POST** `/api_v3/order/add.json`
- Max 10 shipments per request, max 40 products per shipment.
- Request body wraps everything in `{ "data": { access_token, secret_key, shipments: [...] } }`.
- Each shipment includes: `order`, `order_date`, `total_amount`, `name`, `add`, `pin`, `city`, `state`, `country`, `phone`, `products[]` (product_name, product_sku, product_quantity, product_price), `shipment_length/width/height` (cm), `weight` (kg), `payment_mode` ("cod" or "Prepaid"), `order_type` ("forward" or "reverse"), `pickup_address_id`, `return_address_id`, `logistics` (optional carrier hint: delhivery, bluedart, xpressbees, ecom, ekart).
- Additional fields: `cod_amount`, `shipping_charges`, `giftwrap_charges`, `transaction_charges`, `total_discount`, `eway_bill_number`, `gst_number`, `what3words`, `s_type` (air/surface), `api_source`.
- Response: `{ status, status_code, html_message, data: { "1": { status, remark, waybill, refnum, logistic_name, tracking_url } } }`

### Track Order

- **POST** `/api_v2/order/track.json`
- Max 10 AWB numbers per request (comma-separated in `awb_number_list`).
- Response keyed by AWB number with `current_status`, `current_status_code`, `scan_details[]` (date_time, status, status_code, location, remarks), `last_scan_details`, `order_details`, `customer_details`.
- 28+ status codes: UD (undelivered), DL (delivered), CN (cancelled), RT (RTO), Lost, Shortage, etc.

### Cancel Order

- **POST** `/api_v3/order/cancel.json`
- `awb_numbers`: comma-separated AWB numbers, max 100 per request.
- Response: `{ status, status_code, html_message, data: { "1": { status, remark, refnum } } }`

### Pincode Serviceability

- **POST** `/api_v3/pincode/check.json`
- Request: `{ data: { pincode, access_token, secret_key } }`
- Response: per-carrier serviceability with `prepaid` (Y/N), `cod` (Y/N), `pickup` (Y/N), `district`, `state_code`, `sort_code`.

### Other Endpoints (v3)

- `POST /api_v3/order/details.json` — get order details
- `POST /api_v3/order/label.json` — print shipment label
- `POST /api_v3/order/manifest.json` — print manifest
- `POST /api_v3/order/invoice.json` — print invoice
- `POST /api_v3/rate/get.json` — get shipping rates
- `POST /api_v3/ndr/reattempt.json` — add reattempt/RTO for NDR
- `POST /api_v3/warehouse/add.json` — add warehouse
- `GET /api_v3/warehouse/get.json` — list warehouses

## Request Format

All endpoints use **POST** with `Content-Type: application/json` and `Cache-Control: no-cache`. Auth credentials are always inside the `data` key:

```json
{
  "data": {
    "access_token": "...",
    "secret_key": "...",
    ...endpoint-specific fields...
  }
}
```

## Credentials

- `accessToken` — API access token
- `secretKey` — API secret key
- `pickupAddressId` — warehouse pickup address ID
- `returnAddressId` — return warehouse address ID
- `environment` — "staging" or "production"

## Notes

- Supports reverse/return shipments via `order_type: "reverse"`
- Postman collection available from docs site
- Official Docs: https://docs.ithinklogistics.com/
