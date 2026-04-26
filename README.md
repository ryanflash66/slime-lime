# Slime Lime

> Late nights deserve better fuel.

Marketing site for **Slime Lime** — a clean-formula soda built for the long session. 75mg of clean caffeine, 100mg L-theanine, real fruit, six electrolytes. Built for gamers, streamers, and anyone allergic to a 4pm crash.

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

## Deploy

Auto-deploys to Vercel on push to `main`. Production alias: **slime-lime-eta.vercel.app**.

For manual deploys: `vercel --prod` from the project root.

## Stack

- React 18 (CDN, dev build — design-prototype runtime)
- Babel-standalone for in-browser JSX
- Vanilla CSS with custom properties (no framework)
- Static hosting on Vercel

## Credits

Designed with [Claude Design](https://claude.ai/design). Implemented from the design handoff bundle.
