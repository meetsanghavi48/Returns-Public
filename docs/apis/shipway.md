# Shipway API

- Official Docs: https://apidocs.shipway.com/
- Base URL: https://shipway.in/api
- Auth: username + license_key (passed as headers or body params)

## Endpoints

- Add Order: POST /pushOrderData (body: { username, password, order_id, carrier_id, ... })
- Track: POST /getOrderShipmentDetails (body: { username, password, order_id })
- Cancel: POST /cancelOrder
- Get Carriers: GET /getCarriers

## Credentials
- username
- licenseKey (license_key / password)

## Notes
- Aggregator platform supporting multiple carriers
- Supports reverse logistics
- India-focused with some global carriers
