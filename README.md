# Zernio + OpenAI Instagram DM Auto-Reply

Minimal one-person Node.js app for replying to Instagram DMs with OpenAI through Zernio.

This is intentionally small:

- One Express.js process
- No database
- No Redis or queue
- No login screen or user accounts
- One local JSON file at `data/store.json`
- One DigitalOcean App Platform web component

## Env Vars

Fill these in locally and in DigitalOcean App Platform:

```bash
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_MODEL=gpt-4o-mini
ZERNIO_API_KEY=your-zernio-api-key
ZERNIO_ACCOUNT_ID=your-zernio-account-id
ZERNIO_WEBHOOK_SECRET=choose-a-long-random-zernio-secret
WEBHOOK_SECRET=choose-a-long-random-secret
AUTO_SEND=true
HUMANIZE_REPLIES_ENABLED=true
TYPING_INDICATOR_ENABLED=true
HUMAN_SEND_DELAY_ENABLED=true
HUMAN_SEND_DELAY_MIN_MS=6500
HUMAN_SEND_DELAY_MAX_MS=18000
CONVERSATION_MEMORY_ENABLED=true
FOLLOW_UPS_ENABLED=true
PALLET_PROS_KNOWLEDGE=
MANUAL_TAKEOVER_MINUTES=8
PORT=3000
DATA_DIR=
```

Notes:

- `OPENAI_MODEL` defaults to `gpt-4o-mini` if empty.
- `ZERNIO_API_KEY` enables Zernio inbox receiving and sending.
- `ZERNIO_ACCOUNT_ID` is optional when Zernio includes `accountId` in webhook payloads, but it is useful as a fallback for pulling history and sending replies.
- `ZERNIO_WEBHOOK_SECRET` verifies signed Zernio webhooks.
- If you do not configure signed Zernio webhooks yet, `/webhook/zernio?secret=WEBHOOK_SECRET` can use the simple query-secret fallback.
- `AUTO_SEND=true` sends replies immediately only when the AI returns `needs_review: false`.
- `AUTO_SEND=false` saves every generated reply as a pending draft.
- `FOLLOW_UPS_ENABLED=true` sends or drafts follow-up nudges based on your auto-send setting.
- `PALLET_PROS_KNOWLEDGE` is optional. If set, it overrides `knowledge/pallet-pros.md`.
- The OpenAI API key must have active API billing/credits. ChatGPT Plus/Pro billing is separate from API billing.

## Local Setup

```powershell
cd C:\path\to\zernio-openai-ig-autoreply
npm install

$env:OPENAI_API_KEY="sk-your-openai-api-key"
$env:OPENAI_MODEL="gpt-4o-mini"
$env:ZERNIO_API_KEY="your-zernio-api-key"
$env:ZERNIO_ACCOUNT_ID="your-zernio-account-id"
$env:ZERNIO_WEBHOOK_SECRET="choose-a-long-random-zernio-secret"
$env:WEBHOOK_SECRET="choose-a-long-random-secret"
$env:AUTO_SEND="true"
$env:HUMANIZE_REPLIES_ENABLED="true"
$env:TYPING_INDICATOR_ENABLED="true"
$env:HUMAN_SEND_DELAY_ENABLED="true"
$env:HUMAN_SEND_DELAY_MIN_MS="6500"
$env:HUMAN_SEND_DELAY_MAX_MS="18000"
$env:CONVERSATION_MEMORY_ENABLED="true"
$env:FOLLOW_UPS_ENABLED="true"
$env:PALLET_PROS_KNOWLEDGE=""
$env:MANUAL_TAKEOVER_MINUTES="8"
$env:PORT="3000"

npm start
```

Open:

```text
http://localhost:3000/
```

On mobile, open the deployed site in Safari or Chrome and choose `Add to Home Screen` from the browser menu. The app includes a manifest, icon, and service worker route so it can launch like a lightweight phone app.

## Webhook URL

Paste this into Zernio:

```text
https://YOUR-DIGITALOCEAN-APP-URL/webhook/zernio
```

Set the Zernio webhook events to:

```text
message.received
message.sent
```

The `message.received` event stores prospect replies. The `message.sent` event lets the app detect when you replied manually and pause auto-send for that conversation.

If you are not using Zernio's signed webhook secret yet, use this temporary fallback URL:

```text
https://YOUR-DIGITALOCEAN-APP-URL/webhook/zernio?secret=YOUR_WEBHOOK_SECRET
```

## DigitalOcean App Platform Deploy

1. Put this folder in a GitHub repo.
2. In DigitalOcean, create or update one App Platform web service from that repo.
3. Use the Node.js buildpack. No Dockerfile is required.
4. Build command: leave blank or use `npm install`.
5. Run command: `npm start`.
6. Add the env vars from the Env Vars section.
7. Do not add a managed database.
8. Do not add Redis.
9. Do not add a second component.
10. Deploy.

## How It Works

1. `POST /webhook/zernio` receives Zernio message events.
2. The app verifies the Zernio signature from `ZERNIO_WEBHOOK_SECRET`, or uses the temporary `WEBHOOK_SECRET` query fallback.
3. It extracts incoming Instagram DM text from the webhook.
4. It pulls recent conversation messages from Zernio:
   `GET /v1/inbox/conversations/{conversationId}/messages`
5. It calls OpenAI and asks for:
   `{ "reply": string, "needs_review": boolean }`
6. If `AUTO_SEND=true` and `needs_review=false`, it sends through Zernio:
   `POST /v1/inbox/conversations/{conversationId}/messages`
7. Otherwise it saves a draft in `data/store.json`.
8. The app updates lightweight conversation memory by prospect/channel.
9. `GET /` shows today's tracker, conversation memory, controls, and pending drafts.

## Conversation Flow

The assistant should sound like a real Instagram DM conversation, not a rigid script.

Core flow:

- If the prospect asks a question, answer it briefly first.
- If they give context, acknowledge one specific detail.
- When it makes sense, ask: `Is this business something you'd be interested in pursuing?`
- If they say yes, invite them to schedule a Zoom/discovery call.
- Explain that the call is to research their area, answer questions, and see if Pallet Pros Academy fits their goals.
- Ask permission before sending the calendar link: `Do you mind if I send the calendar link?`
- If they say yes, send: `https://www.tidycal.com/palletprosga/discovery`

The app should not keep repeating the same greeting, question, link, or follow-up.

## Conversation Memory Lite

When `CONVERSATION_MEMORY_ENABLED=true`, the app stores a compact record under `data/store.json` keyed by:

```text
provider/account + origin + contact_id
```

The memory stores recent messages, sent-link flags, qualifying questions already asked, processed incoming message IDs, manual takeover state, and follow-up state. It does not add a database or separate service.

The app keeps up to 40 local messages per conversation, sends the latest 20 into the OpenAI prompt, and builds a compact summary for older context.

## Daily Tracker

The homepage and `GET /api/stats` show today's counts:

```text
Prospects touched by sent replies
AI replies sent
Drafts created
Training/YouTube links sent
Booking links sent
Follow-ups sent
```

Important DigitalOcean note: App Platform web components use ephemeral local filesystems. That means `data/store.json` can reset on redeploy/restart because App Platform does not support mounted volumes. For permanent analytics across deploys, use Spaces/Object Storage or a managed database later. The current app intentionally stays database-free.

## Operator Cockpit

The homepage includes:

- Recent conversations with lead status labels.
- Pause/Resume AI per conversation when you want to take over manually.
- Draft feedback buttons: `Good`, `Robotic`, `Pushy`, and `Wrong context`.
- Test Reply mode for pasting a transcript and previewing what OpenAI would say without sending anything.

## Feature Controls

The homepage has on/off controls for:

```text
Auto-send
Follow-ups
Humanize
Typing
Delay
Memory
```

These controls override the matching env vars and are stored in `data/store.json`.

## Knowledge Base

The app includes a simple business knowledge base at:

```text
knowledge/pallet-pros.md
```

That file is added to the OpenAI prompt as `business_knowledge` for replies and follow-ups. It is meant for Pallet Pros facts, offer details, FAQs, objections, tone examples, boundaries, and words/phrases to avoid.

Keep sensitive/private information out of the knowledge base because it can be sent to OpenAI as prompt context.

## Draft Review API

```text
GET  /api/drafts
POST /api/drafts/:id/approve
POST /api/drafts/:id/reject
```

Approve accepts JSON:

```json
{ "reply": "Edited reply text" }
```
