# Demo video script

One take, about 2:45. Everything shown here is part of the build. Don't ad-lib features that aren't listed.

Production URL: https://slime-lime-eta.vercel.app

## Before you record

### Setup

- [ ] **Sandbox buyer login ready.** developer.paypal.com → Testing tools → Sandbox accounts → the **Personal** (buyer) account. Copy its email and password.
- [ ] **Fresh Chrome profile.** Create a new profile just for the recording so history, bookmarks and autofill are empty. Remove any default bookmarks and keep the bookmarks bar hidden.
- [ ] **Dry run once in that profile.** Open the production URL, allow the mic, run the whole script once, and let Chrome save the sandbox buyer password at the PayPal login, so the login autofills during the take.
- [ ] **Reset after the dry run.** Chrome → Clear browsing data → Advanced → tick **Browsing history** and **Cookies and other site data**. Leave **Site settings** unticked so the mic permission stays. This clears the dry run's pack and subscription from the site, so the take starts with nothing saved.
- [ ] **Mic tested.** Say "I play ranked FPS late at night" once and check that the transcript in the concierge panel reads it correctly. Use a headset mic if the room echoes.
- [ ] **Notifications off.** Windows Focus / Do not disturb on. Close chat apps and email.
- [ ] **Only one tab open:** the production URL. Zoom 100%, window at 1440 wide or larger.
- [ ] **Editor ready for shot 6.** Open `api/_lib/catalog.js`, `api/_lib/concierge.js` and `api/_lib/subsign.js` in tabs, in that order. Use full-screen / zen mode so no app or extension logos show.
- [ ] **Screen recorder** set to record system audio too, so the agent's spoken replies are captured.

### Rules checklist

- [ ] Final cut is **under 3:00**. Target 2:45.
- [ ] Uploaded to YouTube as **Public** (not Unlisted, not Private).
- [ ] **No third-party trademarks on screen.** No brand logos in tabs, bookmarks or the taskbar. The site itself is clear: the footer uses plain icons and the copy names no other drinks or games (DAR-707), so any page is safe to show. PayPal's own window is fine; it's the payment partner.
- [ ] **No unlicensed music.** Use no music, or a track you have a license for.
- [ ] **Chrome only.** Hands-free voice needs Chrome's speech recognition. Say so in the Devpost write-up too.
- [ ] On-screen text **"PayPal sandbox · test money only"** is visible while the PayPal window is up (shots 9–10) and on the end card. Add it in the editor as a lower-third.

## Shot table

Lines in quotes under "Ryan says" are spoken out loud to the site. Lines in *italics* are voice-over for the edit, not spoken to the site.

| # | Time | Screen | Ryan says | Agent says / does |
|---|------|--------|-----------|-------------------|
| **Step 1: Open and pick a mode** | | | | |
| 1 | 0:00–0:06 | Chrome, production URL, home page hero | *"This is Slime Lime. You can shop it by voice and subscribe with PayPal."* | Mode picker appears: Hands-free or Legacy. |
| 2 | 0:06–0:12 | Mode picker | (taps **Hands-free**) | Concierge panel opens and starts listening. No wake word; it keeps listening. |
| **Step 2: Build a pack** | | | | |
| 3 | 0:12–0:22 | Concierge panel over the home page | "I play ranked FPS late at night, keep it light on caffeine." | Replies out loud. Asks **at most one** question (for example, how many bottles per delivery). |
| 4 | 0:22–0:27 | Same | Answers the question in a few words, e.g. "Twelve." | (If it didn't ask anything, skip this shot and give the time to shot 5.) |
| 5 | 0:27–0:42 | Flavor-choosing visual, then the adding-to-cart visual | (quiet; let it play) | Calls `build_pack`. The flavor-choosing visual shows the picks. Says which flavors it chose and why, then the adding-to-cart visual plays. |
| **Step 3: Monthly subscription through PayPal** | | | | |
| 6 | 0:42–0:50 | Concierge panel, pack visible | "Make it monthly." | Calls `set_cadence`. Says the pack now comes every month. |
| 7 | 0:50–1:02 | Same | "Start my subscription." | Reads back the items and the **per-delivery total**. The checking-out visual plays and the PayPal button appears. |
| 8 | 1:02–1:06 | PayPal button | *"Payment is never approved by voice. I tap PayPal myself."* (taps the **PayPal** button) | PayPal sandbox window opens. |
| 9 | 1:06–1:22 | PayPal sandbox window | (logs in with the sandbox buyer, autofilled; taps the approve / subscribe button) | PayPal shows the plan: billed every month. Lower-third: **PayPal sandbox · test money only**. |
| 10 | 1:22–1:30 | Window closes, back on site | (quiet) | Says the subscription is set up. |
| **Step 4: Come back later and manage it** | | | | |
| 11 | 1:30–1:38 | Reload the page | *"Later, I come back."* (reloads; taps **Hands-free** again if the mode picker shows) | Concierge listening. |
| 12 | 1:38–1:46 | Concierge panel | "What's my subscription?" | Status: active, monthly, and the **next billing date**. |
| 13 | 1:46–1:58 | Same | "Pause it." → (agent asks) → "Confirm." | Says it will pause the subscription and asks you to say "confirm". After "confirm": paused. The moving-to-a-new-function visual plays when it switches to subscription management. |
| 14 | 1:58–2:08 | Same | "Resume it." → (agent asks) → "Confirm." | Asks for "confirm" again. After "confirm": active again. |
| **Step 5: Get my usual** | | | | |
| 15 | 2:08–2:16 | Same | "Get my usual." | Sees the active subscription, so it doesn't start a second one. Says your pack already comes every month and offers an **extra one-time pack**. |
| 16 | 2:16–2:20 | Same | "No thanks. Stop listening." | Mic turns off. |
| **Step 6: Close on the code** | | | | |
| 17 | 2:20–2:28 | Editor: `api/_lib/catalog.js` | *"Prices are set on the server. The browser and the model only send flavor IDs and quantities."* | — |
| 18 | 2:28–2:36 | Editor: `api/_lib/concierge.js`, `summarizeOrder` | *"Payer details from PayPal never reach the model. It only sees this summary."* | — |
| 19 | 2:36–2:43 | Editor: `api/_lib/subsign.js` | *"The subscription ID is signed with an HMAC, so pause, resume and cancel only work with the signature."* | — |
| 20 | 2:43–2:48 | End card: site URL | *"Slime Lime. Built for the PayPal AI Hackathon."* | End card text: https://slime-lime-eta.vercel.app · **PayPal sandbox · test money only** |

Total: 2:48. If you run long, cut shot 14 (resume) and say "Get my usual" right after the pause. The agent should still offer the extra pack, because the subscription is in your history.

## If voice mishears

The concierge panel has a text box. Typing is a fallback only. Stay in Hands-free mode and keep the take going.

- **Step 1 (mode picker):** if Chrome asks for mic permission, allow it. If the panel isn't listening, reload and tap Hands-free again. Trim the pause in the edit.
- **Step 2 (build a pack):** if it mishears, type it in the panel: `I play ranked FPS late at night, keep it light on caffeine`. If it asks a second question, answer it in the panel.
- **Step 3 (subscription):** if it mishears, type it in the panel: `Make it monthly`, then `Start my subscription`. If the PayPal window is blocked, click the PayPal button again. Never approve by voice; the tap is the approval.
- **Step 4 (manage):** if it mishears, type it in the panel: `What's my subscription?`, `Pause it`, `confirm`, `Resume it`, `confirm`. If it acted on something you didn't say, don't say "confirm"; nothing changes without it.
- **Step 5 (get my usual):** if it mishears, type it in the panel: `Get my usual`. If "stop listening" is misheard, type it in the panel: `stop listening`.
- **Step 6 (code):** no voice. If you fumble a line, pause, then say it again. Cut the first try in the edit.
