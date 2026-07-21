const crypto = require("crypto");
const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";

const HOUSE_RULES = `You are replying to Instagram DMs for Pallet Pros Academy.

Rules:
1. Keep replies short, natural, and easy to read.
2. Ask one question at a time.
3. Do not sound robotic, pushy, or overly formal.
4. Only respond to fresh lead messages, ideally within 24 hours.
5. If the person is only curious, joking, or just wants content, send them to:
   https://youtube.com/@palletprosacademy
6. If the person is interested in starting a pallet business, qualify them before booking.
7. Ask up to 4 qualifying questions total across the conversation:
   - Why do you want to start?
   - When do you want to start?
   - What is holding you back?
   - Would you get on a call?
8. If they are warm enough to book, send:
   https://www.tidycal.com/palletprosga/discovery
9. If they ask for a call, do not suggest weekend calls.
10. If they want a weekend call, steer them to Monday through Friday.
11. If they already received the training link before, do not resend it unless clearly needed.
12. Do not ask for private, sensitive, or unnecessary info.
13. Do not change tags, pipeline stage, lead status, or close conversations.
14. If unsure, do not send yet; draft the reply instead by setting needs_review true.
15. Keep the focus on helping them take the next best step.

Return only valid JSON in this exact shape:
{
  "reply": "short reply text",
  "needs_review": false
}

Set needs_review to true when the reply should be reviewed before sending.`;

function isAutoSendEnabled() {
  return String(process.env.AUTO_SEND || "").toLowerCase() === "true";
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function normalizeSubdomain(rawSubdomain) {
  return rawSubdomain
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .replace(/\.kommo\.com$/i, "")
    .trim();
}

function kommoBaseUrl() {
  const subdomain = normalizeSubdomain(requireEnv("KOMMO_SUBDOMAIN"));
  return `https://${subdomain}.kommo.com`;
}

async function ensureStoreFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(
      DATA_FILE,
      JSON.stringify({ drafts: [], conversationSettings: {} }, null, 2)
    );
  }
}

async function readStore() {
  await ensureStoreFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw || "{}");

  return {
    drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
    conversationSettings:
      parsed.conversationSettings && typeof parsed.conversationSettings === "object"
        ? parsed.conversationSettings
        : {}
  };
}

async function writeStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tempFile = `${DATA_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(store, null, 2));
  await fs.rename(tempFile, DATA_FILE);
}

function getConversationSettings(store, talkId) {
  if (!talkId) {
    return { paused: false };
  }

  if (!store.conversationSettings[talkId]) {
    store.conversationSettings[talkId] = { paused: false };
  }

  return store.conversationSettings[talkId];
}

async function saveDraft(draft) {
  const store = await readStore();
  getConversationSettings(store, draft.talk_id);

  const existingIndex = draft.incoming_message_id
    ? store.drafts.findIndex(
        (item) => item.incoming_message_id === draft.incoming_message_id
      )
    : -1;

  if (existingIndex >= 0) {
    store.drafts[existingIndex] = {
      ...store.drafts[existingIndex],
      ...draft,
      updated_at: new Date().toISOString()
    };
  } else {
    store.drafts.push({
      ...draft,
      id: draft.id || crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }

  await writeStore(store);
}

async function removeDraft(id) {
  const store = await readStore();
  const draft = store.drafts.find((item) => item.id === id);
  store.drafts = store.drafts.filter((item) => item.id !== id);
  await writeStore(store);
  return draft;
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseWebhookPayload(rawBody, contentType) {
  const rawText = rawBody.toString("utf8");
  const lowerContentType = String(contentType || "").toLowerCase();

  if (!rawText.trim()) {
    return {};
  }

  if (lowerContentType.includes("json")) {
    return safeJsonParse(rawText) || {};
  }

  if (lowerContentType.includes("x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(rawText));
  }

  return safeJsonParse(rawText) || Object.fromEntries(new URLSearchParams(rawText));
}

function deepGet(object, dottedPath) {
  if (!object || typeof object !== "object") {
    return undefined;
  }

  return dottedPath.split(".").reduce((current, segment) => {
    if (current === undefined || current === null) {
      return undefined;
    }

    return current[segment];
  }, object);
}

function pickValue(payload, candidates) {
  for (const candidate of candidates) {
    if (
      Object.prototype.hasOwnProperty.call(payload, candidate) &&
      payload[candidate] !== undefined &&
      payload[candidate] !== ""
    ) {
      return payload[candidate];
    }

    const nestedValue = deepGet(payload, candidate);
    if (nestedValue !== undefined && nestedValue !== "") {
      return nestedValue;
    }
  }

  return undefined;
}

function extractIncomingMessage(payload) {
  const talkId = pickValue(payload, [
    "add.0.talk_id",
    "add[0][talk_id]",
    "message[add][0][talk_id]",
    "incoming_message[add][0][talk_id]",
    "messages[add][0][talk_id]",
    "talk_id",
    "talk.id",
    "message.conversation.id",
    "message[conversation][id]",
    "conversation_id"
  ]);

  const text = pickValue(payload, [
    "add.0.text",
    "add[0][text]",
    "message[add][0][text]",
    "incoming_message[add][0][text]",
    "messages[add][0][text]",
    "message.message.text",
    "message[message][text]",
    "message[text]",
    "text"
  ]);

  const direction = pickValue(payload, [
    "add.0.type",
    "add[0][type]",
    "message[add][0][type]",
    "incoming_message[add][0][type]",
    "messages[add][0][type]",
    "type"
  ]);

  const messageType = pickValue(payload, [
    "add.0.message_type",
    "add[0][message_type]",
    "message[add][0][message_type]",
    "incoming_message[add][0][message_type]",
    "messages[add][0][message_type]",
    "message.message.type",
    "message[message][type]",
    "message_type"
  ]);

  const origin = pickValue(payload, [
    "add.0.origin",
    "add[0][origin]",
    "message[add][0][origin]",
    "incoming_message[add][0][origin]",
    "messages[add][0][origin]",
    "origin"
  ]);

  const createdAt = pickValue(payload, [
    "add.0.created_at",
    "add[0][created_at]",
    "message[add][0][created_at]",
    "incoming_message[add][0][created_at]",
    "messages[add][0][created_at]",
    "message.timestamp",
    "message[timestamp]",
    "time",
    "created_at"
  ]);

  const incomingMessageId = pickValue(payload, [
    "add.0.id",
    "add[0][id]",
    "message[add][0][id]",
    "incoming_message[add][0][id]",
    "messages[add][0][id]",
    "message.message.id",
    "message[message][id]",
    "id"
  ]);

  const chatId = pickValue(payload, [
    "add.0.chat_id",
    "add[0][chat_id]",
    "message[add][0][chat_id]",
    "incoming_message[add][0][chat_id]",
    "messages[add][0][chat_id]",
    "chat_id"
  ]);

  const contactId = pickValue(payload, [
    "add.0.contact_id",
    "add[0][contact_id]",
    "message[add][0][contact_id]",
    "incoming_message[add][0][contact_id]",
    "messages[add][0][contact_id]",
    "contact_id"
  ]);

  return {
    talk_id: talkId ? String(talkId) : "",
    chat_id: chatId ? String(chatId) : "",
    contact_id: contactId ? String(contactId) : "",
    incoming_message_id: incomingMessageId ? String(incomingMessageId) : "",
    text: text ? String(text).trim() : "",
    direction: direction ? String(direction).toLowerCase() : "",
    message_type: messageType ? String(messageType).toLowerCase() : "",
    origin: origin ? String(origin).toLowerCase() : "",
    created_at: createdAt ? Number(createdAt) || null : null
  };
}

function isFreshEnough(createdAt) {
  if (!createdAt) {
    return true;
  }

  const messageMs = createdAt < 10_000_000_000 ? createdAt * 1000 : createdAt;
  const ageMs = Date.now() - messageMs;
  return ageMs <= 24 * 60 * 60 * 1000;
}

function isInstagramOrigin(origin) {
  if (!origin) {
    return true;
  }

  return origin.includes("instagram") || origin.includes("insta") || origin === "ig";
}

async function kommoRequest(pathname, options = {}) {
  const response = await fetch(`${kommoBaseUrl()}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${requireEnv("KOMMO_ACCESS_TOKEN")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const body = text ? safeJsonParse(text) || text : null;

  if (!response.ok) {
    throw new Error(
      `Kommo API ${response.status} ${response.statusText}: ${
        typeof body === "string" ? body : JSON.stringify(body)
      }`
    );
  }

  return body;
}

function normalizeKommoMessages(responseBody) {
  const messages =
    responseBody?._embedded?.messages ||
    responseBody?._embedded?.items ||
    responseBody?.messages ||
    [];

  return messages
    .map((message) => {
      const role =
        message.type === "incoming" || message.author?.type === "external"
          ? "user"
          : "assistant";

      return {
        id: message.id || "",
        role,
        text: String(message.text || message.message?.text || "").trim(),
        created_at: message.created_at || message.timestamp || null
      };
    })
    .filter((message) => message.text)
    .sort((a, b) => Number(a.created_at || 0) - Number(b.created_at || 0));
}

async function getConversationThread(talkId) {
  if (!talkId) {
    return [];
  }

  const responseBody = await kommoRequest(
    `/api/v4/talks/${encodeURIComponent(talkId)}/messages?limit=50`,
    { method: "GET", headers: { Accept: "application/hal+json" } }
  );

  return normalizeKommoMessages(responseBody);
}

async function generateReply({ thread, newMessage, contextWarning }) {
  const payload = {
    conversation_history: thread.slice(-30),
    new_message: newMessage.text,
    context_warning: contextWarning || null
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: HOUSE_RULES },
        {
          role: "user",
          content:
            "Use this JSON conversation data to write the next Instagram DM reply. Return JSON only.\n" +
            JSON.stringify(payload, null, 2)
        }
      ]
    })
  });

  const responseText = await response.text();
  const responseBody = safeJsonParse(responseText);

  if (!response.ok) {
    throw new Error(
      `OpenAI API ${response.status} ${response.statusText}: ${responseText}`
    );
  }

  const content = responseBody?.choices?.[0]?.message?.content || "";
  const parsed = safeJsonParse(content);

  if (!parsed || typeof parsed.reply !== "string") {
    throw new Error(`OpenAI returned unexpected content: ${content}`);
  }

  return {
    reply: parsed.reply.trim(),
    needs_review: parsed.needs_review !== false
  };
}

async function sendReplyToKommo(talkId, replyText) {
  if (!talkId) {
    throw new Error("Cannot send reply without a Kommo talk_id.");
  }

  if (!replyText || !replyText.trim()) {
    throw new Error("Cannot send an empty reply.");
  }

  return kommoRequest(
    `/api/v4/talks/${encodeURIComponent(talkId)}/send_message`,
    {
      method: "POST",
      body: JSON.stringify({ text: replyText.trim() })
    }
  );
}

async function processIncomingMessage(incoming, parsedPayload) {
  if (!incoming.text) {
    console.log("Webhook ignored: no text message found.");
    return;
  }

  if (incoming.direction && incoming.direction !== "incoming") {
    console.log(`Webhook ignored: message direction is ${incoming.direction}.`);
    return;
  }

  if (incoming.message_type && incoming.message_type !== "text") {
    console.log(`Webhook ignored: message_type is ${incoming.message_type}.`);
    return;
  }

  if (!isInstagramOrigin(incoming.origin)) {
    console.log(`Webhook ignored: origin is ${incoming.origin}.`);
    return;
  }

  if (!isFreshEnough(incoming.created_at)) {
    console.log("Webhook ignored: message appears older than 24 hours.");
    return;
  }

  let thread = [];
  let contextWarning = "";

  try {
    thread = await getConversationThread(incoming.talk_id);
  } catch (error) {
    contextWarning = `Could not pull Kommo thread: ${error.message}`;
    console.error(contextWarning);
  }

  const filteredThread = thread.filter(
    (message) => message.id !== incoming.incoming_message_id
  );

  let aiReply;

  try {
    aiReply = await generateReply({
      thread: filteredThread,
      newMessage: incoming,
      contextWarning
    });
  } catch (error) {
    await saveDraft({
      talk_id: incoming.talk_id,
      chat_id: incoming.chat_id,
      contact_id: incoming.contact_id,
      incoming_message_id: incoming.incoming_message_id,
      incoming_text: incoming.text,
      origin: incoming.origin,
      reply: "",
      needs_review: true,
      reason: `OpenAI reply generation failed: ${error.message}`
    });

    console.error(`Saved pending draft after OpenAI failure for talk_id=${incoming.talk_id}:`, error);
    return;
  }

  if (contextWarning) {
    aiReply.needs_review = true;
  }

  const store = await readStore();
  const settings = getConversationSettings(store, incoming.talk_id);
  await writeStore(store);

  const shouldAutoSend =
    isAutoSendEnabled() &&
    !settings.paused &&
    aiReply.needs_review === false &&
    Boolean(aiReply.reply);

  if (shouldAutoSend) {
    await sendReplyToKommo(incoming.talk_id, aiReply.reply);
    console.log(`Auto-sent reply for talk_id=${incoming.talk_id}.`);
    return;
  }

  await saveDraft({
    talk_id: incoming.talk_id,
    chat_id: incoming.chat_id,
    contact_id: incoming.contact_id,
    incoming_message_id: incoming.incoming_message_id,
    incoming_text: incoming.text,
    origin: incoming.origin,
    reply: aiReply.reply,
    needs_review: true,
    reason: contextWarning || (aiReply.needs_review ? "AI requested review." : "AUTO_SEND is not true or conversation is paused.")
  });

  console.log(`Saved pending draft for talk_id=${incoming.talk_id}.`);
}

app.post(
  "/webhook/kommo",
  express.raw({ type: "*/*", limit: "2mb" }),
  (req, res) => {
    if (!process.env.WEBHOOK_SECRET) {
      res.status(500).json({ ok: false, error: "WEBHOOK_SECRET is not configured" });
      return;
    }

    if (req.query.secret !== process.env.WEBHOOK_SECRET) {
      res.status(403).json({ ok: false, error: "Invalid webhook secret" });
      return;
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    const parsedPayload = parseWebhookPayload(rawBody, req.headers["content-type"]);
    const incoming = extractIncomingMessage(parsedPayload);

    console.log("Kommo webhook content-type:", req.headers["content-type"] || "");
    console.log("Kommo webhook raw payload:");
    console.log(rawBody.toString("utf8"));
    console.log("Kommo webhook parsed payload:");
    console.log(JSON.stringify(parsedPayload, null, 2));
    console.log("Kommo webhook extracted message:");
    console.log(JSON.stringify(incoming, null, 2));

    res.status(202).json({ ok: true });

    processIncomingMessage(incoming, parsedPayload).catch((error) => {
      console.error("Webhook processing failed:", error);
    });
  }
);

app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.type("html").send(renderHomePage());
});

app.get("/api/drafts", async (_req, res, next) => {
  try {
    const store = await readStore();
    res.json({
      drafts: store.drafts.sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/drafts/:id/approve", async (req, res, next) => {
  try {
    const store = await readStore();
    const draft = store.drafts.find((item) => item.id === req.params.id);

    if (!draft) {
      res.status(404).json({ ok: false, error: "Draft not found" });
      return;
    }

    const reply = String(req.body.reply || draft.reply || "").trim();
    await sendReplyToKommo(draft.talk_id, reply);
    await removeDraft(draft.id);

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/drafts/:id/reject", async (req, res, next) => {
  try {
    const draft = await removeDraft(req.params.id);

    if (!draft) {
      res.status(404).json({ ok: false, error: "Draft not found" });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ ok: false, error: error.message });
});

function renderHomePage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kommo Drafts</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #1c2430;
      --muted: #657084;
      --border: #d9dee8;
      --send: #13795b;
      --discard: #9b2c2c;
      --focus: #2557d6;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Arial, Helvetica, sans-serif;
      line-height: 1.45;
    }

    main {
      width: min(980px, calc(100% - 32px));
      margin: 32px auto;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
    }

    h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 0;
    }

    #status {
      min-height: 22px;
      color: var(--muted);
      font-size: 14px;
      text-align: right;
    }

    .draft-list {
      display: grid;
      gap: 14px;
    }

    .draft {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }

    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 12px;
    }

    .incoming {
      border-left: 3px solid var(--border);
      color: #364154;
      margin: 0 0 12px;
      padding: 8px 0 8px 12px;
      white-space: pre-wrap;
    }

    textarea {
      display: block;
      width: 100%;
      min-height: 112px;
      resize: vertical;
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font: inherit;
      padding: 10px 12px;
    }

    textarea:focus {
      outline: 2px solid var(--focus);
      outline-offset: 1px;
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 12px;
    }

    button {
      border: 0;
      border-radius: 8px;
      color: #ffffff;
      cursor: pointer;
      font-weight: 700;
      min-height: 40px;
      padding: 0 16px;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.65;
    }

    .send { background: var(--send); }
    .discard { background: var(--discard); }

    .empty {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--muted);
      padding: 24px;
      text-align: center;
    }

    @media (max-width: 620px) {
      main {
        width: min(100% - 20px, 980px);
        margin: 18px auto;
      }

      header {
        align-items: flex-start;
        flex-direction: column;
      }

      #status {
        text-align: left;
      }

      .actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>Pending Drafts</h1>
      <div id="status"></div>
    </header>
    <section id="drafts" class="draft-list"></section>
  </main>

  <script>
    const draftsEl = document.getElementById("drafts");
    const statusEl = document.getElementById("status");

    function setStatus(message) {
      statusEl.textContent = message || "";
    }

    function formatDate(value) {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      return date.toLocaleString();
    }

    async function api(path, options) {
      const response = await fetch(path, options);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Request failed");
      }

      return data;
    }

    function renderDraft(draft) {
      const article = document.createElement("article");
      article.className = "draft";

      const meta = document.createElement("div");
      meta.className = "meta";

      const fields = [
        draft.talk_id ? "Talk " + draft.talk_id : "Talk unknown",
        draft.origin ? draft.origin : "",
        draft.created_at ? formatDate(draft.created_at) : "",
        draft.reason ? draft.reason : ""
      ].filter(Boolean);

      fields.forEach((field) => {
        const span = document.createElement("span");
        span.textContent = field;
        meta.appendChild(span);
      });

      const incoming = document.createElement("p");
      incoming.className = "incoming";
      incoming.textContent = draft.incoming_text || "";

      const textarea = document.createElement("textarea");
      textarea.value = draft.reply || "";
      textarea.setAttribute("aria-label", "Draft reply");

      const actions = document.createElement("div");
      actions.className = "actions";

      const discard = document.createElement("button");
      discard.className = "discard";
      discard.type = "button";
      discard.textContent = "Discard";

      const send = document.createElement("button");
      send.className = "send";
      send.type = "button";
      send.textContent = "Send";

      discard.addEventListener("click", async () => {
        discard.disabled = true;
        send.disabled = true;
        setStatus("Discarding...");
        try {
          await api("/api/drafts/" + encodeURIComponent(draft.id) + "/reject", {
            method: "POST"
          });
          await loadDrafts();
          setStatus("Discarded.");
        } catch (error) {
          setStatus(error.message);
          discard.disabled = false;
          send.disabled = false;
        }
      });

      send.addEventListener("click", async () => {
        discard.disabled = true;
        send.disabled = true;
        setStatus("Sending...");
        try {
          await api("/api/drafts/" + encodeURIComponent(draft.id) + "/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reply: textarea.value })
          });
          await loadDrafts();
          setStatus("Sent.");
        } catch (error) {
          setStatus(error.message);
          discard.disabled = false;
          send.disabled = false;
        }
      });

      actions.append(discard, send);
      article.append(meta, incoming, textarea, actions);
      return article;
    }

    async function loadDrafts() {
      setStatus("Loading...");
      try {
        const data = await api("/api/drafts");
        draftsEl.innerHTML = "";

        if (!data.drafts || data.drafts.length === 0) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = "No pending drafts.";
          draftsEl.appendChild(empty);
        } else {
          data.drafts.forEach((draft) => draftsEl.appendChild(renderDraft(draft)));
        }

        setStatus(data.drafts.length + " pending");
      } catch (error) {
        draftsEl.innerHTML = "";
        setStatus(error.message);
      }
    }

    loadDrafts();
    setInterval(loadDrafts, 30000);
  </script>
</body>
</html>`;
}

ensureStoreFile()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Kommo OpenAI IG auto-reply app listening on port ${PORT}`);
      console.log(`AUTO_SEND=${isAutoSendEnabled()}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize local JSON store:", error);
    process.exit(1);
  });
