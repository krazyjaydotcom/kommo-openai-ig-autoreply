const crypto = require("crypto");
const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const ZERNIO_BASE_URL = "https://zernio.com/api/v1";
const YOUTUBE_URL = "https://youtube.com/@palletprosacademy";
const BOOKING_URL = "https://www.tidycal.com/palletprosga/discovery";
const MAX_RECENT_MEMORY_MESSAGES = 20;
const MAX_PROCESSED_MESSAGE_IDS = 100;
const FOLLOW_UP_OFFSETS_MS = [
  30 * 60 * 1000,
  4 * 60 * 60 * 1000,
  18 * 60 * 60 * 1000
];
const FOLLOW_UP_CHECK_MS = 60 * 1000;
const FOLLOW_UP_WINDOW_MS = 23 * 60 * 60 * 1000;
const DEFAULT_STORE = {
  drafts: [],
  conversationSettings: {},
  providerSettings: {
    kommo: { enabled: true },
    zernio: { enabled: true }
  },
  featureSettings: {},
  conversations: {},
  dailyStats: {}
};

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

const HUMAN_STYLE_RULES = `Style guidance:
- Write like a real person sending an Instagram DM.
- Use casual contractions when they fit.
- Match the person's energy without copying slang unnaturally.
- Do not greet them again if the conversation is already started.
- Avoid canned phrases like "Thank you for reaching out" or "I'd be happy to assist."
- Keep punctuation relaxed. Do not use an exclamation point in every reply.
- Never say or imply you are an AI, bot, automation, or typing.`;

function envFlag(name, fallback) {
  const raw = process.env[name];

  if (raw === undefined || raw === "") {
    return fallback;
  }

  return String(raw).toLowerCase() === "true";
}

function featureEnabled(settings, key, envName, fallback) {
  if (settings && typeof settings[key] === "boolean") {
    return settings[key];
  }

  return envFlag(envName, fallback);
}

function isAutoSendEnabled(settings) {
  return featureEnabled(settings, "auto_send", "AUTO_SEND", false);
}

function isHumanizeRepliesEnabled(settings) {
  return featureEnabled(
    settings,
    "humanize_replies",
    "HUMANIZE_REPLIES_ENABLED",
    true
  );
}

function isTypingIndicatorEnabled(settings) {
  return featureEnabled(
    settings,
    "typing_indicator",
    "TYPING_INDICATOR_ENABLED",
    true
  );
}

function isHumanSendDelayEnabled(settings) {
  return featureEnabled(
    settings,
    "human_send_delay",
    "HUMAN_SEND_DELAY_ENABLED",
    true
  );
}

function isConversationMemoryEnabled(settings) {
  return featureEnabled(
    settings,
    "conversation_memory",
    "CONVERSATION_MEMORY_ENABLED",
    true
  );
}

function isFollowUpsEnabled(settings) {
  return featureEnabled(settings, "follow_ups", "FOLLOW_UPS_ENABLED", false);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function systemPrompt(settings) {
  if (!isHumanizeRepliesEnabled(settings)) {
    return HOUSE_RULES;
  }

  return `${HOUSE_RULES}\n\n${HUMAN_STYLE_RULES}`;
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
      JSON.stringify(DEFAULT_STORE, null, 2)
    );
  }
}

async function readStore() {
  await ensureStoreFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw || "{}");

  return normalizeStore(parsed);
}

async function writeStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tempFile = `${DATA_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(normalizeStore(store), null, 2));
  await fs.rename(tempFile, DATA_FILE);
}

function normalizeStore(store) {
  const parsed = store && typeof store === "object" ? store : {};

  return {
    drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
    conversationSettings:
      parsed.conversationSettings && typeof parsed.conversationSettings === "object"
        ? parsed.conversationSettings
        : {},
    providerSettings: normalizeProviderSettings(parsed.providerSettings),
    featureSettings: normalizeFeatureSettings(parsed.featureSettings),
    conversations:
      parsed.conversations && typeof parsed.conversations === "object"
        ? parsed.conversations
        : {},
    dailyStats:
      parsed.dailyStats && typeof parsed.dailyStats === "object"
        ? parsed.dailyStats
        : {}
  };
}

function normalizeProvider(provider) {
  return provider === "zernio" ? "zernio" : "kommo";
}

function normalizeFeatureSettings(settings) {
  const raw = settings && typeof settings === "object" ? settings : {};

  return {
    auto_send: featureEnabled(raw, "auto_send", "AUTO_SEND", false),
    follow_ups: featureEnabled(raw, "follow_ups", "FOLLOW_UPS_ENABLED", false),
    humanize_replies: featureEnabled(
      raw,
      "humanize_replies",
      "HUMANIZE_REPLIES_ENABLED",
      true
    ),
    typing_indicator: featureEnabled(
      raw,
      "typing_indicator",
      "TYPING_INDICATOR_ENABLED",
      true
    ),
    human_send_delay: featureEnabled(
      raw,
      "human_send_delay",
      "HUMAN_SEND_DELAY_ENABLED",
      true
    ),
    conversation_memory: featureEnabled(
      raw,
      "conversation_memory",
      "CONVERSATION_MEMORY_ENABLED",
      true
    )
  };
}

function getFeatureSettings(store) {
  store.featureSettings = normalizeFeatureSettings(store.featureSettings);
  return store.featureSettings;
}

function normalizeProviderSettings(settings) {
  const raw = settings && typeof settings === "object" ? settings : {};

  return {
    kommo: {
      enabled: raw.kommo?.enabled !== false
    },
    zernio: {
      enabled: raw.zernio?.enabled !== false
    }
  };
}

function getProviderSettings(store) {
  store.providerSettings = normalizeProviderSettings(store.providerSettings);
  return store.providerSettings;
}

function isProviderEnabled(store, provider) {
  const providerName = normalizeProvider(provider);
  return getProviderSettings(store)[providerName].enabled !== false;
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

function toMessageTimestampMs(createdAt) {
  if (!createdAt) {
    return Date.now();
  }

  const numeric = Number(createdAt);
  if (!Number.isFinite(numeric)) {
    return Date.now();
  }

  return numeric < 10_000_000_000 ? numeric * 1000 : numeric;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function humanSendDelayMs(replyText, settings) {
  if (!isHumanSendDelayEnabled(settings)) {
    return 0;
  }

  const minMs = Math.max(0, numberEnv("HUMAN_SEND_DELAY_MIN_MS", 2500));
  const maxMs = Math.max(minMs, numberEnv("HUMAN_SEND_DELAY_MAX_MS", 9000));
  const textLength = String(replyText || "").length;
  const readingLikeDelay = Math.min(maxMs, minMs + textLength * 35);
  const upperMs = Math.max(minMs, Math.min(maxMs, readingLikeDelay + 2500));

  return Math.round(minMs + Math.random() * (upperMs - minMs));
}

function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function makeConversationKey({
  provider,
  contact_id,
  chat_id,
  talk_id,
  origin,
  zernio_account_id
}) {
  const channel = origin || "unknown";
  const person = contact_id || chat_id || talk_id || "unknown";

  if (provider === "zernio") {
    return `zernio:${zernio_account_id || "unknown"}:${channel}:${person}`;
  }

  const subdomain = process.env.KOMMO_SUBDOMAIN
    ? normalizeSubdomain(process.env.KOMMO_SUBDOMAIN)
    : "unknown";
  return `${subdomain}:${channel}:${person}`;
}

function getConversationMemory(store, messageLike) {
  const key = messageLike.conversation_key || makeConversationKey(messageLike);

  if (!store.conversations[key]) {
    store.conversations[key] = {
      key,
      provider: messageLike.provider || "kommo",
      contact_id: messageLike.contact_id || "",
      chat_id: messageLike.chat_id || "",
      origin: messageLike.origin || "",
      current_talk_id: messageLike.talk_id || "",
      zernio_account_id: messageLike.zernio_account_id || "",
      zernio_conversation_id: messageLike.zernio_conversation_id || "",
      summary: "",
      last_messages: [],
      processed_message_ids: [],
      questions_asked: [],
      youtube_link_sent: false,
      training_link_sent: false,
      booking_link_sent: false,
      ai_paused: false,
      last_incoming_at: null,
      last_outgoing_at: null,
      follow_up: {
        active: false,
        count: 0,
        question_text: "",
        question_sent_at: null,
        due_at: null,
        last_sent_at: null
      }
    };
  }

  const memory = store.conversations[key];
  memory.key = key;
  memory.provider = messageLike.provider || memory.provider || "kommo";
  memory.contact_id = messageLike.contact_id || memory.contact_id || "";
  memory.chat_id = messageLike.chat_id || memory.chat_id || "";
  memory.origin = messageLike.origin || memory.origin || "";
  memory.current_talk_id = messageLike.talk_id || memory.current_talk_id || "";
  memory.zernio_account_id =
    messageLike.zernio_account_id || memory.zernio_account_id || "";
  memory.zernio_conversation_id =
    messageLike.zernio_conversation_id || memory.zernio_conversation_id || "";
  memory.summary = memory.summary || "";
  memory.last_messages = Array.isArray(memory.last_messages) ? memory.last_messages : [];
  memory.processed_message_ids = Array.isArray(memory.processed_message_ids)
    ? memory.processed_message_ids
    : [];
  memory.questions_asked = Array.isArray(memory.questions_asked) ? memory.questions_asked : [];
  memory.follow_up =
    memory.follow_up && typeof memory.follow_up === "object"
      ? memory.follow_up
      : {};
  memory.follow_up.active = Boolean(memory.follow_up.active);
  memory.follow_up.count = Number(memory.follow_up.count || 0);
  memory.follow_up.question_text = memory.follow_up.question_text || "";
  memory.follow_up.question_sent_at = memory.follow_up.question_sent_at || null;
  memory.follow_up.due_at = memory.follow_up.due_at || null;
  memory.follow_up.last_sent_at = memory.follow_up.last_sent_at || null;

  return memory;
}

function addMemoryMessage(memory, message) {
  memory.last_messages.push({
    role: message.role,
    text: String(message.text || "").slice(0, 1200),
    at: message.at || new Date().toISOString(),
    id: message.id || ""
  });
  memory.last_messages = memory.last_messages.slice(-MAX_RECENT_MEMORY_MESSAGES);
}

function markProcessedMessage(memory, messageId) {
  if (!messageId) {
    return false;
  }

  if (memory.processed_message_ids.includes(messageId)) {
    return true;
  }

  memory.processed_message_ids.push(messageId);
  memory.processed_message_ids = memory.processed_message_ids.slice(
    -MAX_PROCESSED_MESSAGE_IDS
  );

  return false;
}

function detectQuestionKeys(text) {
  const lower = String(text || "").toLowerCase();
  const keys = [];

  if (/why.*start|what.*made.*start|what.*makes.*you.*want/.test(lower)) {
    keys.push("why_start");
  }

  if (/when.*start|timeline|how soon|start.*when/.test(lower)) {
    keys.push("when_start");
  }

  if (/holding.*back|hold.*back|stopping.*you|blocker|stuck/.test(lower)) {
    keys.push("holding_back");
  }

  if (/get on a call|hop on a call|book.*call|discovery/.test(lower)) {
    keys.push("would_call");
  }

  return keys;
}

function replyLooksLikeQuestion(text) {
  return String(text || "").includes("?");
}

function updateLinkMemory(memory, text) {
  const replyText = String(text || "");

  if (replyText.includes(YOUTUBE_URL)) {
    memory.youtube_link_sent = true;
    memory.training_link_sent = true;
  }

  if (replyText.includes(BOOKING_URL)) {
    memory.booking_link_sent = true;
  }
}

function updateQuestionMemory(memory, text) {
  for (const key of detectQuestionKeys(text)) {
    if (!memory.questions_asked.includes(key)) {
      memory.questions_asked.push(key);
    }
  }
}

function scheduleFollowUpIfNeeded(memory, replyText, sentAtMs = Date.now(), settings) {
  if (!isFollowUpsEnabled(settings) || !replyLooksLikeQuestion(replyText)) {
    memory.follow_up.active = false;
    return;
  }

  memory.follow_up = {
    active: true,
    count: 0,
    question_text: String(replyText || "").slice(0, 500),
    question_sent_at: new Date(sentAtMs).toISOString(),
    due_at: new Date(sentAtMs + FOLLOW_UP_OFFSETS_MS[0]).toISOString(),
    last_sent_at: null
  };
}

function cancelFollowUp(memory) {
  if (!memory.follow_up) {
    return;
  }

  memory.follow_up.active = false;
  memory.follow_up.due_at = null;
}

function getDailyStats(store, day = todayKey()) {
  if (!store.dailyStats[day]) {
    store.dailyStats[day] = {
      prospects_touched: 0,
      prospect_keys: [],
      ai_replies_sent: 0,
      manual_approvals_sent: 0,
      auto_replies_sent: 0,
      drafts_created: 0,
      training_links_sent: 0,
      youtube_links_sent: 0,
      booking_links_sent: 0,
      followups_sent: 0
    };
  }

  const stats = store.dailyStats[day];
  stats.prospect_keys = Array.isArray(stats.prospect_keys) ? stats.prospect_keys : [];
  return stats;
}

function recordDailyStat(store, conversationKey, increments = {}) {
  const stats = getDailyStats(store);

  if (
    conversationKey &&
    increments.prospects_touched &&
    !stats.prospect_keys.includes(conversationKey)
  ) {
    stats.prospect_keys.push(conversationKey);
    stats.prospects_touched = stats.prospect_keys.length;
  }

  const { prospects_touched: _prospectsTouched, ...counterIncrements } = increments;

  for (const [key, value] of Object.entries(counterIncrements)) {
    stats[key] = Number(stats[key] || 0) + Number(value || 0);
  }
}

function linkStatsForText(text) {
  const replyText = String(text || "");
  const hasYoutube = replyText.includes(YOUTUBE_URL);
  const hasBooking = replyText.includes(BOOKING_URL);

  return {
    training_links_sent: hasYoutube ? 1 : 0,
    youtube_links_sent: hasYoutube ? 1 : 0,
    booking_links_sent: hasBooking ? 1 : 0
  };
}

function memoryForPrompt(memory, settings) {
  if (!memory || !isConversationMemoryEnabled(settings)) {
    return null;
  }

  return {
    key: memory.key,
    summary: memory.summary,
    recent_messages: memory.last_messages.slice(-12),
    questions_asked: memory.questions_asked,
    youtube_link_sent: Boolean(memory.youtube_link_sent),
    training_link_sent: Boolean(memory.training_link_sent),
    booking_link_sent: Boolean(memory.booking_link_sent),
    follow_up_count: Number(memory.follow_up?.count || 0)
  };
}

async function saveDraft(draft) {
  const store = await readStore();
  getConversationSettings(store, draft.talk_id);
  const conversationKey = draft.conversation_key || makeConversationKey(draft);

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
      conversation_key: conversationKey,
      id: draft.id || crypto.randomUUID(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    recordDailyStat(store, conversationKey, { drafts_created: 1 });
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

async function updateDraft(id, updates) {
  const store = await readStore();
  const index = store.drafts.findIndex((item) => item.id === id);

  if (index < 0) {
    return null;
  }

  store.drafts[index] = {
    ...store.drafts[index],
    ...updates,
    updated_at: new Date().toISOString()
  };

  await writeStore(store);
  return store.drafts[index];
}

function safeJsonParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyZernioSignature(rawBody, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const expectedHex = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const signatureText = String(signature).trim();
  const candidates = signatureText
    .split(",")
    .map((part) => part.trim())
    .flatMap((part) => {
      const value = part.includes("=") ? part.split("=").pop().trim() : part;
      return [part, value];
    });

  return candidates.some((candidate) => timingSafeEqualString(candidate, expectedHex));
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

function normalizeDirection(value) {
  const direction = String(value || "").toLowerCase();

  if (["incoming", "inbound", "received"].includes(direction)) {
    return "incoming";
  }

  if (["outgoing", "outbound", "sent"].includes(direction)) {
    return "outgoing";
  }

  return direction;
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
    provider: "kommo",
    talk_id: talkId ? String(talkId) : "",
    chat_id: chatId ? String(chatId) : "",
    contact_id: contactId ? String(contactId) : "",
    incoming_message_id: incomingMessageId ? String(incomingMessageId) : "",
    text: text ? String(text).trim() : "",
    direction: normalizeDirection(direction),
    message_type: messageType ? String(messageType).toLowerCase() : "",
    origin: origin ? String(origin).toLowerCase() : "",
    created_at: createdAt ? Number(createdAt) || null : null
  };
}

function extractZernioIncomingMessage(payload) {
  const eventId = pickValue(payload, ["id", "event_id", "eventId"]);
  const eventType = pickValue(payload, ["event", "type", "event_type"]);
  const conversationId = pickValue(payload, [
    "data.conversationId",
    "data.conversation_id",
    "data.conversation.id",
    "data.message.conversationId",
    "message.conversationId",
    "conversationId",
    "conversation_id"
  ]);
  const accountId = pickValue(payload, [
    "data.accountId",
    "data.account_id",
    "data.account.id",
    "accountId",
    "account_id"
  ]);
  const messageId = pickValue(payload, [
    "data.messageId",
    "data.message_id",
    "data.id",
    "data.message.id",
    "message.id",
    "messageId",
    "message_id"
  ]);
  const text = pickValue(payload, [
    "data.text",
    "data.message.text",
    "data.body",
    "message.text",
    "data.message",
    "text"
  ]);
  const direction = pickValue(payload, [
    "data.direction",
    "data.message.direction",
    "direction"
  ]);
  const platform = pickValue(payload, [
    "data.platform",
    "data.account.platform",
    "platform"
  ]);
  const senderId = pickValue(payload, [
    "data.sender.contactId",
    "data.sender.id",
    "data.senderId",
    "data.sender_id",
    "data.participantId",
    "data.participant_id",
    "sender.id",
    "senderId"
  ]);
  const timestamp = pickValue(payload, [
    "data.timestamp",
    "data.createdAt",
    "data.created_at",
    "data.sentAt",
    "message.createdAt",
    "timestamp",
    "createdAt"
  ]);
  const timestampMs = timestamp ? Date.parse(String(timestamp)) : NaN;
  const stableMessageId = eventId || messageId || `${conversationId || "unknown"}:${timestamp || Date.now()}`;
  const textValue =
    text && typeof text === "object" ? text.text || text.message || "" : text;

  return {
    provider: "zernio",
    talk_id: conversationId ? String(conversationId) : "",
    chat_id: conversationId ? String(conversationId) : "",
    contact_id: senderId ? String(senderId) : "",
    zernio_conversation_id: conversationId ? String(conversationId) : "",
    zernio_account_id: accountId ? String(accountId) : "",
    incoming_message_id: stableMessageId ? String(stableMessageId) : "",
    text: textValue ? String(textValue).trim() : "",
    direction: normalizeDirection(direction),
    message_type: "text",
    origin: platform ? String(platform).toLowerCase() : "",
    event_type: eventType ? String(eventType) : "",
    created_at: Number.isNaN(timestampMs) ? null : timestampMs
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

async function zernioRequest(pathname, options = {}) {
  const response = await fetch(`${ZERNIO_BASE_URL}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${requireEnv("ZERNIO_API_KEY")}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const body = text ? safeJsonParse(text) || text : null;

  if (!response.ok) {
    throw new Error(
      `Zernio API ${response.status} ${response.statusText}: ${
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

function normalizeZernioMessages(responseBody) {
  const rawMessages =
    responseBody?.messages ||
    responseBody?.data?.messages ||
    responseBody?.data ||
    [];
  const messages = Array.isArray(rawMessages) ? rawMessages : [];

  return messages
    .map((message) => {
      const direction = normalizeDirection(message.direction);
      const createdAt = message.createdAt || message.created_at || message.timestamp || null;
      const createdAtMs = createdAt ? Date.parse(String(createdAt)) : NaN;

      return {
        id: message.id || message.messageId || "",
        role: direction === "incoming" ? "user" : "assistant",
        text: String(message.message || message.text || "").trim(),
        created_at: Number.isNaN(createdAtMs) ? null : createdAtMs
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

async function getZernioConversationThread(conversationId, accountId) {
  if (!conversationId || !accountId) {
    return [];
  }

  const params = new URLSearchParams({
    accountId,
    limit: "50",
    sortOrder: "asc"
  });
  const responseBody = await zernioRequest(
    `/inbox/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
    { method: "GET" }
  );

  return normalizeZernioMessages(responseBody);
}

async function getConversationThreadForIncoming(incoming) {
  if (incoming.provider === "zernio") {
    return getZernioConversationThread(
      incoming.zernio_conversation_id || incoming.talk_id,
      incoming.zernio_account_id
    );
  }

  return getConversationThread(incoming.talk_id);
}

async function generateReply({
  thread,
  newMessage,
  contextWarning,
  memory,
  featureSettings
}) {
  const payload = {
    conversation_history: thread.slice(-30),
    conversation_memory: memoryForPrompt(memory, featureSettings),
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
        { role: "system", content: systemPrompt(featureSettings) },
        {
          role: "user",
          content:
            "Use this JSON conversation data to write the next Instagram DM reply. Return JSON only.\n" +
            "Use conversation_memory to avoid repeating links or qualifying questions.\n" +
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

async function sendReplyToZernio(messageLike, replyText, featureSettings) {
  const conversationId =
    messageLike.zernio_conversation_id ||
    messageLike.conversation_id ||
    messageLike.talk_id ||
    messageLike.current_talk_id;
  const accountId = messageLike.zernio_account_id || process.env.ZERNIO_ACCOUNT_ID;

  if (!conversationId) {
    throw new Error("Cannot send Zernio reply without a conversation id.");
  }

  if (!accountId) {
    throw new Error("Cannot send Zernio reply without a Zernio account id.");
  }

  if (!replyText || !replyText.trim()) {
    throw new Error("Cannot send an empty reply.");
  }

  await prepareZernioSend(messageLike, replyText, featureSettings);

  return zernioRequest(
    `/inbox/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        accountId,
        message: replyText.trim()
      })
    }
  );
}

async function sendZernioTypingIndicator(messageLike, featureSettings) {
  if (!isTypingIndicatorEnabled(featureSettings)) {
    return;
  }

  const conversationId =
    messageLike.zernio_conversation_id ||
    messageLike.conversation_id ||
    messageLike.talk_id ||
    messageLike.current_talk_id;
  const accountId = messageLike.zernio_account_id || process.env.ZERNIO_ACCOUNT_ID;

  if (!conversationId || !accountId) {
    return;
  }

  try {
    await zernioRequest(
      `/inbox/conversations/${encodeURIComponent(conversationId)}/typing`,
      {
        method: "POST",
        body: JSON.stringify({ accountId })
      }
    );
  } catch (error) {
    console.warn(`Zernio typing indicator failed: ${error.message}`);
  }
}

async function prepareZernioSend(messageLike, replyText, featureSettings) {
  await sendZernioTypingIndicator(messageLike, featureSettings);

  const delayMs = humanSendDelayMs(replyText, featureSettings);

  if (delayMs > 0) {
    await sleep(delayMs);
  }
}

async function sendReply(messageLike, replyText, featureSettings) {
  if (messageLike.provider === "zernio") {
    return sendReplyToZernio(messageLike, replyText, featureSettings);
  }

  return sendReplyToKommo(messageLike.talk_id || messageLike.current_talk_id, replyText);
}

async function generateFollowUpReply(memory, featureSettings) {
  const followUpNumber = Number(memory.follow_up?.count || 0) + 1;
  const payload = {
    follow_up_number: followUpNumber,
    original_question: memory.follow_up?.question_text || "",
    conversation_memory: memoryForPrompt(memory, featureSettings)
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt(featureSettings) },
        {
          role: "user",
          content:
            "The prospect has not answered after the assistant asked a question. " +
            "Write a gentle, short follow-up nudge for Instagram. Do not sound pushy. " +
            "Do not ask more than one question. Return JSON only.\n" +
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
    throw new Error(`OpenAI returned unexpected follow-up content: ${content}`);
  }

  return {
    reply: parsed.reply.trim(),
    needs_review: parsed.needs_review !== false
  };
}

async function recordIncomingForMemory(incoming, featureSettings) {
  if (!isConversationMemoryEnabled(featureSettings)) {
    return { duplicate: false, memory: null, conversationKey: makeConversationKey(incoming) };
  }

  const store = await readStore();
  const memory = getConversationMemory(store, incoming);
  const duplicate = markProcessedMessage(memory, incoming.incoming_message_id);

  if (!duplicate) {
    const incomingAt = new Date(toMessageTimestampMs(incoming.created_at)).toISOString();
    memory.last_incoming_at = incomingAt;
    memory.summary = `Last inbound: ${incoming.text.slice(0, 240)}`;
    cancelFollowUp(memory);
    addMemoryMessage(memory, {
      role: "user",
      text: incoming.text,
      at: incomingAt,
      id: incoming.incoming_message_id
    });
  }

  await writeStore(store);

  return { duplicate, memory, conversationKey: memory.key };
}

async function recordOutgoingForMemory(messageLike, replyText, options = {}) {
  const store = await readStore();
  const featureSettings = getFeatureSettings(store);
  const memory = isConversationMemoryEnabled(featureSettings)
    ? getConversationMemory(store, messageLike)
    : null;
  const conversationKey = memory?.key || makeConversationKey(messageLike);
  const sentAtMs = Date.now();
  const sentAt = new Date(sentAtMs).toISOString();
  const source = options.source || "ai";

  if (memory) {
    addMemoryMessage(memory, {
      role: "assistant",
      text: replyText,
      at: sentAt,
      id: options.messageId || ""
    });
    memory.last_outgoing_at = sentAt;
    memory.summary = `Last outbound: ${String(replyText || "").slice(0, 240)}`;
    updateLinkMemory(memory, replyText);
    updateQuestionMemory(memory, replyText);
    scheduleFollowUpIfNeeded(memory, replyText, sentAtMs, featureSettings);
  }

  recordDailyStat(store, conversationKey, {
    prospects_touched: 1,
    ai_replies_sent: 1,
    auto_replies_sent: source === "auto" ? 1 : 0,
    manual_approvals_sent: source === "manual_approval" ? 1 : 0,
    followups_sent: source === "follow_up" ? 1 : 0,
    ...linkStatsForText(replyText)
  });

  await writeStore(store);
}

let followUpSweepRunning = false;

async function processDueFollowUps() {
  if (followUpSweepRunning) {
    return;
  }

  followUpSweepRunning = true;

  try {
    const nowMs = Date.now();
    const store = await readStore();
    const featureSettings = getFeatureSettings(store);

    if (!isFollowUpsEnabled(featureSettings)) {
      return;
    }

    const dueConversations = Object.values(store.conversations).filter((memory) => {
      const dueAtMs = memory.follow_up?.due_at
        ? new Date(memory.follow_up.due_at).getTime()
        : 0;
      const lastIncomingMs = memory.last_incoming_at
        ? new Date(memory.last_incoming_at).getTime()
        : 0;

      return (
        memory.follow_up?.active &&
        isProviderEnabled(store, memory.provider) &&
        !memory.ai_paused &&
        memory.current_talk_id &&
        dueAtMs > 0 &&
        dueAtMs <= nowMs &&
        Number(memory.follow_up.count || 0) < FOLLOW_UP_OFFSETS_MS.length &&
        lastIncomingMs > 0 &&
        nowMs - lastIncomingMs < FOLLOW_UP_WINDOW_MS
      );
    });

    for (const memory of dueConversations) {
      await sendDueFollowUp(memory.key);
    }
  } catch (error) {
    console.error("Follow-up sweep failed:", error);
  } finally {
    followUpSweepRunning = false;
  }
}

async function sendDueFollowUp(conversationKey) {
  const store = await readStore();
  const featureSettings = getFeatureSettings(store);
  const memory = store.conversations[conversationKey];

  if (!memory || !memory.follow_up?.active || memory.ai_paused) {
    return;
  }

  if (!isFollowUpsEnabled(featureSettings)) {
    return;
  }

  if (!isProviderEnabled(store, memory.provider)) {
    memory.follow_up.active = false;
    memory.follow_up.due_at = null;
    await writeStore(store);
    console.log(`Follow-up skipped because ${normalizeProvider(memory.provider)} is disabled.`);
    return;
  }

  const dueAtMs = memory.follow_up.due_at
    ? new Date(memory.follow_up.due_at).getTime()
    : 0;
  const lastIncomingMs = memory.last_incoming_at
    ? new Date(memory.last_incoming_at).getTime()
    : 0;

  if (!dueAtMs || dueAtMs > Date.now()) {
    return;
  }

  if (!lastIncomingMs || Date.now() - lastIncomingMs >= FOLLOW_UP_WINDOW_MS) {
    memory.follow_up.active = false;
    await writeStore(store);
    console.log(`Follow-up skipped outside messaging window for ${conversationKey}.`);
    return;
  }

  if (!memory.current_talk_id) {
    memory.follow_up.active = false;
    await writeStore(store);
    console.log(`Follow-up skipped without current talk_id for ${conversationKey}.`);
    return;
  }

  let aiReply;

  try {
    aiReply = await generateFollowUpReply(memory, featureSettings);
  } catch (error) {
    memory.follow_up.active = false;
    memory.follow_up.due_at = null;
    await writeStore(store);

    await saveDraft({
      provider: memory.provider || "kommo",
      conversation_key: conversationKey,
      talk_id: memory.current_talk_id,
      chat_id: memory.chat_id,
      contact_id: memory.contact_id,
      zernio_conversation_id: memory.zernio_conversation_id,
      zernio_account_id: memory.zernio_account_id,
      origin: memory.origin,
      incoming_message_id: `follow-up-${conversationKey}-${memory.follow_up.count + 1}`,
      incoming_text: "Follow-up due",
      reply: "",
      needs_review: true,
      reason: `Follow-up generation failed: ${error.message}`
    });

    console.error(`Follow-up generation failed for ${conversationKey}:`, error);
    return;
  }

  const replyText = aiReply.reply;

  if (aiReply.needs_review || !replyText) {
    memory.follow_up.active = false;
    memory.follow_up.due_at = null;
    await writeStore(store);

    await saveDraft({
      provider: memory.provider || "kommo",
      conversation_key: conversationKey,
      talk_id: memory.current_talk_id,
      chat_id: memory.chat_id,
      contact_id: memory.contact_id,
      zernio_conversation_id: memory.zernio_conversation_id,
      zernio_account_id: memory.zernio_account_id,
      origin: memory.origin,
      incoming_message_id: `follow-up-review-${conversationKey}-${memory.follow_up.count + 1}`,
      incoming_text: "Follow-up due",
      reply: replyText,
      needs_review: true,
      reason: "AI requested review for this follow-up."
    });

    console.log(`Saved follow-up draft for ${conversationKey}.`);
    return;
  }

  if (!isAutoSendEnabled(featureSettings)) {
    memory.follow_up.active = false;
    memory.follow_up.due_at = null;
    await writeStore(store);

    await saveDraft({
      provider: memory.provider || "kommo",
      conversation_key: conversationKey,
      talk_id: memory.current_talk_id,
      chat_id: memory.chat_id,
      contact_id: memory.contact_id,
      zernio_conversation_id: memory.zernio_conversation_id,
      zernio_account_id: memory.zernio_account_id,
      origin: memory.origin,
      incoming_message_id: `follow-up-draft-${conversationKey}-${memory.follow_up.count + 1}`,
      incoming_text: "Follow-up due",
      reply: replyText,
      needs_review: true,
      reason: "AUTO_SEND is not true, so this follow-up was saved for review."
    });

    console.log(`Saved follow-up draft because AUTO_SEND is off for ${conversationKey}.`);
    return;
  }

  try {
    await sendReply(memory, replyText, featureSettings);
  } catch (error) {
    memory.follow_up.active = false;
    memory.follow_up.due_at = null;
    await writeStore(store);

    await saveDraft({
      provider: memory.provider || "kommo",
      conversation_key: conversationKey,
      talk_id: memory.current_talk_id,
      chat_id: memory.chat_id,
      contact_id: memory.contact_id,
      zernio_conversation_id: memory.zernio_conversation_id,
      zernio_account_id: memory.zernio_account_id,
      origin: memory.origin,
      incoming_message_id: `follow-up-send-${conversationKey}-${memory.follow_up.count + 1}`,
      incoming_text: "Follow-up due",
      reply: replyText,
      needs_review: true,
      reason: `Follow-up send failed: ${error.message}`
    });

    console.error(`Follow-up send failed for ${conversationKey}:`, error);
    return;
  }

  const updatedStore = await readStore();
  const updatedMemory = updatedStore.conversations[conversationKey];
  const nextCount = Number(updatedMemory.follow_up?.count || 0) + 1;
  const questionSentMs = updatedMemory.follow_up?.question_sent_at
    ? new Date(updatedMemory.follow_up.question_sent_at).getTime()
    : Date.now();

  addMemoryMessage(updatedMemory, {
    role: "assistant",
    text: replyText,
    at: new Date().toISOString(),
    id: `follow-up-${nextCount}`
  });
  updateLinkMemory(updatedMemory, replyText);
  updateQuestionMemory(updatedMemory, replyText);
  updatedMemory.last_outgoing_at = new Date().toISOString();
  updatedMemory.follow_up.count = nextCount;
  updatedMemory.follow_up.last_sent_at = new Date().toISOString();

  if (nextCount >= FOLLOW_UP_OFFSETS_MS.length) {
    updatedMemory.follow_up.active = false;
    updatedMemory.follow_up.due_at = null;
  } else {
    updatedMemory.follow_up.due_at = new Date(
      questionSentMs + FOLLOW_UP_OFFSETS_MS[nextCount]
    ).toISOString();
  }

  recordDailyStat(updatedStore, conversationKey, {
    prospects_touched: 1,
    ai_replies_sent: 1,
    followups_sent: 1,
    ...linkStatsForText(replyText)
  });

  await writeStore(updatedStore);
  console.log(`Sent follow-up ${nextCount} for ${conversationKey}.`);
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

  const providerStore = await readStore();
  const featureSettings = getFeatureSettings(providerStore);
  const provider = normalizeProvider(incoming.provider);

  if (!isProviderEnabled(providerStore, provider)) {
    console.log(`Webhook ignored: ${provider} provider is disabled.`);
    return;
  }

  const { duplicate, memory, conversationKey } = await recordIncomingForMemory(
    incoming,
    featureSettings
  );

  if (duplicate) {
    console.log(`Webhook ignored: duplicate message ${incoming.incoming_message_id}.`);
    return;
  }

  let thread = [];
  let contextWarning = "";

  try {
    thread = await getConversationThreadForIncoming(incoming);
  } catch (error) {
    contextWarning = `Could not pull ${incoming.provider || "kommo"} thread: ${error.message}`;
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
      contextWarning,
      memory,
      featureSettings
    });
  } catch (error) {
    await saveDraft({
      provider: incoming.provider || "kommo",
      conversation_key: conversationKey,
      talk_id: incoming.talk_id,
      chat_id: incoming.chat_id,
      contact_id: incoming.contact_id,
      zernio_conversation_id: incoming.zernio_conversation_id,
      zernio_account_id: incoming.zernio_account_id,
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
    isAutoSendEnabled(featureSettings) &&
    !settings.paused &&
    aiReply.needs_review === false &&
    Boolean(aiReply.reply);

  if (shouldAutoSend) {
    await sendReply(incoming, aiReply.reply, featureSettings);
    await recordOutgoingForMemory(incoming, aiReply.reply, { source: "auto" });
    console.log(`Auto-sent reply for talk_id=${incoming.talk_id}.`);
    return;
  }

  await saveDraft({
    provider: incoming.provider || "kommo",
    conversation_key: conversationKey,
    talk_id: incoming.talk_id,
    chat_id: incoming.chat_id,
    contact_id: incoming.contact_id,
    zernio_conversation_id: incoming.zernio_conversation_id,
    zernio_account_id: incoming.zernio_account_id,
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

app.post(
  "/webhook/zernio",
  express.raw({ type: "*/*", limit: "2mb" }),
  (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
    const webhookSecret = process.env.ZERNIO_WEBHOOK_SECRET;
    const signature =
      req.headers["x-zernio-signature"] ||
      req.headers["x-late-signature"] ||
      req.headers["zernio-signature"] ||
      req.headers["x-signature"];
    const fallbackSecretOk =
      process.env.WEBHOOK_SECRET && req.query.secret === process.env.WEBHOOK_SECRET;

    if (webhookSecret) {
      if (!verifyZernioSignature(rawBody, signature, webhookSecret)) {
        res.status(403).json({ ok: false, error: "Invalid Zernio webhook signature" });
        return;
      }
    } else if (!fallbackSecretOk) {
      res.status(500).json({
        ok: false,
        error: "ZERNIO_WEBHOOK_SECRET is not configured"
      });
      return;
    }

    const parsedPayload = parseWebhookPayload(rawBody, req.headers["content-type"]);
    const incoming = extractZernioIncomingMessage(parsedPayload);

    console.log("Zernio webhook content-type:", req.headers["content-type"] || "");
    console.log("Zernio webhook raw payload:");
    console.log(rawBody.toString("utf8"));
    console.log("Zernio webhook parsed payload:");
    console.log(JSON.stringify(parsedPayload, null, 2));
    console.log("Zernio webhook extracted message:");
    console.log(JSON.stringify(incoming, null, 2));

    res.status(202).json({ ok: true });

    if (incoming.event_type && incoming.event_type !== "message.received") {
      console.log(`Zernio webhook ignored: event_type is ${incoming.event_type}.`);
      return;
    }

    processIncomingMessage(incoming, parsedPayload).catch((error) => {
      console.error("Zernio webhook processing failed:", error);
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

app.get("/api/stats", async (_req, res, next) => {
  try {
    const store = await readStore();
    const day = todayKey();
    const stats = getDailyStats(store, day);
    const providerSettings = getProviderSettings(store);
    const featureSettings = getFeatureSettings(store);
    const { prospect_keys: _prospectKeys, ...publicStats } = stats;

    res.json({
      day,
      stats: {
        ...publicStats,
        prospects_touched: stats.prospect_keys.length
      },
      settings: {
        auto_send: isAutoSendEnabled(featureSettings),
        humanize_replies_enabled: isHumanizeRepliesEnabled(featureSettings),
        typing_indicator_enabled: isTypingIndicatorEnabled(featureSettings),
        human_send_delay_enabled: isHumanSendDelayEnabled(featureSettings),
        conversation_memory_enabled: isConversationMemoryEnabled(featureSettings),
        follow_ups_enabled: isFollowUpsEnabled(featureSettings),
        zernio_configured: Boolean(process.env.ZERNIO_API_KEY),
        feature_settings: featureSettings,
        provider_settings: providerSettings
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/features", async (_req, res, next) => {
  try {
    const store = await readStore();
    res.json({
      features: getFeatureSettings(store)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/features", async (req, res, next) => {
  try {
    const feature = String(req.body.feature || "").toLowerCase();
    const allowedFeatures = [
      "auto_send",
      "follow_ups",
      "humanize_replies",
      "typing_indicator",
      "human_send_delay",
      "conversation_memory"
    ];

    if (!allowedFeatures.includes(feature)) {
      res.status(400).json({ ok: false, error: "Unknown feature." });
      return;
    }

    const store = await readStore();
    const featureSettings = getFeatureSettings(store);
    featureSettings[feature] = Boolean(req.body.enabled);
    await writeStore(store);

    res.json({
      ok: true,
      features: getFeatureSettings(store)
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/providers", async (_req, res, next) => {
  try {
    const store = await readStore();
    res.json({
      providers: getProviderSettings(store),
      configured: {
        kommo: Boolean(process.env.KOMMO_ACCESS_TOKEN && process.env.KOMMO_SUBDOMAIN),
        zernio: Boolean(process.env.ZERNIO_API_KEY)
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/providers", async (req, res, next) => {
  try {
    const provider = String(req.body.provider || "").toLowerCase();

    if (!["kommo", "zernio"].includes(provider)) {
      res.status(400).json({ ok: false, error: "Provider must be kommo or zernio." });
      return;
    }

    const enabled = Boolean(req.body.enabled);
    const store = await readStore();
    const providerSettings = getProviderSettings(store);

    providerSettings[provider].enabled = enabled;
    await writeStore(store);

    res.json({
      ok: true,
      providers: getProviderSettings(store)
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
    const provider = normalizeProvider(draft.provider);
    const featureSettings = getFeatureSettings(store);

    if (!isProviderEnabled(store, provider)) {
      const error = `${provider} is disabled in provider controls.`;
      await updateDraft(draft.id, {
        reply,
        needs_review: true,
        reason: `Send blocked: ${error}`
      });
      res.status(409).json({ ok: false, error });
      return;
    }

    try {
      await sendReply(draft, reply, featureSettings);
    } catch (error) {
      await updateDraft(draft.id, {
        reply,
        needs_review: true,
        reason: `Send failed: ${error.message}`
      });
      res.status(502).json({ ok: false, error: error.message });
      return;
    }

    await recordOutgoingForMemory(draft, reply, { source: "manual_approval" });
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

    .stats-grid {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      margin-bottom: 14px;
    }

    .stat {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      min-height: 78px;
      padding: 12px;
    }

    .stat strong {
      display: block;
      font-size: 22px;
      line-height: 1.15;
    }

    .stat span {
      color: var(--muted);
      display: block;
      font-size: 12px;
      margin-top: 4px;
    }

    .flags {
      color: var(--muted);
      display: flex;
      flex-wrap: wrap;
      font-size: 12px;
      gap: 8px;
      margin: -4px 0 16px;
    }

    .flag {
      background: #eef1f6;
      border-radius: 999px;
      padding: 4px 8px;
    }

    .provider-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: -6px 0 16px;
    }

    .provider-toggle {
      background: var(--panel);
      border: 1px solid var(--border);
      color: var(--text);
      font-size: 13px;
      min-height: 34px;
      padding: 0 12px;
    }

    .provider-toggle.is-on {
      background: #e9f7ef;
      border-color: #a9d8bd;
      color: #0c6246;
    }

    .provider-toggle.is-off {
      background: #fff1f1;
      border-color: #e8b9b9;
      color: #8f2424;
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

      .stats-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
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
    <section id="stats" class="stats-grid" aria-label="Daily tracker"></section>
    <section id="flags" class="flags" aria-label="Settings"></section>
    <section id="providers" class="provider-controls" aria-label="Provider controls"></section>
    <section id="features" class="provider-controls" aria-label="Feature controls"></section>
    <section id="drafts" class="draft-list"></section>
  </main>

  <script>
    const draftsEl = document.getElementById("drafts");
    const featuresEl = document.getElementById("features");
    const flagsEl = document.getElementById("flags");
    const providersEl = document.getElementById("providers");
    const statsEl = document.getElementById("stats");
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

    function renderStats(data) {
      const stats = data.stats || {};
      const cards = [
        ["Prospects", stats.prospects_touched || 0],
        ["AI replies", stats.ai_replies_sent || 0],
        ["Drafts", stats.drafts_created || 0],
        ["Training/YouTube", stats.youtube_links_sent || 0],
        ["Booking links", stats.booking_links_sent || 0],
        ["Follow-ups", stats.followups_sent || 0]
      ];

      statsEl.innerHTML = "";
      cards.forEach(([label, value]) => {
        const card = document.createElement("div");
        card.className = "stat";

        const strong = document.createElement("strong");
        strong.textContent = value;

        const span = document.createElement("span");
        span.textContent = label;

        card.append(strong, span);
        statsEl.appendChild(card);
      });

      const settings = data.settings || {};
      flagsEl.innerHTML = "";
      [
        ["Auto-send", settings.auto_send],
        ["Humanize", settings.humanize_replies_enabled],
        ["Typing", settings.typing_indicator_enabled],
        ["Delay", settings.human_send_delay_enabled],
        ["Memory", settings.conversation_memory_enabled],
        ["Follow-ups", settings.follow_ups_enabled],
        ["Zernio key", settings.zernio_configured]
      ].forEach(([label, enabled]) => {
        const flag = document.createElement("span");
        flag.className = "flag";
        flag.textContent = label + ": " + (enabled ? "on" : "off");
        flagsEl.appendChild(flag);
      });

      renderProviderControls(settings);
      renderFeatureControls(settings);
    }

    function renderProviderControls(settings) {
      const providers = settings.provider_settings || {};
      providersEl.innerHTML = "";

      [
        ["kommo", "Kommo"],
        ["zernio", "Zernio"]
      ].forEach(([provider, label]) => {
        const enabled = !providers[provider] || providers[provider].enabled !== false;
        const button = document.createElement("button");
        button.className = "provider-toggle " + (enabled ? "is-on" : "is-off");
        button.type = "button";
        button.textContent = label + ": " + (enabled ? "on" : "off");

        button.addEventListener("click", async () => {
          button.disabled = true;
          const nextEnabled = !enabled;
          setStatus((nextEnabled ? "Enabling " : "Disabling ") + label + "...");
          try {
            await api("/api/providers", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ provider, enabled: nextEnabled })
            });
            await loadDrafts();
            setStatus(label + " " + (nextEnabled ? "enabled." : "disabled."));
          } catch (error) {
            setStatus(error.message);
            button.disabled = false;
          }
        });

        providersEl.appendChild(button);
      });
    }

    function renderFeatureControls(settings) {
      const features = settings.feature_settings || {};
      featuresEl.innerHTML = "";

      [
        ["auto_send", "Auto-send"],
        ["follow_ups", "Follow-ups"],
        ["humanize_replies", "Humanize"],
        ["typing_indicator", "Typing"],
        ["human_send_delay", "Delay"],
        ["conversation_memory", "Memory"]
      ].forEach(([feature, label]) => {
        const enabled = Boolean(features[feature]);
        const button = document.createElement("button");
        button.className = "provider-toggle " + (enabled ? "is-on" : "is-off");
        button.type = "button";
        button.textContent = label + ": " + (enabled ? "on" : "off");

        button.addEventListener("click", async () => {
          button.disabled = true;
          const nextEnabled = !enabled;
          setStatus((nextEnabled ? "Enabling " : "Disabling ") + label + "...");
          try {
            await api("/api/features", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ feature, enabled: nextEnabled })
            });
            await loadDrafts();
            setStatus(label + " " + (nextEnabled ? "enabled." : "disabled."));
          } catch (error) {
            setStatus(error.message);
            button.disabled = false;
          }
        });

        featuresEl.appendChild(button);
      });
    }

    function renderDraft(draft) {
      const article = document.createElement("article");
      article.className = "draft";

      const meta = document.createElement("div");
      meta.className = "meta";

      const fields = [
        draft.provider ? draft.provider : "kommo",
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
        const [data, statsData] = await Promise.all([
          api("/api/drafts"),
          api("/api/stats")
        ]);
        renderStats(statsData);
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
  .then(async () => {
    const store = await readStore();
    const featureSettings = getFeatureSettings(store);

    setInterval(() => {
      processDueFollowUps().catch((error) => {
        console.error("Follow-up interval failed:", error);
      });
    }, FOLLOW_UP_CHECK_MS);

    app.listen(PORT, () => {
      console.log(`Kommo OpenAI IG auto-reply app listening on port ${PORT}`);
      console.log(`AUTO_SEND=${isAutoSendEnabled(featureSettings)}`);
      console.log(`CONVERSATION_MEMORY_ENABLED=${isConversationMemoryEnabled(featureSettings)}`);
      console.log(`FOLLOW_UPS_ENABLED=${isFollowUpsEnabled(featureSettings)}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize local JSON store:", error);
    process.exit(1);
  });
