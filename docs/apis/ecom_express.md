# Ecom Express API

- Integration Portal: https://integration.ecomexpress.in/
- Base URL: https://api.ecomexpress.in/api or https://plapi.ecomexpress.in/api (production)
- Auth: username + password (passed in request body or as query params)

## Endpoints (to verify)

- Create AWB: POST /services/expp/manifest/v2/expplus/
- Track: GET /services/expp/tracking/v2/?awb={awb}&username={user}&password={pass}
- Cancel: POST /services/expp/cmu/cancel/
- Pincode Check: GET /services/pincodeserviceability/?pincode={pin}

## Credentials
- username
- password

## Notes
- Need to verify exact endpoints from integration portal
- Supports reverse/return shipments
- India-specific logistics provider
