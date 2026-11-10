# Slime Lime

> Late nights deserve better fuel.

Personal project. **Slime Lime** is a conceptual brand I built end-to-end — naming, positioning, visual identity, packaging language, and this site. The "company" doesn't exist; the goal was to take a fictional product (a clean-formula gaming soda) and design every surface as if it shipped tomorrow.

This repo is the marketing site half of that exercise.

**Live site:** https://slime-lime-eta.vercel.app

---

## What's in here

A static, no-build React SPA. Loads React 18 + Babel-standalone from CDN, mounts at `<div id="root">`, and hash-routes between five pages.

```
.
├── Slime Lime.html         entry — mounts <App/>
├── colors_and_type.css     design tokens (color, type, spacing, motion)
├── site.css                site styles, animations, HUD chrome, layout helpers
├── shell.jsx               FLAVORS data, Nav, Footer, CartDrawer, Icon, Wordmark, hooks
├── home.jsx                Hero, LiveTicker, ProofStrip, Lineup, ScrollStory, Streamers, SubscribeBar
├── flagship.jsx            PDP (Lemon-Lime) — overview / science / nutrition / reviews tabs
├── subscribe.jsx           Subscribe builder — pack size → flavors → cadence → live price
├── story-faq.jsx           Story page + FAQ accordion
├── concierge.jsx           Flavor Concierge chat panel (AI agent UI)
├── assets/
│   ├── Bottle.jsx          high-fi glass juice bottle SVG (recolored per flavor)
│   ├── bg-leaves.png       hero/leaf backdrop
│   ├── hero-mobile-*.png   packaging photography
│   ├── logo-*.png          brand logos
│   └── mark-*.png          brand marks (slime, leafy, burst)
└── vercel.json             rewrites / → /Slime Lime.html
```

## Run it locally

Just open `Slime Lime.html` in any modern browser. No install, no build, no dev server.

If you want a server (e.g., to test routing across hosts):

```bash
python -m http.server 8000
# → http://localhost:8000/Slime%20Lime.html
```

## Pages

Hash-based routing — refresh-safe, no server config required.

| Route | Page | Highlights |
|---|---|---|
| `/` | Home | Reactive hero (cursor reticle, click-to-drip), live ticker, lineup with flavor recolor, scroll-pinned 3-act story, streamer quotes, subscribe pitch |
| `/flagship` | PDP | Lemon-Lime detail with tabs, qty picker, science chart |
| `/subscribe` | Builder | Pack size → flavor picker (with remaining counter) → cadence → live discount |
| `/story` | Story | Brand origin, timeline, science breakdown |
| `/faq` | FAQ | Grouped accordion (Product / Subscription / Shipping) |

## Notable mechanics

- **Flavor theme system.** Picking a flavor updates `--accent`, `--accent-deep`, `--accent-soft`, and `--accent-glow` on `:root` — every component recolors live. See `useFlavorTheme` in `shell.jsx`.
- **Cart with persistence.** `useCart` in `shell.jsx` syncs `localStorage['sl-cart']` on every mutation. Free-shipping progress bar at $40.
- **Reactive hero.** `Hero` in `home.jsx` tracks cursor position to morph a slime blob, tilt the bottle, render a video-game targeting reticle with X/Y HUD readout, and spawn drip splashes on click.
- **Scroll story.** `ScrollStory` reads scroll progress against a 300vh container to drive a sticky 3-act sequence.

## PayPal sandbox checkout

The cart's **Pay with PayPal** button runs a real PayPal **sandbox** checkout (test money only).

- `api/paypal/config.js`: GET, returns the public client ID and environment.
- `api/paypal/orders.js`: POST `{ items: [{ id, qty, subscription? }] }`. Prices the cart **on the server** (`api/_lib/catalog.js`) and creates a PayPal Orders v2 order. Client-sent prices are ignored.
- `api/paypal/capture.js`: POST `{ orderId }`, captures the approved order.
- Browser side uses the PayPal JS SDK v6 (`useShellPayPal` in `shell.jsx`).

Set these in Vercel (Project, Settings, Environment Variables), never in code:

| Name | Value |
|---|---|
| `PAYPAL_CLIENT_ID` | Sandbox app client ID |
| `PAYPAL_CLIENT_SECRET` | Sandbox app secret |
| `PAYPAL_ENV` | optional, `sandbox` (default) or `live` |

Keep `api/_lib/catalog.js` prices in sync with `FLAVORS` in `shell.jsx`. A plain static server (`python -m http.server`) has no `/api`, so the button shows "Checkout offline" there; use a Vercel preview or `vercel dev`.

## Flavor Concierge (AI shopping agent)

The **Flavor Concierge** button (bottom right) opens a chat with an AI agent that shops for you:

1. You say how you play and what you like ("late-night ranked, nothing too sweet").
2. The agent builds a pack from the real lineup and drops it into the Fridge cart.
3. When you say yes, the agent creates the PayPal sandbox order. You approve it with the PayPal button in the chat.
4. After you pay, the agent confirms the order with PayPal. Next time, "get my usual" reloads your last order.

How it works:

- `api/concierge/chat.js` (POST) runs the agent with the Vercel AI SDK (`ai` v4), on Google Gemini directly or through Vercel AI Gateway (see the env vars below).
- Agent tools (`api/_lib/concierge.js`):
  - `build_pack`: flavor ids and quantities only. Priced on the server by `api/_lib/catalog.js`.
  - `start_checkout`: creates the PayPal Orders v2 order for that pack, server-priced.
  - `reorder_usual`: reloads a past order from this device's history, at today's prices.
  - `get_order`: from the **PayPal Agent Toolkit** (`@paypal/agent-toolkit/ai-sdk`), used to confirm payment status. Only status and amounts are passed back to the model, never payer details.
- The model never sets a price. Every amount comes from `catalog.js`.
- Order history ("my usual") is stored only in the shopper's browser: `localStorage['sl-orders']`, the last 5 paid orders (order id, date, flavor ids and quantities, total). No accounts, no server database.

Environment variables (Vercel, Project, Settings, Environment Variables):

| Name | Value |
|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Option A: a Google AI Studio (Gemini API) key. When set, the agent calls Gemini directly (`gemini-2.5-flash`, override with `CONCIERGE_GOOGLE_MODEL`). |
| `AI_GATEWAY_API_KEY` | Option B, optional: Vercel AI Gateway. On Vercel deployments the function's OIDC token already authenticates the gateway, but the team needs a card on file before the gateway serves requests. |
| `CONCIERGE_MODEL` | optional AI Gateway model id, default `google/gemini-3-flash` |

The concierge reuses `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET` from the checkout above.

## Deploy

Auto-deploys to Vercel on push to `main`. Production alias: **slime-lime-eta.vercel.app**.

For manual deploys: `vercel --prod` from the project root.

## Stack

- React 18 (CDN, dev build — design-prototype runtime)
- Babel-standalone for in-browser JSX
- Vanilla CSS with custom properties (no framework)
- Static hosting on Vercel, plus Node serverless functions in `api/` for PayPal and the Flavor Concierge
- Vercel AI SDK v4 + Vercel AI Gateway, PayPal Agent Toolkit
