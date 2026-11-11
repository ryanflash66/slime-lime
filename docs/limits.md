# Abuse limits (DAR-693)

The concierge spends model credit on every turn, and each PayPal order or subscription call
creates a sandbox object. Both are public, so they need limits that hold until judging ends
(Dec 15, 2026). A memory counter in a serverless function resets with every new instance, so
the limits come in two layers:

1. **Vercel Firewall** at the edge: a per-IP rate limit before any function runs.
2. **Caps in the code**: anything oversized is refused before a model or PayPal is called.

## 1. Code caps

`api/concierge/chat.js` checks these before calling the model:

| Cap | Limit | Over the limit |
|---|---|---|
| Method | POST only | 405 |
| Request body | 32 KB (`Content-Length` or the parsed body) | 413 "That message is too long." |
| Messages per request | 20 (the panel sends its last 20) | 400 |
| Characters per message | 2,000 hard cap | 400 |
| `pack` lines | 20 (`MAX_LINES` in `catalog.js`) | 400 |
| `history` entries | 5 (the panel keeps the last 5 orders) | 400 |
| Missing or empty `messages` | | 400 "Send a message first." |

`api/_lib/concierge.js` then trims what reaches the model:

| Cap | Limit |
|---|---|
| Turns sent to the model (`MAX_TURNS`) | last 16 |
| Characters per message (`MAX_CHARS`) | 600 (longer text is cut, not refused) |
| Tool steps per turn (`maxSteps`) | 5 |
| Output tokens per step (`maxTokens`) | 700 |
| Time for all model attempts (`TURN_BUDGET_MS`) | 50 s, inside the 60 s `maxDuration` |
| Model retries | 1 on Claude when Gemini is waiting, 2 on the last model |

## 2. Vercel Firewall rules

Project `slime-lime` (`prj_RjjxnFayzMV2q4dM1di41qFDQ0Z4`), team
`team_Xh3KqQWJnE51kw8bplPjsd5b`. Both rules are custom rules with a `rate_limit` action, a
fixed 60 s window keyed by client IP, and a 429 response. They match only these paths; the
rest of the site is untouched.

| Rule | Matches | Limit |
|---|---|---|
| `concierge-rate-limit` | path starts with `/api/concierge/chat` AND method equals `POST` | 20 per 60 s per IP, then 429 until the window resets (live) |
| `paypal-rate-limit` | path matches `^/api/paypal/(orders\|subscriptions\|subscription-manage)` (any method) | 10 per 60 s per IP (not available on the current plan) |

Paths match by prefix rather than exact equality, so `/api/concierge/chat/` or
`/api/concierge/chat.js` can't reach the function around the rule.

Two trade-offs to know about:

- The count is per public IP. People sharing one network (a venue or office Wi-Fi) share one
  budget of 20 concierge messages a minute. For a demo, that is plenty.
- `/api/paypal/capture` and `/api/paypal/plans` are not covered. Capture only finishes an order
  the shopper already approved, and the site never calls plans from the browser. Add them to the
  regex if they ever see abuse.

**Status (Nov 11, 2026): `concierge-rate-limit` is live; `paypal-rate-limit` is not.**

- `concierge-rate-limit` (id `rule_concierge_rate_limit_pxg4bc`) was created with
  `vercel firewall rules add` and published. Check on production: 23 quick POSTs of `{}`
  returned 400 nineteen times, then 429, and the rest of the site still answered 200.
- **No action duration ("hold").** The first version used `actionDuration: "1m"`. After the
  first 429, Vercel answered 403 to *every* request from that IP, the storefront included, for
  about 70 s. A shopper on shared Wi-Fi could lose the whole site that way, so the rule was
  re-published without the hold: only chat POSTs over the limit get 429, until the window resets.
- `paypal-rate-limit` was refused: "Rate limiting is not available for this plan (402)". The
  current Vercel plan allows one rate-limit rule, and the concierge rule guards the model credit,
  so it gets that slot. The PayPal endpoints rely on the code caps until the plan changes.
- The MCP `put_firewall_config` / `update_firewall_config` tools both answered 404 "Config not
  found" for a project with no firewall config yet; the CLI (`vercel firewall rules add`, then
  `vercel firewall publish`) works.

### Apply the rules

Use either the Vercel MCP tool `put_firewall_config` (the project has no config yet, so this
creates one and removes nothing) or the dashboard: Project > Firewall > Configure > New Rule.
The request body:

```json
{
  "firewallEnabled": true,
  "rules": [
    {
      "name": "concierge-rate-limit",
      "description": "DAR-693: 20 POSTs per 60 s per IP on the AI concierge; over the limit gets 429 for 60 s.",
      "active": true,
      "conditionGroup": [{ "conditions": [
        { "type": "path", "op": "pre", "value": "/api/concierge/chat" },
        { "type": "method", "op": "eq", "value": "POST" }
      ] }],
      "action": { "mitigate": {
        "action": "rate_limit",
        "rateLimit": { "algo": "fixed_window", "window": 60, "limit": 20, "keys": ["ip"], "action": "rate_limit" }
      } }
    },
    {
      "name": "paypal-rate-limit",
      "description": "DAR-693: 10 requests per 60 s per IP on the PayPal order and subscription endpoints; over the limit gets 429 for 60 s.",
      "active": true,
      "conditionGroup": [{ "conditions": [
        { "type": "path", "op": "re", "value": "^/api/paypal/(orders|subscriptions|subscription-manage)" }
      ] }],
      "action": { "mitigate": {
        "action": "rate_limit",
        "rateLimit": { "algo": "fixed_window", "window": 60, "limit": 10, "keys": ["ip"], "action": "rate_limit" }
      } }
    }
  ]
}
```

The follow-up action `rate_limit` answers 429 Too Many Requests; `deny` would answer 403. If
the plan allows only one rate-limit rule, create `concierge-rate-limit` first: it guards the
model credit.

### Check the rules on production

Each check blocks your own IP for up to a minute, so wait between them.

```bash
# Concierge: an empty body is refused with 400 before any model call.
# Expect 400 for the first 20, then 429.
for i in $(seq 1 22); do
  curl -s -o /dev/null -w "%{http_code} " -X POST -H 'Content-Type: application/json' \
    -d '{}' https://slime-lime-eta.vercel.app/api/concierge/chat
done; echo

# PayPal: GET is refused with 405 and creates nothing. Expect 405 for the first 10, then 429.
for i in $(seq 1 12); do
  curl -s -o /dev/null -w "%{http_code} " https://slime-lime-eta.vercel.app/api/paypal/orders
done; echo
```

## 3. What the shopper sees

`concierge.jsx` shows a 429 as "Easy there — the concierge needs a breather. Try again in a
minute." in the chat, not as a generic glitch. Nothing retries on its own: each message the
shopper sends is one request.
