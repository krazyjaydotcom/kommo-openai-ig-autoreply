const crypto = require("crypto");
const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();

const PORT = Number(process.env.PORT || 3000);
const DEFAULT_DATA_DIR = path.join(__dirname, "data");
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : DEFAULT_DATA_DIR;
const DATA_FILE = path.join(DATA_DIR, "store.json");
const KNOWLEDGE_FILE = path.join(__dirname, "knowledge", "pallet-pros.md");
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const ZERNIO_BASE_URL = "https://zernio.com/api/v1";
const YOUTUBE_URL = "https://youtube.com/@palletprosacademy";
const BOOKING_URL = "https://www.tidycal.com/palletprosga/discovery";
const TRAINING_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PLPFyOjF-83nJ0B5xCreYqoQzcGx-SQsvs";
const MAX_KNOWLEDGE_CHARS = 12_000;
const MAX_RECENT_MEMORY_MESSAGES = 40;
const MAX_PROMPT_MEMORY_MESSAGES = 20;
const MAX_SUMMARY_SOURCE_MESSAGES = 12;
const MAX_MEMORY_SUMMARY_CHARS = 1800;
const MAX_PROCESSED_MESSAGE_IDS = 100;
const DEFAULT_MANUAL_TAKEOVER_MINUTES = 8;
const DEFAULT_HUMAN_SEND_DELAY_MIN_MS = 6500;
const DEFAULT_HUMAN_SEND_DELAY_MAX_MS = 18000;
const APP_OUTGOING_ECHO_WINDOW_MS = 15 * 60 * 1000;
const FOLLOW_UP_OFFSETS_MS = [
  45 * 60 * 1000,
  4 * 60 * 60 * 1000,
  18 * 60 * 60 * 1000
];
const FOLLOW_UP_CHECK_MS = 60 * 1000;
const FOLLOW_UP_WINDOW_MS = 23 * 60 * 60 * 1000;
const DEFAULT_STORE = {
  drafts: [],
  feedback: [],
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
6. If the person is interested in starting a pallet business, move them toward a Zoom/discovery call quickly.
7. Do not over-qualify in DMs. Use the simple DM flow below unless the person asks a specific question.
8. If they are warm enough to book, send:
   https://www.tidycal.com/palletprosga/discovery
9. If they ask for a call, do not suggest weekend calls.
10. If they want a weekend call, steer them to Monday through Friday.
11. If they already received the training link before, do not resend it unless clearly needed.
12. Do not ask for private, sensitive, or unnecessary info.
13. Do not change tags, pipeline stage, lead status, or close conversations.
14. If unsure, do not send yet; draft the reply instead by setting needs_review true.
15. Keep the focus on helping them take the next best step.
16. If they say they booked, scheduled, or got on the calendar, acknowledge it naturally and do not ask what it was for.
17. After someone confirms they booked, send this free training playlist once so they can better understand the opportunity:
   https://www.youtube.com/playlist?list=PLPFyOjF-83nJ0B5xCreYqoQzcGx-SQsvs
18. After someone confirms they booked, do not send the booking link again and do not keep qualifying them.

Disqualify or redirect immediately to https://youtube.com/@palletprosacademy and do not continue qualifying if the person:
- Is unemployed with no capital or real plan.
- Is incarcerated.
- Is clearly just here for free content or curiosity.
- Is asking for load-finding or freight-dispatch help. This program does not find loads for drivers. It teaches the pallet business model and how to run it successfully.

Fast-track to booking if the person already:
- Owns a truck or trailer.
- Owns a business.
- Says they are ready to invest or ready to go.
- Says they want to start, want to learn the business, wants insight, or wants an appointment.

Best-performing DM flow:
1. First touch, if there is no prior context: "Thanks for the follow. Are you here for the content, or are you looking to start your own pallet business?"
2. If they say they want to start, learn, get into pallets, or are interested: tell them a Zoom/discovery call is the next step because you can research their market, answer questions, and see if they are a good fit.
3. Before sending the calendar link, ask permission in one short question: "Do you mind if I send you a link to my calendar?"
4. If they say yes, send the booking link and tell them to choose a date/time that works for them.
5. If they ask for a call, appointment, consultation, details, or scheduling directly, it is okay to send the booking link without asking permission again.
6. If they mention a day/time instead of booking through the link, politely tell them to use the link to choose their time.
7. If they ask for a direct phone call or share their phone number, tell them to book through the link instead.
8. If they say they booked, acknowledge it naturally and do not ask another qualifying question.
9. If they have a real business/market question, answer briefly, then steer back to the call.

Reply length rules:
- Default to 1 short sentence.
- Use 2 short sentences only when needed.
- Only use multiple lines when sending the booking link.
- Do not explain the whole program in DMs.
- Do not ask more than one question.

Standing facts:
- Location: Marietta, Georgia, city/state only.
- Business name: Pallet Pros Academy.
- Recommended vehicle: a 24ft flatbed. It allows forklift access from all angles, unlike standard box trucks. A 24ft flatbed can move around 200 standard pallets in a load.
- Income: do not guarantee or imply typical income. If asked, frame this as one personal example only: "As an example, my own business runs around $400k/year in revenue, and I personally pay myself around $75k/year, but it did not start there, and results vary based on effort and market."
- Program pricing: do not quote one fixed number. Say it depends on the individual and how much success they are prepared to have in the business. If they push for a range, solutions start as low as $37/month for people who are not business owners yet, up to $5,500 for existing business owners.
- Calls: do not accept direct phone calls. If they want a call, the best way is to book time on the calendar:
  https://www.tidycal.com/palletprosga/discovery

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
- Prefer plain, confident phrases like "Got you", "Solid", "Great", "No problem", and "Sounds good" when they fit.
- Avoid long coaching-style answers. This is an appointment-setting DM, not a sales page.
- Keep punctuation relaxed. Do not use an exclamation point in every reply.
- Never say or imply you are an AI, bot, automation, or typing.`;

const CONTEXT_RULES = `Context rules:
- Treat conversation_history and conversation_memory as the source of truth for where the conversation is.
- If the person refers to something they already did or you already sent, infer it from the prior messages instead of asking "for what?" or restarting the conversation.
- Do not repeat a greeting, link, or qualifying question that already happened unless the newest message clearly asks for it.
- If the history is missing, contradictory, or too thin to answer confidently, set needs_review true.`;

const KNOWLEDGE_RULES = `Business knowledge rules:
- Use business_knowledge for Pallet Pros and Pallet Pros Academy facts, offer details, tone, objections, and FAQs.
- Do not mention that you have a knowledge base.
- Do not invent prices, guarantees, timelines, legal claims, income claims, or program details that are not in business_knowledge.
- If the prospect asks for a specific detail that is missing from business_knowledge, either ask one simple clarifying question or set needs_review true.`;

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

async function loadKnowledgeBase() {
  const envKnowledge = String(process.env.PALLET_PROS_KNOWLEDGE || "").trim();

  if (envKnowledge) {
    return envKnowledge.slice(0, MAX_KNOWLEDGE_CHARS);
  }

  try {
    const fileKnowledge = await fs.readFile(KNOWLEDGE_FILE, "utf8");
    return fileKnowledge.trim().slice(0, MAX_KNOWLEDGE_CHARS);
  } catch (error) {
    if (error.code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function manualTakeoverMs() {
  return Math.max(
    0,
    numberEnv("MANUAL_TAKEOVER_MINUTES", DEFAULT_MANUAL_TAKEOVER_MINUTES)
  ) * 60 * 1000;
}

function humanSendDelayBounds(settings) {
  const normalizedSettings = settings ? normalizeFeatureSettings(settings) : null;
  const minMs = Math.max(
    0,
    normalizedSettings
      ? Number(normalizedSettings.human_send_delay_min_ms)
      : numberEnv("HUMAN_SEND_DELAY_MIN_MS", DEFAULT_HUMAN_SEND_DELAY_MIN_MS)
  );
  const maxMs = Math.max(
    minMs,
    normalizedSettings
      ? Number(normalizedSettings.human_send_delay_max_ms)
      : numberEnv("HUMAN_SEND_DELAY_MAX_MS", DEFAULT_HUMAN_SEND_DELAY_MAX_MS)
  );

  return { minMs, maxMs };
}

function systemPrompt(settings) {
  return [
    HOUSE_RULES,
    CONTEXT_RULES,
    KNOWLEDGE_RULES,
    isHumanizeRepliesEnabled(settings) ? HUMAN_STYLE_RULES : ""
  ]
    .filter(Boolean)
    .join("\n\n");
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
    feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
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
  const delayMinMs = Math.max(
    0,
    Number.isFinite(Number(raw.human_send_delay_min_ms))
      ? Number(raw.human_send_delay_min_ms)
      : numberEnv("HUMAN_SEND_DELAY_MIN_MS", DEFAULT_HUMAN_SEND_DELAY_MIN_MS)
  );
  const delayMaxMs = Math.max(
    delayMinMs,
    Number.isFinite(Number(raw.human_send_delay_max_ms))
      ? Number(raw.human_send_delay_max_ms)
      : numberEnv("HUMAN_SEND_DELAY_MAX_MS", DEFAULT_HUMAN_SEND_DELAY_MAX_MS)
  );

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
    ),
    human_send_delay_min_ms: delayMinMs,
    human_send_delay_max_ms: delayMaxMs
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

  const settings = store.conversationSettings[talkId];
  settings.paused = Boolean(settings.paused);
  settings.manual_takeover_until = settings.manual_takeover_until || null;
  settings.manual_takeover_since = settings.manual_takeover_since || null;
  settings.manual_takeover_reason = settings.manual_takeover_reason || "";
  return settings;
}

function isManualTakeoverActive(settingsOrMemory, nowMs = Date.now()) {
  const until = settingsOrMemory?.manual_takeover_until;
  if (!until) {
    return false;
  }

  const untilMs = Date.parse(String(until));
  return Number.isFinite(untilMs) && untilMs > nowMs;
}

function conversationHoldReason(settings) {
  if (settings?.paused) {
    return "Conversation is paused.";
  }

  if (isManualTakeoverActive(settings)) {
    return `Manual takeover is active until ${settings.manual_takeover_until}.`;
  }

  return "";
}

function memoryAutomationPaused(memory) {
  if (!memory?.ai_paused) {
    return false;
  }

  if (memory.manual_takeover_until) {
    return isManualTakeoverActive(memory);
  }

  return true;
}

function comparableText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function appOutgoingSource(source) {
  return ["auto", "manual_approval", "follow_up"].includes(String(source || ""));
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

  const { minMs, maxMs } = humanSendDelayBounds(settings);
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
      booking_confirmed: false,
      lead_status: "cold",
      ai_paused: false,
      manual_takeover_until: null,
      manual_takeover_since: null,
      pending_app_outgoing: [],
      last_incoming_at: null,
      last_outgoing_at: null,
      last_outgoing_source: "",
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
  memory.booking_confirmed = Boolean(memory.booking_confirmed);
  memory.lead_status = classifyLeadStatus(memory);
  memory.manual_takeover_until = memory.manual_takeover_until || null;
  memory.manual_takeover_since = memory.manual_takeover_since || null;
  memory.pending_app_outgoing = Array.isArray(memory.pending_app_outgoing)
    ? memory.pending_app_outgoing
    : [];
  memory.last_outgoing_source = memory.last_outgoing_source || "";

  return memory;
}

function addMemoryMessage(memory, message) {
  memory.last_messages.push({
    role: message.role,
    text: String(message.text || "").slice(0, 1200),
    at: message.at || new Date().toISOString(),
    id: message.id || "",
    source: message.source || ""
  });
  memory.last_messages = memory.last_messages.slice(-MAX_RECENT_MEMORY_MESSAGES);
}

function memoryMessageLabel(message) {
  if (message.role === "user") {
    return "Prospect";
  }

  if (message.source === "manual") {
    return "You";
  }

  return "Assistant";
}

function compactMemoryText(text, maxLength = 220) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();
  return cleanText.length > maxLength
    ? `${cleanText.slice(0, maxLength - 3)}...`
    : cleanText;
}

function questionLabel(key) {
  return (
    {
      why_start: "why they want to start",
      when_start: "when they want to start",
      holding_back: "what is holding them back",
      would_call: "whether they would get on a call"
    }[key] || key
  );
}

function buildConversationSummary(memory) {
  if (!memory) {
    return "";
  }

  const messages = Array.isArray(memory.last_messages) ? memory.last_messages : [];
  const olderCount = Math.max(0, messages.length - MAX_PROMPT_MEMORY_MESSAGES);
  const olderMessages = messages
    .slice(0, olderCount)
    .slice(-MAX_SUMMARY_SOURCE_MESSAGES)
    .map((message) => {
      const text = compactMemoryText(message.text);
      return text ? `${memoryMessageLabel(message)}: ${text}` : "";
    })
    .filter(Boolean);

  const parts = [];

  if (olderMessages.length) {
    parts.push(`Earlier context: ${olderMessages.join(" | ")}`);
  }

  const state = [];
  const leadStatus = classifyLeadStatus(memory);

  if (leadStatus) {
    state.push(`lead status: ${leadStatus}`);
  }

  if (Array.isArray(memory.questions_asked) && memory.questions_asked.length) {
    state.push(
      `questions already asked: ${memory.questions_asked.map(questionLabel).join(", ")}`
    );
  }

  if (memory.youtube_link_sent || memory.training_link_sent) {
    state.push("training/YouTube link was already sent");
  }

  if (memory.booking_link_sent) {
    state.push("booking link was already sent");
  }

  if (memory.booking_confirmed) {
    state.push("prospect said they booked/scheduled");
  }

  if (memory.last_outgoing_source === "manual") {
    state.push("last outbound reply was sent manually");
  }

  if (isManualTakeoverActive(memory)) {
    state.push(`manual takeover active until ${memory.manual_takeover_until}`);
  }

  if (state.length) {
    parts.push(`Conversation state: ${state.join("; ")}.`);
  }

  return parts.join("\n").slice(0, MAX_MEMORY_SUMMARY_CHARS);
}

function recentConversationText(memory, messageCount = 10) {
  return (Array.isArray(memory?.last_messages) ? memory.last_messages : [])
    .slice(-messageCount)
    .map((message) => message.text || "")
    .join(" ")
    .toLowerCase();
}

function classifyLeadStatus(memory) {
  const recentText = recentConversationText(memory);

  if (memory?.booking_confirmed || /\b(booked|scheduled|got on the calendar|locked in)\b/.test(recentText)) {
    return "booked";
  }

  if (/\b(incarcerated|in jail|prison|dispatch|find loads|freight|no money|no capital)\b/.test(recentText)) {
    return "not_fit";
  }

  if (
    memory?.booking_link_sent ||
    /\b(ready to invest|ready to start|ready to go|book a call|hop on a call|discovery call|own a truck|have a truck|own a trailer|have a trailer|own a business)\b/.test(
      recentText
    )
  ) {
    return "hot";
  }

  if (
    (Array.isArray(memory?.questions_asked) && memory.questions_asked.length >= 2) ||
    /\b(timeline|holding me back|start soon|need help|want to start|trying to start)\b/.test(recentText)
  ) {
    return "qualified";
  }

  if (
    memory?.youtube_link_sent ||
    memory?.training_link_sent ||
    /\b(just curious|just looking|more info|free training|youtube|content)\b/.test(recentText)
  ) {
    return "curious";
  }

  return "cold";
}

function refreshMemorySummary(memory) {
  if (memory) {
    memory.lead_status = classifyLeadStatus(memory);
    memory.summary = buildConversationSummary(memory);
  }
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

  if (
    replyText.includes(YOUTUBE_URL) ||
    replyText.includes(TRAINING_PLAYLIST_URL) ||
    replyText.includes("youtube.com/")
  ) {
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

function appointmentSetterCalendarAskReply() {
  return {
    reply:
      "Great. Let's get on a Zoom call this week. That way we can research your market, answer any questions you have, and see if you'd be a good fit for the program.\n\nDo you mind if I send you a link to my calendar?",
    needs_review: false,
    handled: true
  };
}

function appointmentSetterCalendarLinkReply() {
  return {
    reply:
      `Solid. Here's the link to my calendar: ${BOOKING_URL}\n\nChoose a date/time that works for you, and I'll verify it on my end.`,
    needs_review: false,
    handled: true
  };
}

function appointmentSetterUseLinkReply() {
  return {
    reply: "Ok. Please use the link to choose your time.",
    needs_review: false,
    handled: true
  };
}

function appointmentSetterPhoneReply(memory) {
  return {
    reply: memory?.booking_link_sent
      ? "Please book your time using the link I sent earlier."
      : `The best way is to book a time here: ${BOOKING_URL}`,
    needs_review: false,
    handled: true
  };
}

function appointmentSetterContentReply() {
  return {
    reply: `Got you. Check out the free content here: ${YOUTUBE_URL}`,
    needs_review: false,
    handled: true
  };
}

function yesToCalendarLink(text) {
  return /^(yes|yea|yeah|yep|sure|of course|that's fine|that is fine|ok|okay|send it|sounds good|lets do it|let's do it)\b/i.test(
    String(text || "").trim()
  );
}

function wantsContentOnly(text) {
  return /\b(just content|only content|free content|just looking|just curious|researching|youtube)\b/i.test(
    String(text || "")
  );
}

function wantsPalletBusiness(text) {
  return /\b(interested|want|wanna|trying|tryna|looking|ready|learn|start|get started|get into|appointment|consultation|schedule|book|call|zoom|business|pallet)\b/i.test(
    String(text || "")
  );
}

function wantsDirectPhoneCall(text) {
  return /\b(call me|give me a call|phone call|can you call|able to call|my number|\d{3}[-.\s]?\d{3}[-.\s]?\d{4})\b/i.test(
    String(text || "")
  );
}

function mentionsSpecificTimeInsteadOfBooking(text) {
  return /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|\d{1,2}:\d{2}|am|pm|anytime)\b/i.test(
    String(text || "")
  );
}

function lastAssistantAskedForCalendarPermission(memory) {
  return (Array.isArray(memory?.last_messages) ? memory.last_messages : [])
    .slice(-5)
    .some(
      (message) =>
        message.role === "assistant" &&
        /send you a link to my calendar|link to my calendar/i.test(message.text || "")
    );
}

function appointmentSetterRuleReply(memory, incoming) {
  const text = String(incoming?.text || "");

  if (!text.trim()) {
    return null;
  }

  if (wantsDirectPhoneCall(text)) {
    return appointmentSetterPhoneReply(memory);
  }

  if (memory?.booking_link_sent && mentionsSpecificTimeInsteadOfBooking(text)) {
    return appointmentSetterUseLinkReply();
  }

  if (lastAssistantAskedForCalendarPermission(memory) && yesToCalendarLink(text)) {
    return appointmentSetterCalendarLinkReply();
  }

  if (wantsContentOnly(text) && !wantsPalletBusiness(text)) {
    return appointmentSetterContentReply();
  }

  if (
    wantsPalletBusiness(text) &&
    !memory?.booking_link_sent &&
    !lastAssistantAskedForCalendarPermission(memory)
  ) {
    return appointmentSetterCalendarAskReply();
  }

  return null;
}

function isBookingConfirmation(text) {
  const rawLower = String(text || "").toLowerCase();

  if (!rawLower.trim() || rawLower.includes("?")) {
    return false;
  }

  const lower = rawLower
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const firstPersonBooking =
    /\b(i|i'm|im|ive|i've|we|we're|were|weve|we've)\s+(?:just\s+|already\s+)?(?:booked|scheduled|set up|setup|locked in|got on(?: the)? calendar|made (?:the |an? )?appointment|got (?:the )?call booked)\b/;
  const alreadyBooked =
    /\b(?:just|already)\s+(?:booked|scheduled|set up|setup|locked in|got on(?: the)? calendar|made (?:the |an? )?appointment)\b/;
  const completedAction =
    /\b(booked|scheduled|set up|setup|locked in|got on(?: the)? calendar|made (?:the |an? )?appointment|got (?:the )?call booked)\b/;
  const bookingContext =
    /\b(call|appointment|calendar|discovery|meeting|consult|consultation|session)\b/;

  return (
    firstPersonBooking.test(lower) ||
    alreadyBooked.test(lower) ||
    (completedAction.test(lower) && bookingContext.test(lower))
  );
}

function bookingConfirmationReply() {
  return {
    reply:
      `Perfect, glad you got it booked. Before the call, go through this free training so you have a better feel for the opportunity: ${TRAINING_PLAYLIST_URL}`,
    needs_review: false,
    handled: true
  };
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

function publicStats(stats) {
  const { prospect_keys: prospectKeys = [], ...counters } = stats || {};

  return {
    ...counters,
    prospects_touched: Array.isArray(prospectKeys)
      ? prospectKeys.length
      : Number(counters.prospects_touched || 0)
  };
}

function getAllTimeStats(store) {
  const totals = {
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
  const prospectKeys = new Set();

  for (const stats of Object.values(store.dailyStats || {})) {
    const normalizedStats = stats && typeof stats === "object" ? stats : {};

    for (const key of Array.isArray(normalizedStats.prospect_keys)
      ? normalizedStats.prospect_keys
      : []) {
      prospectKeys.add(key);
    }

    for (const key of [
      "ai_replies_sent",
      "manual_approvals_sent",
      "auto_replies_sent",
      "drafts_created",
      "training_links_sent",
      "youtube_links_sent",
      "booking_links_sent",
      "followups_sent"
    ]) {
      totals[key] += Number(normalizedStats[key] || 0);
    }
  }

  totals.prospect_keys = [...prospectKeys];
  totals.prospects_touched = totals.prospect_keys.length;
  return totals;
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
  const hasYoutube =
    replyText.includes(YOUTUBE_URL) ||
    replyText.includes(TRAINING_PLAYLIST_URL) ||
    replyText.includes("youtube.com/");
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
    lead_status: memory.lead_status || classifyLeadStatus(memory),
    stored_message_count: memory.last_messages.length,
    recent_messages: memory.last_messages.slice(-MAX_PROMPT_MEMORY_MESSAGES),
    questions_asked: memory.questions_asked,
    youtube_link_sent: Boolean(memory.youtube_link_sent),
    training_link_sent: Boolean(memory.training_link_sent),
    booking_link_sent: Boolean(memory.booking_link_sent),
    booking_confirmed: Boolean(memory.booking_confirmed),
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

function publicConversation(memory, settings = {}) {
  refreshMemorySummary(memory);
  const messages = Array.isArray(memory.last_messages) ? memory.last_messages : [];
  const lastMessage = messages[messages.length - 1] || null;

  return {
    key: memory.key,
    provider: memory.provider || "kommo",
    contact_id: memory.contact_id || "",
    talk_id: memory.current_talk_id || "",
    origin: memory.origin || "",
    lead_status: memory.lead_status || classifyLeadStatus(memory),
    summary: memory.summary || "",
    last_message: lastMessage,
    last_incoming_at: memory.last_incoming_at || "",
    last_outgoing_at: memory.last_outgoing_at || "",
    last_outgoing_source: memory.last_outgoing_source || "",
    ai_paused: Boolean(settings.paused || memory.ai_paused),
    manual_takeover_active: isManualTakeoverActive(settings) || isManualTakeoverActive(memory),
    manual_takeover_until:
      settings.manual_takeover_until || memory.manual_takeover_until || null,
    booking_link_sent: Boolean(memory.booking_link_sent),
    training_link_sent: Boolean(memory.training_link_sent),
    booking_confirmed: Boolean(memory.booking_confirmed),
    follow_up: memory.follow_up || {}
  };
}

function parseTranscriptForTest(transcript) {
  return String(transcript || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const match = line.match(/^(prospect|lead|customer|user|you|me|assistant|ai|bot)\s*:\s*(.+)$/i);
      const label = match ? match[1].toLowerCase() : "";
      const text = match ? match[2] : line;
      const role = ["you", "me", "assistant", "ai", "bot"].includes(label)
        ? "assistant"
        : "user";

      return {
        id: `test-${index + 1}`,
        role,
        text,
        created_at: new Date().toISOString()
      };
    });
}

function testMemoryFromThread(thread) {
  const memory = {
    key: "test-mode",
    provider: "test",
    summary: "",
    last_messages: thread.map((message) => ({
      role: message.role,
      text: message.text,
      at: message.created_at,
      id: message.id,
      source: message.role === "assistant" ? "manual" : ""
    })),
    questions_asked: [],
    youtube_link_sent: false,
    training_link_sent: false,
    booking_link_sent: false,
    booking_confirmed: false,
    lead_status: "cold",
    follow_up: { active: false, count: 0 }
  };

  updateLinkMemory(memory, memory.last_messages.map((message) => message.text).join("\n"));
  memory.booking_confirmed = isBookingConfirmation(
    memory.last_messages
      .filter((message) => message.role === "user")
      .map((message) => message.text)
      .join("\n")
  );
  refreshMemorySummary(memory);

  return memory;
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
    "message.accountId",
    "message.account_id",
    "account.id",
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
    "message.direction",
    "direction"
  ]);
  const platform = pickValue(payload, [
    "data.platform",
    "data.account.platform",
    "message.platform",
    "account.platform",
    "platform"
  ]);
  const senderId = pickValue(payload, [
    "data.sender.contactId",
    "data.sender.id",
    "data.senderId",
    "data.sender_id",
    "data.participantId",
    "data.participant_id",
    "message.sender.contactId",
    "message.sender.id",
    "message.sender.username",
    "message.participantId",
    "message.participant_id",
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

function firstTextValue(...values) {
  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }

    if (typeof value === "string" || typeof value === "number") {
      const text = String(value).trim();
      if (text) {
        return text;
      }
    }
  }

  return "";
}

function parseMessageTimestamp(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return asNumber < 10_000_000_000 ? asNumber * 1000 : asNumber;
  }

  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

function zernioMessageText(message) {
  return firstTextValue(
    message.message,
    message.text,
    message.body,
    message.content?.text,
    message.content?.body,
    message.payload?.text,
    message.payload?.body,
    message.message?.text,
    message.message?.body
  );
}

function normalizeZernioMessages(responseBody) {
  const rawMessages =
    responseBody?.messages ||
    responseBody?.data?.messages ||
    responseBody?.data?.items ||
    responseBody?.items ||
    responseBody?.result?.messages ||
    responseBody?.data ||
    [];
  const messages = Array.isArray(rawMessages) ? rawMessages : [];

  return messages
    .map((message) => {
      const direction = normalizeDirection(message.direction);
      const createdAt = parseMessageTimestamp(
        message.createdAt ||
          message.created_at ||
          message.timestamp ||
          message.sentAt ||
          message.sent_at ||
          message.deliveredAt ||
          message.delivered_at
      );

      return {
        id: message.id || message.messageId || message.message_id || message._id || "",
        role: direction === "incoming" ? "user" : "assistant",
        text: zernioMessageText(message),
        created_at: createdAt
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
  if (!conversationId) {
    return [];
  }

  const resolvedAccountId = accountId || process.env.ZERNIO_ACCOUNT_ID;
  if (!resolvedAccountId) {
    throw new Error(
      "Missing Zernio account id for conversation history. Set ZERNIO_ACCOUNT_ID in DigitalOcean or confirm the Zernio webhook includes accountId."
    );
  }

  const params = new URLSearchParams({
    accountId: resolvedAccountId,
    limit: "50",
    sortOrder: "asc"
  });
  const responseBody = await zernioRequest(
    `/inbox/conversations/${encodeURIComponent(conversationId)}/messages?${params.toString()}`,
    { method: "GET" }
  );

  const messages = normalizeZernioMessages(responseBody);
  console.log(
    `Loaded Zernio conversation history for conversation_id=${conversationId}: ${messages.length} message(s).`
  );
  return messages;
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
  const promptMemory = memoryForPrompt(memory, featureSettings);
  const businessKnowledge = await loadKnowledgeBase();
  const payload = {
    conversation_history: thread.slice(-30),
    conversation_memory: promptMemory,
    business_knowledge: businessKnowledge || null,
    context_status: {
      provider: newMessage.provider || "kommo",
      history_messages_loaded: thread.length,
      memory_messages_loaded: promptMemory?.recent_messages?.length || 0,
      business_knowledge_loaded: Boolean(businessKnowledge)
    },
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
            "Use conversation_history and conversation_memory to understand where the conversation is and avoid repeating links or qualifying questions.\n" +
            "Use business_knowledge for Pallet Pros facts and voice, but do not invent missing details.\n" +
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
  await recordPendingAppOutgoing(messageLike, replyText);

  if (messageLike.provider === "zernio") {
    return sendReplyToZernio(messageLike, replyText, featureSettings);
  }

  return sendReplyToKommo(messageLike.talk_id || messageLike.current_talk_id, replyText);
}

async function generateFollowUpReply(memory, featureSettings) {
  const followUpNumber = Number(memory.follow_up?.count || 0) + 1;
  const businessKnowledge = await loadKnowledgeBase();
  const payload = {
    follow_up_number: followUpNumber,
    original_question: memory.follow_up?.question_text || "",
    conversation_memory: memoryForPrompt(memory, featureSettings),
    business_knowledge: businessKnowledge || null
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
            "Do not ask more than one question. Use business_knowledge for Pallet Pros voice. Return JSON only.\n" +
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
    if (isBookingConfirmation(incoming.text)) {
      memory.booking_confirmed = true;
      memory.booking_link_sent = true;
    }
    cancelFollowUp(memory);
    addMemoryMessage(memory, {
      role: "user",
      text: incoming.text,
      at: incomingAt,
      id: incoming.incoming_message_id
    });
    refreshMemorySummary(memory);
  }

  await writeStore(store);

  return { duplicate, memory, conversationKey: memory.key };
}

async function recordOutgoingForMemory(messageLike, replyText, options = {}) {
  const store = await readStore();
  const featureSettings = getFeatureSettings(store);
  const memory = getConversationMemory(store, messageLike);
  const conversationKey = memory.key || makeConversationKey(messageLike);
  const sentAtMs = Date.now();
  const sentAt = new Date(sentAtMs).toISOString();
  const source = options.source || "ai";
  const replyComparable = comparableText(replyText);

  memory.pending_app_outgoing = memory.pending_app_outgoing.filter((item) => {
    const itemAtMs = item.at ? Date.parse(String(item.at)) : 0;
    const isExpired = !itemAtMs || sentAtMs - itemAtMs > APP_OUTGOING_ECHO_WINDOW_MS;
    const isSameText = comparableText(item.text) === replyComparable;
    return !isExpired && !isSameText;
  });
  addMemoryMessage(memory, {
    role: "assistant",
    text: replyText,
    at: sentAt,
    id: options.messageId || "",
    source
  });
  memory.last_outgoing_at = sentAt;
  memory.last_outgoing_source = source;
  updateLinkMemory(memory, replyText);
  updateQuestionMemory(memory, replyText);
  scheduleFollowUpIfNeeded(memory, replyText, sentAtMs, featureSettings);
  refreshMemorySummary(memory);

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

async function recordPendingAppOutgoing(messageLike, replyText) {
  const cleanReply = String(replyText || "").trim();
  if (!cleanReply) {
    return;
  }

  const store = await readStore();
  const memory = getConversationMemory(store, messageLike);
  const nowMs = Date.now();

  memory.pending_app_outgoing = memory.pending_app_outgoing
    .filter((item) => {
      const itemAtMs = item.at ? Date.parse(String(item.at)) : 0;
      return itemAtMs && nowMs - itemAtMs <= APP_OUTGOING_ECHO_WINDOW_MS;
    })
    .slice(-8);

  memory.pending_app_outgoing.push({
    text: cleanReply.slice(0, 1200),
    at: new Date(nowMs).toISOString()
  });

  await writeStore(store);
}

function isRecentAppOutgoingEcho(memory, outgoing) {
  const outgoingText = comparableText(outgoing.text);

  if (!memory || !outgoingText) {
    return false;
  }

  const outgoingId = outgoing.incoming_message_id || outgoing.message_id || "";
  const pendingMatches = Array.isArray(memory.pending_app_outgoing)
    ? memory.pending_app_outgoing.some((item) => {
        const itemAtMs = item.at ? Date.parse(String(item.at)) : 0;
        return (
          itemAtMs > 0 &&
          Date.now() - itemAtMs <= APP_OUTGOING_ECHO_WINDOW_MS &&
          comparableText(item.text) === outgoingText
        );
      })
    : false;

  if (pendingMatches) {
    return true;
  }

  const recentMessages = Array.isArray(memory.last_messages)
    ? memory.last_messages.slice(-8).reverse()
    : [];

  return recentMessages.some((message) => {
    if (message.role !== "assistant" || !appOutgoingSource(message.source)) {
      return false;
    }

    if (outgoingId && message.id && String(message.id) === String(outgoingId)) {
      return true;
    }

    const messageText = comparableText(message.text);
    if (!messageText || messageText !== outgoingText) {
      return false;
    }

    const messageAtMs = message.at ? Date.parse(String(message.at)) : 0;
    return messageAtMs > 0 && Date.now() - messageAtMs <= APP_OUTGOING_ECHO_WINDOW_MS;
  });
}

async function processManualOutgoingMessage(outgoing) {
  if (!outgoing.text) {
    console.log("Manual takeover ignored: sent webhook had no text.");
    return;
  }

  const store = await readStore();
  const provider = normalizeProvider(outgoing.provider);

  if (!isProviderEnabled(store, provider)) {
    console.log(`Manual takeover ignored: ${provider} provider is disabled.`);
    return;
  }

  const memory = getConversationMemory(store, outgoing);
  const duplicate = markProcessedMessage(memory, outgoing.incoming_message_id);

  if (duplicate) {
    console.log(`Manual takeover ignored: duplicate sent message ${outgoing.incoming_message_id}.`);
    await writeStore(store);
    return;
  }

  if (isRecentAppOutgoingEcho(memory, outgoing)) {
    console.log(`Manual takeover ignored: app sent echo for talk_id=${outgoing.talk_id}.`);
    await writeStore(store);
    return;
  }

  const sentAtMs = toMessageTimestampMs(outgoing.created_at);
  const sentAt = new Date(sentAtMs).toISOString();
  const takeoverUntil = new Date(Date.now() + manualTakeoverMs()).toISOString();
  const settings = getConversationSettings(store, outgoing.talk_id);

  cancelFollowUp(memory);
  addMemoryMessage(memory, {
    role: "assistant",
    text: outgoing.text,
    at: sentAt,
    id: outgoing.incoming_message_id,
    source: "manual"
  });
  updateLinkMemory(memory, outgoing.text);
  updateQuestionMemory(memory, outgoing.text);
  memory.last_outgoing_at = sentAt;
  memory.last_outgoing_source = "manual";
  memory.ai_paused = true;
  memory.manual_takeover_since = sentAt;
  memory.manual_takeover_until = takeoverUntil;
  refreshMemorySummary(memory);

  settings.manual_takeover_since = sentAt;
  settings.manual_takeover_until = takeoverUntil;
  settings.manual_takeover_reason = "Manual Zernio reply detected.";

  await writeStore(store);
  console.log(
    `Manual takeover active for talk_id=${outgoing.talk_id} until ${takeoverUntil}.`
  );
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
        !memoryAutomationPaused(memory) &&
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

  if (!memory || !memory.follow_up?.active || memoryAutomationPaused(memory)) {
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
    id: `follow-up-${nextCount}`,
    source: "follow_up"
  });
  updateLinkMemory(updatedMemory, replyText);
  updateQuestionMemory(updatedMemory, replyText);
  updatedMemory.last_outgoing_at = new Date().toISOString();
  updatedMemory.last_outgoing_source = "follow_up";
  updatedMemory.follow_up.count = nextCount;
  updatedMemory.follow_up.last_sent_at = new Date().toISOString();
  refreshMemorySummary(updatedMemory);

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

  const ruleBasedReply = isBookingConfirmation(incoming.text)
    ? bookingConfirmationReply()
    : appointmentSetterRuleReply(memory, incoming);

  if (ruleBasedReply) {
    const store = await readStore();
    const settings = getConversationSettings(store, incoming.talk_id);
    const holdReason = conversationHoldReason(settings);
    await writeStore(store);

    const shouldAutoSendRuleReply =
      isAutoSendEnabled(featureSettings) &&
      !holdReason &&
      ruleBasedReply.needs_review === false &&
      Boolean(ruleBasedReply.reply);

    if (shouldAutoSendRuleReply) {
      try {
        await sendReply(incoming, ruleBasedReply.reply, featureSettings);
        await recordOutgoingForMemory(incoming, ruleBasedReply.reply, { source: "auto" });
        console.log(`Auto-sent rule-based reply for talk_id=${incoming.talk_id}.`);
        return;
      } catch (error) {
        console.error(`Rule-based auto-send failed for talk_id=${incoming.talk_id}:`, error);
      }
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
      reply: ruleBasedReply.reply,
      needs_review: true,
      reason: shouldAutoSendRuleReply
        ? "Rule-based auto-send failed; saved for review."
        : holdReason || "Appointment setter flow handled."
    });

    console.log(`Saved rule-based draft for talk_id=${incoming.talk_id}.`);
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
  const holdReason = conversationHoldReason(settings);
  await writeStore(store);

  const shouldAutoSend =
    isAutoSendEnabled(featureSettings) &&
    !holdReason &&
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
    reason:
      contextWarning ||
      holdReason ||
      (aiReply.needs_review ? "AI requested review." : "AUTO_SEND is not true.")
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

    if (incoming.event_type === "message.sent") {
      processManualOutgoingMessage(incoming).catch((error) => {
        console.error("Zernio sent-message processing failed:", error);
      });
      return;
    }

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
    const allTimeStats = getAllTimeStats(store);
    const providerSettings = getProviderSettings(store);
    const featureSettings = getFeatureSettings(store);
    const businessKnowledge = await loadKnowledgeBase();
    const delayBounds = humanSendDelayBounds(featureSettings);

    res.json({
      day,
      stats: publicStats(stats),
      today_stats: publicStats(stats),
      all_time_stats: publicStats(allTimeStats),
      settings: {
        auto_send: isAutoSendEnabled(featureSettings),
        humanize_replies_enabled: isHumanizeRepliesEnabled(featureSettings),
        typing_indicator_enabled: isTypingIndicatorEnabled(featureSettings),
        human_send_delay_enabled: isHumanSendDelayEnabled(featureSettings),
        conversation_memory_enabled: isConversationMemoryEnabled(featureSettings),
        follow_ups_enabled: isFollowUpsEnabled(featureSettings),
        zernio_configured: Boolean(process.env.ZERNIO_API_KEY),
        knowledge_base_configured: Boolean(businessKnowledge),
        manual_takeover_minutes: numberEnv(
          "MANUAL_TAKEOVER_MINUTES",
          DEFAULT_MANUAL_TAKEOVER_MINUTES
        ),
        human_send_delay_min_ms: delayBounds.minMs,
        human_send_delay_max_ms: delayBounds.maxMs,
        follow_up_offsets_minutes: FOLLOW_UP_OFFSETS_MS.map((offsetMs) =>
          Math.round(offsetMs / 60_000)
        ),
        memory_store_messages: MAX_RECENT_MEMORY_MESSAGES,
        memory_prompt_messages: MAX_PROMPT_MEMORY_MESSAGES,
        custom_data_dir: Boolean(process.env.DATA_DIR),
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

app.post("/api/delay", async (req, res, next) => {
  try {
    const minMs = Math.round(Number(req.body.min_ms));
    const maxMs = Math.round(Number(req.body.max_ms));

    if (!Number.isFinite(minMs) || !Number.isFinite(maxMs) || minMs < 0 || maxMs < minMs) {
      res.status(400).json({
        ok: false,
        error: "Delay must be valid milliseconds, and max_ms must be greater than min_ms."
      });
      return;
    }

    const store = await readStore();
    const featureSettings = getFeatureSettings(store);
    featureSettings.human_send_delay_min_ms = minMs;
    featureSettings.human_send_delay_max_ms = maxMs;
    await writeStore(store);

    res.json({
      ok: true,
      delay: humanSendDelayBounds(getFeatureSettings(store)),
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

app.get("/api/conversations", async (_req, res, next) => {
  try {
    const store = await readStore();
    const conversations = Object.values(store.conversations)
      .map((memory) =>
        publicConversation(
          memory,
          getConversationSettings(store, memory.current_talk_id)
        )
      )
      .sort((a, b) => {
        const left = Date.parse(b.last_incoming_at || b.last_outgoing_at || 0);
        const right = Date.parse(a.last_incoming_at || a.last_outgoing_at || 0);
        return left - right;
      });

    await writeStore(store);
    res.json({ conversations });
  } catch (error) {
    next(error);
  }
});

app.post("/api/conversations/:key/pause", async (req, res, next) => {
  try {
    const store = await readStore();
    const memory = store.conversations[req.params.key];

    if (!memory) {
      res.status(404).json({ ok: false, error: "Conversation not found" });
      return;
    }

    const settings = getConversationSettings(store, memory.current_talk_id);
    settings.paused = true;
    settings.manual_takeover_reason = "Paused from dashboard.";
    memory.ai_paused = true;
    refreshMemorySummary(memory);

    await writeStore(store);
    res.json({ ok: true, conversation: publicConversation(memory, settings) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/conversations/:key/resume", async (req, res, next) => {
  try {
    const store = await readStore();
    const memory = store.conversations[req.params.key];

    if (!memory) {
      res.status(404).json({ ok: false, error: "Conversation not found" });
      return;
    }

    const settings = getConversationSettings(store, memory.current_talk_id);
    settings.paused = false;
    settings.manual_takeover_until = null;
    settings.manual_takeover_since = null;
    settings.manual_takeover_reason = "";
    memory.ai_paused = false;
    memory.manual_takeover_until = null;
    memory.manual_takeover_since = null;
    refreshMemorySummary(memory);

    await writeStore(store);
    res.json({ ok: true, conversation: publicConversation(memory, settings) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/feedback", async (req, res, next) => {
  try {
    const type = String(req.body.type || "").trim().slice(0, 40);
    const note = String(req.body.note || "").trim().slice(0, 500);

    if (!type) {
      res.status(400).json({ ok: false, error: "Feedback type is required." });
      return;
    }

    const store = await readStore();
    store.feedback.push({
      id: crypto.randomUUID(),
      type,
      note,
      conversation_key: String(req.body.conversation_key || ""),
      draft_id: String(req.body.draft_id || ""),
      reply: String(req.body.reply || "").slice(0, 2000),
      incoming_text: String(req.body.incoming_text || "").slice(0, 2000),
      created_at: new Date().toISOString()
    });
    store.feedback = store.feedback.slice(-500);

    await writeStore(store);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/test-reply", async (req, res, next) => {
  try {
    const transcript = String(req.body.transcript || "").trim();
    const newText = String(req.body.new_message || "").trim();

    if (!transcript && !newText) {
      res.status(400).json({ ok: false, error: "Add a transcript or a new message." });
      return;
    }

    const featureSettings = getFeatureSettings(await readStore());
    const thread = parseTranscriptForTest(transcript);
    const newMessage = {
      provider: "test",
      text: newText || thread[thread.length - 1]?.text || "",
      origin: "instagram_business"
    };
    const memory = testMemoryFromThread(thread);
    const ruleBasedReply = isBookingConfirmation(newMessage.text)
      ? bookingConfirmationReply()
      : appointmentSetterRuleReply(memory, newMessage);

    if (ruleBasedReply) {
      res.json({
        ok: true,
        lead_status: memory.lead_status,
        reply: ruleBasedReply.reply,
        needs_review: ruleBasedReply.needs_review,
        source: "rule"
      });
      return;
    }

    const aiReply = await generateReply({
      thread,
      newMessage,
      contextWarning: "",
      memory,
      featureSettings
    });

    res.json({
      ok: true,
      lead_status: memory.lead_status,
      reply: aiReply.reply,
      needs_review: aiReply.needs_review,
      source: "ai"
    });
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
      grid-template-columns: repeat(4, minmax(0, 1fr));
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

    .stat small {
      color: #40516d;
      display: block;
      font-size: 11px;
      margin-top: 2px;
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

    .delay-controls {
      align-items: center;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: -6px 0 16px;
      padding: 10px;
    }

    .delay-controls label {
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }

    .delay-controls input {
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font: inherit;
      min-height: 36px;
      padding: 0 10px;
      width: 92px;
    }

    .section-title {
      align-items: center;
      display: flex;
      justify-content: space-between;
      margin: 24px 0 10px;
    }

    .section-title h2 {
      font-size: 18px;
      margin: 0;
    }

    .section-note {
      color: var(--muted);
      font-size: 13px;
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

    .draft,
    .conversation,
    .test-panel {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
    }

    .conversation-list {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .conversation {
      display: grid;
      gap: 10px;
    }

    .pill {
      background: #eef1f6;
      border-radius: 999px;
      color: #40516d;
      display: inline-flex;
      font-size: 12px;
      font-weight: 700;
      padding: 3px 8px;
      text-transform: uppercase;
    }

    .pill.hot { background: #fff0d8; color: #7a4b00; }
    .pill.booked { background: #e9f7ef; color: #0c6246; }
    .pill.not_fit { background: #fff1f1; color: #8f2424; }
    .pill.qualified { background: #eaf0ff; color: #254aa5; }

    .summary,
    .test-result {
      color: #364154;
      font-size: 13px;
      white-space: pre-wrap;
    }

    .feedback-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 10px;
    }

    .feedback,
    .secondary {
      background: #40516d;
      min-height: 34px;
      padding: 0 12px;
    }

    .pause { background: #75520f; }
    .resume { background: #13795b; }

    .test-grid {
      display: grid;
      gap: 10px;
      grid-template-columns: 1fr 1fr;
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

    @media (max-width: 760px) {
      main {
        width: min(100% - 16px, 980px);
        margin: 14px auto 28px;
      }

      header,
      .section-title {
        align-items: flex-start;
        flex-direction: column;
      }

      #status {
        text-align: left;
      }

      .stats-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .conversation-list,
      .test-grid {
        grid-template-columns: 1fr;
      }

      .actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
      }

      .provider-toggle,
      .feedback {
        flex: 1 1 calc(50% - 8px);
      }
    }

    @media (max-width: 420px) {
      h1 {
        font-size: 21px;
      }

      .stat {
        min-height: 68px;
        padding: 10px;
      }

      .stat strong {
        font-size: 20px;
      }

      button {
        min-height: 44px;
        padding: 0 12px;
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
    <section id="delay-controls" class="delay-controls" aria-label="Send delay controls"></section>
    <section class="section-title">
      <h2>Operator Cockpit</h2>
      <span class="section-note">Pause a lead when you want to handle it yourself.</span>
    </section>
    <section id="conversations" class="conversation-list"></section>
    <section class="section-title">
      <h2>Test Reply</h2>
      <span class="section-note">Preview the AI before sending anything.</span>
    </section>
    <section class="test-panel">
      <div class="test-grid">
        <textarea id="test-transcript" aria-label="Test transcript" placeholder="Prospect: I booked the call&#10;You: Perfect"></textarea>
        <textarea id="test-new-message" aria-label="Newest test message" placeholder="Newest prospect message"></textarea>
      </div>
      <div class="actions">
        <button id="test-button" class="secondary" type="button">Preview Reply</button>
      </div>
      <div id="test-result" class="test-result"></div>
    </section>
    <section class="section-title">
      <h2>Pending Drafts</h2>
      <span class="section-note">Edit, send, discard, or tag the draft quality.</span>
    </section>
    <section id="drafts" class="draft-list"></section>
  </main>

  <script>
    const conversationsEl = document.getElementById("conversations");
    const draftsEl = document.getElementById("drafts");
    const delayControlsEl = document.getElementById("delay-controls");
    const featuresEl = document.getElementById("features");
    const flagsEl = document.getElementById("flags");
    const providersEl = document.getElementById("providers");
    const statsEl = document.getElementById("stats");
    const statusEl = document.getElementById("status");
    const testButton = document.getElementById("test-button");
    const testTranscript = document.getElementById("test-transcript");
    const testNewMessage = document.getElementById("test-new-message");
    const testResult = document.getElementById("test-result");

    function setStatus(message) {
      statusEl.textContent = message || "";
    }

    function formatDate(value) {
      if (!value) return "";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";
      return date.toLocaleString();
    }

    function formatMinutes(value) {
      const minutes = Number(value || 0);
      if (!minutes) return "0m";
      if (minutes >= 60 && minutes % 60 === 0) return minutes / 60 + "h";
      return minutes + "m";
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
      const today = data.today_stats || data.stats || {};
      const allTime = data.all_time_stats || data.stats || {};
      const settings = data.settings || {};
      const cards = [
        ["Prospects", allTime.prospects_touched || 0, "all-time"],
        ["AI replies", allTime.ai_replies_sent || 0, "all-time"],
        ["Training/YouTube", allTime.youtube_links_sent || 0, "all-time"],
        ["Booking links", allTime.booking_links_sent || 0, "all-time"],
        ["Prospects", today.prospects_touched || 0, "today"],
        ["AI replies", today.ai_replies_sent || 0, "today"],
        ["Drafts", today.drafts_created || 0, "today"],
        ["Follow-ups", today.followups_sent || 0, "today"]
      ];

      statsEl.innerHTML = "";
      cards.forEach(([label, value, range]) => {
        const card = document.createElement("div");
        card.className = "stat";

        const strong = document.createElement("strong");
        strong.textContent = value;

        const span = document.createElement("span");
        span.textContent = label;

        const small = document.createElement("small");
        small.textContent = range;

        card.append(strong, span, small);
        statsEl.appendChild(card);
      });

      flagsEl.innerHTML = "";
      [
        ["Auto-send", settings.auto_send],
        ["Humanize", settings.humanize_replies_enabled],
        ["Typing", settings.typing_indicator_enabled],
        ["Delay", settings.human_send_delay_enabled],
        ["Memory", settings.conversation_memory_enabled],
        ["Follow-ups", settings.follow_ups_enabled],
        ["Zernio key", settings.zernio_configured],
        ["Knowledge", settings.knowledge_base_configured],
        ["Manual hold", (settings.manual_takeover_minutes || 0) + "m"],
        [
          "Send delay",
          Math.round((settings.human_send_delay_min_ms || 0) / 100) / 10 +
            "-" +
            Math.round((settings.human_send_delay_max_ms || 0) / 100) / 10 +
            "s"
        ],
        [
          "Nudges",
          (settings.follow_up_offsets_minutes || []).map(formatMinutes).join("/")
        ],
        [
          "Memory depth",
          (settings.memory_prompt_messages || 0) +
            "/" +
            (settings.memory_store_messages || 0)
        ]
      ].forEach(([label, value]) => {
        const flag = document.createElement("span");
        flag.className = "flag";
        flag.textContent =
          label + ": " + (typeof value === "boolean" ? (value ? "on" : "off") : value);
        flagsEl.appendChild(flag);
      });

      renderProviderControls(settings);
      renderFeatureControls(settings);
      renderDelayControls(settings);
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

    function secondsFromMs(value) {
      return Math.round(Number(value || 0) / 100) / 10;
    }

    function renderDelayControls(settings) {
      delayControlsEl.innerHTML = "";

      const minInput = document.createElement("input");
      minInput.type = "number";
      minInput.min = "0";
      minInput.step = "0.5";
      minInput.value = secondsFromMs(settings.human_send_delay_min_ms || 0);
      minInput.setAttribute("aria-label", "Minimum delay seconds");

      const maxInput = document.createElement("input");
      maxInput.type = "number";
      maxInput.min = "0";
      maxInput.step = "0.5";
      maxInput.value = secondsFromMs(settings.human_send_delay_max_ms || 0);
      maxInput.setAttribute("aria-label", "Maximum delay seconds");

      const label = document.createElement("label");
      label.textContent = "Send delay seconds";

      const saveButton = document.createElement("button");
      saveButton.className = "provider-toggle is-on";
      saveButton.type = "button";
      saveButton.textContent = "Save";

      const quickButton = document.createElement("button");
      quickButton.className = "provider-toggle";
      quickButton.type = "button";
      quickButton.textContent = "Use 2.5-7s";

      async function saveDelay(minSeconds, maxSeconds) {
        saveButton.disabled = true;
        quickButton.disabled = true;
        setStatus("Saving delay...");
        try {
          await api("/api/delay", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              min_ms: Math.round(Number(minSeconds) * 1000),
              max_ms: Math.round(Number(maxSeconds) * 1000)
            })
          });
          await loadDrafts({ silent: true });
          setStatus("Delay saved.");
        } catch (error) {
          setStatus(error.message);
          saveButton.disabled = false;
          quickButton.disabled = false;
        }
      }

      saveButton.addEventListener("click", () => {
        saveDelay(minInput.value, maxInput.value);
      });

      quickButton.addEventListener("click", () => {
        minInput.value = "2.5";
        maxInput.value = "7";
        saveDelay(2.5, 7);
      });

      delayControlsEl.append(label, minInput, maxInput, saveButton, quickButton);
    }

    function statusLabel(value) {
      return String(value || "cold").replace("_", " ");
    }

    async function saveFeedback(payload) {
      await api("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      setStatus("Feedback saved.");
    }

    function renderFeedbackButtons(payloadFactory) {
      const row = document.createElement("div");
      row.className = "feedback-row";

      [
        ["good", "Good"],
        ["robotic", "Robotic"],
        ["pushy", "Pushy"],
        ["wrong_context", "Wrong context"]
      ].forEach(([type, label]) => {
        const button = document.createElement("button");
        button.className = "feedback";
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await saveFeedback({ ...payloadFactory(), type });
          } catch (error) {
            setStatus(error.message);
            button.disabled = false;
          }
        });
        row.appendChild(button);
      });

      return row;
    }

    function renderConversation(conversation) {
      const article = document.createElement("article");
      article.className = "conversation";

      const meta = document.createElement("div");
      meta.className = "meta";

      const pill = document.createElement("span");
      pill.className = "pill " + (conversation.lead_status || "cold");
      pill.textContent = statusLabel(conversation.lead_status);
      meta.appendChild(pill);

      [
        conversation.provider,
        conversation.talk_id ? "Talk " + conversation.talk_id : "",
        conversation.origin || "",
        conversation.ai_paused ? "Paused" : "",
        conversation.manual_takeover_active ? "Manual hold" : ""
      ].filter(Boolean).forEach((field) => {
        const span = document.createElement("span");
        span.textContent = field;
        meta.appendChild(span);
      });

      const summary = document.createElement("div");
      summary.className = "summary";
      summary.textContent =
        conversation.summary ||
        (conversation.last_message ? conversation.last_message.text : "No memory yet.");

      const actions = document.createElement("div");
      actions.className = "actions";

      const paused = Boolean(conversation.ai_paused || conversation.manual_takeover_active);
      const pauseButton = document.createElement("button");
      pauseButton.className = paused ? "resume" : "pause";
      pauseButton.type = "button";
      pauseButton.textContent = paused ? "Resume AI" : "Pause AI";
      pauseButton.addEventListener("click", async () => {
        pauseButton.disabled = true;
        setStatus(paused ? "Resuming conversation..." : "Pausing conversation...");
        try {
          await api(
            "/api/conversations/" +
              encodeURIComponent(conversation.key) +
              (paused ? "/resume" : "/pause"),
            { method: "POST" }
          );
          await loadDrafts();
          setStatus(paused ? "Conversation resumed." : "Conversation paused.");
        } catch (error) {
          setStatus(error.message);
          pauseButton.disabled = false;
        }
      });

      actions.appendChild(pauseButton);
      article.append(meta, summary, actions);
      return article;
    }

    function renderConversations(conversations) {
      conversationsEl.innerHTML = "";
      const visible = (conversations || []).slice(0, 8);

      if (visible.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No conversation memory yet.";
        conversationsEl.appendChild(empty);
        return;
      }

      visible.forEach((conversation) => {
        conversationsEl.appendChild(renderConversation(conversation));
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

      const feedback = renderFeedbackButtons(() => ({
        conversation_key: draft.conversation_key || "",
        draft_id: draft.id || "",
        incoming_text: draft.incoming_text || "",
        reply: textarea.value || ""
      }));

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
      article.append(meta, incoming, textarea, feedback, actions);
      return article;
    }

    async function loadDrafts(options = {}) {
      if (!options.silent) {
        setStatus("Loading...");
      }
      try {
        const [data, statsData, conversationsData] = await Promise.all([
          api("/api/drafts"),
          api("/api/stats"),
          api("/api/conversations")
        ]);
        renderStats(statsData);
        renderConversations(conversationsData.conversations || []);
        draftsEl.innerHTML = "";

        if (!data.drafts || data.drafts.length === 0) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = "No pending drafts.";
          draftsEl.appendChild(empty);
        } else {
          data.drafts.forEach((draft) => draftsEl.appendChild(renderDraft(draft)));
        }

        setStatus(data.drafts.length + " pending · live refresh on");
      } catch (error) {
        draftsEl.innerHTML = "";
        setStatus(error.message);
      }
    }

    testButton.addEventListener("click", async () => {
      testButton.disabled = true;
      testResult.textContent = "";
      setStatus("Generating preview...");
      try {
        const data = await api("/api/test-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: testTranscript.value,
            new_message: testNewMessage.value
          })
        });
        testResult.textContent =
          "Lead status: " +
          statusLabel(data.lead_status) +
          "\\nNeeds review: " +
          (data.needs_review ? "yes" : "no") +
          "\\n\\n" +
          data.reply;
        setStatus("Preview ready.");
      } catch (error) {
        setStatus(error.message);
      } finally {
        testButton.disabled = false;
      }
    });

    loadDrafts();
    setInterval(() => loadDrafts({ silent: true }), 10000);
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
