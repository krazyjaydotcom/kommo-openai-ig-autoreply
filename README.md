# Kommo/Zernio + OpenAI Instagram DM Auto-Reply

Minimal one-person Node.js app for replying to Instagram DMs with OpenAI through Kommo or Zernio.

This is intentionally small:

- One Express.js process
- No database
- No Redis or queue
- No login screen or user accounts
- Static Kommo Bearer token from `KOMMO_ACCESS_TOKEN`
- One local JSON file at `data/store.json`
- One DigitalOcean App Platform web component

## Env Vars

Fill these in locally and in DigitalOcean App Platform:

```bash
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_MODEL=gpt-4o-mini
KOMMO_SUBDOMAIN=your-subdomain
KOMMO_ACCESS_TOKEN=your-long-lived-kommo-access-token
ZERNIO_API_KEY=your-zernio-api-key
ZERNIO_ACCOUNT_ID=your-zernio-account-id
ZERNIO_WEBHOOK_SECRET=choose-a-long-random-zernio-secret
WEBHOOK_SECRET=choose-a-long-random-secret
AUTO_SEND=false
HUMANIZE_REPLIES_ENABLED=true
TYPING_INDICATOR_ENABLED=true
HUMAN_SEND_DELAY_ENABLED=true
HUMAN_SEND_DELAY_MIN_MS=6500
HUMAN_SEND_DELAY_MAX_MS=18000
CONVERSATION_MEMORY_ENABLED=true
FOLLOW_UPS_ENABLED=false
PALLET_PROS_KNOWLEDGE=
MANUAL_TAKEOVER_MINUTES=8
PORT=3000
```

Notes:

- `OPENAI_MODEL` defaults to `gpt-4o-mini` if empty.
- `KOMMO_SUBDOMAIN` can be `your-subdomain` or `your-subdomain.kommo.com`.
- `ZERNIO_API_KEY` enables Zernio inbox receiving/sending.
- `ZERNIO_ACCOUNT_ID` is optional when Zernio includes `accountId` in webhook payloads, but important as a fallback for pulling conversation history and sending replies.
- `ZERNIO_WEBHOOK_SECRET` verifies signed Zernio webhooks. If you do not configure it yet, `/webhook/zernio?secret=WEBHOOK_SECRET` can use the simple query-secret fallback.
- `AUTO_SEND=true` sends replies immediately only when the AI returns `needs_review: false`.
- `AUTO_SEND=false` saves every generated reply as a pending draft.
- The homepage can override `AUTO_SEND` and the other feature flags without editing DigitalOcean env vars.
- `HUMANIZE_REPLIES_ENABLED=true` adds relaxed Instagram DM style guidance to the AI prompt.
- `TYPING_INDICATOR_ENABLED=true` asks Zernio to show typing before sending when the provider supports it.
- `HUMAN_SEND_DELAY_ENABLED=true` adds a short randomized delay before Zernio sends.
- `HUMAN_SEND_DELAY_MIN_MS` and `HUMAN_SEND_DELAY_MAX_MS` control that delay window.
- `CONVERSATION_MEMORY_ENABLED=true` stores lightweight per-prospect memory in the local JSON file.
- `FOLLOW_UPS_ENABLED=false` keeps follow-up nudges disabled. Set it to `true` only after testing.
- `PALLET_PROS_KNOWLEDGE` is optional. If set, it overrides `knowledge/pallet-pros.md` and gets included in the AI prompt as private business context.
- `MANUAL_TAKEOVER_MINUTES=8` pauses auto-send briefly after the app detects a manual Zernio reply, then lets the bot take over again if you are not around.
- Kommo sending/history requires the Kommo Chats API scopes. If those are not available on your Kommo account, use Zernio for inbox send/receive instead.
- The OpenAI API key must have active API billing/credits. ChatGPT Plus/Pro billing is separate from API billing.

## Local Setup

```powershell
cd C:\path\to\kommo-openai-ig-autoreply
npm install

$env:OPENAI_API_KEY="sk-your-openai-api-key"
$env:OPENAI_MODEL="gpt-4o-mini"
$env:KOMMO_SUBDOMAIN="your-subdomain"
$env:KOMMO_ACCESS_TOKEN="your-long-lived-kommo-access-token"
$env:ZERNIO_API_KEY="your-zernio-api-key"
$env:ZERNIO_ACCOUNT_ID="your-zernio-account-id"
$env:ZERNIO_WEBHOOK_SECRET="choose-a-long-random-zernio-secret"
$env:WEBHOOK_SECRET="choose-a-long-random-secret"
$env:AUTO_SEND="false"
$env:HUMANIZE_REPLIES_ENABLED="true"
$env:TYPING_INDICATOR_ENABLED="true"
$env:HUMAN_SEND_DELAY_ENABLED="true"
$env:HUMAN_SEND_DELAY_MIN_MS="6500"
$env:HUMAN_SEND_DELAY_MAX_MS="18000"
$env:CONVERSATION_MEMORY_ENABLED="true"
$env:FOLLOW_UPS_ENABLED="false"
$env:PALLET_PROS_KNOWLEDGE=""
$env:MANUAL_TAKEOVER_MINUTES="8"
$env:PORT="3000"

npm start
```

Open:

```text
http://localhost:3000/
```

Local webhook URL for tunnel testing:

```text
https://YOUR-TUNNEL-DOMAIN/webhook/kommo?secret=YOUR_WEBHOOK_SECRET
```

The first Kommo webhook logs the full raw payload and parsed payload to stdout so you can confirm Kommo's real field names.

## Webhook URLs

After deploying, paste this into Kommo if you are using Kommo webhooks:

```text
https://YOUR-DIGITALOCEAN-APP-URL/webhook/kommo?secret=YOUR_WEBHOOK_SECRET
```

Use the `Incoming message received` event for talks/messages. If Kommo lets you scope by channel, scope it to Instagram.

Paste this into Zernio if you are using Zernio webhooks:

```text
https://YOUR-DIGITALOCEAN-APP-URL/webhook/zernio
```

Set the Zernio webhook events to `message.received` and `message.sent`. The `message.sent` event lets the app detect when you replied manually and pause auto-send for that conversation. If you are not using Zernio's signed webhook secret yet, use this temporary fallback URL:

```text
https://YOUR-DIGITALOCEAN-APP-URL/webhook/zernio?secret=YOUR_WEBHOOK_SECRET
```

## DigitalOcean App Platform Deploy

1. Put this folder in a GitHub repo.
2. In DigitalOcean, create a new App Platform app from that repo.
3. Add exactly one Web Service component.
4. Use the Node.js buildpack. No Dockerfile is required.
5. Build command: leave blank or use `npm install`.
6. Run command: `npm start`.
7. Add the env vars from the Env Vars section.
8. Do not add a managed database.
9. Do not add Redis.
10. Do not add a second component.
11. Deploy.

Then set the Kommo or Zernio webhook URL:

```text
https://YOUR-DIGITALOCEAN-APP-URL/webhook/kommo?secret=YOUR_WEBHOOK_SECRET
https://YOUR-DIGITALOCEAN-APP-URL/webhook/zernio
```

## How It Works

1. `POST /webhook/kommo?secret=X` verifies `X` against `WEBHOOK_SECRET`.
2. `POST /webhook/zernio` verifies the Zernio signature from `ZERNIO_WEBHOOK_SECRET`.
3. The app logs the raw webhook payload.
4. It extracts the incoming message fields it knows about.
5. It pulls recent conversation messages from Kommo or Zernio:
   `GET /api/v4/talks/{talk_id}/messages`
   `GET /v1/inbox/conversations/{conversationId}/messages`
6. It calls OpenAI Chat Completions and asks for:
   `{ "reply": string, "needs_review": boolean }`
7. If `AUTO_SEND=true` and `needs_review=false`, it sends through the source provider:
   `POST /api/v4/talks/{talk_id}/send_message`
   `POST /v1/inbox/conversations/{conversationId}/messages`
8. Otherwise it saves a draft in `data/store.json`.
9. The app updates lightweight conversation memory by prospect/channel.
10. `GET /` shows today's tracker plus pending drafts with Send and Discard buttons.

## Conversation Memory Lite

When `CONVERSATION_MEMORY_ENABLED=true`, the app stores a compact record under `data/store.json` keyed by:

```text
provider/account + origin + contact_id
```

If the provider does not provide `contact_id`, it falls back to `chat_id`, then conversation/talk id. This lets the AI continue naturally if the messaging provider creates a new thread for the same Instagram contact.

The memory stores recent messages, sent-link flags, qualifying questions already asked, processed incoming message IDs, manual takeover state, and follow-up state. It does not add a database or separate service.

The app keeps up to 40 local messages per conversation, sends the latest 20 into the OpenAI prompt, and builds a compact summary for older context. This is the app-code version of a Zernio workflow `history` variable.

For the best memory, the Zernio webhook should include:

```text
message.received
message.sent
```

`message.received` stores prospect replies. `message.sent` stores manual replies that Zernio sees, including outgoing Instagram DMs when Zernio emits that event for the connected account.

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

Training link counts use the current YouTube Academy URL:

```text
https://youtube.com/@palletprosacademy
```

## Provider Controls

The homepage has Kommo and Zernio on/off controls. They are stored in `data/store.json` with the rest of the local app state.

When a provider is off:

```text
Incoming webhooks from that provider are ignored
Draft Send is blocked for that provider
Scheduled follow-ups for that provider are skipped
```

This is useful while moving from Kommo to Zernio. Leave Zernio on and turn Kommo off once your Zernio webhook is working.

## Feature Controls

The homepage also has on/off controls for:

```text
Auto-send
Follow-ups
Humanize
Typing
Delay
Memory
```

These controls override the matching env vars and are stored in `data/store.json`. This lets you test auto-reply without redeploying.

## Human Feel

The app has three small options to make replies feel less robotic:

```text
HUMANIZE_REPLIES_ENABLED=true
TYPING_INDICATOR_ENABLED=true
HUMAN_SEND_DELAY_ENABLED=true
```

Humanized replies add casual Instagram DM style guidance to the AI prompt. Zernio typing indicators are sent before Zernio replies when the connected platform supports them. The send delay adds a short randomized pause before Zernio sends, which keeps automated replies from landing instantly.

The app also has a simple post-booking guard. When someone says they booked or scheduled the call, it acknowledges naturally instead of asking another qualifying question.

## Knowledge Base

The app includes a simple business knowledge base at:

```text
knowledge/pallet-pros.md
```

That file is added to the OpenAI prompt as `business_knowledge` for replies and follow-ups. It is meant for Pallet Pros facts, offer details, FAQs, objections, tone examples, boundaries, and words/phrases to avoid.

For DigitalOcean, the most durable no-database option is:

```text
PALLET_PROS_KNOWLEDGE=your longer business context
```

If `PALLET_PROS_KNOWLEDGE` is set, it overrides the repo file. If it is empty, the app uses `knowledge/pallet-pros.md`.

Keep sensitive/private information out of the knowledge base because it can be sent to OpenAI as prompt context.

## Manual Takeover

When the Zernio webhook includes `message.sent`, the app watches for manual replies you send outside this app.

If it sees a manual Zernio reply, it pauses auto-send for that conversation for:

```text
MANUAL_TAKEOVER_MINUTES=8
```

During that short window, new incoming messages can still become drafts, but the bot will not auto-send into the thread. After the window passes, the bot can take over again from the current conversation history. App-generated sends are ignored so the bot does not pause itself after its own replies.

## Follow-Ups

Follow-ups are disabled unless:

```bash
FOLLOW_UPS_ENABLED=true
```

If `AUTO_SEND=false`, due follow-ups are saved as editable drafts. If both `AUTO_SEND=true` and `FOLLOW_UPS_ENABLED=true`, safe follow-ups can send automatically.

When enabled, the app schedules up to 3 gentle AI follow-up nudges after a sent reply asks a question:

```text
45 minutes after the question
4 hours after the question
18 hours after the question
```

If the prospect replies, the follow-up schedule is canceled. The app also skips follow-ups outside a conservative 23-hour window from the prospect's latest incoming message.

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

## Local JSON Persistence

The only persistence is:

```text
data/store.json
```

It contains pending drafts and per-conversation settings. You can manually set a conversation to draft-only by editing:

```json
{
  "conversationSettings": {
    "123": {
      "paused": true
    }
  }
}
```

DigitalOcean App Platform local disk can be replaced on redeploys or restarts. That is the tradeoff for keeping this tool database-free.
