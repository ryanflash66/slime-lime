# Subscriptions: PayPal plans

Recurring "Subscribe & Save" billing runs on PayPal Subscriptions. PayPal requires a catalog
**product** and one **billing plan** per billing frequency. This app creates them itself, so
nobody has to copy plan IDs into environment variables.

## What gets provisioned

| Cadence id (`CADENCES` in `api/_lib/catalog.js`) | PayPal plan name  | Billing frequency |
| ------------------------------------------------ | ----------------- | ----------------- |
| `biweekly`                                       | `slime-biweekly`  | every 2 weeks     |
| `monthly`                                        | `slime-monthly`   | every month       |
| `quarterly`                                      | `slime-quarterly` | every 3 months    |

All three plans belong to one product, **Slime Lime Subscription Pack** (`type: PHYSICAL`,
`category: FOOD_RETAIL_AND_SERVICE`). Each plan has:

- one `REGULAR` billing cycle with `total_cycles: 0`, so it bills until the subscriber cancels;
- a placeholder fixed price of 10.00 USD. The server must set the real pack price on each
  subscription it creates (a plan override, priced by `priceCart`); the placeholder only applies
  if a subscription has no override. Plan IDs are public, so a buyer could start a subscription
  at the placeholder price from the JS SDK. Fulfillment must check the billed amount;
- `payment_preferences: { auto_bill_outstanding: true, payment_failure_threshold: 1 }`.

## How it works

`ensurePlans()` in `api/_lib/plans.js` returns `{ biweekly, monthly, quarterly }` mapped to PayPal
plan IDs. On the first call in a function instance it:

1. Lists the catalog products (`GET /v1/catalogs/products`, every page) and picks the one named
   "Slime Lime Subscription Pack", or creates it.
2. Lists that product's plans (`GET /v1/billing/plans?product_id=…`, every page) and matches each
   cadence by plan name. An `ACTIVE` match is used as is. An `INACTIVE` or `CREATED` match is
   activated. If there is no match, the plan is created as `ACTIVE`.
3. Caches the result on that warm instance for 15 minutes, then checks PayPal again (in case a
   plan was changed in the dashboard). Concurrent calls share one in-flight run. A failed run is
   not cached, so the next call tries again.

Plans are matched by name and kept ACTIVE: if you deactivate `slime-monthly` in the PayPal
dashboard, the next check reactivates it. To retire a plan, rename it or change `PLAN_SPECS`.

It is safe to call often and from many instances at once:

- **Lookups come first.** Once the product and plans exist, a call only reads; it creates nothing.
- **Creates are idempotent.** Each create sends a fixed `PayPal-Request-Id`
  (`slime-product-v1`, `slime-plan-biweekly-v1`, `slime-plan-monthly-v1`,
  `slime-plan-quarterly-v1`). If two cold starts both miss the lookup and both create, PayPal
  returns the first result to the second request instead of creating a duplicate.

If you change the plan shape (frequency, cycles, payment preferences), bump `PROVISION_VERSION`
in `api/_lib/plans.js` and rename the plans, so new request IDs and names are used. To change only
what customers pay, change the per-subscription price override instead.

## Endpoint

`GET /api/paypal/plans` runs `ensurePlans()` and returns:

```json
{
  "env": "sandbox",
  "plans": {
    "biweekly":  { "id": "P-…", "status": "ACTIVE" },
    "monthly":   { "id": "P-…", "status": "ACTIVE" },
    "quarterly": { "id": "P-…", "status": "ACTIVE" }
  }
}
```

- The response is `Cache-Control: no-store` and has no secrets. Plan IDs are public; the browser
  passes them to PayPal to start a subscription.
- If PayPal fails, the response is `502` with `paypal: { name, issue, debug_id }`. Give PayPal
  support the `debug_id`.
- If the PayPal keys are missing, the response is `503`. Any method other than `GET` gets `405`.

You can call this endpoint once after deploying to a new environment (or switching `PAYPAL_ENV`)
to provision the plans up front. Otherwise the first subscription request provisions them.

## Requirements

- `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` set in Vercel. Sandbox and live each get their own
  product and plans, because they are separate PayPal accounts.
- The PayPal REST app must have **Subscriptions** enabled (developer dashboard → app → Features).
  Without it, catalog and plan calls fail with `403 NOT_AUTHORIZED`, which the endpoint returns as
  `502` with the `debug_id`.
