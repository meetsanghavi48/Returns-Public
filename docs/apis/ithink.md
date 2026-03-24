# iThink Logistics API

- Official Docs: https://docs.ithinklogistics.com/
- Base URL (Production): https://manage.ithinklogistics.com/api_v3
- Base URL (Staging): https://pre-alpha.ithinklogistics.com/api_v3
- Auth: access_token + secret_key in JSON body

## Endpoints

- Create Order: POST /order/add.json
- Track: POST /order/track.json (body: { data: { awb_number_list, access_token, secret_key } })
- Cancel: POST /order/cancel.json
- Pincode Check: POST /pincode/check.json

## Credentials
- access_token (API Key)
- secret_key (Secret Key)
- environment (staging/production)

## Notes
- All requests use POST with JSON body
- Payload wrapped in { data: { ...params, access_token, secret_key } }
- Supports reverse/return shipments via shipping_mode: "Reverse"
