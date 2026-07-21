# Kommo + OpenAI Instagram DM Auto-Reply

Minimal one-person Node.js app for replying to Kommo Instagram DM talks with OpenAI.

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
WEBHOOK_SECRET=choose-a-long-random-secret
AUTO_SEND=false
PORT=3000
```

Notes:

- `OPENAI_MODEL` defaults to `gpt-4o-mini` if empty.
- `KOMMO_SUBDOMAIN` can be `your-subdomain` or `your-subdomain.kommo.com`.
- `AUTO_SEND=true` sends replies immediately only when the AI returns `needs_review: false`.
- `AUTO_SEND=false` saves every generated reply as a pending draft.
- The Kommo token needs permission for the Talks API message history and external chat sending.

## Local Setup

```powershell
cd C:\path\to\kommo-openai-ig-autoreply
npm install

$env:OPENAI_API_KEY="sk-your-openai-api-key"
$env:OPENAI_MODEL="gpt-4o-mini"
$env:KOMMO_SUBDOMAIN="your-subdomain"
$env:KOMMO_ACCESS_TOKEN="your-long-lived-kommo-access-token"
$env:WEBHOOK_SECRET="choose-a-long-random-secret"
$env:AUTO_SEND="false"
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

## Kommo Webhook URL

After deploying, paste this into Kommo:

```text
https://YOUR-DIGITALOCEAN-APP-URL/webhook/kommo?secret=YOUR_WEBHOOK_SECRET
```

Use the `Incoming message received` event for talks/messages. If Kommo lets you scope by channel, scope it to Instagram.

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

Then set the Kommo webhook URL to:

```text
https://YOUR-DIGITALOCEAN-APP-URL/webhook/kommo?secret=YOUR_WEBHOOK_SECRET
```

## How It Works

1. `POST /webhook/kommo?secret=X` verifies `X` against `WEBHOOK_SECRET`.
2. The app logs the raw Kommo payload.
3. It extracts the incoming talk/message fields it knows about.
4. It pulls recent conversation messages from:
   `GET /api/v4/talks/{talk_id}/messages`
5. It calls OpenAI Chat Completions and asks for:
   `{ "reply": string, "needs_review": boolean }`
6. If `AUTO_SEND=true` and `needs_review=false`, it sends through:
   `POST /api/v4/talks/{talk_id}/send_message`
7. Otherwise it saves a draft in `data/store.json`.
8. `GET /` shows pending drafts with Send and Discard buttons.

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
