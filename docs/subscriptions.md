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
  subscription it creates (a plan override, priced by `priceSubscription`); the placeholder only
  applies if a subscription has no override. Plan IDs are public, so a buyer could start a
  subscription at the placeholder price from the JS SDK. Fulfillment must check the billed amount
  (see [Checking the billed amount](#checking-the-billed-amount-verifybilledamount));
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
- `SUB_SIGNING_SECRET` set in Vercel (any long random string) for `POST /api/paypal/subscriptions`.
  Changing it invalidates every `sig` already handed out.

## Creating a subscription

`POST /api/paypal/subscriptions` (`api/paypal/subscriptions.js`) prices the pack on the server and
creates the PayPal subscription the buyer then approves.

Request:

```json
{
  "lines": [{ "id": "lemon-lime", "qty": 6 }, { "id": "cherry", "qty": 4 }, { "id": "mango", "qty": 2 }],
  "cadence": "monthly",
  "attemptId": "a1b2c3d4"
}
```

`attemptId` is optional: a client-generated ID (8 to 64 of `A-Z a-z 0-9 - _`) for one checkout
attempt. The server hashes it with the cadence and the priced pack into the `PayPal-Request-Id`,
so a retry of the same attempt gets the same subscription back instead of a second one, while the
same attemptId with a different pack still creates a new one.

`id` is a plain flavor id. The server adds the `--sub` suffix itself, so a subscription costs
exactly what the same `--sub` lines cost in the cart: `priceSubscription(lines, cadence)` in
`catalog.js` runs them through `priceCart(lines, { allowSubscription: true })` (1 to 20 lines,
quantity 1 to 96, known cadence) and returns `{ totalCents, total, packCode }`.

Without that option `priceCart` refuses any `--sub` line with a `400`. That is the one-time path
(`POST /api/paypal/orders` and the concierge's `start_checkout`): PayPal can't bill a recurring
pack and one-time bottles in one payment, so a subscription is only ever created here.

The PayPal call is `POST /v1/billing/subscriptions` with:

- `plan_id`: `ensurePlans()[cadence]`;
- `plan: { billing_cycles: [{ sequence: 1, pricing_scheme: { fixed_price: { value: <total>, currency_code: "USD" } } }] }`,
  the inline price override. It is always sent; without it PayPal would bill the 10.00 placeholder;
- `custom_id`: the pack code (below);
- `application_context: { brand_name: "Slime Lime", shipping_preference: "NO_SHIPPING", user_action: "SUBSCRIBE_NOW" }`.

Response `201`:

```json
{ "subscriptionId": "I-…", "sig": "…", "total": "21.96", "cadence": "monthly" }
```

The subscription starts as `APPROVAL_PENDING`; the browser hands `subscriptionId` to the PayPal
JS SDK for approval. `sig` is `base64url(HMAC-SHA256(SUB_SIGNING_SECRET, subscriptionId))`
(`subsign.sign(id)` in `api/_lib/subsign.js`). Later calls that take a subscription ID from the
browser should require the `sig` and check it with `subsign.verify(id, sig)`, which compares in
constant time and returns `false` (never throws) on missing, malformed or wrong-length input.

Errors: `400` for a bad pack or cadence, `405` for any method but `POST`, and `503` when
`SUB_SIGNING_SECRET` (or the PayPal keys) is missing. The signing secret is checked before any
PayPal call, so no unsigned subscription is ever created. The pack is validated before PayPal is
called, so any PayPal error (even a 4xx such as `403 NOT_AUTHORIZED`) comes back as `502` with
`paypal: { name, issue, debug_id }`, like `GET /api/paypal/plans`.

Each call creates a new subscription. One the buyer never approves stays `APPROVAL_PENDING` and
is never billed, so a retry or double click costs nothing.

### In the browser

The Fridge (`fridge.jsx`) shows two checkouts when the cart holds both kinds of line:
"Start subscription · $X every <cadence>" for the crisper pack and "Pay with PayPal · $Y" for the
one-time bottles. `useShellPayPalSub` in `shell.jsx` drives the first one on PayPal JS SDK v6:

1. `shellLoadPayPal()` creates one SDK instance with
   `components: ['paypal-payments', 'paypal-subscriptions']`; the hook checks
   `findEligibleMethods({ paymentFlow: 'RECURRING_PAYMENT', currencyCode: 'USD' })` and creates
   one `createPayPalSubscriptionPaymentSession({ onApprove, onCancel, onError })`.
2. The click handler calls `session.start({ presentationMode: 'auto' }, promise)` synchronously
   (so the popup isn't blocked), where `promise` is this endpoint's response mapped to
   `{ subscriptionId }`. Each click gets a fresh `attemptId` (`crypto.randomUUID()`); a lost
   response (network error or 5xx) is retried once with the same one.
3. On approve, `slRecordSubscription` (`concierge.jsx`) stores
   `{ kind: 'subscription', subscriptionId, sig, cadence, at, lines, total }` in
   `localStorage['sl-orders']`, the subscribed crisper lines leave the cart, and a
   `sl-concierge` event with `type: 'subscribed'` goes out. Cancel or error leaves the cart as is.

### Pack codes (`custom_id`)

The pack is stored on the subscription as a pack code: each line as a two-letter flavor code plus
its quantity, joined with `.`, in the order given. For example `lm6.ch4.mg2` is 6 Lemon-Lime,
4 Cherry Cool and 2 Mango Rush. Lines are not merged, so the code decodes to exactly the lines
that were priced.

| Flavor id    | Code |
| ------------ | ---- |
| `lemon-lime` | `lm` |
| `cherry`     | `ch` |
| `blue-rasp`  | `br` |
| `mango`      | `mg` |
| `grape`      | `gp` |
| `watermelon` | `wm` |

Codes live in `FLAVOR_CODES` in `catalog.js`. Never reuse or reassign one: a live subscription
keeps its `custom_id` for as long as it bills. When a flavor is retired, leave its code in
`FLAVOR_CODES`. A new flavor needs a new code; the module refuses to load if a flavor has no code
or two flavors share one. `decodePackCode(code)` turns a code back into `[{ id, qty }]`, or returns
`null` if it is malformed. The longest accepted pack (20 lines of 96) is 99 characters, inside
PayPal's 127-character limit; `priceSubscription` refuses any pack whose code would be longer.

`node scripts/check-sub-pricing.mjs` checks, over thousands of random packs and every cadence,
that `priceSubscription` equals `priceCart` for the same `--sub` lines, that pack codes round-trip,
and that the worst case fits in `custom_id`. Run it along with `node scripts/check-prices.mjs`
before merging.

## Checking the billed amount (`verifyBilledAmount`)

Plan IDs are public and every plan carries the 10.00 USD placeholder. A buyer can skip our endpoint
and start a subscription from the PayPal JS SDK on a plan ID, at the placeholder price or with an
inline override and `custom_id` of their own. Such a subscription is real, and PayPal will bill it.
So never trust a subscription's price or contents without checking them.

`verifyBilledAmount(subscription, planIds?)` in `api/_lib/subscriptions.js` does that check. Pass
it the result of `getSubscription(id)`, which calls
`GET /v1/billing/subscriptions/{id}?fields=plan`. The `fields=plan` part matters: only then does
PayPal include the subscription's effective `plan.billing_cycles`, where an inline override shows up
as `pricing_scheme.fixed_price` (and `plan_overridden` is `true`). Without it there is nothing to
compare, and the check fails.

It resolves `{ ok: true, cadence, lines, packCode, expected }` only when:

1. `custom_id` decodes to a pack (`decodePackCode`);
2. `plan_id` is one of our cadence plans (`ensurePlans()`, or the `planIds` map you pass), which
   gives the cadence;
3. every billing cycle's `fixed_price` is in USD and equals `priceSubscription(pack, cadence).total`
   (a cycle with no price, such as a free trial, fails);
4. `quantity` is absent or `"1"`;
5. `billing_info.last_payment.amount`, once PayPal has taken a payment, is that same amount.

Otherwise it resolves `{ ok: false, reason, expected?, actual? }`. It only rejects when
`ensurePlans()` cannot reach PayPal, so a caller can tell "wrong price" from "could not check".
Without `planIds`, a cold instance runs the full `ensurePlans()` lookup first; pass `planIds` when
you already have them.

The check compares against **today's** prices and plans:

- If you change a flavor price or a cadence discount, existing subscriptions keep billing their
  old inline price and fail the check until they are moved to the new price (PayPal's
  `POST /v1/billing/subscriptions/{id}/revise` with a new `plan` override). That is on purpose: they
  no longer bill what the pack costs.
- If you retire a flavor, its pack codes still decode, but `priceSubscription` refuses them.
- If you replace a plan (rename it or bump `PROVISION_VERSION` in `plans.js`), subscriptions on the
  old plan are "not on a Slime Lime plan". While they run out, pass `planIds` with an array per
  cadence that includes the old plan IDs (for example `{ monthly: [newId, oldId], … }`).

Plan these changes together with the subscriptions that are still billing.

Status, manage and fulfillment code (DAR-695 and later) should check both: `sig` (this server
created the subscription) and `verifyBilledAmount` (it bills what the pack costs). Do not fulfill
a subscription that fails either one.
