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
const SUPABASE_STATE_KEY = "default";
const SUPABASE_STATE_TABLE = process.env.SUPABASE_STATE_TABLE || "app_state";
const KNOWLEDGE_FILE = path.join(__dirname, "knowledge", "pallet-pros.md");
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const ZERNIO_BASE_URL = "https://zernio.com/api/v1";
const YOUTUBE_URL = "https://youtube.com/@palletprosacademy";
const BOOKING_URL = "https://www.tidycal.com/palletprosga/discovery";
const TRACKED_BOOKING_BASE_URL =
  process.env.TRACKED_BOOKING_BASE_URL || "https://go.palletprosacademy.com/discovery";
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v20.0";
const META_GRAPH_ACCESS_TOKEN =
  process.env.META_GRAPH_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN || "";
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
const CALENDAR_SEQUENCE_GAP_MS = 8 * 1000;
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
    zernio: { enabled: true }
  },
  featureSettings: {
    auto_send: true,
    follow_ups: true
  },
  conversations: {},
  linkClicks: [],
  bookingEvents: [],
  profileCache: {},
  automationEvents: [],
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
6. If the person asks a question or gives context, answer the question first and acknowledge the context before steering.
7. Do not over-qualify in DMs. Use the simple DM flow below, but let the conversation breathe when the person is asking real questions.
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

Core appointment-setting objective:
- The goal is not to have a long educational conversation in DMs. The goal is to identify real intent, answer enough to build trust, and move warm prospects to a Zoom/discovery call.
- If someone plainly says they want to start, learn, get started, schedule, book, or talk about the pallet business, treat them as warm and move toward the call quickly.
- The best-performing path is: interest -> Zoom call framing -> ask permission for calendar -> send calendar -> tell them to choose a time and you will verify it.
- Do not add extra qualification questions after a clear "I want to start" unless their message includes a real question or important context that needs a brief answer first.
- When a prospect gives a lot of context, mirror one concrete detail, answer one useful point, then steer back to a call where you can research their market and see whether the academy fits.
- The DM should feel like a confident human appointment setter, not a course explainer, FAQ bot, or coach.

Disqualify or redirect immediately to https://youtube.com/@palletprosacademy and do not continue qualifying if the person:
- Is unemployed with no capital or real plan.
- Is incarcerated.
- Is clearly just here for free content or curiosity.
- Is asking for load-finding or freight-dispatch help. This program does not find loads for drivers. It teaches the pallet business model and how to run it successfully.

Treat the lead as warmer if the person already:
- Owns a truck or trailer.
- Owns a business.
- Says they are ready to invest or ready to go.
- Says they want to start, want to learn the business, wants insight, or wants an appointment.

Best-performing DM flow:
1. First touch, if there is no prior context: "Thanks for the follow. Are you here for the content, or are you looking to start your own pallet business?"
2. If they ask questions, answer briefly and naturally. Do not ignore the question just to push the call.
3. If they give useful context, mirror one specific detail so they feel heard.
4. If they are only lightly curious or vague, ask one open-ended question like: "Is this business something you'd be interested in pursuing?"
5. If they say yes or clearly show they want to pursue it, invite them to a Zoom/discovery call so you can research their area, answer their questions, and see if Pallet Pros Academy would be a good fit for their goals.
6. Before sending the calendar link, ask permission in one short question: "Do you mind if I send you a link to my calendar?"
7. If they say yes, send the booking link and tell them to choose a date/time that works for them.
8. If they ask for a call, appointment, consultation, details, or scheduling directly, it is okay to send the booking link without asking permission again.
9. If they mention a day/time instead of booking through the link, politely tell them to use the link to choose their time.
10. If they ask for a direct phone call or share their phone number, tell them to book through the link instead.
11. If they say they booked, acknowledge it naturally and do not ask another qualifying question.
12. Do not force every interested person through the exact same script. The flow is a guide, not a word-for-word requirement.

Reply length rules:
- Default to 1 short sentence.
- Use 2 short sentences only when needed.
- Only use multiple lines when sending the booking link.
- Do not explain the whole program in DMs.
- Do not ask more than one question.
- If the prospect gives details about their market, truck, job, location, money, yards, contracts, prices, or current situation, do not ignore those details.
- If the prospect asks a question inside their message, answer that question before asking them to book or sending the calendar link.
- If they ask multiple questions, answer the most important one briefly and then guide them to the call.
- Do not repeat the same calendar ask, greeting, link message, or qualifying question in back-to-back replies.

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
- Prefer plain, confident phrases like "Got you", "Solid", "No problem", and "Sounds good" when they fit.
- Do not overuse "Great", "Perfect", "Awesome", or repeated upbeat openers.
- Avoid long coaching-style answers. This is an appointment-setting DM, not a sales page.
- Keep punctuation relaxed. Do not use an exclamation point in every reply.
- Never say or imply you are an AI, bot, automation, or typing.`;

const CONTEXT_RULES = `Context rules:
- Treat conversation_history and conversation_memory as the source of truth for where the conversation is.
- If the person refers to something they already did or you already sent, infer it from the prior messages instead of asking "for what?" or restarting the conversation.
- Do not repeat a greeting, link, or qualifying question that already happened unless the newest message clearly asks for it.
- Before writing, compare against recent assistant messages and avoid reusing the same wording.
- If the newest message contains a question, answer it directly and briefly before steering to the next step.
- When a prospect gives context, mirror one specific detail so the reply feels like it was written for them.
- Bare replies like "yes", "ok", "sounds good", "how?", or "interested" depend on the previous assistant question. Use the last assistant message to decide what they are agreeing to.
- If a bare reply cannot be confidently tied to the previous assistant question, set needs_review true instead of guessing.
- If they already said they want to start, learn the business, get started, schedule, book, or talk through details, do not ask multiple warm-up questions. Move to the Zoom/calendar permission step.
- Use one simple reason, timeline, or obstacle question only when the person is vague, lukewarm, or merely curious.
- If the history is missing, contradictory, or too thin to answer confidently, set needs_review true.`;

const SCENARIO_PLAYBOOK_RULES = `Scenario playbook:
- Price or cost question:
  Answer directly without sounding evasive. Say it depends on where they are starting and what level of help they need. If they push for a range, say options start as low as $37/month for people who are not business owners yet and can go up to $5,500 for existing business owners. Then steer to the call to see what makes sense for them.
- "How does this work?" or "What is the pallet business?":
  Give the short version: the academy helps them understand how to source, move, and sell pallets in their area. Do not teach the full model in DMs. Steer to a discovery call where their market can be researched.
- No truck yet:
  Do not disqualify immediately. Say a truck helps, but the first step is seeing whether their area has the opportunity. Move toward a discovery call if they are serious.
- Has a truck, trailer, business, warehouse, route, or pallet-yard access:
  Treat as warmer. Mirror the asset they have, then move toward the call quickly.
- No money, no capital, unemployed, or "I can't afford anything":
  Do not hard sell. If they have no capital or no plan, send them to YouTube. If they are serious but early, say YouTube is the best starting point for now.
- Location or market question:
  If they share a city/state or mention nearby yards/manufacturing, acknowledge it and say the call is where you can research that market properly. Ask permission for the calendar if they seem serious.
- Skeptical lead, "Is this legit?", "Does this really work?", or asks for proof:
  Acknowledge the skepticism. Say you run this business yourself and the call is to see whether the model makes sense in their area. Do not make income guarantees.
- Wants direct phone call or sends a phone number:
  Do not call directly. Tell them to use the calendar so the call is organized.
- Mentions a specific day/time instead of using the link:
  If the calendar link was already sent, tell them to use the link to choose the time. If the link was not sent and they clearly want to book, send the calendar link.
- Requests weekend call:
  Do not book Saturday or Sunday. Steer to a weekday and ask which weekday works or send the calendar link if appropriate.
- Already booked:
  Acknowledge naturally. Do not keep selling, re-qualifying, or sending the booking link again. If they ask another question, answer briefly and say you can cover it on the call.
- Missed call, needs to reschedule, or asks to rebook:
  Be understanding and send the calendar link again. Keep it short.
- Link sent but they keep asking broad questions:
  Answer one useful point, then nudge them back to the link so the details can be handled on the call.
- Content-only, curiosity-only, jokes, or not ready:
  Send them to youtube.com/@palletprosacademy and do not push a call.
- Load-finding, freight, dispatch, or trucking loads:
  Clarify that this is not load-finding or dispatch. It teaches the pallet business model. If they are not interested in pallets, send YouTube or disengage.
- Partner/spouse/family wants to discuss:
  Keep it warm. Say that makes sense, and the call can help them understand the opportunity clearly. Move toward the calendar if they are serious.
- Timeframe question like "How fast can I start?":
  Say it depends on their area, effort, and resources. The call is where you can look at what their first steps would be.
- Income question:
  Do not guarantee results. If useful, use the personal example from Standing facts and then steer back to the call.

Scenario priority:
1. Safety/disqualification and content-only redirects come first.
2. Answer direct questions briefly.
3. If serious intent is present, move toward Zoom/calendar.
4. Ask only one question.
5. Do not keep chatting when the next best step is clearly booking.`;

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

function isApprovalModeEnabled(settings) {
  return featureEnabled(settings, "approval_mode", "APPROVAL_MODE", false);
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

function manualTakeoverMinutes(settings) {
  const value = settings && Number.isFinite(Number(settings.manual_takeover_minutes))
    ? Number(settings.manual_takeover_minutes)
    : numberEnv("MANUAL_TAKEOVER_MINUTES", DEFAULT_MANUAL_TAKEOVER_MINUTES);

  return Math.max(0, value);
}

function manualTakeoverMs(settings) {
  return manualTakeoverMinutes(settings) * 60 * 1000;
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
    SCENARIO_PLAYBOOK_RULES,
    KNOWLEDGE_RULES,
    isHumanizeRepliesEnabled(settings) ? HUMAN_STYLE_RULES : ""
  ]
    .filter(Boolean)
    .join("\n\n");
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

function storeBackend() {
  const requested = String(process.env.STORE_BACKEND || "").toLowerCase();
  if (requested === "supabase") {
    return "supabase";
  }

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return "supabase";
  }

  return "json";
}

async function supabaseRestRequest(pathname, options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }

  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const body = text ? safeJsonParse(text) || text : null;

  if (!response.ok) {
    throw new Error(
      `Supabase REST ${response.status} ${response.statusText}: ${
        typeof body === "string" ? body : JSON.stringify(body)
      }`
    );
  }

  return body;
}

async function ensureSupabaseStore() {
  const rows = await supabaseRestRequest(
    `${encodeURIComponent(SUPABASE_STATE_TABLE)}?key=eq.${encodeURIComponent(
      SUPABASE_STATE_KEY
    )}&select=value`,
    { method: "GET" }
  );

  if (!Array.isArray(rows) || !rows.length) {
    let initialValue = DEFAULT_STORE;
    try {
      const raw = await fs.readFile(DATA_FILE, "utf8");
      initialValue = normalizeStore(JSON.parse(raw || "{}"));
    } catch {
      initialValue = DEFAULT_STORE;
    }

    await supabaseRestRequest(encodeURIComponent(SUPABASE_STATE_TABLE), {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        key: SUPABASE_STATE_KEY,
        value: initialValue,
        updated_at: new Date().toISOString()
      })
    });
  }
}

async function readStore() {
  if (storeBackend() === "supabase") {
    await ensureSupabaseStore();
    const rows = await supabaseRestRequest(
      `${encodeURIComponent(SUPABASE_STATE_TABLE)}?key=eq.${encodeURIComponent(
        SUPABASE_STATE_KEY
      )}&select=value`,
      { method: "GET" }
    );

    return normalizeStore(Array.isArray(rows) ? rows[0]?.value || {} : {});
  }

  await ensureStoreFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw || "{}");

  return normalizeStore(parsed);
}

async function writeStore(store) {
  if (storeBackend() === "supabase") {
    const normalized = normalizeStore(store);
    await supabaseRestRequest(encodeURIComponent(SUPABASE_STATE_TABLE), {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
          key: SUPABASE_STATE_KEY,
          value: normalized,
          updated_at: new Date().toISOString()
      })
    });

    return;
  }

  await fs.mkdir(DATA_DIR, { recursive: true });
  const tempFile = `${DATA_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(normalizeStore(store), null, 2));
  await fs.rename(tempFile, DATA_FILE);
}

function normalizeStore(store) {
  const parsed = store && typeof store === "object" ? store : {};
  const conversations =
    parsed.conversations && typeof parsed.conversations === "object"
      ? parsed.conversations
      : {};

  return {
    drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
    feedback: Array.isArray(parsed.feedback) ? parsed.feedback : [],
    conversationSettings:
      parsed.conversationSettings && typeof parsed.conversationSettings === "object"
        ? parsed.conversationSettings
        : {},
    providerSettings: normalizeProviderSettings(parsed.providerSettings),
    featureSettings: normalizeFeatureSettings(parsed.featureSettings),
    conversations: mergeSplitConversationMemories(conversations),
    linkClicks: Array.isArray(parsed.linkClicks) ? parsed.linkClicks : [],
    bookingEvents: Array.isArray(parsed.bookingEvents) ? parsed.bookingEvents : [],
    profileCache:
      parsed.profileCache && typeof parsed.profileCache === "object"
        ? parsed.profileCache
        : {},
    automationEvents: Array.isArray(parsed.automationEvents)
      ? parsed.automationEvents
      : [],
    dailyStats:
      parsed.dailyStats && typeof parsed.dailyStats === "object"
        ? parsed.dailyStats
        : {}
  };
}

function normalizeProvider(provider) {
  return String(provider || "").toLowerCase() === "test" ? "test" : "zernio";
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
  const manualMinutes = Math.max(
    0,
    Number.isFinite(Number(raw.manual_takeover_minutes))
      ? Number(raw.manual_takeover_minutes)
      : numberEnv("MANUAL_TAKEOVER_MINUTES", DEFAULT_MANUAL_TAKEOVER_MINUTES)
  );

  return {
    auto_send: featureEnabled(raw, "auto_send", "AUTO_SEND", false),
    approval_mode: featureEnabled(raw, "approval_mode", "APPROVAL_MODE", false),
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
    human_send_delay_max_ms: delayMaxMs,
    manual_takeover_minutes: manualMinutes
  };
}

function getFeatureSettings(store) {
  store.featureSettings = normalizeFeatureSettings(store.featureSettings);
  return store.featureSettings;
}

function normalizeProviderSettings(settings) {
  const raw = settings && typeof settings === "object" ? settings : {};

  return {
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
  if (providerName === "test") {
    return true;
  }
  return getProviderSettings(store).zernio.enabled !== false;
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

function recentAssistantMessages(memory, limit = 5) {
  return (Array.isArray(memory?.last_messages) ? memory.last_messages : [])
    .filter((message) => message.role === "assistant")
    .slice(-limit);
}

function replyRepeatsRecentAssistant(memory, replyText) {
  const reply = comparableText(replyText);

  if (!reply || reply.length < 18) {
    return false;
  }

  return recentAssistantMessages(memory).some((message) => {
    const previous = comparableText(message.text);

    if (!previous || previous.length < 18) {
      return false;
    }

    return (
      previous === reply ||
      (reply.length > 60 && previous.includes(reply)) ||
      (previous.length > 60 && reply.includes(previous))
    );
  });
}

function hasRecentAssistantContext(memory, thread = []) {
  const memoryHasAssistant = recentAssistantMessages(memory, 3).length > 0;
  const threadHasAssistant = (Array.isArray(thread) ? thread : [])
    .slice(-8)
    .some((message) => {
      const direction = normalizeDirection(message.direction || "");
      return (
        message.role === "assistant" ||
        message.sender === "assistant" ||
        direction === "outgoing" ||
        direction === "sent"
      );
    });

  return memoryHasAssistant || threadHasAssistant;
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

function resolveTimeframe(value) {
  const key = String(value || "24h").toLowerCase();
  return ["24h", "7d", "30d", "90d", "ytd", "all"].includes(key) ? key : "24h";
}

function timeframeStartDate(timeframe, now = new Date()) {
  const resolved = resolveTimeframe(timeframe);

  if (resolved === "all") {
    return null;
  }

  if (resolved === "ytd") {
    return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  }

  const hours = {
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
    "90d": 24 * 90
  }[resolved];

  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

function isDateInTimeframe(value, timeframe, now = new Date()) {
  if (resolveTimeframe(timeframe) === "all") {
    return true;
  }

  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return false;
  }

  return date >= timeframeStartDate(timeframe, now) && date <= now;
}

function latestConversationTime(memory) {
  const times = [
    memory?.last_incoming_at,
    memory?.last_outgoing_at,
    memory?.booking_link_clicked_at,
    memory?.booking_confirmed_at
  ]
    .map((value) => Date.parse(String(value || "")))
    .filter((value) => Number.isFinite(value));

  return times.length ? new Date(Math.max(...times)).toISOString() : "";
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

  if (normalizeProvider(provider) === "test") {
    return `test:${channel}:${person}`;
  }

  return `zernio:${zernio_account_id || "unknown"}:${channel}:${person}`;
}

function isUsefulZernioContactId(contactId, accountId) {
  const contactText = String(contactId || "").trim();
  const accountText = String(accountId || "").trim();

  return Boolean(contactText && (!accountText || contactText !== accountText));
}

function findExistingConversationKey(store, messageLike, proposedKey) {
  const conversations =
    store.conversations && typeof store.conversations === "object"
      ? store.conversations
      : {};
  const provider = normalizeProvider(messageLike.provider);
  const talkId = String(
    messageLike.zernio_conversation_id || messageLike.talk_id || ""
  );
  const accountId = String(messageLike.zernio_account_id || "");
  const origin = String(messageLike.origin || "");

  if (!talkId) {
    return proposedKey;
  }

  const matches = Object.entries(conversations).filter(([, memory]) => {
    if (!memory || typeof memory !== "object") {
      return false;
    }

    const memoryTalkId = String(
      memory.zernio_conversation_id || memory.current_talk_id || ""
    );

    return (
      normalizeProvider(memory.provider) === provider &&
      memoryTalkId === talkId &&
      (!accountId || !memory.zernio_account_id || memory.zernio_account_id === accountId) &&
      (!origin || !memory.origin || memory.origin === origin)
    );
  });

  const prospectMatch = matches.find(([, memory]) =>
    isUsefulZernioContactId(memory.contact_id, accountId)
  );

  return (prospectMatch || matches[0] || [proposedKey])[0];
}

function mergeUniqueList(...lists) {
  const seen = new Set();
  const merged = [];

  for (const list of lists) {
    if (!Array.isArray(list)) {
      continue;
    }

    for (const item of list) {
      const comparable =
        item && typeof item === "object" ? JSON.stringify(item) : String(item);
      if (!seen.has(comparable)) {
        seen.add(comparable);
        merged.push(item);
      }
    }
  }

  return merged;
}

function messageSortTime(message) {
  const parsed = Date.parse(String(message?.at || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function newerValue(currentValue, currentAt, incomingValue, incomingAt) {
  if (!incomingValue) {
    return currentValue || "";
  }

  if (!currentValue) {
    return incomingValue;
  }

  return messageSortTime({ at: incomingAt }) >= messageSortTime({ at: currentAt })
    ? incomingValue
    : currentValue;
}

function chooseMergedZernioKey(firstKey, firstMemory, secondKey, secondMemory) {
  const firstUseful = isUsefulZernioContactId(
    firstMemory.contact_id,
    firstMemory.zernio_account_id
  );
  const secondUseful = isUsefulZernioContactId(
    secondMemory.contact_id,
    secondMemory.zernio_account_id
  );

  if (firstUseful && !secondUseful) {
    return firstKey;
  }

  if (secondUseful && !firstUseful) {
    return secondKey;
  }

  return firstKey;
}

function mergeConversationMemory(target, source) {
  const mergedMessages = mergeUniqueList(target.last_messages, source.last_messages)
    .sort((a, b) => messageSortTime(a) - messageSortTime(b))
    .slice(-MAX_RECENT_MEMORY_MESSAGES);
  const lastIncomingAt = newerValue(
    target.last_incoming_at,
    target.last_incoming_at,
    source.last_incoming_at,
    source.last_incoming_at
  );
  const lastOutgoingAt = newerValue(
    target.last_outgoing_at,
    target.last_outgoing_at,
    source.last_outgoing_at,
    source.last_outgoing_at
  );
  const sourceHasNewerOutgoing =
    messageSortTime({ at: source.last_outgoing_at }) >
    messageSortTime({ at: target.last_outgoing_at });

  target.contact_id =
    isUsefulZernioContactId(target.contact_id, target.zernio_account_id)
      ? target.contact_id
      : source.contact_id || target.contact_id || "";
  target.username = target.username || source.username || "";
  target.avatar_url =
    cacheableAvatarUrl(target.avatar_url) || cacheableAvatarUrl(source.avatar_url);
  target.profile_last_checked_at =
    target.profile_last_checked_at || source.profile_last_checked_at || null;
  target.chat_id = target.chat_id || source.chat_id || "";
  target.origin = target.origin || source.origin || "";
  target.current_talk_id = target.current_talk_id || source.current_talk_id || "";
  target.zernio_account_id =
    target.zernio_account_id || source.zernio_account_id || "";
  target.zernio_conversation_id =
    target.zernio_conversation_id || source.zernio_conversation_id || "";
  target.last_messages = mergedMessages;
  target.processed_message_ids = mergeUniqueList(
    target.processed_message_ids,
    source.processed_message_ids
  ).slice(-MAX_PROCESSED_MESSAGE_IDS);
  target.questions_asked = mergeUniqueList(target.questions_asked, source.questions_asked);
  target.youtube_link_sent = Boolean(target.youtube_link_sent || source.youtube_link_sent);
  target.training_link_sent = Boolean(
    target.training_link_sent || source.training_link_sent
  );
  target.booking_link_sent = Boolean(target.booking_link_sent || source.booking_link_sent);
  target.booking_link_clicked = Boolean(
    target.booking_link_clicked || source.booking_link_clicked
  );
  target.booking_link_clicked_at =
    newerValue(
      target.booking_link_clicked_at,
      target.booking_link_clicked_at,
      source.booking_link_clicked_at,
      source.booking_link_clicked_at
    ) || null;
  target.booking_confirmed = Boolean(target.booking_confirmed || source.booking_confirmed);
  target.booking_confirmed_at =
    newerValue(
      target.booking_confirmed_at,
      target.booking_confirmed_at,
      source.booking_confirmed_at,
      source.booking_confirmed_at
    ) || null;
  target.ai_paused = Boolean(target.ai_paused || source.ai_paused);
  target.manual_takeover_until =
    newerValue(
      target.manual_takeover_until,
      target.manual_takeover_until,
      source.manual_takeover_until,
      source.manual_takeover_until
    ) || null;
  target.manual_takeover_since =
    target.manual_takeover_since || source.manual_takeover_since || null;
  target.pending_app_outgoing = mergeUniqueList(
    target.pending_app_outgoing,
    source.pending_app_outgoing
  );
  target.last_incoming_at = lastIncomingAt || null;
  target.last_outgoing_at = lastOutgoingAt || null;
  target.last_outgoing_source = sourceHasNewerOutgoing
    ? source.last_outgoing_source || target.last_outgoing_source || ""
    : target.last_outgoing_source || source.last_outgoing_source || "";

  if (
    source.follow_up?.active &&
    (!target.follow_up?.active ||
      messageSortTime({ at: source.follow_up.due_at }) <
        messageSortTime({ at: target.follow_up.due_at }))
  ) {
    target.follow_up = { ...source.follow_up };
  }

  refreshMemorySummary(target);
  target.lead_status = classifyLeadStatus(target);

  return target;
}

function mergeSplitConversationMemories(conversations) {
  const merged = {};
  const byZernioTalk = new Map();

  for (const [key, memory] of Object.entries(conversations || {})) {
    if (!memory || typeof memory !== "object") {
      continue;
    }

    const talkId = String(memory.zernio_conversation_id || memory.current_talk_id || "");
    const mergeKey =
      normalizeProvider(memory.provider) === "zernio" && talkId
        ? [
            "zernio",
            memory.zernio_account_id || "",
            memory.origin || "",
            talkId
          ].join(":")
        : "";

    if (!mergeKey || !byZernioTalk.has(mergeKey)) {
      const targetKey = key;
      merged[targetKey] = memory;
      if (mergeKey) {
        byZernioTalk.set(mergeKey, targetKey);
      }
      continue;
    }

    const existingKey = byZernioTalk.get(mergeKey);
    const existingMemory = merged[existingKey];
    const targetKey = chooseMergedZernioKey(existingKey, existingMemory, key, memory);

    if (targetKey === existingKey) {
      mergeConversationMemory(existingMemory, memory);
      existingMemory.key = existingKey;
      continue;
    }

    const replacementMemory = mergeConversationMemory(memory, existingMemory);
    replacementMemory.key = key;
    delete merged[existingKey];
    merged[key] = replacementMemory;
    byZernioTalk.set(mergeKey, key);
  }

  return merged;
}

function getConversationMemory(store, messageLike) {
  const proposedKey = messageLike.conversation_key || makeConversationKey(messageLike);
  const key = store.conversations?.[proposedKey]
    ? proposedKey
    : findExistingConversationKey(store, messageLike, proposedKey);

  if (!store.conversations[key]) {
    store.conversations[key] = {
      key,
      provider: normalizeProvider(messageLike.provider),
      contact_id: messageLike.contact_id || "",
      username: messageLike.username || "",
      avatar_url: messageLike.avatar_url || "",
      profile_last_checked_at: null,
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
      booking_link_clicked: false,
      booking_link_clicked_at: null,
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
  memory.provider = normalizeProvider(messageLike.provider || memory.provider);
  memory.contact_id =
    normalizeProvider(messageLike.provider) === "zernio"
      ? isUsefulZernioContactId(messageLike.contact_id, messageLike.zernio_account_id)
        ? messageLike.contact_id
        : memory.contact_id || ""
      : messageLike.contact_id || memory.contact_id || "";
  memory.username =
    String(messageLike.username || "").trim().replace(/^@/, "") || memory.username || "";
  memory.avatar_url =
    cacheableAvatarUrl(messageLike.avatar_url) || cacheableAvatarUrl(memory.avatar_url);
  memory.profile_last_checked_at = memory.profile_last_checked_at || null;
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
  memory.booking_link_clicked = Boolean(memory.booking_link_clicked);
  memory.booking_link_clicked_at = memory.booking_link_clicked_at || null;
  memory.booking_confirmed = Boolean(memory.booking_confirmed);
  memory.booking_confirmed_at = memory.booking_confirmed_at || null;
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

  if (memory.booking_link_clicked) {
    state.push("booking link was clicked");
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
    memory?.booking_link_clicked ||
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

  if (/interested.*pursu|pursu.*business|mostly checking.*out/.test(lower)) {
    keys.push("would_pursue");
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

  if (replyText.includes(BOOKING_URL) || replyText.includes(TRACKED_BOOKING_BASE_URL)) {
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
      "Great. Let's get on a Zoom call this week so we can research your market, answer your questions, and see if the academy fits your goals.\n\nDo you mind if I send the calendar link?",
    needs_review: false,
    handled: true
  };
}

function leadTrackingId(messageLike = {}) {
  return String(
    messageLike.contact_id ||
      messageLike.ig_user_id ||
      messageLike.zernio_contact_id ||
      messageLike.chat_id ||
      ""
  ).trim();
}

function trackedBookingUrl(messageLike = {}) {
  const leadId = leadTrackingId(messageLike);
  const params = new URLSearchParams();

  if (leadId) {
    params.set("id", leadId);
  }

  return params.toString()
    ? `${TRACKED_BOOKING_BASE_URL}?${params.toString()}`
    : TRACKED_BOOKING_BASE_URL;
}

function withTrackedBookingUrl(replyText, messageLike = {}) {
  return String(replyText || "").replaceAll(BOOKING_URL, trackedBookingUrl(messageLike));
}

function appointmentSetterCalendarLinkReply(messageLike) {
  const calendarUrl = trackedBookingUrl(messageLike);
  const messages = [
    `Solid. Here's the calendar: ${calendarUrl}`,
    "Choose a date/time that works for you, and I'll verify it on my end."
  ];

  return {
    reply: messages.join("\n\n"),
    messages,
    needs_review: false,
    handled: true
  };
}

function appointmentSetterUseLinkReply() {
  return {
    reply: "Sounds good. Use that calendar link to grab the weekday time that works best for you.",
    needs_review: false,
    handled: true
  };
}

function appointmentSetterPhoneReply(memory, messageLike) {
  return {
    reply: memory?.booking_link_sent
      ? "Use the link I sent and grab the weekday time that works best for you."
      : `The cleanest next step is to grab a weekday time here: ${trackedBookingUrl(messageLike)}`,
    needs_review: false,
    handled: true
  };
}

function appointmentSetterContentReply() {
  return {
    reply: `Got you. The YouTube is probably the best place to start: ${YOUTUBE_URL}`,
    needs_review: false,
    handled: true
  };
}

function appointmentSetterCostReply() {
  return {
    reply:
      "It depends on where you're starting and what kind of help you need. The call is the best way to see what makes sense for you. Want me to send the calendar link?",
    needs_review: false,
    handled: true
  };
}

function appointmentSetterHowItWorksReply() {
  return {
    reply:
      "The short version is we help you understand how to source, move, and sell pallets in your area. Want to hop on a quick Zoom so we can look at your market?",
    needs_review: false,
    handled: true
  };
}

function appointmentSetterNoTruckReply() {
  return {
    reply:
      "That's fine. A truck helps, but the first step is seeing if your area has the opportunity. Want to hop on a quick Zoom so we can look at it?",
    needs_review: false,
    handled: true
  };
}

function appointmentSetterNoMoneyReply() {
  return {
    reply: `No pressure. The YouTube channel is probably the best place to start for now: ${YOUTUBE_URL}`,
    needs_review: false,
    handled: true
  };
}

function appointmentSetterSkepticReply() {
  return {
    reply:
      "I get why you'd ask. I run this business myself, and the call is to see if the model makes sense in your area. Want me to send the calendar link?",
    needs_review: false,
    handled: true
  };
}

function appointmentSetterWarmQualifierReply() {
  return {
    reply: "Got you. Is this business something you'd be interested in pursuing, or are you mostly checking it out right now?",
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

function asksPriceOrCost(text) {
  return /\b(price|cost|how much|what.*charge|program.*cost|academy.*cost|pay for|investment)\b/i.test(
    String(text || "")
  );
}

function asksHowItWorks(text) {
  return /\b(how does (?:this|it|the business) work|how.*pallet.*work|what is the pallet business|explain.*pallet|what.*business model)\b/i.test(
    String(text || "")
  );
}

function saysNoTruckYet(text) {
  return /\b(no truck|don't have (?:a )?truck|dont have (?:a )?truck|without (?:a )?truck|need (?:a )?truck|no trailer|don't have (?:a )?trailer|dont have (?:a )?trailer)\b/i.test(
    String(text || "")
  );
}

function saysNoMoneyOrCapital(text) {
  return /\b(no money|no capital|don't have (?:any )?(?:money|capital)|dont have (?:any )?(?:money|capital)|can't afford|cant afford|broke|unemployed)\b/i.test(
    String(text || "")
  );
}

function asksIfLegit(text) {
  return /\b(is this legit|legit|scam|real deal|does this really work|does it work|proof|testimonials?|results)\b/i.test(
    String(text || "")
  );
}

function wantsPalletBusiness(text) {
  return /\b(interested|want|wanna|trying|tryna|looking|ready|learn|start|get started|get into|appointment|consultation|schedule|book|call|zoom|business|pallet)\b/i.test(
    String(text || "")
  );
}

function hasClearStartIntent(text) {
  return /\b(i'?m|im|i am|we'?re|were|we are|i|we)\s+(?:definitely\s+|really\s+|ready\s+|tryna\s+|trying\s+|looking\s+|want(?:ing)?\s+|wanna\s+)?(?:interested|ready|down|trying|tryna|looking|want(?:ing)?|wanna|ready)\b.{0,80}\b(start|get started|learn|business|pallet|pallets)\b/i.test(
    String(text || "")
  ) ||
    /\b(start|get started|learn|get into)\b.{0,40}\b(pallet|pallets|business)\b/i.test(
      String(text || "")
    ) ||
    /\b(pallet|pallets)\b.{0,40}\b(business|academy|program)\b/i.test(String(text || ""));
}

function wantsAppointmentOrScheduling(text) {
  return /\b(schedule|appointment|book|booking|calendar|consultation|consult|zoom|discovery call|call this week|reschedule|rebook)\b/i.test(
    String(text || "")
  );
}

function lastAssistantAskedContentOrBusiness(memory) {
  return (Array.isArray(memory?.last_messages) ? memory.last_messages : [])
    .slice(-5)
    .some(
      (message) =>
        message.role === "assistant" &&
        /content/i.test(message.text || "") &&
        /(start|looking to start|wanting to start).{0,40}(pallet|business)/i.test(
          message.text || ""
        )
    );
}

function yesToBusinessInterest(text) {
  const cleanText = String(text || "")
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return /^(yes|yea|yeah|yep|yup|most definitely|definitely|for sure|sure|yea definitely|yeah definitely|i am|i'm|im|interested|i'm interested|im interested|trying|tryna|i'm tryna|im tryna|i want|wanting|wanna|ready|down|let's do it|lets do it)\b/.test(
    cleanText
  );
}

function hasRichProspectContext(text) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();

  if (cleanText.length > 120 || cleanText.includes("?")) {
    return true;
  }

  return /\b(but|because|since|already|currently|around me|near me|my area|truck|trailer|job|work|yard|yards|market|contracts|prices|pay|money|capital|city|state|location|driving|insight|question|questions)\b/i.test(
    cleanText
  );
}

function prospectAskedQuestion(text) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();

  return (
    cleanText.includes("?") ||
    /\b(how|what|where|when|why|who|can i|can you|do you|does it|is it|are there|would|could|should|price|cost|pay|make|need|start)\b/i.test(
      cleanText
    )
  );
}

function isSimplePalletBusinessIntent(text) {
  return wantsPalletBusiness(text) && !hasRichProspectContext(text);
}

function isAmbiguousShortReply(text) {
  const cleanText = String(text || "")
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return /^(yes|yea|yeah|yep|yup|ok|okay|k|sure|bet|cool|sounds good|interested|how|info|more info|send it|let s do it|lets do it)$/.test(
    cleanText
  );
}

function askedWarmQualifier(memory) {
  return (Array.isArray(memory?.questions_asked) ? memory.questions_asked : []).some(
    (key) => ["why_start", "would_pursue"].includes(key)
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
        /send you a link to my calendar|send (?:you )?(?:the|a) calendar link|link to my calendar|calendar link/i.test(
          message.text || ""
        )
    );
}

function appointmentSetterRuleReply(memory, incoming) {
  const text = String(incoming?.text || "");

  if (!text.trim()) {
    return null;
  }

  if (wantsDirectPhoneCall(text) && !hasRichProspectContext(text)) {
    return appointmentSetterPhoneReply(memory, incoming);
  }

  if (saysNoMoneyOrCapital(text)) {
    return appointmentSetterNoMoneyReply();
  }

  if (asksPriceOrCost(text)) {
    return appointmentSetterCostReply();
  }

  if (asksHowItWorks(text)) {
    return appointmentSetterHowItWorksReply();
  }

  if (saysNoTruckYet(text)) {
    return appointmentSetterNoTruckReply();
  }

  if (asksIfLegit(text)) {
    return appointmentSetterSkepticReply();
  }

  if (
    wantsAppointmentOrScheduling(text) &&
    !memory?.booking_link_sent &&
    !memory?.booking_confirmed
  ) {
    return appointmentSetterCalendarLinkReply(incoming);
  }

  if (
    lastAssistantAskedContentOrBusiness(memory) &&
    yesToBusinessInterest(text) &&
    !memory?.booking_link_sent &&
    !memory?.booking_confirmed
  ) {
    return appointmentSetterCalendarAskReply();
  }

  if (
    memory?.booking_link_sent &&
    mentionsSpecificTimeInsteadOfBooking(text) &&
    !prospectAskedQuestion(text)
  ) {
    return appointmentSetterUseLinkReply();
  }

  if (
    lastAssistantAskedForCalendarPermission(memory) &&
    yesToCalendarLink(text) &&
    !hasRichProspectContext(text)
  ) {
    return appointmentSetterCalendarLinkReply(incoming);
  }

  if (
    wantsContentOnly(text) &&
    !hasClearStartIntent(text) &&
    !wantsAppointmentOrScheduling(text) &&
    !prospectAskedQuestion(text)
  ) {
    return appointmentSetterContentReply();
  }

  if (
    isSimplePalletBusinessIntent(text) &&
    !memory?.booking_link_sent &&
    !lastAssistantAskedForCalendarPermission(memory)
  ) {
    return hasClearStartIntent(text) || askedWarmQualifier(memory)
      ? appointmentSetterCalendarAskReply()
      : appointmentSetterWarmQualifierReply();
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
      booking_link_clicks: 0,
      appointments_scheduled: 0,
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

async function recordBookingLinkClick(req) {
  const leadId = String(req.query.id || req.query.lead_id || "").trim().slice(0, 160);
  const clickedAt = new Date().toISOString();
  const store = await readStore();

  store.linkClicks.push({
    id: crypto.randomUUID(),
    lead_id: leadId,
    clicked_at: clickedAt,
    user_agent: String(req.headers["user-agent"] || "").slice(0, 300),
    ip:
      String(req.headers["x-forwarded-for"] || "")
        .split(",")[0]
        .trim()
        .slice(0, 64) || String(req.socket?.remoteAddress || "").slice(0, 64)
  });
  store.linkClicks = store.linkClicks.slice(-1000);

  if (leadId) {
    for (const memory of Object.values(store.conversations || {})) {
      if (!memory || typeof memory !== "object") {
        continue;
      }

      const identifiers = [
        memory.contact_id,
        memory.chat_id,
        memory.current_talk_id,
        memory.zernio_conversation_id
      ].map((value) => String(value || ""));

      if (identifiers.includes(leadId)) {
        memory.booking_link_clicked = true;
        memory.booking_link_clicked_at = clickedAt;
        memory.lead_status = "hot";
        refreshMemorySummary(memory);
      }
    }
  }

  recordDailyStat(store, leadId ? `click:${leadId}` : "click:unknown", {
    booking_link_clicks: 1
  });

  await writeStore(store);
  return leadId;
}

function leadMatchesMemory(memory, leadId) {
  const id = String(leadId || "").trim();
  if (!id || !memory || typeof memory !== "object") {
    return false;
  }

  return [
    memory.contact_id,
    memory.chat_id,
    memory.current_talk_id,
    memory.zernio_conversation_id
  ]
    .map((value) => String(value || ""))
    .includes(id);
}

async function recordAppointmentScheduled({ leadId, source = "booking_webhook", payload = {} }) {
  const cleanLeadId = String(leadId || "").trim().slice(0, 160);
  const bookedAt = new Date().toISOString();
  const store = await readStore();
  let matched = false;

  store.bookingEvents.push({
    id: crypto.randomUUID(),
    lead_id: cleanLeadId,
    booked_at: bookedAt,
    source,
    payload: JSON.stringify(payload || {}).slice(0, 3000)
  });
  store.bookingEvents = store.bookingEvents.slice(-1000);

  if (cleanLeadId) {
    for (const memory of Object.values(store.conversations || {})) {
      if (!leadMatchesMemory(memory, cleanLeadId)) {
        continue;
      }

      matched = true;
      const wasConfirmed = Boolean(memory.booking_confirmed);
      memory.booking_confirmed = true;
      memory.booking_confirmed_at = memory.booking_confirmed_at || bookedAt;
      memory.booking_link_clicked = true;
      memory.booking_link_clicked_at = memory.booking_link_clicked_at || bookedAt;
      memory.lead_status = "booked";
      refreshMemorySummary(memory);

      if (!wasConfirmed) {
        recordDailyStat(store, memory.key || `booking:${cleanLeadId}`, {
          appointments_scheduled: 1
        });
      }
    }
  }

  if (!matched) {
    recordDailyStat(store, cleanLeadId ? `booking:${cleanLeadId}` : "booking:unknown", {
      appointments_scheduled: 1
    });
  }

  await writeStore(store);
  return { lead_id: cleanLeadId, matched, booked_at: bookedAt };
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
    booking_link_clicks: 0,
    appointments_scheduled: 0,
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
      "booking_link_clicks",
      "appointments_scheduled",
      "followups_sent"
    ]) {
      totals[key] += Number(normalizedStats[key] || 0);
    }
  }

  totals.prospect_keys = [...prospectKeys];
  totals.prospects_touched = totals.prospect_keys.length;
  return totals;
}

function emptyStats() {
  return {
    prospects_touched: 0,
    prospect_keys: [],
    ai_replies_sent: 0,
    manual_approvals_sent: 0,
    auto_replies_sent: 0,
    drafts_created: 0,
    training_links_sent: 0,
    youtube_links_sent: 0,
    booking_links_sent: 0,
    booking_link_clicks: 0,
    appointments_scheduled: 0,
    followups_sent: 0
  };
}

function statsForTimeframe(store, timeframe) {
  if (resolveTimeframe(timeframe) === "all") {
    return getAllTimeStats(store);
  }

  const now = new Date();
  const totals = emptyStats();
  const prospectKeys = new Set();

  for (const [day, stats] of Object.entries(store.dailyStats || {})) {
    const dayDate = new Date(`${day}T23:59:59.999Z`);
    if (Number.isNaN(dayDate.getTime()) || !isDateInTimeframe(dayDate.toISOString(), timeframe, now)) {
      continue;
    }

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
      "booking_link_clicks",
      "appointments_scheduled",
      "followups_sent"
    ]) {
      totals[key] += Number(normalizedStats[key] || 0);
    }
  }

  totals.prospect_keys = [...prospectKeys];
  totals.prospects_touched = totals.prospect_keys.length;
  return totals;
}

function conversationInTimeframe(memory, timeframe) {
  return isDateInTimeframe(latestConversationTime(memory), timeframe);
}

function conversationHasAssistantReply(memory) {
  return (Array.isArray(memory?.last_messages) ? memory.last_messages : []).some(
    (message) => message.role === "assistant"
  );
}

function conversationKpisForTimeframe(store, timeframe) {
  const conversations = Object.values(store.conversations || {}).filter((memory) =>
    conversationInTimeframe(memory, timeframe)
  );
  const totalLeads = conversations.length;
  const aiReplied = conversations.filter(conversationHasAssistantReply).length;
  const linkSent = conversations.filter((memory) => memory.booking_link_sent).length;
  const linkClicked = conversations.filter((memory) => memory.booking_link_clicked).length;
  const callBooked = conversations.filter((memory) => memory.booking_confirmed).length;

  return {
    total_leads: totalLeads,
    ai_replied: aiReplied,
    booking_links_sent: linkSent,
    booking_link_clicks: linkClicked,
    appointments_scheduled: callBooked,
    link_sent_rate: totalLeads ? Math.round((linkSent / totalLeads) * 1000) / 10 : 0,
    click_through_rate: linkSent ? Math.round((linkClicked / linkSent) * 1000) / 10 : 0,
    booking_conversion_rate: linkClicked
      ? Math.round((callBooked / linkClicked) * 1000) / 10
      : 0
  };
}

function touchpointKpisForTimeframe(store, timeframe) {
  const conversations = Object.values(store.conversations || {});
  let incomingMessages = 0;
  let outgoingMessages = 0;
  const interactedAccounts = new Set();
  const reachedAccounts = new Set();

  for (const memory of conversations) {
    const messages = Array.isArray(memory?.last_messages) ? memory.last_messages : [];
    for (const message of messages) {
      if (!isDateInTimeframe(message.at, timeframe)) {
        continue;
      }

      const key =
        memory.key ||
        memory.contact_id ||
        memory.chat_id ||
        memory.current_talk_id ||
        message.id;
      interactedAccounts.add(String(key));

      if (message.role === "assistant") {
        outgoingMessages += 1;
        reachedAccounts.add(String(key));
      } else {
        incomingMessages += 1;
      }
    }
  }

  return {
    accounts_interacted: interactedAccounts.size,
    accounts_reached: reachedAccounts.size,
    incoming_messages: incomingMessages,
    outgoing_messages: outgoingMessages,
    total_messages: incomingMessages + outgoingMessages
  };
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

function addAutomationEvent(store, event = {}) {
  store.automationEvents = Array.isArray(store.automationEvents)
    ? store.automationEvents
    : [];

  store.automationEvents.push({
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    level: event.level || "info",
    type: event.type || "event",
    message: String(event.message || "").slice(0, 500),
    talk_id: String(event.talk_id || "").slice(0, 120),
    contact_id: String(event.contact_id || "").slice(0, 120),
    conversation_key: String(event.conversation_key || "").slice(0, 240),
    reason: String(event.reason || "").slice(0, 700)
  });

  store.automationEvents = store.automationEvents.slice(-500);
}

async function appendAutomationEvent(event = {}) {
  const store = await readStore();
  addAutomationEvent(store, event);
  await writeStore(store);
}

function linkStatsForText(text) {
  const replyText = String(text || "");
  const hasYoutube =
    replyText.includes(YOUTUBE_URL) ||
    replyText.includes(TRAINING_PLAYLIST_URL) ||
    replyText.includes("youtube.com/");
  const hasBooking =
    replyText.includes(BOOKING_URL) || replyText.includes(TRACKED_BOOKING_BASE_URL);

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
    booking_link_clicked: Boolean(memory.booking_link_clicked),
    booking_link_clicked_at: memory.booking_link_clicked_at || null,
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
    provider: normalizeProvider(memory.provider),
    contact_id: memory.contact_id || "",
    username: memory.username || "",
    avatar_url: cacheableAvatarUrl(memory.avatar_url),
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
    booking_link_clicked: Boolean(memory.booking_link_clicked),
    booking_link_clicked_at: memory.booking_link_clicked_at || null,
    training_link_sent: Boolean(memory.training_link_sent),
    booking_confirmed: Boolean(memory.booking_confirmed),
    booking_confirmed_at: memory.booking_confirmed_at || null,
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
  const username = pickValue(payload, [
    "data.sender.username",
    "data.sender.handle",
    "data.customer.username",
    "data.customer.handle",
    "message.sender.username",
    "message.sender.handle",
    "sender.username",
    "sender.handle",
    "username",
    "handle"
  ]);
  const avatarUrl = pickValue(payload, [
    "data.sender.profile_pic",
    "data.sender.profilePic",
    "data.sender.avatar",
    "data.customer.profile_pic",
    "data.customer.profilePic",
    "data.customer.avatar",
    "message.sender.profile_pic",
    "message.sender.profilePic",
    "message.sender.avatar",
    "sender.profile_pic",
    "sender.profilePic",
    "sender.avatar",
    "profile_pic",
    "avatar",
    "avatar_url"
  ]);
  const recipientId = pickValue(payload, [
    "data.recipient.contactId",
    "data.recipient.id",
    "data.recipientId",
    "data.recipient_id",
    "data.receiver.contactId",
    "data.receiver.id",
    "data.receiverId",
    "data.receiver_id",
    "data.contactId",
    "data.contact_id",
    "data.customer.id",
    "data.customerId",
    "data.customer_id",
    "message.recipient.contactId",
    "message.recipient.id",
    "message.recipientId",
    "message.recipient_id",
    "message.receiver.contactId",
    "message.receiver.id",
    "message.receiverId",
    "message.receiver_id",
    "message.contactId",
    "message.contact_id",
    "recipient.id",
    "recipientId",
    "contactId",
    "contact_id"
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
  const normalizedDirection = normalizeDirection(direction);
  const accountText = accountId ? String(accountId) : "";
  const senderText = senderId ? String(senderId) : "";
  const recipientText = recipientId ? String(recipientId) : "";
  const contactId =
    normalizedDirection === "outgoing" || senderText === accountText
      ? recipientText || (senderText !== accountText ? senderText : "")
      : senderText || recipientText;

  return {
    provider: "zernio",
    talk_id: conversationId ? String(conversationId) : "",
    chat_id: conversationId ? String(conversationId) : "",
    contact_id: contactId ? String(contactId) : "",
    username: username ? String(username).trim().replace(/^@/, "") : "",
    avatar_url: cacheableAvatarUrl(avatarUrl),
    zernio_conversation_id: conversationId ? String(conversationId) : "",
    zernio_account_id: accountId ? String(accountId) : "",
    incoming_message_id: stableMessageId ? String(stableMessageId) : "",
    text: textValue ? String(textValue).trim() : "",
    direction: normalizedDirection,
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

function cacheableAvatarUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  try {
    const url = new URL(text);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

async function fetchInstagramProfile(senderId) {
  const id = String(senderId || "").trim();
  if (!id || !META_GRAPH_ACCESS_TOKEN) {
    return null;
  }

  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(id)}`);
  url.searchParams.set("fields", "username,profile_pic");
  url.searchParams.set("access_token", META_GRAPH_ACCESS_TOKEN);

  try {
    const response = await fetch(url);
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.warn(
        `Meta profile lookup failed for ${id}: ${response.status} ${JSON.stringify(body).slice(0, 300)}`
      );
      return null;
    }

    return {
      username: String(body.username || "").trim(),
      avatar_url: cacheableAvatarUrl(body.profile_pic)
    };
  } catch (error) {
    console.warn(`Meta profile lookup failed for ${id}: ${error.message}`);
    return null;
  }
}

async function hydrateLeadProfile(store, memory, messageLike) {
  const leadId = String(messageLike.contact_id || memory.contact_id || "").trim();
  if (!leadId) {
    return;
  }

  store.profileCache = store.profileCache && typeof store.profileCache === "object"
    ? store.profileCache
    : {};

  const directUsername = String(messageLike.username || "").trim().replace(/^@/, "");
  const directAvatar = cacheableAvatarUrl(messageLike.avatar_url);

  if (directUsername || directAvatar) {
    const cached = store.profileCache[leadId] || {};
    store.profileCache[leadId] = {
      ...cached,
      username: directUsername || cached.username || "",
      avatar_url: directAvatar || cached.avatar_url || "",
      updated_at: new Date().toISOString(),
      source: directAvatar ? "webhook" : cached.source || "webhook"
    };
  }

  const cached = store.profileCache[leadId];
  if (cached) {
    memory.username = memory.username || cached.username || "";
    memory.avatar_url =
      cacheableAvatarUrl(memory.avatar_url) || cacheableAvatarUrl(cached.avatar_url);
  }

  const lastCheckedMs = Date.parse(String(memory.profile_last_checked_at || ""));
  const recentlyChecked =
    Number.isFinite(lastCheckedMs) && Date.now() - lastCheckedMs < 24 * 60 * 60 * 1000;

  if ((memory.username && memory.avatar_url) || recentlyChecked || !META_GRAPH_ACCESS_TOKEN) {
    return;
  }

  memory.profile_last_checked_at = new Date().toISOString();
  const profile = await fetchInstagramProfile(leadId);
  if (!profile) {
    return;
  }

  store.profileCache[leadId] = {
    username: profile.username || memory.username || "",
    avatar_url: profile.avatar_url || memory.avatar_url || "",
    updated_at: new Date().toISOString(),
    source: "meta"
  };
  memory.username = profile.username || memory.username || "";
  memory.avatar_url = profile.avatar_url || memory.avatar_url || "";
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
  if (normalizeProvider(incoming.provider) === "test") {
    return [];
  }

  return getZernioConversationThread(
    incoming.zernio_conversation_id || incoming.talk_id,
    incoming.zernio_account_id
  );
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
      provider: normalizeProvider(newMessage.provider),
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

  return sendReplyToZernio(messageLike, replyText, featureSettings);
}

function replyMessages(replyLike) {
  const messages = Array.isArray(replyLike?.messages)
    ? replyLike.messages
    : [replyLike?.reply || replyLike];

  return messages
    .map((message) => String(message || "").trim())
    .filter(Boolean);
}

function joinedReplyText(replyLike) {
  return replyMessages(replyLike).join("\n\n");
}

async function sendReplySequence(messageLike, replyLike, featureSettings) {
  const messages = replyMessages(replyLike);

  for (let index = 0; index < messages.length; index += 1) {
    if (index > 0) {
      await sleep(CALENDAR_SEQUENCE_GAP_MS);
    }

    const sendSettings =
      index === 0
        ? featureSettings
        : {
            ...featureSettings,
            human_send_delay: false
          };

    await sendReply(messageLike, messages[index], sendSettings);
  }

  return messages;
}

async function generateFollowUpReply(memory, featureSettings) {
  const followUpNumber = Number(memory.follow_up?.count || 0) + 1;
  const replies = [
    "Still interested in getting this started?",
    "No pressure, just checking if this is still something you want to look into.",
    "I'll leave it with you for now. If you want the next step, just message me back."
  ];

  return {
    reply: replies[Math.min(followUpNumber, replies.length) - 1],
    needs_review: false
  };
}

async function recordIncomingForMemory(incoming, featureSettings) {
  if (!isConversationMemoryEnabled(featureSettings)) {
    return { duplicate: false, memory: null, conversationKey: makeConversationKey(incoming) };
  }

  const store = await readStore();
  const memory = getConversationMemory(store, incoming);
  await hydrateLeadProfile(store, memory, incoming);
  const duplicate = markProcessedMessage(memory, incoming.incoming_message_id);

  if (!duplicate) {
    const incomingAt = new Date(toMessageTimestampMs(incoming.created_at)).toISOString();
    memory.last_incoming_at = incomingAt;
    if (isBookingConfirmation(incoming.text)) {
      const wasConfirmed = Boolean(memory.booking_confirmed);
      memory.booking_confirmed = true;
      memory.booking_link_sent = true;
      memory.booking_confirmed_at = incomingAt;
      if (!wasConfirmed) {
        recordDailyStat(store, memory.key, { appointments_scheduled: 1 });
      }
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
  const featureSettings = getFeatureSettings(store);
  const takeoverUntil = new Date(Date.now() + manualTakeoverMs(featureSettings)).toISOString();
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
      provider: normalizeProvider(memory.provider),
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
      provider: normalizeProvider(memory.provider),
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
      provider: normalizeProvider(memory.provider),
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
      provider: normalizeProvider(memory.provider),
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
    await appendAutomationEvent({
      level: "warn",
      type: "ignored",
      message: "Webhook ignored: no text message found.",
      talk_id: incoming.talk_id,
      contact_id: incoming.contact_id
    });
    return;
  }

  if (incoming.direction && incoming.direction !== "incoming") {
    console.log(`Webhook ignored: message direction is ${incoming.direction}.`);
    await appendAutomationEvent({
      level: "info",
      type: "ignored",
      message: "Webhook ignored: non-incoming message.",
      talk_id: incoming.talk_id,
      contact_id: incoming.contact_id,
      reason: `direction=${incoming.direction}`
    });
    return;
  }

  if (incoming.message_type && incoming.message_type !== "text") {
    console.log(`Webhook ignored: message_type is ${incoming.message_type}.`);
    await appendAutomationEvent({
      level: "info",
      type: "ignored",
      message: "Webhook ignored: unsupported message type.",
      talk_id: incoming.talk_id,
      contact_id: incoming.contact_id,
      reason: `message_type=${incoming.message_type}`
    });
    return;
  }

  if (!isInstagramOrigin(incoming.origin)) {
    console.log(`Webhook ignored: origin is ${incoming.origin}.`);
    await appendAutomationEvent({
      level: "info",
      type: "ignored",
      message: "Webhook ignored: origin was not Instagram.",
      talk_id: incoming.talk_id,
      contact_id: incoming.contact_id,
      reason: `origin=${incoming.origin}`
    });
    return;
  }

  if (!isFreshEnough(incoming.created_at)) {
    console.log("Webhook ignored: message appears older than 24 hours.");
    await appendAutomationEvent({
      level: "info",
      type: "ignored",
      message: "Webhook ignored: message appears older than 24 hours.",
      talk_id: incoming.talk_id,
      contact_id: incoming.contact_id
    });
    return;
  }

  const providerStore = await readStore();
  const featureSettings = getFeatureSettings(providerStore);
  const provider = normalizeProvider(incoming.provider);

  if (!isProviderEnabled(providerStore, provider)) {
    console.log(`Webhook ignored: ${provider} provider is disabled.`);
    addAutomationEvent(providerStore, {
      level: "warn",
      type: "ignored",
      message: "Webhook ignored: provider is disabled.",
      talk_id: incoming.talk_id,
      contact_id: incoming.contact_id,
      reason: `${provider} provider disabled`
    });
    await writeStore(providerStore);
    return;
  }

  const { duplicate, memory, conversationKey } = await recordIncomingForMemory(
    incoming,
    featureSettings
  );

  if (duplicate) {
    console.log(`Webhook ignored: duplicate message ${incoming.incoming_message_id}.`);
    await appendAutomationEvent({
      level: "info",
      type: "ignored",
      message: "Webhook ignored: duplicate message.",
      talk_id: incoming.talk_id,
      contact_id: incoming.contact_id,
      conversation_key: conversationKey,
      reason: incoming.incoming_message_id
    });
    return;
  }

  const ruleBasedReply = isBookingConfirmation(incoming.text)
    ? bookingConfirmationReply()
    : appointmentSetterRuleReply(memory, incoming);

  if (ruleBasedReply) {
    const replyText = joinedReplyText(ruleBasedReply);
    const store = await readStore();
    const settings = getConversationSettings(store, incoming.talk_id);
    const holdReason = conversationHoldReason(settings);
    await writeStore(store);

    const reviewRequired =
      isApprovalModeEnabled(featureSettings) && ruleBasedReply.needs_review !== false;
    const shouldAutoSendRuleReply =
      isAutoSendEnabled(featureSettings) &&
      !holdReason &&
      !reviewRequired &&
      Boolean(replyText);

    if (shouldAutoSendRuleReply) {
      try {
        await sendReplySequence(incoming, ruleBasedReply, featureSettings);
        await recordOutgoingForMemory(incoming, replyText, { source: "auto" });
        await appendAutomationEvent({
          level: "success",
          type: "auto_sent",
          message: "Auto-sent rule-based reply.",
          talk_id: incoming.talk_id,
          contact_id: incoming.contact_id,
          conversation_key: conversationKey
        });
        console.log(`Auto-sent rule-based reply for talk_id=${incoming.talk_id}.`);
        return;
      } catch (error) {
        console.error(`Rule-based auto-send failed for talk_id=${incoming.talk_id}:`, error);
      }
    }

    await saveDraft({
      provider: normalizeProvider(incoming.provider),
      conversation_key: conversationKey,
      talk_id: incoming.talk_id,
      chat_id: incoming.chat_id,
      contact_id: incoming.contact_id,
      zernio_conversation_id: incoming.zernio_conversation_id,
      zernio_account_id: incoming.zernio_account_id,
      incoming_message_id: incoming.incoming_message_id,
      incoming_text: incoming.text,
      origin: incoming.origin,
      reply: replyText,
      needs_review: true,
      reason: shouldAutoSendRuleReply
        ? "Rule-based auto-send failed; saved for review."
        : holdReason ||
          (reviewRequired
            ? "Approval mode is on, so this rule-based reply was saved for review."
            : "Appointment setter flow handled.")
    });

    await appendAutomationEvent({
      level: "warn",
      type: "draft_saved",
      message: "Saved rule-based draft instead of sending.",
      talk_id: incoming.talk_id,
      contact_id: incoming.contact_id,
      conversation_key: conversationKey,
      reason:
        holdReason ||
        (reviewRequired
          ? "Approval mode required review."
          : "Rule-based auto-send failed or reply was empty.")
    });

    console.log(`Saved rule-based draft for talk_id=${incoming.talk_id}.`);
    return;
  }

  let thread = [];
  let contextWarning = "";

  try {
    thread = await getConversationThreadForIncoming(incoming);
  } catch (error) {
    contextWarning = `Could not pull ${normalizeProvider(incoming.provider)} thread: ${error.message}`;
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
    aiReply.reply = withTrackedBookingUrl(aiReply.reply, incoming);
  } catch (error) {
    await saveDraft({
      provider: normalizeProvider(incoming.provider),
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

    await appendAutomationEvent({
      level: "error",
      type: "openai_failed",
      message: "OpenAI reply generation failed.",
      talk_id: incoming.talk_id,
      contact_id: incoming.contact_id,
      conversation_key: conversationKey,
      reason: error.message
    });

    console.error(`Saved pending draft after OpenAI failure for talk_id=${incoming.talk_id}:`, error);
    return;
  }

  let reviewReason = "";

  if (contextWarning) {
    aiReply.needs_review = true;
    reviewReason = contextWarning;
  }

  if (
    !reviewReason &&
    isAmbiguousShortReply(incoming.text) &&
    !hasRecentAssistantContext(memory, filteredThread)
  ) {
    aiReply.needs_review = true;
    reviewReason = "Ambiguous short reply without enough prior assistant context.";
  }

  if (replyRepeatsRecentAssistant(memory, aiReply.reply)) {
    aiReply.needs_review = true;
    reviewReason = "AI reply repeated a recent assistant message.";
  }

  const store = await readStore();
  const settings = getConversationSettings(store, incoming.talk_id);
  const holdReason = conversationHoldReason(settings);
  await writeStore(store);

  const reviewRequired =
    isApprovalModeEnabled(featureSettings) &&
    (aiReply.needs_review || Boolean(reviewReason));
  const shouldAutoSend =
    isAutoSendEnabled(featureSettings) &&
    !holdReason &&
    !reviewRequired &&
    Boolean(aiReply.reply);

  if (shouldAutoSend) {
    try {
      await sendReply(incoming, aiReply.reply, featureSettings);
      await recordOutgoingForMemory(incoming, aiReply.reply, { source: "auto" });
      await appendAutomationEvent({
        level: "success",
        type: "auto_sent",
        message: "Auto-sent OpenAI reply.",
        talk_id: incoming.talk_id,
        contact_id: incoming.contact_id,
        conversation_key: conversationKey,
        reason: reviewReason || ""
      });
      console.log(`Auto-sent reply for talk_id=${incoming.talk_id}.`);
      return;
    } catch (error) {
      await saveDraft({
        provider: normalizeProvider(incoming.provider),
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
        reason: `Auto-send failed: ${error.message}`
      });
      await appendAutomationEvent({
        level: "error",
        type: "send_failed",
        message: "Auto-send failed after OpenAI generated a reply.",
        talk_id: incoming.talk_id,
        contact_id: incoming.contact_id,
        conversation_key: conversationKey,
        reason: error.message
      });
      console.error(`Auto-send failed for talk_id=${incoming.talk_id}:`, error);
      return;
    }
  }

  await saveDraft({
    provider: normalizeProvider(incoming.provider),
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
      reviewReason ||
      holdReason ||
      (reviewRequired
        ? "Approval mode is on, so this reply was saved for review."
        : "AUTO_SEND is not true.")
  });

  await appendAutomationEvent({
    level: "warn",
    type: "draft_saved",
    message: "Saved OpenAI draft instead of sending.",
    talk_id: incoming.talk_id,
    contact_id: incoming.contact_id,
    conversation_key: conversationKey,
    reason:
      reviewReason ||
      holdReason ||
      (reviewRequired
        ? "Approval mode required review."
        : "AUTO_SEND is off or reply was empty.")
  });

  console.log(`Saved pending draft for talk_id=${incoming.talk_id}.`);
}

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
      appendAutomationEvent({
        level: "info",
        type: "ignored",
        message: "Zernio webhook ignored: unexpected event type.",
        talk_id: incoming.talk_id,
        contact_id: incoming.contact_id,
        reason: `event_type=${incoming.event_type}`
      }).catch((error) => console.error("Automation event logging failed:", error));
      return;
    }

    processIncomingMessage(incoming, parsedPayload).catch((error) => {
      appendAutomationEvent({
        level: "error",
        type: "processing_failed",
        message: "Webhook processing failed after receipt.",
        talk_id: incoming.talk_id,
        contact_id: incoming.contact_id,
        reason: error.message
      }).catch((loggingError) =>
        console.error("Automation event logging failed:", loggingError)
      );
      console.error("Zernio webhook processing failed:", error);
    });
  }
);

app.use(express.json({ limit: "1mb" }));

app.get("/", (_req, res) => {
  res.type("html").send(renderModernHomePage());
});

app.get("/discovery", async (req, res, next) => {
  try {
    const leadId = await recordBookingLinkClick(req);
    const redirectUrl = new URL(BOOKING_URL);

    if (leadId) {
      redirectUrl.searchParams.set("lead_id", leadId);
    }

    res.redirect(302, redirectUrl.toString());
  } catch (error) {
    next(error);
  }
});

app.get("/dashboard", (_req, res) => {
  res.type("html").send(renderModernHomePage());
});

app.get("/manifest.webmanifest", (_req, res) => {
  res.type("application/manifest+json").send(
    JSON.stringify({
      name: "Pallet Pros DM Setter",
      short_name: "DM Setter",
      description: "Zernio and OpenAI Instagram DM appointment setter.",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#f7f8fb",
      theme_color: "#11231f",
      icons: [
        {
          src: "/app-icon.svg",
          sizes: "any",
          type: "image/svg+xml",
          purpose: "any maskable"
        }
      ]
    })
  );
});

app.get("/app-icon.svg", (_req, res) => {
  res.type("image/svg+xml").send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#11231f"/>
  <path d="M126 154h260c22 0 40 18 40 40v112c0 22-18 40-40 40H232l-74 62c-13 11-32 2-32-15v-47h-14c-22 0-40-18-40-40V194c0-22 18-40 40-40h14z" fill="#f5c15c"/>
  <path d="M154 220h205M154 272h146" stroke="#11231f" stroke-width="28" stroke-linecap="round"/>
</svg>`);
});

app.get("/sw.js", (_req, res) => {
  res
    .type("application/javascript")
    .send(`self.addEventListener("install", event => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});`);
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

app.get("/api/automation-events", async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 40)));
    const store = await readStore();
    const events = (Array.isArray(store.automationEvents) ? store.automationEvents : [])
      .slice()
      .sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0))
      .slice(0, limit);

    res.json({ events });
  } catch (error) {
    next(error);
  }
});

app.get("/api/stats", async (req, res, next) => {
  try {
    const store = await readStore();
    const timeframe = resolveTimeframe(req.query.timeframe);
    const day = todayKey();
    const stats = getDailyStats(store, day);
    const allTimeStats = getAllTimeStats(store);
    const timeframeStats = statsForTimeframe(store, timeframe);
    const funnel = conversationKpisForTimeframe(store, timeframe);
    const touchpoints = touchpointKpisForTimeframe(store, timeframe);
    const providerSettings = getProviderSettings(store);
    const featureSettings = getFeatureSettings(store);
    const businessKnowledge = await loadKnowledgeBase();
    const delayBounds = humanSendDelayBounds(featureSettings);

    res.json({
      day,
      timeframe,
      stats: publicStats(stats),
      today_stats: publicStats(stats),
      all_time_stats: publicStats(allTimeStats),
      timeframe_stats: publicStats(timeframeStats),
      funnel,
      touchpoints,
      settings: {
        auto_send: isAutoSendEnabled(featureSettings),
        approval_mode: isApprovalModeEnabled(featureSettings),
        humanize_replies_enabled: isHumanizeRepliesEnabled(featureSettings),
        typing_indicator_enabled: isTypingIndicatorEnabled(featureSettings),
        human_send_delay_enabled: isHumanSendDelayEnabled(featureSettings),
        conversation_memory_enabled: isConversationMemoryEnabled(featureSettings),
        follow_ups_enabled: isFollowUpsEnabled(featureSettings),
        zernio_configured: Boolean(process.env.ZERNIO_API_KEY),
        knowledge_base_configured: Boolean(businessKnowledge),
        manual_takeover_minutes: manualTakeoverMinutes(featureSettings),
        human_send_delay_min_ms: delayBounds.minMs,
        human_send_delay_max_ms: delayBounds.maxMs,
        follow_up_offsets_minutes: FOLLOW_UP_OFFSETS_MS.map((offsetMs) =>
          Math.round(offsetMs / 60_000)
        ),
        memory_store_messages: MAX_RECENT_MEMORY_MESSAGES,
        memory_prompt_messages: MAX_PROMPT_MEMORY_MESSAGES,
        custom_data_dir: Boolean(process.env.DATA_DIR),
        store_backend: storeBackend(),
        supabase_configured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY),
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
      "approval_mode",
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

app.post("/api/webhooks/booking-confirmed", async (req, res, next) => {
  try {
    const leadId =
      pickValue(req.body || {}, [
        "lead_id",
        "ig_user_id",
        "IG_USER_ID",
        "data.lead_id",
        "data.ig_user_id",
        "query.lead_id",
        "url_params.lead_id",
        "contact.lead_id",
        "metadata.lead_id"
      ]) ||
      req.query.lead_id ||
      req.query.id;

    if (!leadId) {
      res.status(400).json({ ok: false, error: "Missing lead_id or id." });
      return;
    }

    const event = await recordAppointmentScheduled({
      leadId,
      source: "booking_confirmed_webhook",
      payload: req.body || {}
    });

    res.json({ ok: true, event });
  } catch (error) {
    next(error);
  }
});

app.post("/api/manual-takeover", async (req, res, next) => {
  try {
    const minutes = Number(req.body.minutes);

    if (!Number.isFinite(minutes) || minutes < 0) {
      res.status(400).json({
        ok: false,
        error: "minutes must be a positive number or 0."
      });
      return;
    }

    const store = await readStore();
    const featureSettings = getFeatureSettings(store);
    featureSettings.manual_takeover_minutes = minutes;
    await writeStore(store);

    res.json({
      ok: true,
      manual_takeover_minutes: manualTakeoverMinutes(getFeatureSettings(store)),
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

    if (provider !== "zernio") {
      res.status(400).json({ ok: false, error: "Provider must be zernio." });
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

app.get("/api/conversations", async (req, res, next) => {
  try {
    const store = await readStore();
    const timeframe = resolveTimeframe(req.query.timeframe || "all");
    const conversations = Object.values(store.conversations)
      .filter((memory) => conversationInTimeframe(memory, timeframe))
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
    res.json({ conversations, timeframe });
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

app.post("/api/conversations/:key/send-booking-link", async (req, res, next) => {
  try {
    const store = await readStore();
    const memory = store.conversations[req.params.key];

    if (!memory) {
      res.status(404).json({ ok: false, error: "Conversation not found" });
      return;
    }

    const messageLike = {
      provider: memory.provider,
      contact_id: memory.contact_id,
      chat_id: memory.chat_id,
      talk_id: memory.current_talk_id,
      zernio_conversation_id: memory.zernio_conversation_id,
      zernio_account_id: memory.zernio_account_id,
      origin: memory.origin
    };
    const reply =
      "Bet. Here's the calendar:\n" +
      trackedBookingUrl(messageLike) +
      "\n\nChoose a weekday time that works for you.";
    const featureSettings = getFeatureSettings(store);

    try {
      await sendReply(messageLike, reply, featureSettings);
    } catch (error) {
      res.status(502).json({ ok: false, error: error.message });
      return;
    }

    await recordOutgoingForMemory(messageLike, reply, { source: "manual_booking_link" });
    const updatedStore = await readStore();
    const updatedMemory = updatedStore.conversations[req.params.key] || memory;
    const settings = getConversationSettings(updatedStore, updatedMemory.current_talk_id);

    res.json({
      ok: true,
      reply,
      conversation: publicConversation(updatedMemory, settings)
    });
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
        reply: joinedReplyText(ruleBasedReply),
        messages: replyMessages(ruleBasedReply),
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
  <meta name="theme-color" content="#11231f">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="DM Setter">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/app-icon.svg" type="image/svg+xml">
  <title>Pallet Pros DM Setter</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fb;
      --panel: #ffffff;
      --panel-soft: #f1f5f3;
      --ink: #11231f;
      --text: #1d2b31;
      --muted: #65747b;
      --border: #d9e1e4;
      --line: #eef2f4;
      --send: #11745b;
      --discard: #9b2c2c;
      --pause: #8a5a16;
      --focus: #2364d2;
      --accent: #f5c15c;
      --blue: #2f6fb2;
      --shadow: 0 16px 40px rgba(17, 35, 31, 0.08);
    }

    * { box-sizing: border-box; }

    html {
      background: var(--bg);
      -webkit-text-size-adjust: 100%;
    }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      line-height: 1.45;
    }

    main {
      width: min(1120px, calc(100% - 32px));
      margin: 0 auto;
      padding: 22px 0 42px;
    }

    header {
      background: var(--ink);
      border: 1px solid #223a34;
      border-radius: 18px;
      box-shadow: var(--shadow);
      color: #f8faf9;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 18px;
      min-height: 132px;
      padding: 22px;
    }

    .eyebrow {
      color: var(--accent);
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.08em;
      margin: 0 0 6px;
      text-transform: uppercase;
    }

    h1 {
      margin: 0;
      font-size: clamp(28px, 4vw, 44px);
      font-weight: 800;
      letter-spacing: 0;
      line-height: 1.04;
    }

    .header-copy {
      color: #bed0ca;
      margin: 10px 0 0;
      max-width: 680px;
    }

    .status-card {
      align-items: flex-end;
      display: grid;
      gap: 8px;
      justify-items: end;
      min-width: 180px;
    }

    #status {
      min-height: 22px;
      color: #dce7e3;
      font-size: 14px;
      text-align: right;
    }

    .live-pill {
      align-items: center;
      background: rgba(245, 193, 92, 0.14);
      border: 1px solid rgba(245, 193, 92, 0.34);
      border-radius: 999px;
      color: #ffe4aa;
      display: inline-flex;
      font-size: 12px;
      font-weight: 800;
      gap: 8px;
      min-height: 34px;
      padding: 0 12px;
      white-space: nowrap;
    }

    .live-pill::before {
      background: #49d17c;
      border-radius: 999px;
      content: "";
      height: 8px;
      width: 8px;
    }

    .stats-grid {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-bottom: 16px;
    }

    .stat {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 14px;
      box-shadow: 0 8px 22px rgba(17, 35, 31, 0.05);
      min-height: 88px;
      padding: 14px;
    }

    .stat strong {
      display: block;
      font-size: 28px;
      line-height: 1.15;
    }

    .stat span {
      color: var(--muted);
      display: block;
      font-size: 12px;
      margin-top: 4px;
    }

    .stat small {
      color: var(--blue);
      display: block;
      font-size: 11px;
      margin-top: 2px;
      text-transform: uppercase;
      font-weight: 800;
    }

    .flags {
      color: var(--muted);
      display: flex;
      flex-wrap: wrap;
      font-size: 12px;
      gap: 8px;
      margin: 0 0 14px;
    }

    .flag {
      background: #eef4f1;
      border: 1px solid #dce8e3;
      border-radius: 999px;
      color: #344d46;
      padding: 6px 10px;
    }

    .provider-controls {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0 0 14px;
    }

    .delay-controls {
      align-items: center;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 14px;
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 0 0 18px;
      padding: 12px;
    }

    .delay-controls label {
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }

    .delay-controls input {
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text);
      font: inherit;
      min-height: 42px;
      padding: 0 10px;
      width: 92px;
    }

    .section-title {
      align-items: center;
      display: flex;
      justify-content: space-between;
      gap: 14px;
      margin: 24px 0 10px;
    }

    .section-title h2 {
      font-size: 20px;
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
      min-height: 40px;
      padding: 0 14px;
    }

    .provider-toggle.is-on {
      background: #dff5eb;
      border-color: #9ed7bd;
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
      border-radius: 14px;
      box-shadow: 0 8px 24px rgba(17, 35, 31, 0.05);
      padding: 16px;
    }

    .conversation-list {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .conversation {
      display: grid;
      gap: 10px;
      min-height: 180px;
    }

    .pill {
      background: #eef4f1;
      border-radius: 999px;
      color: #40516d;
      display: inline-flex;
      font-size: 12px;
      font-weight: 700;
      padding: 4px 9px;
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
      background: #344b57;
      min-height: 38px;
      padding: 0 12px;
    }

    .pause { background: var(--pause); }
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
      background: var(--panel-soft);
      border-left: 4px solid var(--accent);
      border-radius: 10px;
      color: #364154;
      margin: 0 0 12px;
      padding: 10px 12px;
      white-space: pre-wrap;
    }

    textarea {
      display: block;
      width: 100%;
      min-height: 112px;
      resize: vertical;
      border: 1px solid var(--border);
      border-radius: 12px;
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
      border-radius: 10px;
      color: #ffffff;
      cursor: pointer;
      font-weight: 700;
      min-height: 42px;
      padding: 0 16px;
      transition: transform 120ms ease, opacity 120ms ease, box-shadow 120ms ease;
    }

    button:hover:not(:disabled) {
      box-shadow: 0 8px 18px rgba(17, 35, 31, 0.12);
      transform: translateY(-1px);
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
      border-radius: 14px;
      color: var(--muted);
      padding: 24px;
      text-align: center;
    }

    .install-note {
      background: #fff7e7;
      border: 1px solid #f2d398;
      border-radius: 14px;
      color: #6d4d12;
      font-size: 13px;
      margin: 0 0 18px;
      padding: 12px 14px;
    }

    @media (max-width: 760px) {
      main {
        width: min(100% - 20px, 980px);
        padding: 10px 0 28px;
      }

      header,
      .section-title {
        align-items: flex-start;
        flex-direction: column;
      }

      header {
        border-radius: 16px;
        min-height: auto;
        padding: 18px;
      }

      .header-copy {
        font-size: 14px;
      }

      .status-card {
        align-items: flex-start;
        justify-items: start;
        min-width: 0;
        width: 100%;
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

      .delay-controls input {
        flex: 1 1 86px;
        min-width: 0;
      }

      .provider-toggle,
      .feedback {
        flex: 1 1 calc(50% - 8px);
      }
    }

    @media (max-width: 420px) {
      h1 {
        font-size: 28px;
      }

      .stats-grid {
        gap: 8px;
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

      .actions {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <p class="eyebrow">Pallet Pros Academy</p>
        <h1>DM Setter</h1>
        <p class="header-copy">Watch drafts, auto-send status, follow-ups, and recent Instagram conversations from one mobile-friendly cockpit.</p>
      </div>
      <div class="status-card">
        <span class="live-pill">Zernio live</span>
        <div id="status"></div>
      </div>
    </header>
    <section class="install-note">On your phone, open this site in the browser menu and choose Add to Home Screen to install it like an app.</section>
    <section id="stats" class="stats-grid" aria-label="Daily tracker"></section>
    <section id="flags" class="flags" aria-label="Settings"></section>
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
        ["Link clicks", allTime.booking_link_clicks || 0, "all-time"],
        ["Prospects", today.prospects_touched || 0, "today"],
        ["AI replies", today.ai_replies_sent || 0, "today"],
        ["Drafts", today.drafts_created || 0, "today"],
        ["Follow-ups", today.followups_sent || 0, "today"],
        ["Link clicks", today.booking_link_clicks || 0, "today"]
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

      renderFeatureControls(settings);
      renderDelayControls(settings);
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
        draft.provider ? draft.provider : "zernio",
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

        setStatus(data.drafts.length + " pending - live refresh on");
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
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  </script>
</body>
</html>`;
}

function renderModernHomePage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#09110f">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-title" content="DM Setter">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/app-icon.svg" type="image/svg+xml">
  <title>Pallet Pros AI Setter</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #07100e;
      --bg-2: #0c1715;
      --panel: rgba(18, 31, 29, 0.78);
      --panel-strong: rgba(24, 39, 36, 0.92);
      --panel-soft: rgba(255, 255, 255, 0.06);
      --border: rgba(255, 255, 255, 0.12);
      --border-strong: rgba(144, 242, 215, 0.32);
      --text: #f6fbf8;
      --muted: #9fb2ad;
      --dim: #6f827d;
      --green: #39df9f;
      --teal: #45d6d0;
      --violet: #9c7cff;
      --gold: #f4c95d;
      --red: #ff6b7a;
      --blue: #69a7ff;
      --shadow: 0 22px 70px rgba(0, 0, 0, 0.34);
      --radius: 16px;
    }

    * { box-sizing: border-box; }

    html {
      min-height: 100%;
      background:
        radial-gradient(circle at 12% 8%, rgba(69, 214, 208, 0.2), transparent 28%),
        radial-gradient(circle at 88% 18%, rgba(156, 124, 255, 0.18), transparent 28%),
        linear-gradient(145deg, var(--bg), #101b1a 52%, #09110f);
      -webkit-text-size-adjust: 100%;
    }

    body {
      min-height: 100%;
      margin: 0;
      color: var(--text);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      letter-spacing: 0;
    }

    button,
    input,
    textarea,
    select {
      font: inherit;
    }

    button {
      border: 0;
      cursor: pointer;
      transition: transform 140ms ease, border-color 140ms ease, background 140ms ease, opacity 140ms ease;
    }

    button:hover:not(:disabled) {
      transform: translateY(-1px);
    }

    button:disabled {
      cursor: wait;
      opacity: 0.58;
    }

    .app {
      display: grid;
      grid-template-columns: 248px minmax(0, 1fr);
      min-height: 100vh;
    }

    .sidebar {
      border-right: 1px solid var(--border);
      background: rgba(4, 11, 10, 0.64);
      backdrop-filter: blur(22px);
      padding: 22px 16px;
      position: sticky;
      top: 0;
      height: 100vh;
    }

    .brand {
      align-items: center;
      display: flex;
      gap: 12px;
      margin-bottom: 28px;
    }

    .brand-mark {
      align-items: center;
      background: linear-gradient(135deg, rgba(69, 214, 208, 0.24), rgba(156, 124, 255, 0.28));
      border: 1px solid var(--border-strong);
      border-radius: 14px;
      display: grid;
      font-size: 18px;
      font-weight: 900;
      height: 46px;
      justify-items: center;
      width: 46px;
    }

    .brand strong {
      display: block;
      font-size: 15px;
      line-height: 1.15;
    }

    .brand span {
      color: var(--muted);
      display: block;
      font-size: 12px;
      margin-top: 3px;
    }

    .nav {
      display: grid;
      gap: 8px;
    }

    .nav a,
    .bottom-nav a {
      align-items: center;
      border: 1px solid transparent;
      border-radius: 14px;
      color: var(--muted);
      display: flex;
      gap: 10px;
      min-height: 48px;
      padding: 0 13px;
      text-decoration: none;
    }

    .nav a.active,
    .nav a:hover,
    .bottom-nav a.active {
      background: rgba(255, 255, 255, 0.07);
      border-color: var(--border);
      color: var(--text);
    }

    .main {
      min-width: 0;
      padding: 24px 26px 46px;
    }

    .topbar {
      align-items: flex-start;
      display: flex;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 20px;
    }

    .eyebrow {
      color: var(--teal);
      font-size: 12px;
      font-weight: 800;
      margin: 0 0 7px;
      text-transform: uppercase;
    }

    h1,
    h2,
    h3,
    p {
      margin-top: 0;
    }

    h1 {
      font-size: clamp(30px, 5vw, 54px);
      line-height: 0.98;
      margin-bottom: 9px;
    }

    .subhead {
      color: var(--muted);
      max-width: 780px;
      margin-bottom: 0;
    }

    .status-stack {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
      min-width: 275px;
    }

    .status-pill {
      align-items: center;
      background: rgba(57, 223, 159, 0.1);
      border: 1px solid rgba(57, 223, 159, 0.28);
      border-radius: 999px;
      color: #dffdf2;
      display: inline-flex;
      font-size: 12px;
      font-weight: 800;
      gap: 8px;
      min-height: 36px;
      padding: 0 12px;
      white-space: nowrap;
    }

    .status-pill::before {
      background: var(--green);
      border-radius: 50%;
      box-shadow: 0 0 16px rgba(57, 223, 159, 0.8);
      content: "";
      height: 8px;
      width: 8px;
    }

    .timeframe {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 18px;
      padding: 7px;
    }

    .timeframe button {
      background: transparent;
      border-radius: 12px;
      color: var(--muted);
      min-height: 40px;
      padding: 0 15px;
    }

    .timeframe button.active {
      background: linear-gradient(135deg, rgba(69, 214, 208, 0.9), rgba(156, 124, 255, 0.86));
      color: #06100f;
      font-weight: 900;
    }

    .grid {
      display: grid;
      gap: 14px;
    }

    .kpis {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-bottom: 16px;
    }

    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      backdrop-filter: blur(24px);
    }

    .kpi {
      min-height: 142px;
      overflow: hidden;
      padding: 17px;
      position: relative;
    }

    .kpi::after {
      background: linear-gradient(135deg, rgba(69, 214, 208, 0.26), rgba(156, 124, 255, 0.14));
      border-radius: 50%;
      content: "";
      height: 110px;
      position: absolute;
      right: -34px;
      top: -34px;
      width: 110px;
    }

    .kpi span {
      color: var(--muted);
      display: block;
      font-size: 13px;
      font-weight: 800;
      margin-bottom: 16px;
    }

    .kpi strong {
      display: block;
      font-size: 34px;
      line-height: 1;
      position: relative;
      z-index: 1;
    }

    .kpi small {
      color: var(--teal);
      display: block;
      font-size: 12px;
      font-weight: 800;
      margin-top: 8px;
      position: relative;
      z-index: 1;
    }

    .content-grid {
      align-items: start;
      grid-template-columns: minmax(0, 1.15fr) minmax(340px, 0.85fr);
    }

    .panel {
      padding: 18px;
    }

    .panel-head {
      align-items: center;
      display: flex;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 14px;
    }

    .panel h2 {
      font-size: 18px;
      margin: 0;
    }

    .panel-note {
      color: var(--muted);
      font-size: 13px;
    }

    .funnel {
      display: grid;
      gap: 12px;
    }

    .funnel-row {
      display: grid;
      gap: 8px;
    }

    .funnel-label {
      align-items: center;
      display: flex;
      justify-content: space-between;
      color: var(--muted);
      font-size: 13px;
      font-weight: 800;
    }

    .bar {
      background: rgba(255, 255, 255, 0.07);
      border-radius: 999px;
      height: 12px;
      overflow: hidden;
    }

    .bar span {
      background: linear-gradient(90deg, var(--teal), var(--violet));
      border-radius: inherit;
      display: block;
      height: 100%;
      min-width: 4px;
      transition: width 240ms ease;
    }

    .activity {
      display: grid;
      gap: 10px;
      max-height: 720px;
      overflow: auto;
      padding-right: 3px;
    }

    .lead {
      background: rgba(255, 255, 255, 0.055);
      border: 1px solid var(--border);
      border-radius: 16px;
      display: grid;
      gap: 12px;
      padding: 14px;
    }

    .lead-top {
      align-items: center;
      display: grid;
      gap: 12px;
      grid-template-columns: 48px minmax(0, 1fr) auto;
    }

    .avatar {
      align-items: center;
      background: linear-gradient(135deg, rgba(69, 214, 208, 0.42), rgba(244, 201, 93, 0.26));
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 50%;
      display: grid;
      font-weight: 900;
      height: 48px;
      justify-items: center;
      overflow: hidden;
      width: 48px;
    }

    .avatar img {
      height: 100%;
      object-fit: cover;
      width: 100%;
    }

    .lead-name {
      display: block;
      font-size: 15px;
      font-weight: 900;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lead-meta,
    .lead-message {
      color: var(--muted);
      font-size: 12px;
    }

    .lead-message {
      line-height: 1.4;
    }

    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .tag {
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid var(--border);
      border-radius: 999px;
      color: var(--muted);
      display: inline-flex;
      font-size: 11px;
      font-weight: 900;
      min-height: 26px;
      padding: 5px 8px;
      text-transform: uppercase;
    }

    .tag.green { color: #c9ffe9; border-color: rgba(57, 223, 159, 0.35); }
    .tag.gold { color: #ffe7a3; border-color: rgba(244, 201, 93, 0.4); }
    .tag.blue { color: #d7e8ff; border-color: rgba(105, 167, 255, 0.42); }
    .tag.red { color: #ffd7dd; border-color: rgba(255, 107, 122, 0.42); }
    .tag.violet { color: #e6ddff; border-color: rgba(156, 124, 255, 0.42); }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .action {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--border);
      border-radius: 12px;
      color: var(--text);
      font-size: 12px;
      font-weight: 900;
      min-height: 40px;
      padding: 0 11px;
    }

    .action.primary {
      background: rgba(57, 223, 159, 0.16);
      border-color: rgba(57, 223, 159, 0.35);
    }

    .action.warn {
      background: rgba(244, 201, 93, 0.12);
      border-color: rgba(244, 201, 93, 0.38);
    }

    .controls {
      display: grid;
      gap: 10px;
    }

    .control-row {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .toggle {
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid var(--border);
      border-radius: 999px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 900;
      min-height: 40px;
      padding: 0 12px;
    }

    .toggle.on {
      background: rgba(57, 223, 159, 0.14);
      border-color: rgba(57, 223, 159, 0.36);
      color: #dffdf2;
    }

    .toggle.off {
      background: rgba(255, 107, 122, 0.1);
      border-color: rgba(255, 107, 122, 0.32);
      color: #ffd8de;
    }

    .test-grid {
      display: grid;
      gap: 10px;
      grid-template-columns: 1fr 1fr;
      margin-top: 12px;
    }

    textarea {
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid var(--border);
      border-radius: 14px;
      color: var(--text);
      min-height: 118px;
      padding: 12px;
      resize: vertical;
      width: 100%;
    }

    textarea:focus {
      border-color: rgba(69, 214, 208, 0.6);
      outline: none;
    }

    .result {
      color: var(--muted);
      font-size: 13px;
      margin-top: 10px;
      white-space: pre-wrap;
    }

    .drafts {
      display: grid;
      gap: 10px;
    }

    .events {
      display: grid;
      gap: 8px;
      margin-top: 12px;
      max-height: 210px;
      overflow: auto;
    }

    .event {
      background: rgba(255, 255, 255, 0.055);
      border: 1px solid var(--border);
      border-radius: 13px;
      color: var(--muted);
      display: grid;
      gap: 4px;
      font-size: 12px;
      padding: 10px;
    }

    .event strong {
      color: var(--text);
      font-size: 12px;
    }

    .event.error { border-color: rgba(255, 107, 122, 0.42); }
    .event.warn { border-color: rgba(244, 201, 93, 0.42); }
    .event.success { border-color: rgba(57, 223, 159, 0.42); }

    .empty {
      border: 1px dashed var(--border);
      border-radius: 16px;
      color: var(--muted);
      padding: 22px;
      text-align: center;
    }

    .toast {
      color: var(--muted);
      font-size: 13px;
      min-height: 19px;
    }

    .bottom-nav {
      display: none;
    }

    @media (prefers-color-scheme: light) {
      :root {
        color-scheme: light;
        --bg: #edf5f2;
        --bg-2: #f8fbfa;
        --panel: rgba(255, 255, 255, 0.78);
        --panel-strong: rgba(255, 255, 255, 0.92);
        --panel-soft: rgba(9, 17, 15, 0.06);
        --border: rgba(9, 17, 15, 0.12);
        --text: #07100e;
        --muted: #52635f;
        --dim: #73847f;
      }
    }

    @media (max-width: 1020px) {
      .app {
        grid-template-columns: 1fr;
      }

      .sidebar {
        display: none;
      }

      .main {
        padding: 18px 14px 90px;
      }

      .topbar {
        display: grid;
      }

      .status-stack {
        justify-content: flex-start;
        min-width: 0;
      }

      .kpis,
      .content-grid,
      .test-grid {
        grid-template-columns: 1fr;
      }

      .bottom-nav {
        background: rgba(4, 11, 10, 0.72);
        backdrop-filter: blur(20px);
        border: 1px solid var(--border);
        border-radius: 18px 18px 0 0;
        bottom: 0;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        left: 0;
        padding: 7px 8px max(7px, env(safe-area-inset-bottom));
        position: fixed;
        right: 0;
        z-index: 20;
      }

      .bottom-nav a {
        border-radius: 14px;
        display: grid;
        font-size: 11px;
        gap: 2px;
        justify-items: center;
        min-height: 52px;
        padding: 5px 3px;
      }
    }

    @media (max-width: 560px) {
      .main {
        padding-left: 10px;
        padding-right: 10px;
      }

      .timeframe {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
      }

      .timeframe button {
        min-height: 44px;
        padding: 0 8px;
      }

      .kpi {
        min-height: 118px;
      }

      .lead-top {
        grid-template-columns: 48px minmax(0, 1fr);
      }

      .lead-top .tag {
        grid-column: 1 / -1;
        width: fit-content;
      }

      .actions {
        display: grid;
        grid-template-columns: 1fr;
      }

      .action {
        min-height: 48px;
      }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">AS</div>
        <div><strong>Pallet Pros</strong><span>AI Setter v2</span></div>
      </div>
      <nav class="nav" aria-label="Primary">
        <a class="active" href="#dashboard">Dashboard</a>
        <a href="#activity">Live Logs</a>
        <a href="#settings">Prompt Settings</a>
        <a href="#analytics">Analytics</a>
      </nav>
    </aside>

    <main class="main">
      <section class="topbar" id="dashboard">
        <div>
          <p class="eyebrow">Instagram auto-reply and analytics</p>
          <h1>Your Lead Pulse</h1>
          <p class="subhead">Track incoming IG leads, AI responses, calendar-link clicks, and booked discovery calls from one mobile-ready command center.</p>
        </div>
        <div>
          <div class="status-stack">
            <span class="status-pill" id="bot-status">OpenAI Bot: Checking</span>
            <span class="status-pill" id="webhook-status">IG Webhook: Checking</span>
          </div>
          <div class="toast" id="status"></div>
        </div>
      </section>

      <section class="timeframe" aria-label="Timeframe selector">
        <button type="button" data-range="24h" class="active">24 Hours</button>
        <button type="button" data-range="7d">7 Days</button>
        <button type="button" data-range="30d">30 Days</button>
        <button type="button" data-range="90d">90 Days</button>
        <button type="button" data-range="ytd">YTD</button>
        <button type="button" data-range="all">All Time</button>
      </section>

      <section class="grid kpis" id="kpis" aria-label="KPI summary"></section>

      <section class="grid content-grid">
        <section class="card panel" id="analytics">
          <div class="panel-head">
            <h2>Conversion Funnel</h2>
            <span class="panel-note" id="range-label">24 Hours</span>
          </div>
          <div class="funnel" id="funnel"></div>
        </section>

        <section class="card panel" id="settings">
          <div class="panel-head">
            <h2>Operations</h2>
            <span class="panel-note">Live controls</span>
          </div>
          <div class="controls">
            <div class="control-row" id="features"></div>
            <div class="control-row" id="flags"></div>
            <div class="events" id="automation-events"></div>
          </div>
        </section>
      </section>

      <section class="grid content-grid" style="margin-top:14px;">
        <section class="card panel" id="activity">
          <div class="panel-head">
            <h2>Real-Time Activity Feed</h2>
            <span class="panel-note" id="activity-count"></span>
          </div>
          <div class="activity" id="conversations"></div>
        </section>

        <section class="card panel">
          <div class="panel-head">
            <h2>Test Reply</h2>
            <span class="panel-note">Preview only</span>
          </div>
          <div class="test-grid">
            <textarea id="test-transcript" aria-label="Test transcript" placeholder="Prospect: I want to learn pallets&#10;You: Is this something you want to pursue?"></textarea>
            <textarea id="test-new-message" aria-label="Newest test message" placeholder="Newest prospect message"></textarea>
          </div>
          <div class="actions" style="margin-top:10px;">
            <button id="test-button" class="action primary" type="button">Preview Reply</button>
          </div>
          <div id="test-result" class="result"></div>
        </section>
      </section>

      <section class="card panel" style="margin-top:14px;">
        <div class="panel-head">
          <h2>Pending Drafts</h2>
          <span class="panel-note">Approval queue</span>
        </div>
        <div id="drafts" class="drafts"></div>
      </section>
    </main>
  </div>

  <nav class="bottom-nav" aria-label="Mobile navigation">
    <a class="active" href="#dashboard">Dash</a>
    <a href="#activity">Logs</a>
    <a href="#settings">Settings</a>
    <a href="#analytics">Stats</a>
  </nav>

  <script>
    const state = { timeframe: "24h", conversations: [] };
    const conversationsEl = document.getElementById("conversations");
    const draftsEl = document.getElementById("drafts");
    const featuresEl = document.getElementById("features");
    const flagsEl = document.getElementById("flags");
    const automationEventsEl = document.getElementById("automation-events");
    const kpisEl = document.getElementById("kpis");
    const funnelEl = document.getElementById("funnel");
    const statusEl = document.getElementById("status");
    const botStatusEl = document.getElementById("bot-status");
    const webhookStatusEl = document.getElementById("webhook-status");
    const rangeLabelEl = document.getElementById("range-label");
    const activityCountEl = document.getElementById("activity-count");
    const testButton = document.getElementById("test-button");
    const testTranscript = document.getElementById("test-transcript");
    const testNewMessage = document.getElementById("test-new-message");
    const testResult = document.getElementById("test-result");

    function setStatus(message) {
      statusEl.textContent = message || "";
    }

    function timeframeLabel(value) {
      return {
        "24h": "24 Hours",
        "7d": "7 Days",
        "30d": "30 Days",
        "90d": "90 Days",
        ytd: "Year to Date",
        all: "All Time"
      }[value] || "24 Hours";
    }

    function formatDate(value) {
      if (!value) return "No timestamp";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "No timestamp";
      return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    }

    function percent(value) {
      const number = Number(value || 0);
      return number.toFixed(number % 1 ? 1 : 0) + "%";
    }

    function initials(conversation) {
      const source = conversation.username || conversation.contact_id || conversation.talk_id || "IG";
      return String(source).replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "IG";
    }

    async function api(path, options) {
      const response = await fetch(path, options);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Request failed");
      return data;
    }

    function renderKpis(data) {
      const funnel = data.funnel || {};
      const touchpoints = data.touchpoints || {};
      const totalDms = Math.max(Number((data.timeframe_stats || {}).prospects_touched || 0), Number(funnel.total_leads || 0));
      const cards = [
        ["Accounts Interacted", touchpoints.accounts_interacted || 0, timeframeLabel(state.timeframe)],
        ["Accounts Reached", touchpoints.accounts_reached || 0, "outbound touchpoints"],
        ["Total IG Leads Captured", funnel.total_leads || totalDms || 0, "conversation memory"],
        ["Booking Links Sent", funnel.booking_links_sent || 0, percent(funnel.link_sent_rate || 0) + " of leads"],
        ["Booking Link Clicks", funnel.booking_link_clicks || 0, percent(funnel.click_through_rate || 0) + " CTR"],
        ["Discovery Calls Scheduled", funnel.appointments_scheduled || 0, percent(funnel.booking_conversion_rate || 0) + " conversion"]
      ];
      kpisEl.innerHTML = "";
      cards.forEach(([label, value, detail]) => {
        const card = document.createElement("article");
        card.className = "card kpi";
        const title = document.createElement("span");
        title.textContent = label;
        const metric = document.createElement("strong");
        metric.textContent = value;
        const small = document.createElement("small");
        small.textContent = detail;
        card.append(title, metric, small);
        kpisEl.appendChild(card);
      });
    }

    function renderFunnel(data) {
      const funnel = data.funnel || {};
      const stages = [
        ["IG Leads", funnel.total_leads || 0],
        ["AI Replied", funnel.ai_replied || 0],
        ["Link Sent", funnel.booking_links_sent || 0],
        ["Link Clicked", funnel.booking_link_clicks || 0],
        ["Call Booked", funnel.appointments_scheduled || 0]
      ];
      const max = Math.max(...stages.map(([, value]) => Number(value || 0)), 1);
      funnelEl.innerHTML = "";
      stages.forEach(([label, value]) => {
        const row = document.createElement("div");
        row.className = "funnel-row";
        const top = document.createElement("div");
        top.className = "funnel-label";
        top.innerHTML = "<span>" + label + "</span><strong>" + value + "</strong>";
        const bar = document.createElement("div");
        bar.className = "bar";
        const fill = document.createElement("span");
        fill.style.width = Math.max(4, Math.round((Number(value || 0) / max) * 100)) + "%";
        bar.appendChild(fill);
        row.append(top, bar);
        funnelEl.appendChild(row);
      });
    }

    function renderStatuses(settings) {
      botStatusEl.textContent = "OpenAI Bot: " + (settings.auto_send ? "Active" : "Draft Mode");
      webhookStatusEl.textContent = "IG Webhook: " + (settings.zernio_configured ? "Operational" : "Needs Key");
      flagsEl.innerHTML = "";
      [
        ["Memory", settings.conversation_memory_enabled],
        ["Approval mode", settings.approval_mode],
        ["Follow-ups", settings.follow_ups_enabled],
        ["Typing", settings.typing_indicator_enabled],
        ["Knowledge", settings.knowledge_base_configured],
        ["Store", settings.store_backend || "json"]
      ].forEach(([label, value]) => {
        const tag = document.createElement("span");
        const isBoolean = typeof value === "boolean";
        tag.className = "tag " + (!isBoolean || value ? "green" : "red");
        tag.textContent = label + ": " + (isBoolean ? (value ? "on" : "off") : value);
        flagsEl.appendChild(tag);
      });
      renderFeatureControls(settings.feature_settings || {});
    }

    function renderFeatureControls(features) {
      featuresEl.innerHTML = "";
      [
        ["auto_send", "Auto-send"],
        ["approval_mode", "Approval mode"],
        ["follow_ups", "Auto-follow-up"],
        ["humanize_replies", "Human tone"],
        ["conversation_memory", "Context memory"]
      ].forEach(([feature, label]) => {
        const enabled = Boolean(features[feature]);
        const button = document.createElement("button");
        button.className = "toggle " + (enabled ? "on" : "off");
        button.type = "button";
        button.textContent = label + ": " + (enabled ? "on" : "off");
        button.addEventListener("click", async () => {
          button.disabled = true;
          setStatus("Saving " + label + "...");
          try {
            await api("/api/features", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ feature, enabled: !enabled })
            });
            await loadAll(true);
            setStatus(label + " saved.");
          } catch (error) {
            setStatus(error.message);
            button.disabled = false;
          }
        });
        featuresEl.appendChild(button);
      });
    }

    function statusTags(conversation) {
      const tags = [];
      if (conversation.last_outgoing_at) tags.push(["AI Replied", "green"]);
      if (conversation.booking_link_sent) tags.push(["Link Sent", "blue"]);
      if (conversation.booking_link_clicked) tags.push(["Link Clicked", "gold"]);
      if (conversation.booking_confirmed) tags.push(["Appointment Scheduled", "violet"]);
      if (conversation.ai_paused || conversation.manual_takeover_active) tags.push(["Paused", "red"]);
      return tags.length ? tags : [["New Lead", "blue"]];
    }

    function renderConversation(conversation) {
      const card = document.createElement("article");
      card.className = "lead";
      const top = document.createElement("div");
      top.className = "lead-top";
      const avatar = document.createElement("div");
      avatar.className = "avatar";
      if (conversation.avatar_url) {
        const image = document.createElement("img");
        image.src = conversation.avatar_url;
        image.alt = "";
        image.loading = "lazy";
        image.onerror = () => {
          avatar.textContent = initials(conversation);
        };
        avatar.appendChild(image);
      } else {
        avatar.textContent = initials(conversation);
      }

      const info = document.createElement("div");
      const name = document.createElement("strong");
      name.className = "lead-name";
      name.textContent = conversation.username ? "@" + conversation.username : conversation.contact_id || conversation.talk_id || "Instagram lead";
      const meta = document.createElement("div");
      meta.className = "lead-meta";
      meta.textContent = formatDate(conversation.last_incoming_at || conversation.last_outgoing_at) + " · " + (conversation.origin || "instagram");
      info.append(name, meta);

      const status = document.createElement("span");
      status.className = "tag " + (conversation.lead_status === "booked" ? "violet" : conversation.lead_status === "hot" ? "gold" : "blue");
      status.textContent = String(conversation.lead_status || "cold").replace("_", " ");
      top.append(avatar, info, status);

      const tags = document.createElement("div");
      tags.className = "tags";
      statusTags(conversation).forEach(([label, color]) => {
        const tag = document.createElement("span");
        tag.className = "tag " + color;
        tag.textContent = label;
        tags.appendChild(tag);
      });

      const message = document.createElement("div");
      message.className = "lead-message";
      const lastText = conversation.last_message && conversation.last_message.text ? conversation.last_message.text : conversation.summary || "No recent message yet.";
      message.textContent = lastText;

      const actions = document.createElement("div");
      actions.className = "actions";
      const paused = Boolean(conversation.ai_paused || conversation.manual_takeover_active);
      const pauseButton = document.createElement("button");
      pauseButton.className = "action warn";
      pauseButton.type = "button";
      pauseButton.textContent = paused ? "Resume AI" : "Pause AI";
      pauseButton.addEventListener("click", async () => {
        pauseButton.disabled = true;
        try {
          await api("/api/conversations/" + encodeURIComponent(conversation.key) + (paused ? "/resume" : "/pause"), { method: "POST" });
          await loadAll(true);
          setStatus(paused ? "AI resumed." : "AI paused for this lead.");
        } catch (error) {
          setStatus(error.message);
          pauseButton.disabled = false;
        }
      });

      const linkButton = document.createElement("button");
      linkButton.className = "action primary";
      linkButton.type = "button";
      linkButton.textContent = "Send Booking Link";
      linkButton.addEventListener("click", async () => {
        linkButton.disabled = true;
        setStatus("Sending tracked booking link...");
        try {
          await api("/api/conversations/" + encodeURIComponent(conversation.key) + "/send-booking-link", { method: "POST" });
          await loadAll(true);
          setStatus("Tracked booking link sent.");
        } catch (error) {
          setStatus(error.message);
          linkButton.disabled = false;
        }
      });

      actions.append(pauseButton, linkButton);
      card.append(top, tags, message, actions);
      return card;
    }

    function renderConversations(conversations) {
      conversationsEl.innerHTML = "";
      const visible = (conversations || []).slice(0, 20);
      activityCountEl.textContent = visible.length + " visible";
      if (!visible.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No Instagram activity in this timeframe yet.";
        conversationsEl.appendChild(empty);
        return;
      }
      visible.forEach((conversation) => conversationsEl.appendChild(renderConversation(conversation)));
    }

    function renderDrafts(drafts) {
      draftsEl.innerHTML = "";
      if (!drafts || !drafts.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No pending drafts.";
        draftsEl.appendChild(empty);
        return;
      }
      drafts.slice(0, 8).forEach((draft) => {
        const card = document.createElement("article");
        card.className = "lead";
        const text = document.createElement("div");
        text.className = "lead-message";
        text.textContent = draft.reply || "Draft is empty.";
        const actions = document.createElement("div");
        actions.className = "actions";
        const send = document.createElement("button");
        send.className = "action primary";
        send.type = "button";
        send.textContent = "Send";
        send.addEventListener("click", async () => {
          send.disabled = true;
          try {
            await api("/api/drafts/" + encodeURIComponent(draft.id) + "/approve", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reply: draft.reply })
            });
            await loadAll(true);
            setStatus("Draft sent.");
          } catch (error) {
            setStatus(error.message);
            send.disabled = false;
          }
        });
        const discard = document.createElement("button");
        discard.className = "action";
        discard.type = "button";
        discard.textContent = "Discard";
        discard.addEventListener("click", async () => {
          discard.disabled = true;
          try {
            await api("/api/drafts/" + encodeURIComponent(draft.id) + "/reject", { method: "POST" });
            await loadAll(true);
            setStatus("Draft discarded.");
          } catch (error) {
            setStatus(error.message);
            discard.disabled = false;
          }
        });
        actions.append(send, discard);
        card.append(text, actions);
        draftsEl.appendChild(card);
      });
    }

    function renderAutomationEvents(events) {
      automationEventsEl.innerHTML = "";
      const visible = (events || []).slice(0, 8);
      if (!visible.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No automation events yet.";
        automationEventsEl.appendChild(empty);
        return;
      }

      visible.forEach((event) => {
        const row = document.createElement("div");
        row.className = "event " + (event.level || "info");
        const top = document.createElement("strong");
        top.textContent = (event.type || "event").replace("_", " ") + " · " + formatDate(event.created_at);
        const message = document.createElement("span");
        message.textContent = event.message || "";
        const reason = document.createElement("span");
        reason.textContent = event.reason || event.talk_id || "";
        row.append(top, message);
        if (reason.textContent) row.appendChild(reason);
        automationEventsEl.appendChild(row);
      });
    }

    async function loadAll(silent) {
      if (!silent) setStatus("Refreshing...");
      try {
        const query = "?timeframe=" + encodeURIComponent(state.timeframe);
        const [stats, conversations, drafts, events] = await Promise.all([
          api("/api/stats" + query),
          api("/api/conversations" + query),
          api("/api/drafts"),
          api("/api/automation-events?limit=25")
        ]);
        rangeLabelEl.textContent = timeframeLabel(state.timeframe);
        renderKpis(stats);
        renderFunnel(stats);
        renderStatuses(stats.settings || {});
        renderConversations(conversations.conversations || []);
        renderDrafts(drafts.drafts || []);
        renderAutomationEvents(events.events || []);
        if (!silent) setStatus("Live.");
      } catch (error) {
        setStatus(error.message);
      }
    }

    document.querySelectorAll("[data-range]").forEach((button) => {
      button.addEventListener("click", () => {
        state.timeframe = button.dataset.range;
        document.querySelectorAll("[data-range]").forEach((item) => item.classList.toggle("active", item === button));
        loadAll();
      });
    });

    testButton.addEventListener("click", async () => {
      testButton.disabled = true;
      testResult.textContent = "";
      setStatus("Generating preview...");
      try {
        const data = await api("/api/test-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: testTranscript.value, new_message: testNewMessage.value })
        });
        testResult.textContent = "Lead status: " + String(data.lead_status || "cold").replace("_", " ") + "\\nNeeds review: " + (data.needs_review ? "yes" : "no") + "\\n\\n" + data.reply;
        setStatus("Preview ready.");
      } catch (error) {
        setStatus(error.message);
      } finally {
        testButton.disabled = false;
      }
    });

    loadAll();
    setInterval(() => loadAll(true), 10000);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
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
      console.log(`Zernio OpenAI IG auto-reply app listening on port ${PORT}`);
      console.log(`AUTO_SEND=${isAutoSendEnabled(featureSettings)}`);
      console.log(`CONVERSATION_MEMORY_ENABLED=${isConversationMemoryEnabled(featureSettings)}`);
      console.log(`FOLLOW_UPS_ENABLED=${isFollowUpsEnabled(featureSettings)}`);
    });
  })
  .catch((error) => {
    console.error("Failed to initialize local JSON store:", error);
    process.exit(1);
  });
