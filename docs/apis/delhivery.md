# Delhivery API
- Base URL: https://track.delhivery.com (tracking), https://f.delhivery.com (shipping)
- Auth: Token header - "Authorization: Token {token}"
- Create Pickup: POST /api/cmu/create.json (form-data with JSON "data" field)
- Track: GET /api/v1/packages/json/?waybill={awb}&token={token}
- Serviceability: GET /c/api/pin-city/check/?filter_codes={pin}&token={token}
- Cancel: POST /api/p/edit
- Credentials: token, pickup_location
