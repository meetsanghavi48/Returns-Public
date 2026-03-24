# Ecom Express API

## Auth Method

- **username** + **password** included in every request as form-encoded body fields.
- Credentials are provided by the Ecom Express tech team (contact: Software.support@ecomexpress.in).
- No OAuth or Bearer tokens; credentials travel in the request payload.

## Base URLs

| Environment | Base URL |
|---|---|
| Production | `https://api.ecomexpress.in` |
| Staging/Beta | `https://clbeta.ecomexpress.in` |

Integration portal: https://integration.ecomexpress.in/

## Key Endpoints

### Fetch AWB Numbers

- **POST** `/apiv2/fetch_awb/`
- Request (form-encoded): `username`, `password`, `count` (number of AWBs), `type` (PPD=prepaid, COD=cash-on-delivery, REV=reverse).
- Response: `{ awb: ["AWB001", "AWB002", ...] }` or error with `reason` field.

### Manifest / Create Shipment

- **POST** `/apiv2/manifest_awb/`
- Request (form-encoded): `username`, `password`, `json_input` (JSON string of shipment array).
- Each shipment object includes: `AWB_NUMBER`, `ORDER_NUMBER`, `PRODUCT` (PPD/COD/REV), `CONSIGNEE`, `CONSIGNEE_ADDRESS1`, `CONSIGNEE_ADDRESS2`, `DESTINATION_CITY`, `PINCODE`, `STATE`, `MOBILE`, `TELEPHONE`, `ITEM_DESCRIPTION`, `PIECES`, `COLLECTABLE_VALUE`, `DECLARED_VALUE`, `ACTUAL_WEIGHT` (kg), `LENGTH`, `BREADTH`, `HEIGHT`, `PICKUP_NAME`, `PICKUP_ADDRESS_LINE1`, `PICKUP_ADDRESS_LINE2`, `PICKUP_PINCODE`, `PICKUP_PHONE`, `PICKUP_MOBILE`, `RETURN_PINCODE`, `RETURN_NAME`, `RETURN_ADDRESS_LINE1`, `RETURN_PHONE`, `RETURN_MOBILE`, `DG_SHIPMENT` (true/false).
- Response includes per-shipment success/failure with reason codes.

### Track Shipment

- **POST** `/apiv2/track_me/`
- Request: `username`, `password`, `awb` (single or comma-separated AWB numbers).
- Response: array of shipment objects with `current_status`, `scans[]` (updated_on, status, reason_code, reason_code_description, location, city), `expected_date`.

### Pincode Serviceability

- **POST** `/apiv2/pincodes/`
- Request: `username`, `password`, `pincode`.
- Response: array of pincode objects with `city`, `state`, `active` (Y/N), `cod` (Y/N), route codes.

### Cancel AWB

- **POST** `/apiv2/cancel_awb/`
- Request: `username`, `password`, `awbs` (AWB number to cancel).
- Response: success/failure with reason.

## Request Format

Most endpoints use **POST** with `Content-Type: application/x-www-form-urlencoded`:

```
username=your_user&password=your_pass&awb=AWB123456
```

For manifest, shipment data is passed as a JSON string in the `json_input` form field:

```
username=your_user&password=your_pass&json_input=[{"AWB_NUMBER":"AWB123","ORDER_NUMBER":"ORD456",...}]
```

## Credentials

- `username` — Ecom Express API username
- `password` — Ecom Express API password
- `useSandbox` — optional flag to use staging environment

## Workflow

1. Fetch AWB numbers via `/apiv2/fetch_awb/`
2. Check pincode serviceability via `/apiv2/pincodes/`
3. Create shipment via `/apiv2/manifest_awb/`
4. Track via `/apiv2/track_me/`
5. Cancel if needed via `/apiv2/cancel_awb/`

## Notes

- Supports reverse/return shipments via `type: "REV"` and `PRODUCT: "REV"`.
- India-specific logistics provider.
- NDR (non-delivery report) instruction endpoints also available; contact support for details.

## Official Docs

- https://integration.ecomexpress.in/ (API Dev Guide, requires login for full specs)
- GitHub PHP wrapper: https://github.com/Unkodero/ecom-express-api
- Contact: Software.support@ecomexpress.in for credentials and complete documentation
