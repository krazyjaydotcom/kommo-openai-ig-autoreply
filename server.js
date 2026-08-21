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
const BOOKING_URL = "https://www.tidycal.com/palletprosga/15-minute-meeting";
const TRACKED_BOOKING_BASE_URL =
  process.env.TRACKED_BOOKING_BASE_URL || "https://go.palletprosacademy.com/discovery";
const TRAINING_URL = "https://www.palletprosacademy.com/training";
const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE || "America/New_York";
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v20.0";
const META_GRAPH_ACCESS_TOKEN =
  process.env.META_GRAPH_ACCESS_TOKEN || process.env.INSTAGRAM_ACCESS_TOKEN || "";
const TRAINING_PLAYLIST_URL =
  "https://www.youtube.com/playlist?list=PLPFyOjF-83nJ0B5xCreYqoQzcGx-SQsvs";
const DEFAULT_WARM_TRAINING_ROUTE_PERCENT = 25;
const MAX_KNOWLEDGE_CHARS = 12_000;
const MAX_RECENT_MEMORY_MESSAGES = 40;
const MAX_PROMPT_MEMORY_MESSAGES = 20;
const MAX_SUMMARY_SOURCE_MESSAGES = 12;
const MAX_MEMORY_SUMMARY_CHARS = 1800;
const MAX_PROCESSED_MESSAGE_IDS = 100;
const MAX_LEARNING_PROMPT_CHARS = 2200;
const MAX_LEARNING_TRANSCRIPT_CHARS = 9000;
const DEFAULT_MANUAL_TAKEOVER_MINUTES = 4;
const DEFAULT_HUMAN_SEND_DELAY_MIN_MS = 2500;
const DEFAULT_HUMAN_SEND_DELAY_MAX_MS = 7000;
const APP_OUTGOING_ECHO_WINDOW_MS = 15 * 60 * 1000;
const CALENDAR_SEQUENCE_GAP_MS = 8 * 1000;
const FOLLOW_UP_OFFSETS_MS = [
  45 * 60 * 1000,
  4 * 60 * 60 * 1000,
  18 * 60 * 60 * 1000
];
const FOLLOW_UP_CHECK_MS = 60 * 1000;
const FOLLOW_UP_WINDOW_MS = 23 * 60 * 60 * 1000;
const LEARNING_REVIEW_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const LEARNING_REVIEW_CHECK_MS = 60 * 60 * 1000;
const APP_BUILD_MARKER = "2026-08-10-inbox-no-autofocus-v1";
const DEFAULT_KPI_TARGETS = {
  daily_touch_points_target: 100,
  touch_pitch_min_rate: 10,
  pitch_book_min_rate: 50,
  book_show_min_rate: 75,
  weekly_calls_booked_goal: 15
};
const KPI_EVENT_TYPES = new Set([
  "touch_point",
  "call_pitched",
  "call_booked",
  "call_showed",
  "call_no_show",
  "call_cancelled",
  "call_rescheduled",
  "booking_link_sent",
  "booking_link_clicked",
  "human_intervention",
  "follow_up"
]);
const INCOMING_REPLY_DEBOUNCE_MS = Math.max(
  0,
  numberEnv("INCOMING_REPLY_DEBOUNCE_MS", 20_000)
);
const SELF_INSTAGRAM_USERNAMES = new Set(
  String(process.env.OWN_INSTAGRAM_USERNAME || "palletprosacademy")
    .split(",")
    .map((value) => value.trim().replace(/^@/, "").toLowerCase())
    .filter(Boolean)
);
const SELF_INSTAGRAM_IDS = new Set(
  String(process.env.OWN_INSTAGRAM_IDS || "17841462003997282")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);
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
  learningInsights: [],
  learningState: {},
  dailyStats: {},
  kpiEvents: [],
  kpiTargets: DEFAULT_KPI_TARGETS
};
let storeWriteQueue = Promise.resolve();
const pendingIncomingReplies = new Map();

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
- Optimize for qualified conversations, qualified appointments, shows, and enrollments. Do not optimize merely for the number of calendar links sent.
- Use this progression for serious pallet-business interest: interest detected -> ask permission for 3 quick questions -> learn market -> learn why they want to start now -> learn financial/lifestyle goal -> give a short personalized Zoom invitation -> send calendar immediately after they agree to the Zoom.
- Next-step routes are: content-only -> YouTube; vague/education-needed -> training video with permission; serious but not yet qualified -> 3 quick questions; qualified -> Zoom invitation; ready-to-book -> calendar immediately.
- The prospect's message decides the route. Do not force everyone through the same script.
- If someone plainly says they want to start, learn, get started, or get into the pallet business, ask permission for 3 quick questions before probing.
- Do not ask the 3 questions like a form. Keep it conversational and ask only the next missing question.
- The 3 core areas are operating market, why now/why they want to start, and financial/lifestyle goal. If any of that information was already shared, do not ask for it again.
- If someone asks to book, schedule, talk, get the calendar, or send the link, do not force qualification. Send the calendar.
- Do not ask that discovery question when the prospect already gave motivation, assets, occupation, urgency, or asked to book. Never slow down hot prospects.
- The historically strong booking path is: interest -> useful Zoom framing -> prospect agrees to Zoom -> calendar immediately -> stay engaged while they book.
- The Zoom should feel like a working session: research their market, answer questions, and determine fit. It should not feel like a generic sales pitch.
- Once the prospect agrees to the Zoom invitation, do not ask a second permission question for the calendar link.
- If someone is vague, lightly curious, or asking how the model works without clear start intent, offer the short training video first and ask permission to send it. If they agree, send:
  https://www.palletprosacademy.com/training
- Use training strategically for appropriate warm prospects who need education. Do not send training to hot prospects who are ready for a call.
- Do not overload anyone with YouTube + training + calendar. Choose one primary CTA at a time.
- When a prospect gives context, mirror one concrete detail, answer one useful point, then choose the next route.
- Do not over-qualify in DMs. Do not ask a long series of questions. Do not teach the entire pallet business through Instagram messages.
- Once the prospect gives permission to receive the calendar link, sending the link becomes the highest-priority action. Never qualify more first, never ask if they are still interested, and never ask the booking question again.
- If the prospect asks a real question before they have agreed to the call, answer briefly first. If the question needs a soft bridge, end with: "Is that something you'd want to learn more about?" Then move to the Zoom/calendar permission step only after they accept.

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
1. First touch, if there is no prior context: "Yoo 👋 Thanks for the follow! Are you just here for the content or are you wanting to start your own pallet business?"
2. If they ask questions, answer briefly and naturally. Do not ignore the question just to push the call.
3. If they give useful context, mirror one specific detail so they feel heard.
4. If they are only lightly curious, vague, or asking follow-up questions without clear start intent, say: "Got you. I have a short training video that explains how the pallet business works. Want me to send it?"
5. If they say yes to the training video, send: "No problem. Here's the training video: https://www.palletprosacademy.com/training"
6. If they say they want to start and have not already supplied market/why-now/goal, ask permission for 3 quick questions.
7. After permission, ask only the next missing question: market, why they want to start now, then financial/lifestyle goal.
8. If they already supplied market/why-now/goal, skip those questions and move to the Zoom invitation.
9. Once qualified, use a personalized Zoom invitation for this week or next week based on the current America/New_York weekday.
10. If they agree to the Zoom, do not ask for calendar permission again. Send the calendar immediately.
11. If they ask for a call, appointment, consultation, details, or scheduling directly, send the booking link without forcing qualification.
12. If they mention a day/time instead of booking through the link, politely tell them to use the link to choose their time.
13. If they ask for a direct phone call or share their phone number, tell them to book through the link instead.
14. If they say they booked, reply: "Great. I'm looking forward to helping you get things started."
15. Do not force every interested person through the exact same script. The flow is a guide, not a word-for-word requirement.

Reply length rules:
- Default to 1 short sentence.
- Use 2 short sentences only when needed.
- Only use multiple lines when sending the booking link.
- Do not explain the whole program in DMs.
- Do not ask more than one question.
- If the prospect gives details about their market, truck, job, location, money, yards, contracts, prices, or current situation, do not ignore those details.
- If the prospect asks a question inside their message, answer that question before asking them to book or sending the calendar link.
- When answering a question before the calendar step, do not end with "Want me to send you the calendar link?" unless they already asked for the link/call. End with a softer interest question first, then move to the calendar permission message only after they accept.
- If they ask multiple questions, answer the most important one briefly and then guide them to the call.
- Do not repeat the same calendar ask, greeting, link message, or qualifying question in back-to-back replies.
- Treat agreement broadly. "Yes", "yeah", "yep", "sure", "sureee", "that's fine", "fine", "ok", "okay", "absolutely", "send it", "send me the link", "go ahead", "let's do it", "I'm down", "that works", "bet", "I'm interested", "sounds good", "when are you available?", "how do I book?", "can we talk?", and "yes that is fine" all mean send the calendar link now.
- Never use the em dash character in prospect-facing replies.
- If they ask what the call is about, say: "We'll take a look at your local market, talk about how the pallet business works, answer your questions and see if Pallet Pros Academy makes sense for what you're trying to build." Then ask: "Want me to send you the calendar link?"
- If they ask about price before booking, say: "We have a few different options depending on the level of help you're looking for. The easiest thing is for us to talk for a few minutes, learn what you're trying to do, and point you in the right direction." Then ask: "Want me to send you the calendar link?"

Standing facts:
- Location: Marietta, Georgia, city/state only.
- Business name: Pallet Pros Academy.
- Recommended vehicle: a 24ft flatbed. It allows forklift access from all angles, unlike standard box trucks. A 24ft flatbed can move around 200 standard pallets in a load.
- Income: do not guarantee or imply typical income. If asked, frame this as one personal example only: "As an example, my own business runs around $400k/year in revenue, and I personally pay myself around $75k/year, but it did not start there, and results vary based on effort and market."
- Program pricing: do not quote one fixed number. Say it depends on the individual and how much success they are prepared to have in the business. If they push for a range, solutions start as low as $37/month for people who are not business owners yet, up to $5,500 for existing business owners.
- Calls: do not accept direct phone calls. If they want a call, the best way is to book time on the calendar:
  https://www.tidycal.com/palletprosga/15-minute-meeting

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
- Use lead_profile silently when present. It may include intent, temperature, occupation, assets, pallet experience, motivation, urgency, and stage. Do not reveal these labels to the prospect.
- Bare replies like "yes", "ok", "sounds good", "how?", or "interested" depend on the previous assistant question. Use the last assistant message to decide what they are agreeing to.
- If a bare reply cannot be confidently tied to the previous assistant question, set needs_review true instead of guessing.
- If they already said they want to start, learn the business, get started, schedule, book, or talk through details, do not ask multiple warm-up questions. Move to the Zoom/calendar permission step.
- A single motivation question can be useful for a simple "I want to start" reply with no context, but do not ask it if they already shared their motivation or a hot signal.
- Do not use timeline, obstacle, or asset questions as the default. For vague, lukewarm, or merely curious replies, offer the training video and ask permission to send it.
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
- Existing pallet operator, slowed-down business, buyer/client problem, contracts, or pricing pressure:
  Treat them as experienced, not beginner. First name the business problem they gave you. Position the academy/call as a way to research their market and find better buyers or buyer channels, then ask permission for the calendar. Use this flavor: "Got you. That's exactly the type of thing my academy helps people with. We can get on a call, research your market, and see where you may be able to find better buyers. Do you mind if I send you a link to my calendar?"
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
- Vague, lightly curious, or asks how the business works without saying they want to start:
  Offer the short training video and ask permission to send it. If they agree, send https://www.palletprosacademy.com/training. Do not ask reason, timeline, or obstacle questions.
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
3. If serious intent is present, move toward the business outcome first, then the Zoom/calendar.
4. Ask only one question.
5. Do not keep chatting when the next best step is clearly booking.
6. Positioning matters: prospects usually want the result, not a Zoom call. Frame the call as the easiest way to solve or diagnose the problem they just named.`;

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
  const normalized = normalizeStore(store);

  if (storeBackend() === "supabase") {
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

  const writeJob = storeWriteQueue
    .catch(() => {})
    .then(async () => {
      await fs.mkdir(DATA_DIR, { recursive: true });
      const tempFile = `${DATA_FILE}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(tempFile, JSON.stringify(normalized, null, 2));
      await fs.rename(tempFile, DATA_FILE);
    });

  storeWriteQueue = writeJob;
  await writeJob;
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
    learningInsights: Array.isArray(parsed.learningInsights)
      ? parsed.learningInsights.slice(-12)
      : [],
    learningState:
      parsed.learningState && typeof parsed.learningState === "object"
        ? parsed.learningState
        : {},
    dailyStats:
      parsed.dailyStats && typeof parsed.dailyStats === "object"
        ? parsed.dailyStats
        : {},
    kpiEvents: Array.isArray(parsed.kpiEvents)
      ? parsed.kpiEvents.filter((event) => KPI_EVENT_TYPES.has(event?.type)).slice(-5000)
      : [],
    kpiTargets: normalizeKpiTargets(parsed.kpiTargets)
  };
}

function normalizeKpiTargets(targets) {
  const raw = targets && typeof targets === "object" ? targets : {};
  const normalized = { ...DEFAULT_KPI_TARGETS };

  for (const key of Object.keys(normalized)) {
    const value = Number(raw[key]);
    if (Number.isFinite(value) && value >= 0) {
      normalized[key] = value;
    }
  }

  return normalized;
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
  const warmTrainingRoutePercent = Math.min(
    100,
    Math.max(
      0,
      Number.isFinite(Number(raw.warm_training_route_percent))
        ? Number(raw.warm_training_route_percent)
        : numberEnv(
            "WARM_TRAINING_ROUTE_PERCENT",
            DEFAULT_WARM_TRAINING_ROUTE_PERCENT
          )
    )
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
    manual_takeover_minutes: manualMinutes,
    warm_training_route_percent: warmTrainingRoutePercent
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

function hasProspectMessages(memory) {
  return (Array.isArray(memory?.last_messages) ? memory.last_messages : []).some(
    (message) => message.role === "user"
  );
}

function comparableText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function appOutgoingSource(source) {
  return ["auto", "manual_approval", "manual_companion", "follow_up"].includes(String(source || ""));
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

function businessDateKey(value = new Date(), timeZone = BUSINESS_TIME_ZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  })
    .formatToParts(date)
    .reduce((accumulator, part) => {
      accumulator[part.type] = part.value;
      return accumulator;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function todayKey(date = new Date()) {
  return businessDateKey(date);
}

function keyToUtcDate(key) {
  const [year, month, day] = String(key || "").split("-").map(Number);
  if (!year || !month || !day) {
    return new Date(NaN);
  }
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function addDaysToKey(key, days) {
  const date = keyToUtcDate(key);
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function startOfWeekKey(key) {
  const date = keyToUtcDate(key);
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return date.toISOString().slice(0, 10);
}

function startOfMonthKey(key) {
  return `${String(key).slice(0, 7)}-01`;
}

function startOfYearKey(key) {
  return `${String(key).slice(0, 4)}-01-01`;
}

function startOfQuarterKey(key) {
  const [year, month] = String(key || "").split("-").map(Number);
  const startMonth = Math.floor(((month || 1) - 1) / 3) * 3 + 1;
  return `${year}-${String(startMonth).padStart(2, "0")}-01`;
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
  const usableContactId =
    normalizeProvider(provider) === "zernio"
      ? isUsefulZernioContactId(contact_id, zernio_account_id)
        ? contact_id
        : ""
      : contact_id;
  const person = usableContactId || chat_id || talk_id || "unknown";

  if (normalizeProvider(provider) === "test") {
    return `test:${channel}:${person}`;
  }

  return `zernio:${zernio_account_id || "unknown"}:${channel}:${person}`;
}

function isUsefulZernioContactId(contactId, accountId) {
  const contactText = String(contactId || "").trim();
  const accountText = String(accountId || "").trim();

  return Boolean(contactText && !isSelfIdentity(contactText, "", accountText));
}

function cleanUsername(value) {
  return String(value || "").trim().replace(/^@/, "");
}

function isSelfUsername(value) {
  const username = cleanUsername(value).toLowerCase();
  return Boolean(username && SELF_INSTAGRAM_USERNAMES.has(username));
}

function isSelfId(value, accountId = "") {
  const id = String(value || "").trim();
  const accountText = String(accountId || "").trim();
  return Boolean(
    id && ((accountText && id === accountText) || SELF_INSTAGRAM_IDS.has(id))
  );
}

function isSelfIdentity(id, username = "", accountId = "") {
  return isSelfId(id, accountId) || isSelfUsername(id) || isSelfUsername(username);
}

function usefulIdentityId(id, accountId = "", username = "") {
  const value = String(id || "").trim();
  return value && !isSelfIdentity(value, username, accountId) ? value : "";
}

function usefulUsername(username) {
  const value = cleanUsername(username);
  return value && !isSelfUsername(value) ? value : "";
}

function looksLikeInternalIdentifier(value) {
  const text = String(value || "").trim();
  if (!text) {
    return true;
  }

  return Boolean(
    text.includes(":") ||
      /^zernio/i.test(text) ||
      /^\d{8,}$/.test(text) ||
      /^[a-f0-9]{16,}$/i.test(text) ||
      /^[a-z0-9_-]{20,}$/i.test(text)
  );
}

function firstUsefulIdentity(candidates, accountId = "") {
  for (const candidate of candidates) {
    const id = usefulIdentityId(candidate?.id, accountId, candidate?.username);
    if (id) {
      return id;
    }
  }

  return "";
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
      username: usefulUsername(messageLike.username),
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
      lead_profile: {},
      conversation_state: "INITIAL",
      lead_status: "cold",
      ai_paused: false,
      manual_takeover_until: null,
      manual_takeover_since: null,
      needs_human_review: false,
      needs_human_review_reason: "",
      needs_human_review_at: null,
      hot_reason: "",
      hot_at: null,
      last_reply_reason: "",
      reply_reason_history: [],
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
    usefulUsername(messageLike.username) || memory.username || "";
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
  memory.lead_profile =
    memory.lead_profile && typeof memory.lead_profile === "object"
      ? memory.lead_profile
      : {};
  memory.conversation_state = memory.conversation_state || "INITIAL";
  memory.lead_status = classifyLeadStatus(memory);
  memory.manual_takeover_until = memory.manual_takeover_until || null;
  memory.manual_takeover_since = memory.manual_takeover_since || null;
  memory.needs_human_review = Boolean(memory.needs_human_review);
  memory.needs_human_review_reason = memory.needs_human_review_reason || "";
  memory.needs_human_review_at = memory.needs_human_review_at || null;
  memory.hot_reason = memory.hot_reason || "";
  memory.hot_at = memory.hot_at || null;
  memory.last_reply_reason = memory.last_reply_reason || "";
  memory.reply_reason_history = Array.isArray(memory.reply_reason_history)
    ? memory.reply_reason_history
    : [];
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
    source: message.source || "",
    reason: message.reason || ""
  });
  memory.last_messages = memory.last_messages.slice(-MAX_RECENT_MEMORY_MESSAGES);
}

function memoryMessageLabel(message) {
  if (message.role === "user") {
    return "Prospect";
  }

  if (String(message.source || "").startsWith("manual")) {
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
      qualification_why: "why now is a good time",
      qualification_market: "operating market",
      qualification_goal: "financial goal",
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
    hasHotQualificationSignal(recentText) ||
    /\b(ready to invest|ready to start|ready to go|book a call|hop on a call|discovery call|own a truck|have a truck|own a trailer|have a trailer|own a business)\b/.test(
      recentText
    )
  ) {
    return "hot";
  }

  if (
    (Array.isArray(memory?.questions_asked) && memory.questions_asked.length >= 2) ||
    mentionsPersonalMotivation(recentText) ||
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

  if (/why.*start|what.*made.*start|what.*makes.*you.*want|what.*got.*want.*start|got.*you.*want.*start/.test(lower)) {
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

  if (/mind if i ask.*3 quick questions|3 quick questions|three quick questions/.test(lower)) {
    keys.push("qualification_permission");
  }

  if (/city and state|operate(?: your)? pallet business|operating market|planning to operate/.test(lower)) {
    keys.push("qualification_market");
  }

  if (/what'?s got you interested|why.*good time|why.*start.*now|interested in starting.*now|start(?:ing)?(?: the)? business.*now/.test(lower)) {
    keys.push("qualification_why");
  }

  if (/financially|extra income|something bigger|ideally like the pallet business to do|financial or lifestyle/.test(lower)) {
    keys.push("qualification_goal");
  }

  if (/open to hopping on.*zoom|quick zoom|take a look at.*market together|look at your market together|get on a zoom|hop on a zoom|get on a call|hop on a call|book.*call|discovery/.test(lower)) {
    keys.push("would_call");
  }

  return keys;
}

function replyLooksLikeQuestion(text) {
  return String(text || "").includes("?");
}

function humanEscalationReason(text) {
  const lower = String(text || "").toLowerCase();

  if (/\b(stop|unsubscribe|remove me|leave me alone|don't message me|do not message me)\b/.test(lower)) {
    return "Prospect asked not to be messaged.";
  }

  if (/\b(bot|automated|automation|real person|human|not a real person)\b/.test(lower)) {
    return "Prospect questioned whether this is a real person.";
  }

  if (/\b(refund|chargeback|lawsuit|lawyer|attorney|legal|sue|complaint)\b/.test(lower)) {
    return "Legal, refund, or complaint language needs manual handling.";
  }

  if (/\b(ssn|social security|bank account|routing number|credit card|debit card|password)\b/.test(lower)) {
    return "Private financial or sensitive information was mentioned.";
  }

  if (/\b(fuck|bullshit|scam ass|fake ass|stop playing|you lying|you're lying|u lying)\b/.test(lower)) {
    return "Angry or high-risk tone needs manual handling.";
  }

  if (/\b(too aggressive|aggressive|pushy|too pushy|doing too much|too much pressure|stop pushing|pressure|pressuring|coming on too strong)\b/.test(lower)) {
    return "Prospect said the conversation felt too aggressive or pushy.";
  }

  return "";
}

function hotLeadReason(text) {
  const lower = String(text || "").toLowerCase();

  if (/\b(book|schedule|calendar|appointment|zoom|call|talk|consultation|meeting)\b/.test(lower)) {
    return "Asked about booking or talking.";
  }

  if (/\b(ready|start now|get started|sign me up|join|program|academy|interested|i'm down|lets do it|let's do it)\b/.test(lower)) {
    return "Showed direct interest in starting.";
  }

  if (/\b(price|cost|how much|payment|invest|investment)\b/.test(lower)) {
    return "Asked about price or investment.";
  }

  if (/\b(truck|trailer|warehouse|pallet business|pallet company|buyers|contracts|clients|customers)\b/.test(lower)) {
    return "Mentioned assets, current business, or buyer problem.";
  }

  return "";
}

function objectionReason(text) {
  const lower = String(text || "").toLowerCase();

  if (/\b(price|cost|how much|expensive|afford|money)\b/.test(lower)) return "price";
  if (/\b(buyer|buyers|client|clients|customer|customers|contract|contracts)\b/.test(lower)) return "buyers";
  if (/\b(truck|trailer|vehicle|flatbed)\b/.test(lower)) return "equipment";
  if (/\b(area|market|city|state|near me|local)\b/.test(lower)) return "market";
  if (/\b(legit|proof|scam|real|work)\b/.test(lower)) return "trust";
  if (/\b(how does|how do|what is|explain)\b/.test(lower)) return "how_it_works";
  return "";
}

function replyReasonForText(replyText, { source = "ai", memory = null } = {}) {
  const text = String(replyText || "");

  if (source === "manual" || source === "manual_approval" || source === "manual_booking_link") {
    return source;
  }

  if (source === "follow_up") {
    const trigger = String(memory?.follow_up?.trigger_type || "");
    return trigger ? `follow_up_${trigger}` : "follow_up";
  }

  if (linkStatsForText(text).booking_links_sent) return "calendar_link_sent";
  if (text.includes(YOUTUBE_URL) || text.includes(TRAINING_PLAYLIST_URL)) {
    return memory?.booking_confirmed ? "booked_training_sent" : "content_redirect";
  }
  if (/send you a link to my calendar|send (?:you )?(?:the|a) calendar link|link to my calendar|calendar link/i.test(text)) {
    return "calendar_permission_ask";
  }
  if (/something you(?:'d| would)? want to learn more about|want to learn more|learn more about/i.test(text)) {
    return "answered_question_soft_bridge";
  }
  if (/research your market|see if you'd be a good fit|see where you may be able to find buyers/i.test(text)) {
    return "zoom_positioning";
  }
  if (replyPitchesCall(text)) return "call_pitch";
  return "context_reply";
}

function noteReplyReason(memory, reason, at = new Date().toISOString()) {
  if (!reason) return;
  memory.last_reply_reason = reason;
  memory.reply_reason_history = Array.isArray(memory.reply_reason_history)
    ? memory.reply_reason_history
    : [];
  memory.reply_reason_history.push({ reason, at });
  memory.reply_reason_history = memory.reply_reason_history.slice(-50);
}

const STATE_ABBREVIATIONS = {
  al: "Alabama",
  ak: "Alaska",
  az: "Arizona",
  ar: "Arkansas",
  ca: "California",
  co: "Colorado",
  ct: "Connecticut",
  de: "Delaware",
  fl: "Florida",
  ga: "Georgia",
  hi: "Hawaii",
  ia: "Iowa",
  id: "Idaho",
  il: "Illinois",
  in: "Indiana",
  ks: "Kansas",
  ky: "Kentucky",
  la: "Louisiana",
  ma: "Massachusetts",
  md: "Maryland",
  me: "Maine",
  mi: "Michigan",
  mn: "Minnesota",
  mo: "Missouri",
  ms: "Mississippi",
  mt: "Montana",
  nc: "North Carolina",
  nd: "North Dakota",
  ne: "Nebraska",
  nh: "New Hampshire",
  nj: "New Jersey",
  nm: "New Mexico",
  nv: "Nevada",
  ny: "New York",
  oh: "Ohio",
  ok: "Oklahoma",
  or: "Oregon",
  pa: "Pennsylvania",
  ri: "Rhode Island",
  sc: "South Carolina",
  sd: "South Dakota",
  tn: "Tennessee",
  tx: "Texas",
  ut: "Utah",
  va: "Virginia",
  vt: "Vermont",
  wa: "Washington",
  wi: "Wisconsin",
  wv: "West Virginia",
  wy: "Wyoming",
  dc: "District of Columbia"
};

const MARKET_ALIASES = {
  atl: { city: "Atlanta", state: "Georgia", market: "Atlanta, Georgia" },
  atlanta: { city: "Atlanta", state: "Georgia", market: "Atlanta, Georgia" },
  dfw: { city: "Dallas-Fort Worth", state: "Texas", market: "Dallas-Fort Worth, Texas" },
  nyc: { city: "New York City", state: "New York", market: "New York City, New York" },
  la: { city: "Los Angeles", state: "California", market: "Los Angeles, California" }
};

function normalizeStateName(value) {
  const clean = String(value || "").trim().replace(/[.,]/g, "");
  if (!clean) return "";
  const lower = clean.toLowerCase();
  return STATE_ABBREVIATIONS[lower] || clean.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function titleCaseWords(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function extractLocationPhrase(value, pattern) {
  const match = String(value || "").match(pattern);
  if (!match) return null;
  const city = titleCaseWords(match[1] || "");
  const state = normalizeStateName(match[2] || "");
  if (!city && !state) return null;
  return {
    city,
    state,
    market: [city, state].filter(Boolean).join(", ")
  };
}

function extractMarketInfo(text) {
  const lower = String(text || "").toLowerCase();
  const result = {};

  for (const [alias, info] of Object.entries(MARKET_ALIASES)) {
    const aliasPattern = new RegExp(`\\b${alias}\\b`, "i");
    if (aliasPattern.test(lower)) {
      result.operating_city = info.city;
      result.operating_state = info.state;
      result.operating_market = info.market;
      break;
    }
  }

  const operating =
    extractLocationPhrase(text, /\b(?:operating|operate|working|work|doing business|run(?:ning)?(?: it)?|launch(?:ing)?|starting)(?:\s+(?:the business|it|in|around|out of))*\s+(?:in|around|out of)?\s*([A-Za-z][A-Za-z\s.'-]{1,40})\s*,?\s+(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|DC|Georgia|Texas|Florida|Mississippi|California|New York|Tennessee|Alabama|South Carolina|North Carolina)\b/i) ||
    extractLocationPhrase(text, /\b(?:in|from|near|around)\s+([A-Za-z][A-Za-z\s.'-]{1,40})\s*,?\s+(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|DC|Georgia|Texas|Florida|Mississippi|California|New York|Tennessee|Alabama|South Carolina|North Carolina)\b/i);

  if (operating && !result.operating_market) {
    result.operating_city = operating.city;
    result.operating_state = operating.state;
    result.operating_market = operating.market;
  }

  const current =
    extractLocationPhrase(text, /\b(?:i'?m|im|i am|based|live|located)\s+(?:in|out of|near|around)\s+([A-Za-z][A-Za-z\s.'-]{1,40})\s*,?\s+(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|DC|Georgia|Texas|Florida|Mississippi|California|New York|Tennessee|Alabama|South Carolina|North Carolina)\b/i);

  if (current) {
    result.current_location = current.market;
    if (!result.operating_market && !/\b(?:operat|work|business|market)\b/i.test(text)) {
      result.operating_city = current.city;
      result.operating_state = current.state;
      result.operating_market = current.market;
    }
  }

  return result;
}

function extractResourceInfo(text) {
  const value = String(text || "").toLowerCase();
  const result = {};
  const vehicleMatches = [];

  for (const [pattern, label] of [
    [/\bbox truck\b/i, "box truck"],
    [/\bflatbed\b/i, "flatbed"],
    [/\bpickup(?: truck)?\b/i, "pickup truck"],
    [/\btrailer\b/i, "trailer"],
    [/\bcargo van\b/i, "cargo van"],
    [/\bsemi\b/i, "semi"],
    [/\btruck\b/i, "truck"]
  ]) {
    if (pattern.test(value)) vehicleMatches.push(label);
  }

  if (vehicleMatches.length) {
    result.has_vehicle = true;
    result.vehicle_type = [...new Set(vehicleMatches)].join(", ");
  }

  if (/\b(no truck|no trailer|don'?t have.*(?:truck|trailer)|dont have.*(?:truck|trailer)|starting from scratch|from scratch|scratch)\b/i.test(value)) {
    result.starting_from_scratch = true;
    if (!vehicleMatches.length) result.has_vehicle = false;
  }

  if (/\b(rent|rental|lease|borrow)\b.{0,40}\b(truck|trailer|van|equipment|something)\b|\b(rent|rental|lease)\b/i.test(value)) {
    result.plans_to_rent = true;
  }

  const businessType = String(
    value.match(/\b(trucking|courier|logistics|junk removal|moving|transportation|delivery|route|pallet)\s+(?:business|company)\b/i)?.[0] ||
      value.match(/\b(?:own|run|have|got|started)\s+(?:a|an|my)?\s*([a-z\s]{3,30}(?:business|company))\b/i)?.[1] ||
      ""
  ).trim();

  if (businessType || /\b(own|run|have|got|started).{0,30}\b(?:business|company|llc)\b/i.test(value)) {
    result.existing_business = true;
    result.existing_business_type = businessType || "existing business";
  }

  return result;
}

function extractGoalInfo(text) {
  const value = String(text || "");
  const lower = value.toLowerCase();
  const result = {};
  const moneyGoal = value.match(/\$[\d,]+(?:\s*(?:a|per)?\s*(?:month|mo|week|wk|day|yr|year))?/i)?.[0];

  if (moneyGoal) {
    result.financial_goal = moneyGoal.trim();
  } else if (/\b(extra income|side income|second income|additional income)\b/i.test(lower)) {
    result.financial_goal = "extra income";
  } else if (/\b(replace (?:my )?job|quit (?:my )?job|leave (?:my )?job)\b/i.test(lower)) {
    result.financial_goal = "replace job income";
  } else if (/\b(full[-\s]?time|something bigger|build it big|scale)\b/i.test(lower)) {
    result.financial_goal = "build into something bigger";
  } else if (/\b(pay bills|pay off debt|support (?:my )?family|provide for|financial freedom|make money)\b/i.test(lower)) {
    result.financial_goal = lower.match(/\b(pay bills|pay off debt|support (?:my )?family|provide for|financial freedom|make money)\b/i)?.[0] || "";
  }

  if (/\b(buy (?:a )?(?:car|truck|vehicle|house)|move to|move out|home more|leave trucking|support (?:my )?family|family|kids|freedom)\b/i.test(lower)) {
    result.lifestyle_goal =
      value.match(/\b(?:buy (?:a )?(?:car|truck|vehicle|house)|move to [A-Za-z\s]+|move out|home more|leave trucking|support (?:my )?family|financial freedom|freedom)\b/i)?.[0] ||
      "lifestyle improvement";
  }

  if (result.financial_goal || result.lifestyle_goal || mentionsPersonalMotivation(value)) {
    result.primary_motivation =
      result.financial_goal || result.lifestyle_goal || value.replace(/\s+/g, " ").trim().slice(0, 160);
  }

  return result;
}

function extractQualificationFields(text) {
  return {
    ...extractMarketInfo(text),
    ...extractResourceInfo(text),
    ...extractGoalInfo(text)
  };
}

function leadProfileFromText(text) {
  const value = String(text || "").toLowerCase();
  const profile = {
    intent: "",
    temperature: "",
    occupation: "",
    assets: [],
    business_experience: "",
    pallet_experience: "",
    motivation: "",
    urgency: "",
    stage: "",
    ...extractQualificationFields(text)
  };

  if (wantsContentOnly(value)) profile.intent = "content_only";
  else if (hasClearStartIntent(value) || wantsPalletBusiness(value)) profile.intent = "interested";
  if (wantsCalendarLinkNow(value) || wantsAppointmentOrScheduling(value)) profile.intent = "ready";

  if (/\b(cdl|truck(?:ing|er)?|hotshot|transportation)\b/i.test(value)) {
    profile.occupation = "trucking/logistics";
  } else if (/\b(logistics|courier|delivery|route|routes)\b/i.test(value)) {
    profile.occupation = "logistics/delivery";
  } else if (/\b(warehouse|forklift)\b/i.test(value)) {
    profile.occupation = "warehouse";
  } else if (/\b(business owner|own a business|llc|company)\b/i.test(value)) {
    profile.occupation = "business_owner";
  }

  for (const [pattern, label] of [
    [/\bbox truck\b/i, "box_truck"],
    [/\bflatbed\b/i, "flatbed"],
    [/\btrailer\b/i, "trailer"],
    [/\bpickup\b/i, "pickup_truck"],
    [/\bcdl\b/i, "cdl"],
    [/\bwarehouse|warehouses\b/i, "warehouse_relationships"],
    [/\bbuyer|buyers|supplier|suppliers|yard|yards\b/i, "pallet_relationships"]
  ]) {
    if (pattern.test(value)) profile.assets.push(label);
  }

  if (/\b(own a business|business owner|llc|company|entrepreneur)\b/i.test(value)) {
    profile.business_experience = "some_or_experienced";
  }

  if (mentionsExistingPalletExperience(value)) {
    profile.pallet_experience = "active_or_some";
  }

  if (/\b(extra income|side income|second income|another source of income)\b/i.test(value)) {
    profile.motivation = "extra_income";
  } else if (/\b(replace (?:my )?job|quit (?:my )?job|leave (?:my )?job)\b/i.test(value)) {
    profile.motivation = "replace_job";
  } else if (/\b(work for myself|own (?:my )?business|start (?:my )?business)\b/i.test(value)) {
    profile.motivation = "start_business";
  } else if (/\b(family|kids|home more|local)\b/i.test(value)) {
    profile.motivation = "family_lifestyle";
  } else if (/\b(financial freedom|make money|income)\b/i.test(value)) {
    profile.motivation = "financial_freedom";
  }

  if (/\b(asap|right away|start now|ready|need to start|urgent|immediately)\b/i.test(value)) {
    profile.urgency = "high";
  } else if (/\b(soon|this week|this month|next week)\b/i.test(value)) {
    profile.urgency = "medium";
  }

  if (profile.intent === "content_only") profile.stage = "content_nurture";
  else if (profile.intent === "ready") profile.stage = "ready_to_book";
  else if (hasHotQualificationSignal(value)) profile.stage = "qualified_hot";
  else if (profile.intent === "interested") profile.stage = "intent_identified";

  profile.temperature = profile.stage === "qualified_hot" || profile.stage === "ready_to_book"
    ? "hot"
    : profile.intent === "interested"
      ? "warm"
      : profile.intent === "content_only"
        ? "cold"
        : "";

  return profile;
}

function mergeLeadProfile(existing = {}, incoming = {}) {
  const merged = existing && typeof existing === "object" ? { ...existing } : {};

  for (const [key, value] of Object.entries(incoming || {})) {
    if (Array.isArray(value)) {
      const current = Array.isArray(merged[key]) ? merged[key] : [];
      merged[key] = [...new Set([...current, ...value].filter(Boolean))];
    } else if (typeof value === "boolean" && typeof merged[key] !== "boolean") {
      merged[key] = value;
    } else if (value && !merged[key]) {
      merged[key] = value;
    } else if (
      value &&
      key === "temperature" &&
      ["", "cold", "warm", "hot"].indexOf(value) >
        ["", "cold", "warm", "hot"].indexOf(merged[key] || "")
    ) {
      merged[key] = value;
    } else if (
      value &&
      key === "stage" &&
      ["", "new", "intent_identified", "motivation_identified", "qualified_hot", "ready_to_book"].indexOf(value) >
        ["", "new", "intent_identified", "motivation_identified", "qualified_hot", "ready_to_book"].indexOf(merged[key] || "")
    ) {
      merged[key] = value;
    }
  }

  return merged;
}

function containsBookingLink(text) {
  const replyText = String(text || "");
  return (
    replyText.includes(BOOKING_URL) ||
    replyText.includes(TRACKED_BOOKING_BASE_URL) ||
    /https?:\/\/(?:www\.)?tidycal\.com\/palletprosga\/[^\s)]+/i.test(replyText) ||
    /https?:\/\/go\.palletprosacademy\.com\/discovery(?:\?[^\s)]*)?/i.test(replyText)
  );
}

function noteIncomingSignals(memory, incomingText, incomingAt) {
  memory.lead_profile = mergeLeadProfile(
    memory.lead_profile,
    leadProfileFromText(incomingText)
  );

  if (hasClearStartIntent(incomingText) || wantsPalletBusiness(incomingText)) {
    markConversationState(memory, "PALLET_INTEREST_DETECTED");
  }

  const missing = missingQualificationKeys(memory);
  console.log(
    `Incoming qualification signals for ${memory.key || "conversation"}: state=${memory.conversation_state || "INITIAL"} missing=${missing.join(",") || "none"} market=${memory.lead_profile?.operating_market || ""} why=${memory.lead_profile?.start_reason || ""} goal=${memory.lead_profile?.primary_motivation || memory.lead_profile?.financial_goal || ""}`
  );

  const escalation = humanEscalationReason(incomingText);
  if (escalation) {
    memory.needs_human_review = true;
    memory.needs_human_review_reason = escalation;
    memory.needs_human_review_at = incomingAt;
    memory.ai_paused = true;
    cancelFollowUp(memory);
  }

  const hot = hotLeadReason(incomingText);
  if (hot) {
    memory.hot_reason = hot;
    memory.hot_at = incomingAt;
  }

  const objection = objectionReason(incomingText);
  if (objection) {
    memory.last_objection = objection;
    memory.last_objection_at = incomingAt;
  }
}

function updateLinkMemory(memory, text) {
  const replyText = String(text || "");

  if (
    replyText.includes(YOUTUBE_URL) ||
    replyText.includes(TRAINING_URL) ||
    replyText.includes(TRAINING_PLAYLIST_URL) ||
    replyText.includes("youtube.com/")
  ) {
    memory.youtube_link_sent = true;
    memory.training_link_sent = true;
  }

  if (containsBookingLink(replyText)) {
    memory.booking_link_sent = true;
  }
}

function updateQuestionMemory(memory, text) {
  const keys = detectQuestionKeys(text);
  for (const key of keys) {
    if (!memory.questions_asked.includes(key)) {
      memory.questions_asked.push(key);
    }
  }

  if (keys.includes("qualification_permission")) {
    markQualificationPermissionRequested(memory);
  }

  if (
    keys.includes("qualification_market") ||
    keys.includes("qualification_why") ||
    keys.includes("qualification_goal")
  ) {
    markConversationState(memory, "QUALIFYING");
  }

  if (keys.includes("would_call")) {
    markCallInvited(memory);
  }
}

function appointmentSetterCalendarAskReply() {
  return {
    reply:
      "I respect that. Let's get on a Zoom call this week. That way we can research your market, answer any questions you have and see if you'd be a good fit for the program.\n\nDo you mind if I send you a link to my calendar?",
    needs_review: false,
    handled: true
  };
}

function appointmentSetterStartSegueReply() {
  return {
    reply:
      "Solid. My academy can definitely help you get started making money in this business fast.\n\nIs that something you'd be interested in learning more about?",
    needs_review: false,
    handled: true
  };
}

function appointmentSetterMotivationReply() {
  return {
    reply: "Nice. What's got you wanting to start a pallet business?",
    needs_review: false,
    handled: true
  };
}

function easternWeekdayName(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long"
  }).format(date);
}

function zoomWeekPhrase(date = new Date()) {
  const weekday = easternWeekdayName(date);
  return ["Friday", "Saturday"].includes(weekday) ? "next week" : "this week";
}

function cleanProspectReply(text) {
  return String(text || "").replace(/\u2014/g, ",").replace(/\u2013/g, "-");
}

function hasQualificationPermission(memory) {
  const profile = memory?.lead_profile || {};
  return Boolean(profile.qualification_permission_granted);
}

function qualificationPermissionRequested(memory) {
  const profile = memory?.lead_profile || {};
  return Boolean(profile.qualification_permission_requested) ||
    (Array.isArray(memory?.questions_asked) && memory.questions_asked.includes("qualification_permission"));
}

function hasOperatingMarket(memory) {
  const profile = memory?.lead_profile || {};
  return Boolean(profile.operating_market || profile.operating_city || profile.operating_state);
}

function hasResourcePosition(memory) {
  const profile = memory?.lead_profile || {};
  return (
    typeof profile.starting_from_scratch === "boolean" ||
    typeof profile.has_vehicle === "boolean" ||
    Boolean(profile.vehicle_type || profile.plans_to_rent || profile.existing_business || profile.existing_business_type)
  );
}

function hasWhyStart(memory) {
  const profile = memory?.lead_profile || {};
  return Boolean(profile.start_reason || profile.why_now || profile.start_motivation);
}

function hasGoalMotivation(memory) {
  const profile = memory?.lead_profile || {};
  return Boolean(
    profile.financial_goal ||
      profile.lifestyle_goal ||
      profile.primary_motivation ||
      profile.motivation
  );
}

function missingQualificationKeys(memory) {
  const missing = [];
  if (!hasOperatingMarket(memory)) missing.push("market");
  if (!hasWhyStart(memory)) missing.push("why");
  if (!hasGoalMotivation(memory)) missing.push("goal");
  return missing;
}

function qualificationComplete(memory) {
  return missingQualificationKeys(memory).length === 0;
}

function markConversationState(memory, state) {
  if (memory && state) {
    memory.conversation_state = state;
    memory.lead_profile = memory.lead_profile && typeof memory.lead_profile === "object"
      ? memory.lead_profile
      : {};
    memory.lead_profile.conversation_state = state;
  }
}

function markQualificationPermissionRequested(memory) {
  if (!memory) return;
  memory.lead_profile = memory.lead_profile && typeof memory.lead_profile === "object"
    ? memory.lead_profile
    : {};
  memory.lead_profile.qualification_permission_requested = true;
  markConversationState(memory, "PERMISSION_REQUESTED");
}

function markQualificationPermissionGranted(memory) {
  if (!memory) return;
  memory.lead_profile = memory.lead_profile && typeof memory.lead_profile === "object"
    ? memory.lead_profile
    : {};
  memory.lead_profile.qualification_permission_granted = true;
  markConversationState(memory, "QUALIFYING");
}

function markCallInvited(memory) {
  if (!memory) return;
  memory.lead_profile = memory.lead_profile && typeof memory.lead_profile === "object"
    ? memory.lead_profile
    : {};
  memory.lead_profile.call_invited = true;
  markConversationState(memory, "CALL_INVITED");
}

function lastAssistantAskedQualificationPermission(memory) {
  return (Array.isArray(memory?.last_messages) ? memory.last_messages : [])
    .slice(-5)
    .some(
      (message) =>
        message.role === "assistant" &&
        /3 quick questions|three quick questions|where you're at and what you're looking to do/i.test(message.text || "")
    );
}

function qualificationQuestionWasAsked(memory) {
  return (
    (Array.isArray(memory?.questions_asked) ? memory.questions_asked : []).some((key) =>
      ["qualification_market", "qualification_why", "qualification_goal"].includes(key)
    ) ||
    (Array.isArray(memory?.last_messages) ? memory.last_messages : [])
      .slice(-5)
      .some(
        (message) =>
          message.role === "assistant" &&
          /city and state|what's got you interested|why is now a good time|financially|extra income|something bigger/i.test(
            message.text || ""
          )
      )
  );
}

function lastAssistantAskedWhyNow(memory) {
  return (Array.isArray(memory?.last_messages) ? memory.last_messages : [])
    .slice(-6)
    .some(
      (message) =>
        message.role === "assistant" &&
        /what'?s got you interested|why is now a good time|why.*start.*now/i.test(
          message.text || ""
        )
    );
}

function lastAssistantInvitedToZoom(memory) {
  return Boolean(memory?.lead_profile?.call_invited) ||
    (Array.isArray(memory?.last_messages) ? memory.last_messages : [])
      .slice(-5)
      .some(
        (message) =>
          message.role === "assistant" &&
          /open to hopping on.*zoom|quick zoom|take a look at.*market together|look at your market together/i.test(message.text || "")
      );
}

function zoomAcceptance(text) {
  return yesToCalendarLink(text) || /\b(open to it|i'?m all for it|all for it|that makes sense|works for me|let'?s talk|lets talk|we can|i can do that|sounds like a plan)\b/i.test(
    String(text || "")
  );
}

function directBookingIntent(text) {
  return wantsCalendarLinkNow(text) ||
    /\b(can you|could you|please|just)?\s*(send|drop|share|give).{0,30}\b(calendar|booking|schedule|link)\b/i.test(String(text || "")) ||
    /\b(where do i schedule|how do i book|can i book|ready to talk|let'?s set up a call|lets set up a call)\b/i.test(String(text || ""));
}

function asksToResendCalendarLink(text) {
  return /\b(resend|send again|send it again|drop it again|share it again|lost the link|need the link again|send me the link again|can you send it again|could you send it again)\b/i.test(
    String(text || "")
  );
}

function formatKnownMarket(memory) {
  const profile = memory?.lead_profile || {};
  return profile.operating_market ||
    [profile.operating_city, profile.operating_state].filter(Boolean).join(", ") ||
    "your market";
}

function resourceAcknowledgement(memory) {
  const profile = memory?.lead_profile || {};
  if (profile.vehicle_type) return `Since you already mentioned ${profile.vehicle_type}, that gives us a real starting point.`;
  if (profile.existing_business_type) return `Since you already have ${profile.existing_business_type}, that may give you a head start.`;
  if (profile.existing_business) return "Since you already have a business setup, that may give you a head start.";
  if (profile.plans_to_rent) return "Starting lean with rentals can be an option while you're getting things moving.";
  if (profile.starting_from_scratch || profile.has_vehicle === false) return "Starting from scratch is fine, we just need to look at the market and the cleanest first move.";
  return "";
}

function goalAcknowledgement(memory) {
  const profile = memory?.lead_profile || {};
  const goal = profile.primary_motivation || profile.financial_goal || profile.lifestyle_goal || profile.motivation || "";
  if (!goal) return "";
  if (/replace job/i.test(goal)) return "Since you're trying to replace your job, it makes sense to look at this seriously.";
  if (/car|vehicle|move|family|freedom/i.test(goal)) return "It sounds like you're looking for something that could make a meaningful difference.";
  return "That gives me a better idea of what you're trying to do.";
}

function appointmentSetterQualificationPermissionReply(memory) {
  markQualificationPermissionRequested(memory);
  return {
    reply:
      "Sure. Mind if I ask you 3 quick questions so I can get a better idea of where you're at and what you're looking to do?",
    needs_review: false,
    handled: true
  };
}

function appointmentSetterQualificationQuestionReply(memory) {
  markConversationState(memory, "QUALIFYING");
  const profile = memory?.lead_profile || {};
  const missing = missingQualificationKeys(memory);
  const next = missing[0];

  if (next === "market") {
    return {
      reply: "Perfect. First one, what city and state are you planning to operate your pallet business in?",
      needs_review: false,
      handled: true
    };
  }

  if (next === "why") {
    const market = formatKnownMarket(memory);
    const basedLine = profile.current_location && profile.operating_market && profile.current_location !== profile.operating_market
      ? `Got you. So you're based in ${profile.current_location}, but you'll be operating in the ${market} area. `
      : profile.operating_market
        ? `Got you. ${market} is helpful to know. `
        : "";

    return {
      reply:
        `${basedLine}What's got you interested in starting a pallet business now?`,
      needs_review: false,
      handled: true
    };
  }

  if (next === "goal") {
    const ack = memory?.lead_profile?.start_reason ? "I respect that." : resourceAcknowledgement(memory);
    return {
      reply:
        `${ack ? `${ack} ` : ""}Last question. What would you ideally like the pallet business to do for you financially?`,
      needs_review: false,
      handled: true
    };
  }

  return appointmentSetterZoomInviteReply(memory);
}

function appointmentSetterZoomInviteReply(memory, date = new Date()) {
  markCallInvited(memory);
  const market = formatKnownMarket(memory);
  const weekPhrase = zoomWeekPhrase(date);
  const ack = goalAcknowledgement(memory) || resourceAcknowledgement(memory) || "Based on what you told me, I think it'd be worth looking at this properly.";
  console.log(
    `Qualification complete for ${memory?.key || "conversation"}; weekday=${easternWeekdayName(date)}; zoom_phrase=${weekPhrase}; market=${market}`
  );

  return {
    reply:
      `${ack} Would you be open to hopping on a quick Zoom ${weekPhrase} so we can take a look at ${market} together and see if this could realistically make sense for you?`,
    needs_review: false,
    handled: true
  };
}

function appointmentSetterQualificationQuestionAfterAnswerReply(memory, answer, questionReply) {
  const intro = cleanProspectReply(answer || "");
  const next = cleanProspectReply(questionReply.reply || "");
  return {
    ...questionReply,
    reply: intro ? `${intro} ${next}` : next
  };
}

function qualificationInterruptionReply(memory, text) {
  if (
    !qualificationPermissionRequested(memory) &&
    !hasQualificationPermission(memory) &&
    !qualificationQuestionWasAsked(memory)
  ) {
    return null;
  }

  let answer = "";

  if (seemsToWantJobOrDrivingWork(text)) {
    return appointmentSetterJobSeekerReply();
  } else if (saysNoMoneyOrCapital(text)) {
    return appointmentSetterNoMoneyReply();
  } else if (asksPriceOrCost(text)) {
    answer =
      "We have a few different options depending on where you're starting and the level of help you need. The call is where we can point you in the right direction.";
  } else if (asksHowItWorks(text)) {
    answer =
      "Short version, we help you understand how to source, move, and sell pallets in your area. I don't want to turn the DM into a whole class though.";
  } else if (saysNoTruckYet(text)) {
    answer =
      "Not necessarily. Some people start by renting or arranging transportation while they're getting established.";
  } else if (asksIfLegit(text)) {
    answer =
      "I get why you'd ask. I run this business myself, and the call is really about seeing if the model makes sense in your area.";
  } else if (asksWhatCallIsAbout(text)) {
    answer =
      "We'll look at your local market, talk through where you're starting from, answer your questions, and see if the business makes sense for your goals.";
  }

  if (!answer) {
    return null;
  }

  if (qualificationComplete(memory)) {
    return appointmentSetterQualificationQuestionAfterAnswerReply(
      memory,
      answer,
      appointmentSetterZoomInviteReply(memory)
    );
  }

  return appointmentSetterQualificationQuestionAfterAnswerReply(
    memory,
    answer,
    appointmentSetterQualificationQuestionReply(memory)
  );
}

function appointmentSetterQualificationFlowReply(memory, incoming, text) {
  if (!memory || memory.booking_confirmed) {
    return null;
  }

  const directQualificationFields = extractQualificationFields(text);
  if (lastAssistantAskedWhyNow(memory)) {
    delete directQualificationFields.financial_goal;
    delete directQualificationFields.lifestyle_goal;
    delete directQualificationFields.primary_motivation;
    delete directQualificationFields.motivation;
    directQualificationFields.start_reason = cleanProspectReply(text).slice(0, 180);
  }
  const answeringWhyNow = lastAssistantAskedWhyNow(memory);
  memory.lead_profile = mergeLeadProfile(
    mergeLeadProfile(memory.lead_profile, directQualificationFields),
    answeringWhyNow ? {} : leadProfileFromText(text)
  );
  if (answeringWhyNow && text.trim()) {
    memory.lead_profile.start_reason = cleanProspectReply(text).slice(0, 180);
  }

  const missingBefore = missingQualificationKeys(memory);
  console.log(
    `Qualification state=${memory.conversation_state || "INITIAL"} intent=${memory.lead_profile?.intent || ""} missing=${missingBefore.join(",") || "none"}`
  );

  if (
    lastAssistantAskedQualificationPermission(memory) &&
    (yesToCalendarLink(text) || yesToBusinessInterest(text))
  ) {
    markQualificationPermissionGranted(memory);
    console.log(`Qualification permission granted for ${memory.key || "conversation"}.`);
    return qualificationComplete(memory)
      ? appointmentSetterZoomInviteReply(memory)
      : appointmentSetterQualificationQuestionReply(memory);
  }

  if (
    (qualificationPermissionRequested(memory) ||
      lastAssistantAskedQualificationPermission(memory)) &&
    !hasQualificationPermission(memory) &&
    !memory.booking_link_sent &&
    !saysNoMoneyOrCapital(text) &&
    !seemsToWantJobOrDrivingWork(text) &&
    hasQualificationContinuationSignal(text)
  ) {
    markQualificationPermissionGranted(memory);
    console.log(
      `Qualification permission inferred from useful context for ${memory.key || "conversation"}.`
    );
    return qualificationComplete(memory)
      ? appointmentSetterZoomInviteReply(memory)
      : appointmentSetterQualificationQuestionReply(memory);
  }

  if (memory.booking_link_sent && asksToResendCalendarLink(text)) {
    console.log(`Calendar resend requested for ${memory.key || "conversation"}.`);
    return appointmentSetterCalendarLinkReply(incoming, memory);
  }

  if (
    memory.booking_link_sent &&
    (zoomAcceptance(text) || directBookingIntent(text) || yesToCalendarLink(text))
  ) {
    console.log(`Calendar already sent for ${memory.key || "conversation"}. Nudging existing link.`);
    return appointmentSetterUseLinkReply();
  }

  if (!memory.booking_link_sent && lastAssistantInvitedToZoom(memory) && zoomAcceptance(text)) {
    console.log(`Call acceptance detected for ${memory.key || "conversation"}. Sending calendar.`);
    return appointmentSetterCalendarLinkReply(incoming, memory);
  }

  if (!memory.booking_link_sent && directBookingIntent(text)) {
    console.log(`Direct booking intent detected for ${memory.key || "conversation"}. Bypassing qualification.`);
    return appointmentSetterCalendarLinkReply(incoming, memory);
  }

  const interruption = qualificationInterruptionReply(memory, text);
  if (interruption) {
    console.log(`Qualification interruption handled for ${memory.key || "conversation"}.`);
    return interruption;
  }

  const interested =
    hasClearStartIntent(text) ||
    (lastAssistantAskedContentOrBusiness(memory) && yesToBusinessInterest(text)) ||
    (lastAssistantAskedContentOrBusiness(memory) && missingBefore.length < 3) ||
    qualificationQuestionWasAsked(memory) ||
    (wantsPalletBusiness(text) && !wantsContentOnly(text) && !prospectAskedQuestion(text));

  if (!interested) {
    return null;
  }

  markConversationState(memory, "PALLET_INTEREST_DETECTED");

  if (
    !hasQualificationPermission(memory) &&
    !qualificationPermissionRequested(memory) &&
    !qualificationQuestionWasAsked(memory)
  ) {
    return appointmentSetterQualificationPermissionReply(memory);
  }

  if (qualificationComplete(memory)) {
    console.log(`Pallet interest plus complete qualification detected for ${memory.key || "conversation"}.`);
    return appointmentSetterZoomInviteReply(memory);
  }

  const hasPartialQualification =
    hasOperatingMarket(memory) || hasResourcePosition(memory) || hasGoalMotivation(memory);

  if (hasPartialQualification || hasQualificationPermission(memory)) {
    markQualificationPermissionGranted(memory);
    console.log(
      `Partial qualification detected for ${memory.key || "conversation"}; missing=${missingQualificationKeys(memory).join(",")}.`
    );
    return appointmentSetterQualificationQuestionReply(memory);
  }

  if (!qualificationPermissionRequested(memory)) {
    return appointmentSetterQualificationPermissionReply(memory);
  }

  return null;
}

function leadTrackingId(messageLike = {}) {
  const contactId =
    normalizeProvider(messageLike.provider) === "zernio"
      ? usefulIdentityId(
          messageLike.contact_id,
          messageLike.zernio_account_id,
          messageLike.username
        )
      : String(messageLike.contact_id || "").trim();

  return String(
    contactId ||
      messageLike.ig_user_id ||
      messageLike.zernio_contact_id ||
      messageLike.chat_id ||
      messageLike.talk_id ||
      ""
  ).trim();
}

function publicTrackingCode(leadId) {
  const cleanLeadId = String(leadId || "").trim();
  if (!cleanLeadId) {
    return "";
  }

  return `p${crypto
    .createHash("sha256")
    .update(cleanLeadId)
    .digest("base64url")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 9)}`;
}

function memoryTrackingIdentifiers(memory) {
  if (!memory || typeof memory !== "object") {
    return [];
  }

  return [
    memory.contact_id,
    memory.chat_id,
    memory.current_talk_id,
    memory.zernio_conversation_id
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function resolvePublicTrackingId(store, publicId) {
  const cleanPublicId = String(publicId || "").trim();
  if (!cleanPublicId) {
    return "";
  }

  for (const memory of Object.values(store.conversations || {})) {
    for (const identifier of memoryTrackingIdentifiers(memory)) {
      if (identifier === cleanPublicId || publicTrackingCode(identifier) === cleanPublicId) {
        return identifier;
      }
    }
  }

  return cleanPublicId;
}

function trackedBookingUrl(messageLike = {}) {
  const leadId = leadTrackingId(messageLike);
  const trackingCode = publicTrackingCode(leadId);
  const params = new URLSearchParams();

  if (trackingCode) {
    params.set("t", trackingCode);
  }

  return params.toString()
    ? `${TRACKED_BOOKING_BASE_URL}?${params.toString()}`
    : TRACKED_BOOKING_BASE_URL;
}

function withTrackedBookingUrl(replyText, messageLike = {}) {
  return String(replyText || "").replace(
    /https?:\/\/(?:www\.)?tidycal\.com\/palletprosga\/[^\s)]+/gi,
    trackedBookingUrl(messageLike)
  );
}

function appointmentSetterCalendarLinkReply(messageLike, memory = null) {
  const calendarUrl = trackedBookingUrl(messageLike);
  if (memory) {
    markConversationState(memory, "CALENDAR_SENT");
  }
  const messages = [
    `Perfect. Here's my calendar. Grab whatever time works best for you:\n\n${calendarUrl}`
  ];

  return {
    reply: messages.join("\n\n"),
    messages,
    message_delays_ms: [],
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
      "We have a few different options depending on where you're starting and the level of help you need. Some options start as low as $37/month, and more hands-on help for existing business owners can go up to $5,500.\n\nWant me to send you the calendar link so we can point you in the right direction?",
    needs_review: false,
    handled: true
  };
}

function appointmentSetterHowItWorksReply() {
  return {
    reply:
      "Got you. I have a short training video that explains how the pallet business works. Want me to send it?",
    needs_review: false,
    handled: true
  };
}

function appointmentSetterCallAboutReply() {
  return {
    reply:
      "We'll take a look at your local market, answer your questions, and see if Pallet Pros Academy makes sense for what you're trying to build.\n\nWant me to send you the calendar link?",
    needs_review: false,
    handled: true
  };
}

function appointmentSetterTrainingAskReply() {
  return {
    reply: "Got you. I have a short training video that explains how the pallet business works. Want me to send it?",
    needs_review: false,
    handled: true
  };
}

function appointmentSetterTrainingLinkReply() {
  return {
    reply: `No problem. Here's the training video: ${TRAINING_URL}`,
    needs_review: false,
    handled: true
  };
}

function appointmentSetterNotReadyReply() {
  return {
    reply:
      "No problem. If timing isn't right yet, the training video is probably the best next step for now.\n\nWant me to send it?",
    needs_review: false,
    handled: true
  };
}

function appointmentSetterNoTruckReply() {
  return {
    reply:
      "That's fine. A truck helps, but the first step is seeing if your area even has the right opportunity.\n\nIs that something you'd want to learn more about?",
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

function appointmentSetterJobSeekerReply() {
  return {
    reply:
      `I respect that. This page is really for people wanting to learn or start the pallet business, not for hiring drivers.\n\nIf you want to learn the business for free, the YouTube channel is the best place to start: ${YOUTUBE_URL}`,
    needs_review: false,
    handled: true
  };
}

function appointmentSetterSkepticReply() {
  return {
    reply:
      "I get why you'd ask. I run this business myself, and it still comes down to whether the model makes sense in your area.\n\nIs that something you'd want to learn more about?",
    needs_review: false,
    handled: true
  };
}

function appointmentSetterExistingBuyerProblemReply() {
  return {
    reply:
      "Got you. That's exactly the type of thing my academy helps people with. We can get on a call, research your market, and see where you may be able to find better buyers.\n\nDo you mind if I send you a link to my calendar?",
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
  const cleanText = String(text || "")
    .toLowerCase()
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return /^(yes|yea|yeah|yep|yup|sure|suree+|of course|that's fine|thats fine|that is fine|that's cool|thats cool|cool|fine|k|ok|okay|absolutely|please|send it|send me the link|go ahead|sounds good|that works|bet|i'm interested|im interested|interested|i'm down|im down|lets do it|let's do it|when are you available|how do i book|can we talk|yes that is fine)\b/i.test(
    cleanText
  );
}

function wantsCalendarLinkNow(text) {
  const value = String(text || "").toLowerCase();
  return (
    /\b(send|drop|share|give|text)\b.{0,24}\b(calendar|booking|call|zoom|discovery)?\s*link\b/.test(value) ||
    /\b(calendar|booking|call|zoom|discovery)\s*link\b/.test(value) ||
    /\b(book|schedule|set up|setup|lock in)\b.{0,24}\b(call|zoom|appointment|discovery|calendar)\b/.test(value) ||
    /\b(let'?s|lets)\s+(?:do|get)\s+it\s+(?:done|started)?\b/.test(value)
  );
}

function saysTheyWillBook(text) {
  return /\b(i'?ll|i will|im going to|i'm going to|gonna|going to)\s+(?:book|schedule|grab|choose|pick)|\b(book(?:ing)?\s+(?:it|on|now|soon|today|tomorrow))\b/i.test(
    String(text || "")
  );
}

function wantsContentOnly(text) {
  return /\b(just content|only content|free content|here for (?:the )?content|just here for (?:the )?content|just looking|just curious|researching|youtube)\b/i.test(
    String(text || "")
  );
}

function saysNotReadyYet(text) {
  return /\b(not now|not right now|not ready|when i'?m ready|when im ready|i'?ll let you know|i will let you know|later|another time|not at the moment|not today|maybe later)\b/i.test(
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

function asksWhatCallIsAbout(text) {
  return /\b(what(?:'s| is)? (?:the )?(?:call|zoom|meeting|consultation|consult) (?:about|for)|what do we talk about|what will we discuss|what happens on (?:the )?(?:call|zoom|meeting))\b/i.test(
    String(text || "")
  );
}

function saysNoTruckYet(text) {
  return /\b(no truck|don't have (?:a )?truck|dont have (?:a )?truck|without (?:a )?truck|need (?:a )?truck|no trailer|don't have (?:a )?trailer|dont have (?:a )?trailer)\b/i.test(
    String(text || "")
  );
}

function saysNoMoneyOrCapital(text) {
  return /\b(no money|no capital|don't have (?:any )?(?:money|capital)|dont have (?:any )?(?:money|capital)|do not have (?:any )?(?:money|capital)|can't afford|cant afford|broke|unemployed)\b/i.test(
    String(text || "")
  );
}

function seemsToWantJobOrDrivingWork(text) {
  const value = String(text || "");
  return /\b(driver|drivers|drive|driving|job|hire|hiring|work for|work with|join something already|needed help|need help|someone needed.*help|someone needed.*driver|assuming something else|thought.*driver|thought.*help)\b/i.test(
    value
  );
}

function wantsTrainingIntro(text) {
  const value = String(text || "");
  return /\b(here to learn|just learning|trying to learn|tryna learn|want to learn|learn more|more info|information|info|what'?s steps|what are the steps|steps|how it works|how does it work|explain|teach me|show me)\b/i.test(
    value
  );
}

function asksIfLegit(text) {
  return /\b(is this legit|legit|scam|real deal|does this really work|proof|testimonials?|results)\b/i.test(
    String(text || "")
  );
}

function mentionsExistingPalletBusiness(text) {
  return /\b(started|have|own|run|running|been in|already (?:have|run|started)).{0,80}\b(pallet|pallets|pallet business)\b|\b(pallet|pallets)\b.{0,80}\b(5 years|years ago|already started|my business|our business|slowed down|slow|slower)\b/i.test(
    String(text || "")
  );
}

function mentionsBuyerProblem(text) {
  return /\b(buyer|buyers|client|clients|customer|customers|contracts?|accounts?|new business|sales|sell more|selling|yard|yards|direct buyers?|better buyers?|slowed down|slow|less money|pricing|prices)\b/i.test(
    String(text || "")
  );
}

function existingOperatorBuyerProblem(memory, text) {
  const recent = recentConversationText(memory, 8);
  const combined = `${recent} ${String(text || "").toLowerCase()}`;

  return mentionsBuyerProblem(text) && mentionsExistingPalletBusiness(combined);
}

function wantsPalletBusiness(text) {
  return /\b(interested|want|wanna|trying|tryna|looking|ready|learn|start|get started|get into|appointment|consultation|schedule|book|call|zoom|business|pallet)\b/i.test(
    String(text || "")
  );
}

function hasClearStartIntent(text) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();

  if (cleanText.includes("?") || /^(how|what|where|when|why|who|can|do|does|is|are|would|could|should)\b/i.test(cleanText)) {
    return false;
  }

  return /\b(i'?m|im|i am|we'?re|were|we are|i|we)\s+(?:definitely\s+|really\s+|ready\s+|tryna\s+|trying\s+|looking\s+|want(?:ing)?\s+|wanna\s+)?(?:interested|ready|down|trying|tryna|looking|want(?:ing)?|wanna|ready)\b.{0,80}\b(start|get started|learn|business|pallet|pallets)\b/i.test(
    String(text || "")
  ) ||
    /\b(i|we)\s+(?:would\s+like|want|wanna|wanting|ready|trying|tryna|looking|waiting)\b.{0,80}\b(?:own|have|start|get|build)\b.{0,50}\b(?:my|our|a|own)?\s*(?:pallet\s+)?business\b/i.test(
      String(text || "")
    ) ||
    /\b(my own business|own business|have my business|have a business|start my business|start a business|start the business)\b/i.test(
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

function lastAssistantAskedSoftLearningBridge(memory) {
  return (Array.isArray(memory?.last_messages) ? memory.last_messages : [])
    .slice(-5)
    .some(
      (message) =>
        message.role === "assistant" &&
        /(want to learn more|want to know more|want to look into it|something you'd want to learn more about|something you would want to learn more about|interested in learning more|how does that sound)/i.test(
          message.text || ""
        )
    );
}

function lastAssistantAskedForTrainingPermission(memory) {
  return (Array.isArray(memory?.last_messages) ? memory.last_messages : [])
    .slice(-5)
    .some(
      (message) =>
        message.role === "assistant" &&
        /(training video|explains how the pallet business works|want me to send it|send it)/i.test(
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

  return /^(yes|yea|yeah|yep|yup|both|bet|cool|that's cool|thats cool|that's fine|thats fine|sounds good|that works|most definitely|definitely|for sure|sure|yea definitely|yeah definitely|i am|i'm|im|interested|i'm interested|im interested|trying|tryna|i'm tryna|im tryna|i want|wanting|wanna|ready|down|let's do it|lets do it)\b/.test(
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

function mentionsRelevantOccupationOrAsset(text) {
  return /\b(cdl|truck(?:ing|er)?|box truck|flatbed|trailer|hotshot|logistics|warehouse|forklift|courier|delivery|deliveries|moving|junk removal|transportation|route|routes|business owner|own a business|llc|pickup|cargo van)\b/i.test(
    String(text || "")
  );
}

function mentionsPersonalMotivation(text) {
  return /\b(extra income|side income|second income|replace (?:my )?job|quit (?:my )?job|leave (?:my )?job|financial freedom|own (?:my )?business|work for myself|family|kids|home more|tired of|on the road|local|make money|income source|build something)\b/i.test(
    String(text || "")
  );
}

function hasQualificationContinuationSignal(text) {
  const value = String(text || "");
  const fields = extractQualificationFields(value);
  return (
    hasClearStartIntent(value) ||
    wantsPalletBusiness(value) ||
    mentionsRelevantOccupationOrAsset(value) ||
    mentionsExistingPalletExperience(value) ||
    mentionsPersonalMotivation(value) ||
    Boolean(
      fields.operating_market ||
        fields.operating_city ||
        fields.operating_state ||
        fields.vehicle_type ||
        fields.existing_business ||
        fields.existing_business_type ||
        fields.plans_to_rent ||
        fields.financial_goal ||
        fields.lifestyle_goal ||
        fields.primary_motivation
    )
  );
}

function mentionsExistingPalletExperience(text) {
  return /\b(already|currently|been|have|got|started|run|running|sell|selling|sold|flip|flipping|pick up|pickup|remove|removing|broker|brokered|buyer|buyers|supplier|suppliers|warehouse|warehouses|yard|yards)\b.{0,80}\b(pallet|pallets)\b|\b(pallet|pallets)\b.{0,80}\b(already|currently|buyer|buyers|supplier|suppliers|warehouse|warehouses|yard|yards|sell|selling|sold|flip|flipping|pick up|remove|broker)\b/i.test(
    String(text || "")
  );
}

function hasHotQualificationSignal(text) {
  const value = String(text || "");
  return (
    wantsCalendarLinkNow(value) ||
    wantsAppointmentOrScheduling(value) ||
    mentionsRelevantOccupationOrAsset(value) ||
    mentionsExistingPalletExperience(value) ||
    mentionsPersonalMotivation(value) ||
    /\b(ready|start now|get started|sign me up|join|how do i join|need to start|want to do this|definitely looking to start|serious|asap|right away)\b/i.test(
      value
    )
  );
}

function alreadyAskedMotivation(memory) {
  return (Array.isArray(memory?.questions_asked) ? memory.questions_asked : []).includes(
    "why_start"
  );
}

function shouldAskMotivationBeforeZoom(memory, text) {
  return (
    !alreadyAskedMotivation(memory) &&
    !hasHotQualificationSignal(text) &&
    !hasRichProspectContext(text) &&
    !prospectAskedQuestion(text)
  );
}

function warmTrainingRoutePercent(settings = {}) {
  const value = Number(settings.warm_training_route_percent);
  return Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : DEFAULT_WARM_TRAINING_ROUTE_PERCENT;
}

function stablePercentKey(value) {
  const digest = crypto.createHash("sha1").update(String(value || "")).digest("hex").slice(0, 8);
  return parseInt(digest, 16) % 100;
}

function shouldRouteWarmLeadToTraining(memory, text, settings) {
  if (memory?.training_link_sent || memory?.youtube_link_sent || memory?.booking_link_sent) {
    return false;
  }

  if (hasHotQualificationSignal(text) || wantsAppointmentOrScheduling(text)) {
    return false;
  }

  const percent = warmTrainingRoutePercent(settings);
  if (percent <= 0) {
    return false;
  }

  const key = memory?.key || memory?.contact_id || memory?.chat_id || text;
  return stablePercentKey(key) < percent;
}

function prospectAskedQuestion(text) {
  const cleanText = String(text || "").replace(/\s+/g, " ").trim();

  return (
    cleanText.includes("?") ||
    /^(how|what|where|when|why|who|can i|can you|do you|does it|is it|are there|would|could|should)\b/i.test(
      cleanText
    ) ||
    /\b(price|cost|pay|make|need)\b/i.test(
      cleanText
    )
  );
}

function isSimplePalletBusinessIntent(text) {
  return (
    wantsPalletBusiness(text) &&
    !prospectAskedQuestion(text) &&
    !wantsContentOnly(text) &&
    !hasRichProspectContext(text)
  );
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

function latestProspectTurnText(memory, incoming) {
  const messages = Array.isArray(memory?.last_messages) ? memory.last_messages : [];
  const incomingId = String(incoming?.incoming_message_id || "");
  const latestUserAtMs = toMessageTimestampMs(incoming?.created_at || Date.now());
  const burst = [];

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "assistant") {
      break;
    }

    if (message.role !== "user") {
      continue;
    }

    const messageAtMs = message.at ? Date.parse(String(message.at)) : latestUserAtMs;
    const closeEnough =
      Number.isFinite(messageAtMs) && latestUserAtMs - messageAtMs <= 45 * 1000;

    if (!closeEnough && (!incomingId || String(message.id || "") !== incomingId)) {
      break;
    }

    burst.unshift(message.text || "");
  }

  const combined = burst.join(" ").replace(/\s+/g, " ").trim();
  return combined || String(incoming?.text || "");
}

function appointmentSetterRuleReply(memory, incoming, featureSettings = {}) {
  const text = latestProspectTurnText(memory, incoming);

  if (!text.trim()) {
    return null;
  }

  if (
    wantsContentOnly(text) &&
    !hasClearStartIntent(text) &&
    !wantsAppointmentOrScheduling(text)
  ) {
    return appointmentSetterContentReply();
  }

  if (
    seemsToWantJobOrDrivingWork(text) &&
    !hasClearStartIntent(text) &&
    !wantsAppointmentOrScheduling(text)
  ) {
    return appointmentSetterJobSeekerReply();
  }

  if (
    saysNoMoneyOrCapital(text) &&
    !hasClearStartIntent(text) &&
    !wantsAppointmentOrScheduling(text)
  ) {
    return appointmentSetterNoMoneyReply();
  }

  if (
    wantsTrainingIntro(text) &&
    !hasClearStartIntent(text) &&
    !wantsAppointmentOrScheduling(text) &&
    !memory?.training_link_sent &&
    !memory?.youtube_link_sent &&
    !memory?.booking_link_sent
  ) {
    return appointmentSetterTrainingAskReply();
  }

  const qualificationReply = appointmentSetterQualificationFlowReply(
    memory,
    incoming,
    text
  );
  if (qualificationReply) {
    return qualificationReply;
  }

  if (
    !memory?.booking_confirmed &&
    lastAssistantAskedForCalendarPermission(memory) &&
    yesToCalendarLink(text)
  ) {
    return memory?.booking_link_sent
      ? appointmentSetterUseLinkReply()
      : appointmentSetterCalendarLinkReply(incoming, memory);
  }

  if (
    !memory?.booking_confirmed &&
    lastAssistantAskedForTrainingPermission(memory) &&
    (yesToBusinessInterest(text) || yesToCalendarLink(text))
  ) {
    return appointmentSetterTrainingLinkReply();
  }

  if (wantsDirectPhoneCall(text) && !hasRichProspectContext(text)) {
    return appointmentSetterPhoneReply(memory, incoming);
  }

  if (saysNoMoneyOrCapital(text)) {
    return appointmentSetterNoMoneyReply();
  }

  if (saysNotReadyYet(text) && !memory?.booking_link_sent) {
    return appointmentSetterNotReadyReply();
  }

  if (existingOperatorBuyerProblem(memory, text)) {
    markConversationState(memory, "PALLET_INTEREST_DETECTED");

    if (!hasQualificationPermission(memory) && !qualificationQuestionWasAsked(memory)) {
      return appointmentSetterQualificationPermissionReply(memory);
    }

    if (!qualificationComplete(memory)) {
      markQualificationPermissionGranted(memory);
      return appointmentSetterQualificationQuestionReply(memory);
    }

    return appointmentSetterExistingBuyerProblemReply();
  }

  if (asksPriceOrCost(text)) {
    return appointmentSetterCostReply();
  }

  if (
    (hasClearStartIntent(text) || isSimplePalletBusinessIntent(text)) &&
    !memory?.booking_link_sent &&
    !lastAssistantAskedForCalendarPermission(memory)
  ) {
    if (shouldAskMotivationBeforeZoom(memory, text)) {
      return appointmentSetterMotivationReply();
    }

    return appointmentSetterCalendarAskReply();
  }

  if (asksWhatCallIsAbout(text)) {
    return appointmentSetterCallAboutReply();
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
    lastAssistantAskedSoftLearningBridge(memory) &&
    yesToBusinessInterest(text) &&
    !memory?.booking_link_sent &&
    !memory?.booking_confirmed
  ) {
    return appointmentSetterCalendarAskReply();
  }

  if (memory?.booking_confirmed) {
    return null;
  }

  if (memory?.booking_link_sent && saysTheyWillBook(text) && !prospectAskedQuestion(text)) {
    return {
      reply: "Sounds good, grab the weekday time that works best and I'll verify it.",
      needs_review: false,
      handled: true
    };
  }

  if (wantsCalendarLinkNow(text) && !memory?.booking_confirmed) {
    return memory?.booking_link_sent && !asksToResendCalendarLink(text)
      ? appointmentSetterUseLinkReply()
      : appointmentSetterCalendarLinkReply(incoming, memory);
  }

  if (
    wantsAppointmentOrScheduling(text) &&
    !memory?.booking_link_sent &&
    !memory?.booking_confirmed
  ) {
    return prospectAskedQuestion(text)
      ? appointmentSetterCalendarAskReply()
      : appointmentSetterCalendarLinkReply(incoming, memory);
  }

  if (
    lastAssistantAskedContentOrBusiness(memory) &&
    yesToBusinessInterest(text) &&
    !memory?.booking_link_sent &&
    !memory?.booking_confirmed
  ) {
    if (shouldAskMotivationBeforeZoom(memory, text)) {
      return appointmentSetterMotivationReply();
    }

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
    wantsContentOnly(text) &&
    !hasClearStartIntent(text) &&
    !wantsAppointmentOrScheduling(text) &&
    !prospectAskedQuestion(text)
  ) {
    return appointmentSetterContentReply();
  }

  if (
    wantsPalletBusiness(text) &&
    !memory?.booking_link_sent &&
    !lastAssistantAskedForCalendarPermission(memory)
  ) {
    if (hasHotQualificationSignal(text)) {
      return appointmentSetterCalendarAskReply();
    }

    if (shouldAskMotivationBeforeZoom(memory, text)) {
      return appointmentSetterMotivationReply();
    }

    if (shouldRouteWarmLeadToTraining(memory, text, featureSettings)) {
      return appointmentSetterTrainingAskReply();
    }

    return appointmentSetterTrainingAskReply();
  }

  if (
    isAmbiguousShortReply(text) &&
    !memory?.booking_link_sent &&
    !lastAssistantAskedForCalendarPermission(memory)
  ) {
    return appointmentSetterTrainingAskReply();
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
    reply: "Great. I'm looking forward to helping you get things started.",
    needs_review: false,
    handled: true
  };
}

function followUpTriggerType(replyText) {
  const text = String(replyText || "");

  if (linkStatsForText(text).booking_links_sent) {
    return "booking_link_sent";
  }

  if (/send you a link to my calendar|send (?:you )?(?:the|a) calendar link|link to my calendar|calendar link/i.test(text)) {
    return "calendar_permission";
  }

  if (/something you(?:'d| would)? want to learn more about|want to learn more|learn more about/i.test(text)) {
    return "soft_learning_bridge";
  }

  return replyLooksLikeQuestion(text) ? "question" : "";
}

function scheduleFollowUpIfNeeded(memory, replyText, sentAtMs = Date.now(), settings) {
  const triggerType = followUpTriggerType(replyText);

  if (!isFollowUpsEnabled(settings) || !triggerType || memory.booking_confirmed) {
    memory.follow_up.active = false;
    return;
  }

  memory.follow_up = {
    active: true,
    count: 0,
    trigger_type: triggerType,
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
  const publicId = String(req.query.t || req.query.id || req.query.lead_id || "")
    .trim()
    .slice(0, 160);
  const clickedAt = new Date().toISOString();
  const store = await readStore();
  const leadId = resolvePublicTrackingId(store, publicId);

  store.linkClicks.push({
    id: crypto.randomUUID(),
    lead_id: leadId,
    public_id: publicId,
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

      if (memoryTrackingIdentifiers(memory).includes(leadId)) {
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
  recordKpiEvent(store, {
    type: "booking_link_clicked",
    timestamp: clickedAt,
    conversation_id: leadId || publicId || "unknown",
    prospect_id: leadId || publicId || "unknown",
    source: "tracked_calendar_redirect",
    dedupe_key: `booking_link_clicked:${publicId || leadId || clickedAt}`
  });

  await writeStore(store);
  return { leadId, publicId };
}

function leadMatchesMemory(memory, leadId) {
  const id = String(leadId || "").trim();
  if (!id || !memory || typeof memory !== "object") {
    return false;
  }

  return memoryTrackingIdentifiers(memory).some(
    (identifier) => identifier === id || publicTrackingCode(identifier) === id
  );
}

async function recordAppointmentScheduled({ leadId, source = "booking_webhook", payload = {} }) {
  const bookedAt = new Date().toISOString();
  const store = await readStore();
  const publicId = String(leadId || "").trim().slice(0, 160);
  const cleanLeadId = resolvePublicTrackingId(store, publicId);
  let matched = false;

  store.bookingEvents.push({
    id: crypto.randomUUID(),
    lead_id: cleanLeadId,
    public_id: publicId,
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
        recordKpiEvent(store, {
          type: "call_booked",
          timestamp: bookedAt,
          conversation_id: memory.key || cleanLeadId,
          prospect_id: cleanLeadId || memory.contact_id || memory.key,
          source,
          dedupe_key: `call_booked:${memory.key || cleanLeadId}:${businessDateKey(bookedAt)}`
        });
      }
    }
  }

  if (!matched) {
    recordDailyStat(store, cleanLeadId ? `booking:${cleanLeadId}` : "booking:unknown", {
      appointments_scheduled: 1
    });
    recordKpiEvent(store, {
      type: "call_booked",
      timestamp: bookedAt,
      conversation_id: cleanLeadId || publicId || "unknown",
      prospect_id: cleanLeadId || publicId || "unknown",
      source,
      dedupe_key: `call_booked:${cleanLeadId || publicId || bookedAt}:${businessDateKey(bookedAt)}`
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

function latestAssistantMessage(memory) {
  const messages = Array.isArray(memory?.last_messages) ? memory.last_messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") {
      return messages[index];
    }
  }
  return null;
}

function scorecardMessageId(message) {
  if (!message) {
    return "";
  }

  return String(
    message.id ||
      `reply:${message.at || ""}:${crypto
        .createHash("sha1")
        .update(String(message.text || ""))
        .digest("hex")
        .slice(0, 12)}`
  );
}

function latestScorecardForReply(store, conversationKey, messageId) {
  const feedback = Array.isArray(store?.feedback) ? store.feedback : [];
  const cleanMessageId = String(messageId || "");
  for (let index = feedback.length - 1; index >= 0; index -= 1) {
    const item = feedback[index];
    if (
      item?.type === "reply_scorecard" &&
      item.conversation_key === conversationKey &&
      String(item.message_id || "") === cleanMessageId
    ) {
      return item;
    }
  }
  return null;
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

function safeRate(numerator, denominator) {
  const top = Number(numerator || 0);
  const bottom = Number(denominator || 0);
  if (!bottom || !Number.isFinite(top) || !Number.isFinite(bottom)) {
    return 0;
  }
  return Math.round((top / bottom) * 10000) / 100;
}

function conversationIdentifier(memoryOrMessage = {}, fallback = "") {
  return String(
    memoryOrMessage.key ||
      memoryOrMessage.conversation_id ||
      memoryOrMessage.conversation_key ||
      memoryOrMessage.contact_id ||
      memoryOrMessage.chat_id ||
      memoryOrMessage.zernio_conversation_id ||
      memoryOrMessage.talk_id ||
      memoryOrMessage.current_talk_id ||
      fallback ||
      "unknown"
  ).slice(0, 240);
}

function replyPitchesCall(text) {
  const value = String(text || "");
  return /\b(zoom|call|calendar|book|schedule|appointment|talk for a few|research your market|send you (a|the) link|send (you )?(my )?calendar)\b/i.test(
    value
  );
}

function recordKpiEvent(store, event = {}) {
  const type = String(event.type || "").trim();
  if (!KPI_EVENT_TYPES.has(type)) {
    return null;
  }

  store.kpiEvents = Array.isArray(store.kpiEvents) ? store.kpiEvents : [];
  const timestamp = event.timestamp ? new Date(event.timestamp) : new Date();
  const at = Number.isNaN(timestamp.getTime()) ? new Date().toISOString() : timestamp.toISOString();
  const conversationId = conversationIdentifier(event, event.prospect_id || event.lead_id || "");
  const day = businessDateKey(at);
  const dedupeKey =
    event.dedupe_key ||
    `${type}:${day}:${conversationId}:${String(event.source || "").slice(0, 60)}`;

  if (store.kpiEvents.some((item) => item?.dedupe_key === dedupeKey)) {
    return null;
  }

  const normalized = {
    id: crypto.randomUUID(),
    type,
    timestamp: at,
    business_day: day,
    conversation_id: conversationId,
    prospect_id: String(event.prospect_id || event.lead_id || conversationId).slice(0, 240),
    source: String(event.source || "app").slice(0, 80),
    dedupe_key: dedupeKey,
    metadata: event.metadata && typeof event.metadata === "object" ? event.metadata : {}
  };

  store.kpiEvents.push(normalized);
  store.kpiEvents = store.kpiEvents.slice(-5000);
  return normalized;
}

function dateRangeFromQuery(query = {}, now = new Date()) {
  const rawRange = String(query.range || query.timeframe || "7d").toLowerCase();
  const today = businessDateKey(now);
  const customStart = String(query.start || query.start_date || "").slice(0, 10);
  const customEnd = String(query.end || query.end_date || "").slice(0, 10);

  if (rawRange === "all" || rawRange === "all_time") {
    return { key: "all", label: "All Time", startKey: "", endKey: "", all: true };
  }

  if (rawRange === "custom" && customStart && customEnd) {
    return {
      key: "custom",
      label: "Custom",
      startKey: customStart <= customEnd ? customStart : customEnd,
      endKey: customStart <= customEnd ? customEnd : customStart,
      all: false
    };
  }

  const ranges = {
    "24h": ["Today", today, today],
    today: ["Today", today, today],
    yesterday: ["Yesterday", addDaysToKey(today, -1), addDaysToKey(today, -1)],
    "7d": ["Last 7 Days", addDaysToKey(today, -6), today],
    last_7_days: ["Last 7 Days", addDaysToKey(today, -6), today],
    "30d": ["Last 30 Days", addDaysToKey(today, -29), today],
    last_30_days: ["Last 30 Days", addDaysToKey(today, -29), today],
    "90d": ["Last 90 Days", addDaysToKey(today, -89), today],
    ytd: ["YTD", startOfYearKey(today), today],
    this_year: ["This Year", startOfYearKey(today), today]
  };

  if (rawRange === "this_week") {
    ranges.this_week = ["This Week", startOfWeekKey(today), today];
  }
  if (rawRange === "last_week") {
    const end = addDaysToKey(startOfWeekKey(today), -1);
    ranges.last_week = ["Last Week", startOfWeekKey(end), end];
  }
  if (rawRange === "this_month") {
    ranges.this_month = ["This Month", startOfMonthKey(today), today];
  }
  if (rawRange === "last_month") {
    const end = addDaysToKey(startOfMonthKey(today), -1);
    ranges.last_month = ["Last Month", startOfMonthKey(end), end];
  }
  if (rawRange === "this_quarter") {
    ranges.this_quarter = ["This Quarter", startOfQuarterKey(today), today];
  }
  if (rawRange === "last_quarter") {
    const end = addDaysToKey(startOfQuarterKey(today), -1);
    ranges.last_quarter = ["Last Quarter", startOfQuarterKey(end), end];
  }
  if (rawRange === "last_year") {
    const year = Number(today.slice(0, 4)) - 1;
    ranges.last_year = ["Last Year", `${year}-01-01`, `${year}-12-31`];
  }

  const selected = ranges[rawRange] || ranges["7d"];
  return {
    key: rawRange,
    label: selected[0],
    startKey: selected[1],
    endKey: selected[2],
    all: false
  };
}

function kpiEventInRange(event, range) {
  if (range.all) {
    return true;
  }
  const key = event.business_day || businessDateKey(event.timestamp);
  return key >= range.startKey && key <= range.endKey;
}

function derivedKpiEvents(store) {
  const events = [];

  for (const [day, stats] of Object.entries(store.dailyStats || {})) {
    const keys = Array.isArray(stats?.prospect_keys) ? stats.prospect_keys : [];
    for (const key of keys) {
      events.push({
        id: `legacy-touch:${day}:${key}`,
        type: "touch_point",
        timestamp: `${day}T12:00:00.000Z`,
        business_day: day,
        conversation_id: key,
        prospect_id: key,
        source: "legacy_daily_stats",
        derived: true
      });
    }
  }

  for (const memory of Object.values(store.conversations || {})) {
    const conversationId = conversationIdentifier(memory);
    const prospectId = memory.contact_id || memory.chat_id || conversationId;
    const touchedDays = new Map();
    const messages = Array.isArray(memory?.last_messages) ? memory.last_messages : [];
    const touchTimes = messages
      .map((message) => message?.at)
      .filter(Boolean);

    if (!touchTimes.length) {
      [
        memory.last_incoming_at,
        memory.last_outgoing_at,
        memory.booking_link_clicked_at,
        memory.booking_confirmed_at
      ]
        .filter(Boolean)
        .forEach((value) => touchTimes.push(value));
    }

    for (const at of touchTimes) {
      const parsed = Date.parse(String(at || ""));
      if (!Number.isFinite(parsed)) continue;
      const timestamp = new Date(parsed).toISOString();
      const day = businessDateKey(timestamp);
      if (!touchedDays.has(day)) {
        touchedDays.set(day, timestamp);
      }
    }

    for (const [day, timestamp] of touchedDays) {
      events.push({
        id: `conversation-touch:${day}:${conversationId}`,
        type: "touch_point",
        timestamp,
        business_day: day,
        conversation_id: conversationId,
        prospect_id: prospectId,
        source: "conversation_memory",
        derived: true
      });
    }

    const pitchedMessage = messages.find(
      (message) => message.role === "assistant" && replyPitchesCall(message.text)
    );
    if (memory.call_pitched || pitchedMessage) {
      const at = memory.call_pitched_at || pitchedMessage?.at || memory.last_outgoing_at || new Date().toISOString();
      events.push({
        id: `legacy-pitch:${conversationId}:${businessDateKey(at)}`,
        type: "call_pitched",
        timestamp: at,
        business_day: businessDateKey(at),
        conversation_id: conversationId,
        prospect_id: prospectId,
        source: "conversation_memory",
        derived: true
      });
    }
    if (memory.appointment_status === "showed") {
      const at = memory.appointment_status_at || memory.booking_confirmed_at || memory.last_outgoing_at || new Date().toISOString();
      events.push({
        id: `legacy-show:${conversationId}:${businessDateKey(at)}`,
        type: "call_showed",
        timestamp: at,
        business_day: businessDateKey(at),
        conversation_id: conversationId,
        prospect_id: prospectId,
        source: "manual_status",
        derived: true
      });
    }
    if (memory.appointment_status === "no_show") {
      const at = memory.appointment_status_at || new Date().toISOString();
      events.push({
        id: `legacy-noshow:${conversationId}:${businessDateKey(at)}`,
        type: "call_no_show",
        timestamp: at,
        business_day: businessDateKey(at),
        conversation_id: conversationId,
        prospect_id: prospectId,
        source: "manual_status",
        derived: true
      });
    }
  }

  for (const event of Array.isArray(store.bookingEvents) ? store.bookingEvents : []) {
    const at = event.booked_at || event.created_at || new Date().toISOString();
    events.push({
      id: `legacy-book:${event.id || event.lead_id || at}`,
      type: "call_booked",
      timestamp: at,
      business_day: businessDateKey(at),
      conversation_id: String(event.lead_id || event.public_id || event.id || "booking"),
      prospect_id: String(event.lead_id || event.public_id || event.id || "booking"),
      source: event.source || "booking_event",
      derived: true
    });
  }

  return events;
}

function allKpiEvents(store) {
  const seen = new Set();
  return [...derivedKpiEvents(store), ...(Array.isArray(store.kpiEvents) ? store.kpiEvents : [])]
    .filter((event) => KPI_EVENT_TYPES.has(event?.type))
    .filter((event) => {
      const key = `${event.type}:${event.business_day || businessDateKey(event.timestamp)}:${event.conversation_id || event.prospect_id || event.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function groupKeyForEvent(event, groupBy) {
  const day = event.business_day || businessDateKey(event.timestamp);
  if (groupBy === "year") return day.slice(0, 4);
  if (groupBy === "month") return day.slice(0, 7);
  if (groupBy === "week") return startOfWeekKey(day);
  return day;
}

function emptySetterKpis() {
  return {
    touch_points: 0,
    calls_pitched: 0,
    calls_booked: 0,
    calls_showed: 0,
    no_shows: 0,
    cancelled: 0,
    rescheduled: 0,
    booking_links_sent: 0,
    booking_link_clicks: 0,
    follow_ups: 0,
    human_interventions: 0,
    touch_to_pitch_rate: 0,
    pitch_to_book_rate: 0,
    book_to_show_rate: 0,
    touch_to_book_rate: 0
  };
}

function setterKpisForEvents(events) {
  const kpis = emptySetterKpis();
  const touchKeys = new Set();

  for (const event of events || []) {
    if (event.type === "touch_point") {
      touchKeys.add(`${event.business_day || businessDateKey(event.timestamp)}:${event.conversation_id || event.prospect_id}`);
    } else if (event.type === "call_pitched") {
      kpis.calls_pitched += 1;
    } else if (event.type === "call_booked") {
      kpis.calls_booked += 1;
    } else if (event.type === "call_showed") {
      kpis.calls_showed += 1;
    } else if (event.type === "call_no_show") {
      kpis.no_shows += 1;
    } else if (event.type === "call_cancelled") {
      kpis.cancelled += 1;
    } else if (event.type === "call_rescheduled") {
      kpis.rescheduled += 1;
    } else if (event.type === "booking_link_sent") {
      kpis.booking_links_sent += 1;
    } else if (event.type === "booking_link_clicked") {
      kpis.booking_link_clicks += 1;
    } else if (event.type === "follow_up") {
      kpis.follow_ups += 1;
    } else if (event.type === "human_intervention") {
      kpis.human_interventions += 1;
    }
  }

  kpis.touch_points = touchKeys.size;
  kpis.touch_to_pitch_rate = safeRate(kpis.calls_pitched, kpis.touch_points);
  kpis.pitch_to_book_rate = safeRate(kpis.calls_booked, kpis.calls_pitched);
  kpis.book_to_show_rate = safeRate(kpis.calls_showed, kpis.calls_booked);
  kpis.touch_to_book_rate = safeRate(kpis.calls_booked, kpis.touch_points);
  return kpis;
}

function kpiDiagnosis(kpis, targets = DEFAULT_KPI_TARGETS) {
  if (!kpis.touch_points) {
    return {
      level: "needs",
      title: "Low conversation volume",
      message: "No meaningful DM touch points are showing in this range yet."
    };
  }
  if (kpis.touch_points >= Math.max(10, Number(targets.daily_touch_points_target || 100) * 0.25) && kpis.touch_to_pitch_rate < Number(targets.touch_pitch_min_rate || 10)) {
    return {
      level: "needs",
      title: "Pitch rate is low",
      message: "People are replying, but the app is not moving enough warm conversations toward a call."
    };
  }
  if (kpis.calls_pitched >= 5 && kpis.pitch_to_book_rate < Number(targets.pitch_book_min_rate || 50)) {
    return {
      level: "needs",
      title: "Booking conversion is soft",
      message: "The pitch is happening, but not enough prospects are saying yes and booking."
    };
  }
  if (kpis.calls_booked >= 3 && kpis.book_to_show_rate < Number(targets.book_show_min_rate || 75)) {
    return {
      level: "watch",
      title: "Show rate needs attention",
      message: "Booked calls are not consistently marked as showed yet. Update call outcomes after Zoom."
    };
  }
  return {
    level: "ok",
    title: "Setter flow is healthy",
    message: "Touch, pitch, booked, and showed metrics are within the current target guardrails."
  };
}

function kpiAnalytics(store, query = {}) {
  const range = dateRangeFromQuery(query);
  const groupBy = ["day", "week", "month", "year"].includes(String(query.group_by || query.group || "").toLowerCase())
    ? String(query.group_by || query.group).toLowerCase()
    : "day";
  const events = allKpiEvents(store).filter((event) => kpiEventInRange(event, range));
  const totals = setterKpisForEvents(events);
  const groups = new Map();

  for (const event of events) {
    const key = groupKeyForEvent(event, groupBy);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }

  const breakdown = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, groupEvents]) => ({ key, ...setterKpisForEvents(groupEvents) }));

  return {
    range,
    group_by: groupBy,
    business_time_zone: BUSINESS_TIME_ZONE,
    totals,
    targets: normalizeKpiTargets(store.kpiTargets),
    diagnosis: kpiDiagnosis(totals, normalizeKpiTargets(store.kpiTargets)),
    breakdown
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
  const hasTraining = replyText.includes(TRAINING_URL);
  const hasBooking = containsBookingLink(replyText);

  return {
    training_links_sent: hasYoutube || hasTraining ? 1 : 0,
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
    lead_profile:
      memory.lead_profile && typeof memory.lead_profile === "object"
        ? memory.lead_profile
        : {},
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

function publicConversation(memory, settings = {}, store = null) {
  refreshMemorySummary(memory);
  const messages = Array.isArray(memory.last_messages) ? memory.last_messages : [];
  const lastMessage = messages[messages.length - 1] || null;
  const lastAssistantMessage = latestAssistantMessage(memory);
  const lastAssistantMessageId = scorecardMessageId(lastAssistantMessage);
  const latestScorecard = store && lastAssistantMessage
    ? latestScorecardForReply(store, memory.key, lastAssistantMessageId)
    : null;

  return {
    key: memory.key,
    provider: normalizeProvider(memory.provider),
    contact_id: memory.contact_id || "",
    display_name: conversationDisplayName(memory),
    profile_status: memory.username ? "resolved" : "missing_username",
    username: memory.username || "",
    avatar_url: cacheableAvatarUrl(memory.avatar_url),
    talk_id: memory.current_talk_id || "",
    origin: memory.origin || "",
    lead_status: memory.lead_status || classifyLeadStatus(memory),
    summary: memory.summary || "",
    recent_messages: messages.slice(-MAX_RECENT_MEMORY_MESSAGES),
    last_message: lastMessage,
    last_assistant_message: lastAssistantMessage
      ? { ...lastAssistantMessage, scorecard_id: lastAssistantMessageId }
      : null,
    reply_scorecard: latestScorecard
      ? {
          rating: latestScorecard.rating || "",
          note: latestScorecard.note || "",
          created_at: latestScorecard.created_at || ""
        }
      : null,
    last_incoming_at: memory.last_incoming_at || "",
    last_outgoing_at: memory.last_outgoing_at || "",
    last_outgoing_source: memory.last_outgoing_source || "",
    ai_paused: Boolean(settings.paused || memoryAutomationPaused(memory)),
    manual_takeover_active: isManualTakeoverActive(settings) || isManualTakeoverActive(memory),
    manual_takeover_until:
      settings.manual_takeover_until || memory.manual_takeover_until || null,
    call_pitched: Boolean(memory.call_pitched),
    call_pitched_at: memory.call_pitched_at || null,
    needs_human_review: Boolean(memory.needs_human_review),
    needs_human_review_reason: memory.needs_human_review_reason || "",
    needs_human_review_at: memory.needs_human_review_at || null,
    hot_reason: memory.hot_reason || "",
    hot_at: memory.hot_at || null,
    last_objection: memory.last_objection || "",
    last_objection_at: memory.last_objection_at || null,
    last_reply_reason: memory.last_reply_reason || "",
    reply_reason_history: Array.isArray(memory.reply_reason_history)
      ? memory.reply_reason_history.slice(-10)
      : [],
    booking_link_sent: Boolean(memory.booking_link_sent),
    booking_link_clicked: Boolean(memory.booking_link_clicked),
    booking_link_clicked_at: memory.booking_link_clicked_at || null,
    training_link_sent: Boolean(memory.training_link_sent),
    booking_confirmed: Boolean(memory.booking_confirmed),
    booking_confirmed_at: memory.booking_confirmed_at || null,
    appointment_status: memory.appointment_status || "unknown",
    appointment_status_at: memory.appointment_status_at || null,
    follow_up: memory.follow_up || {}
  };
}

function conversationDisplayName(memory) {
  if (memory.username) {
    return `@${memory.username}`;
  }

  const candidate = memory.contact_id || memory.chat_id || memory.current_talk_id || memory.key;
  if (candidate && !looksLikeInternalIdentifier(candidate)) {
    return String(candidate);
  }

  return "Instagram lead";
}

function conversationGhosted(memory, nowMs = Date.now()) {
  if (!memory || memory.booking_confirmed || memory.needs_human_review) return false;
  const lastIncomingMs = memory.last_incoming_at ? Date.parse(memory.last_incoming_at) : 0;
  const lastOutgoingMs = memory.last_outgoing_at ? Date.parse(memory.last_outgoing_at) : 0;
  if (!lastOutgoingMs || (lastIncomingMs && lastIncomingMs > lastOutgoingMs)) return false;
  return nowMs - lastOutgoingMs >= 4 * 60 * 60 * 1000;
}

function setterReviewForTimeframe(store, timeframe = "7d") {
  const nowMs = Date.now();
  const conversations = Object.values(store.conversations || {})
    .filter((memory) => conversationInTimeframe(memory, timeframe))
    .sort((a, b) => {
      const left = Date.parse(b.last_incoming_at || b.last_outgoing_at || 0);
      const right = Date.parse(a.last_incoming_at || a.last_outgoing_at || 0);
      return left - right;
    });
  const replyReasons = {};
  const objections = {};
  const hot_leads = [];
  const needs_me = [];
  const ghosted = [];

  for (const memory of conversations) {
    for (const item of memory.reply_reason_history || []) {
      const reason = String(item?.reason || "unknown");
      replyReasons[reason] = (replyReasons[reason] || 0) + 1;
    }

    if (memory.last_objection) {
      objections[memory.last_objection] = (objections[memory.last_objection] || 0) + 1;
    }

    const summary = {
      key: memory.key,
      name: conversationDisplayName(memory),
      username: memory.username || "",
      last_incoming_at: memory.last_incoming_at || "",
      last_outgoing_at: memory.last_outgoing_at || "",
      last_reply_reason: memory.last_reply_reason || "",
      last_objection: memory.last_objection || "",
      last_message:
        (Array.isArray(memory.last_messages) && memory.last_messages.length
          ? memory.last_messages[memory.last_messages.length - 1]?.text
          : memory.summary) || ""
    };

    if (memory.hot_reason && !memory.booking_confirmed) {
      hot_leads.push({ ...summary, reason: memory.hot_reason, at: memory.hot_at || "" });
    }

    if (memory.needs_human_review) {
      needs_me.push({
        ...summary,
        reason: memory.needs_human_review_reason || "Needs manual review.",
        at: memory.needs_human_review_at || ""
      });
    }

    if (conversationGhosted(memory, nowMs)) {
      ghosted.push({
        ...summary,
        reason: memory.last_reply_reason || "No prospect response after outgoing message.",
        at: memory.last_outgoing_at || ""
      });
    }
  }

  const reasonBreakdown = Object.entries(replyReasons)
    .sort(([, a], [, b]) => b - a)
    .map(([reason, count]) => ({ reason, count }));
  const objectionBreakdown = Object.entries(objections)
    .sort(([, a], [, b]) => b - a)
    .map(([reason, count]) => ({ reason, count }));

  return {
    timeframe,
    totals: {
      conversations: conversations.length,
      hot_leads: hot_leads.length,
      needs_me: needs_me.length,
      ghosted: ghosted.length
    },
    reply_reasons: reasonBreakdown,
    objections: objectionBreakdown,
    hot_leads: hot_leads.slice(0, 25),
    needs_me: needs_me.slice(0, 25),
    ghosted: ghosted.slice(0, 25)
  };
}

function conversationOutcomeLabel(memory) {
  if (memory?.booking_confirmed) return "booked";
  if (memory?.booking_link_clicked) return "clicked_calendar_not_booked";
  if (memory?.booking_link_sent) return "calendar_sent_not_clicked";
  if (memory?.training_link_sent || memory?.youtube_link_sent) return "training_or_content_sent";
  if (memory?.call_pitched) return "call_pitched_no_link";
  if (conversationGhosted(memory)) return "ghosted";
  return memory?.lead_status || "unknown";
}

function learningConversationSamples(store, timeframe = "7d", limit = 35) {
  const conversations = Object.values(store.conversations || {})
    .filter((memory) => conversationInTimeframe(memory, timeframe))
    .sort((a, b) => latestConversationTime(b) - latestConversationTime(a))
    .slice(0, limit);

  return conversations.map((memory) => ({
    name: conversationDisplayName(memory),
    outcome: conversationOutcomeLabel(memory),
    lead_status: memory.lead_status || "",
    call_pitched: Boolean(memory.call_pitched),
    booking_link_sent: Boolean(memory.booking_link_sent),
    booking_link_clicked: Boolean(memory.booking_link_clicked),
    booking_confirmed: Boolean(memory.booking_confirmed),
    last_reply_reason: memory.last_reply_reason || "",
    messages: (Array.isArray(memory.last_messages) ? memory.last_messages : [])
      .slice(-12)
      .map((message) => ({
        role: message.role === "user" ? "prospect" : "assistant",
        source: message.source || "",
        text: compactMemoryText(message.text, 260)
      }))
  }));
}

function deterministicLearningReview(store, timeframe = "7d") {
  const analytics = kpiAnalytics(store, { range: timeframe });
  const review = setterReviewForTimeframe(store, timeframe);
  const stats = statsForTimeframe(store, timeframe);
  const totals = analytics.totals;
  const promptGuidance = [];
  const observations = [];
  const experiments = [];
  const guardrails = [
    "Keep replies short and human. One clear question per message.",
    "Do not over-qualify clear start intent. Move toward Zoom/calendar permission quickly.",
    "Do not invent prices, earnings, guarantees, or program details."
  ];

  observations.push(
    `${totals.touch_points || 0} touch points, ${totals.calls_pitched || 0} calls pitched, ${totals.calls_booked || 0} calls booked in ${timeframe}.`
  );

  if ((totals.booking_link_clicks || 0) > (totals.calls_booked || 0)) {
    observations.push(
      "Calendar clicks are higher than confirmed bookings, so some prospects are interested enough to click but are not finishing the booking step."
    );
    promptGuidance.push(
      "If the prospect clicked or received the calendar link but did not book, follow up by checking whether the page opened or whether they saw a time that works."
    );
    experiments.push(
      "For calendar-click/no-book leads, test a friction-removal follow-up instead of another generic reminder."
    );
  }

  if (totals.touch_points && safeRate(totals.calls_pitched, totals.touch_points) < 12) {
    observations.push("Call pitch rate is low relative to touch points.");
    promptGuidance.push(
      "Treat phrases like 'my own business', 'have my business', 'both', 'want to learn', and 'start a business' as warm enough to pitch the Zoom call."
    );
  }

  if (review.ghosted.length >= 3) {
    observations.push(`${review.ghosted.length} conversations look ghosted after the assistant replied.`);
    promptGuidance.push(
      "When a prospect gives context, mirror one concrete detail and position the call around solving that specific problem instead of making the call sound like the goal."
    );
  }

  if ((stats.training_links_sent || 0) > (stats.booking_links_sent || 0)) {
    observations.push("Training links outnumber booking links.");
    promptGuidance.push(
      "Use the training video for vague curiosity, but do not send training first when the prospect clearly says they want to start or own a pallet business."
    );
  }

  if (!promptGuidance.length) {
    promptGuidance.push(
      "Keep using the direct winning flow: interest -> Zoom framing -> ask permission for calendar -> send calendar when they agree."
    );
  }

  return {
    summary: observations.join(" "),
    observations,
    prompt_guidance: promptGuidance.slice(0, 8),
    guardrails,
    experiments: experiments.slice(0, 5),
    source: "deterministic"
  };
}

async function openAiLearningReview(store, timeframe = "7d") {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const payload = {
    timeframe,
    generated_at: new Date().toISOString(),
    analytics: kpiAnalytics(store, { range: timeframe }),
    setter_review: setterReviewForTimeframe(store, timeframe),
    conversation_samples: learningConversationSamples(store, timeframe)
  };
  const compactPayload = JSON.stringify(payload, null, 2).slice(0, MAX_LEARNING_TRANSCRIPT_CHARS);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a senior Instagram appointment-setting strategist for Pallet Pros Academy. Analyze 7-day DM outcomes and return practical guidance that can improve future replies. The winning flow is direct and low-friction: clear pallet-business interest -> frame Zoom as market research and Q&A -> ask permission for calendar -> send calendar after permission. Do not recommend long qualification, generic open-ended discovery questions, pressure, vague urgency, storytelling, personalized videos, income claims, or fake certainty."
        },
        {
          role: "user",
          content:
            "Return JSON with keys: summary, observations, prompt_guidance, guardrails, experiments. Each array should use short direct strings. Focus on what should change in future replies based on the data.\n" +
            compactPayload
        }
      ]
    })
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI learning review failed ${response.status}: ${text}`);
  }

  const parsed = safeJsonParse(responseBodyContent(text));
  if (!parsed) {
    return null;
  }

  return normalizeLearningReview(parsed, "openai");
}

function responseBodyContent(responseText) {
  const body = safeJsonParse(responseText);
  return body?.choices?.[0]?.message?.content || responseText;
}

function normalizeStringList(value, limit = 8) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function usefulLearningGuidance(item) {
  const text = String(item || "").toLowerCase();
  if (!text.trim()) {
    return false;
  }

  return !/\b(increase urgency|open[- ]ended questions?|storytelling|personalized video|different messaging styles|resonates|more engagement|value proposition)\b/i.test(
    text
  );
}

function mergeUniqueLearningList(primary = [], secondary = [], limit = 8) {
  const seen = new Set();
  const merged = [];

  for (const item of [...primary, ...secondary]) {
    const clean = String(item || "").replace(/\s+/g, " ").trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(clean);
    if (merged.length >= limit) {
      break;
    }
  }

  return merged;
}

function normalizeLearningReview(raw, source = "deterministic") {
  const fallback = raw && typeof raw === "object" ? raw : {};
  return {
    summary: String(fallback.summary || "").replace(/\s+/g, " ").trim().slice(0, 700),
    observations: normalizeStringList(fallback.observations, 10),
    prompt_guidance: normalizeStringList(fallback.prompt_guidance, 10),
    guardrails: normalizeStringList(fallback.guardrails, 10),
    experiments: normalizeStringList(fallback.experiments, 8),
    source
  };
}

function mergeLearningReviews(aiReview, baseReview) {
  if (!aiReview) {
    return baseReview;
  }

  const filteredAiGuidance = normalizeStringList(aiReview.prompt_guidance, 10).filter(
    usefulLearningGuidance
  );

  return {
    summary: aiReview.summary || baseReview.summary,
    observations: mergeUniqueLearningList(aiReview.observations, baseReview.observations, 10),
    prompt_guidance: mergeUniqueLearningList(
      filteredAiGuidance,
      baseReview.prompt_guidance,
      10
    ),
    guardrails: mergeUniqueLearningList(aiReview.guardrails, baseReview.guardrails, 10),
    experiments: mergeUniqueLearningList(
      normalizeStringList(aiReview.experiments, 8).filter(usefulLearningGuidance),
      baseReview.experiments,
      8
    ),
    source: filteredAiGuidance.length ? "openai" : "deterministic"
  };
}

function latestLearningGuidance(store) {
  const insights = Array.isArray(store?.learningInsights) ? store.learningInsights : [];
  const latest = insights
    .slice()
    .reverse()
    .find((item) => item && item.status === "complete");

  if (!latest) {
    return null;
  }

  return {
    generated_at: latest.generated_at,
    timeframe: latest.timeframe,
    source: latest.source,
    summary: latest.summary,
    prompt_guidance: latest.prompt_guidance || [],
    guardrails: latest.guardrails || []
  };
}

function learningGuidanceForPrompt(store) {
  const guidance = latestLearningGuidance(store);
  if (!guidance) {
    return null;
  }

  return {
    ...guidance,
    summary: compactMemoryText(guidance.summary, 500),
    prompt_guidance: normalizeStringList(guidance.prompt_guidance, 8),
    guardrails: normalizeStringList(guidance.guardrails, 8)
  };
}

async function runLearningReview(store, { timeframe = "7d", force = false } = {}) {
  const normalized = normalizeStore(store);
  normalized.learningState =
    normalized.learningState && typeof normalized.learningState === "object"
      ? normalized.learningState
      : {};

  const now = Date.now();
  const lastRunMs = Date.parse(String(normalized.learningState.last_run_at || ""));
  if (!force && Number.isFinite(lastRunMs) && now - lastRunMs < LEARNING_REVIEW_INTERVAL_MS) {
    return { ran: false, reason: "not_due", insight: latestLearningGuidance(normalized) };
  }

  normalized.learningState.last_attempt_at = new Date(now).toISOString();
  const baseReview = normalizeLearningReview(deterministicLearningReview(normalized, timeframe));
  let aiReview = null;
  let errorMessage = "";

  try {
    aiReview = await openAiLearningReview(normalized, timeframe);
  } catch (error) {
    errorMessage = error.message;
  }

  const selected = mergeLearningReviews(aiReview, baseReview);
  const insight = {
    id: crypto.randomUUID(),
    status: "complete",
    timeframe,
    generated_at: new Date().toISOString(),
    source: selected.source || "deterministic",
    summary: selected.summary || baseReview.summary,
    observations: selected.observations.length ? selected.observations : baseReview.observations,
    prompt_guidance: selected.prompt_guidance.length
      ? selected.prompt_guidance
      : baseReview.prompt_guidance,
    guardrails: selected.guardrails.length ? selected.guardrails : baseReview.guardrails,
    experiments: selected.experiments.length ? selected.experiments : baseReview.experiments,
    fallback_reason: aiReview ? "" : errorMessage
  };

  normalized.learningInsights = Array.isArray(normalized.learningInsights)
    ? normalized.learningInsights
    : [];
  normalized.learningInsights.push(insight);
  normalized.learningInsights = normalized.learningInsights.slice(-12);
  normalized.learningState.last_run_at = insight.generated_at;
  normalized.learningState.last_error = errorMessage;

  addAutomationEvent(normalized, {
    type: "learning_review",
    level: "info",
    message: "7-day learning review completed.",
    reason: insight.source
  });

  return { ran: true, insight, store: normalized };
}

async function processLearningReviewIfDue() {
  const store = await readStore();
  const result = await runLearningReview(store, { timeframe: "7d", force: false });
  if (result.ran && result.store) {
    await writeStore(result.store);
  }
  return result;
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
  for (const message of memory.last_messages) {
    if (message.role === "assistant") {
      updateQuestionMemory(memory, message.text);
    }
  }
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
  const senderUsername = pickValue(payload, [
    "data.sender.username",
    "data.sender.handle",
    "message.sender.username",
    "message.sender.handle",
    "sender.username",
    "sender.handle"
  ]);
  const leadId = pickValue(payload, [
    "data.customer.contactId",
    "data.customer.contact_id",
    "data.customer.id",
    "data.customerId",
    "data.customer_id",
    "data.contact.contactId",
    "data.contact.contact_id",
    "data.contact.id",
    "data.contactId",
    "data.contact_id",
    "data.participant.contactId",
    "data.participant.contact_id",
    "data.participant.id",
    "data.participantId",
    "data.participant_id",
    "message.customer.contactId",
    "message.customer.contact_id",
    "message.customer.id",
    "message.contact.contactId",
    "message.contact.contact_id",
    "message.contact.id",
    "message.contactId",
    "message.contact_id",
    "contact.contactId",
    "contact.contact_id",
    "contact.id",
    "customer.contactId",
    "customer.contact_id",
    "customer.id",
    "contactId",
    "contact_id"
  ]);
  const leadUsername = pickValue(payload, [
    "data.user.username",
    "data.user.handle",
    "data.sender.username",
    "data.sender.handle",
    "data.customer.username",
    "data.customer.handle",
    "data.customer.profile.username",
    "data.customer.profile.handle",
    "data.customer.social.username",
    "data.customer.social.handle",
    "data.contact.username",
    "data.contact.handle",
    "data.contact.profile.username",
    "data.contact.profile.handle",
    "data.contact.social.username",
    "data.contact.social.handle",
    "data.participant.username",
    "data.participant.handle",
    "data.instagram.username",
    "data.instagram.handle",
    "message.user.username",
    "message.user.handle",
    "message.sender.username",
    "message.sender.handle",
    "message.customer.username",
    "message.customer.handle",
    "message.customer.profile.username",
    "message.customer.profile.handle",
    "message.customer.social.username",
    "message.customer.social.handle",
    "message.contact.username",
    "message.contact.handle",
    "message.contact.profile.username",
    "message.contact.profile.handle",
    "message.contact.social.username",
    "message.contact.social.handle",
    "message.participant.username",
    "message.participant.handle",
    "message.instagram.username",
    "message.instagram.handle",
    "sender.username",
    "sender.handle",
    "contact.username",
    "contact.handle",
    "contact.profile.username",
    "contact.profile.handle",
    "contact.social.username",
    "contact.social.handle",
    "customer.username",
    "customer.handle",
    "customer.profile.username",
    "customer.profile.handle",
    "customer.social.username",
    "customer.social.handle",
    "participant.username",
    "participant.handle",
    "instagram.username",
    "instagram.handle",
    "from.username",
    "from.handle",
    "username",
    "handle"
  ]);
  const avatarUrl = pickValue(payload, [
    "data.user.profile_pic",
    "data.user.profilePic",
    "data.user.avatar",
    "data.sender.profile_pic",
    "data.sender.profilePic",
    "data.sender.avatar",
    "data.customer.profile_pic",
    "data.customer.profilePic",
    "data.customer.avatar",
    "data.customer.profile.profile_pic",
    "data.customer.profile.profilePic",
    "data.customer.profile.avatar",
    "data.contact.profile_pic",
    "data.contact.profilePic",
    "data.contact.avatar",
    "data.contact.profile.profile_pic",
    "data.contact.profile.profilePic",
    "data.contact.profile.avatar",
    "data.instagram.profile_pic",
    "data.instagram.profilePic",
    "data.instagram.avatar",
    "message.user.profile_pic",
    "message.user.profilePic",
    "message.user.avatar",
    "message.sender.profile_pic",
    "message.sender.profilePic",
    "message.sender.avatar",
    "sender.profile_pic",
    "sender.profilePic",
    "sender.avatar",
    "contact.profile_pic",
    "contact.profilePic",
    "contact.avatar",
    "customer.profile_pic",
    "customer.profilePic",
    "customer.avatar",
    "instagram.profile_pic",
    "instagram.profilePic",
    "instagram.avatar",
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
    "recipient_id"
  ]);
  const recipientUsername = pickValue(payload, [
    "data.recipient.username",
    "data.recipient.handle",
    "data.receiver.username",
    "data.receiver.handle",
    "message.recipient.username",
    "message.recipient.handle",
    "message.receiver.username",
    "message.receiver.handle",
    "recipient.username",
    "recipient.handle",
    "receiver.username",
    "receiver.handle"
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
    normalizedDirection === "outgoing"
      ? firstUsefulIdentity(
          [
            { id: recipientText, username: recipientUsername },
            { id: leadId, username: leadUsername },
            { id: senderText, username: senderUsername }
          ],
          accountText
        )
      : firstUsefulIdentity(
          [
            { id: leadId, username: leadUsername },
            { id: senderText, username: senderUsername },
            { id: recipientText, username: recipientUsername }
          ],
          accountText
        );
  const username =
    usefulUsername(leadUsername) ||
    usefulUsername(senderUsername) ||
    usefulUsername(recipientUsername);

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
  const learningStore = await readStore();
  const learningInsights = learningGuidanceForPrompt(learningStore);
  const payload = {
    conversation_history: thread.slice(-30),
    conversation_memory: promptMemory,
    business_knowledge: businessKnowledge || null,
    learning_insights: learningInsights,
    context_status: {
      provider: normalizeProvider(newMessage.provider),
      history_messages_loaded: thread.length,
      memory_messages_loaded: promptMemory?.recent_messages?.length || 0,
      business_knowledge_loaded: Boolean(businessKnowledge),
      learning_insights_loaded: Boolean(learningInsights)
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
            "Use learning_insights as recent performance guidance, but never violate house rules, safety rules, or business_knowledge.\n" +
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

async function currentAutomationHoldReason(messageLike) {
  const store = await readStore();
  const memory = getConversationMemory(store, messageLike);
  const settings = getConversationSettings(
    store,
    messageLike.talk_id || memory.current_talk_id
  );
  const holdReason = conversationHoldReason(settings);

  if (holdReason) {
    return holdReason;
  }

  if (memoryAutomationPaused(memory)) {
    return "Automation is paused for this prospect.";
  }

  return "";
}

async function sendAutoReply(messageLike, replyText, featureSettings) {
  const holdReason = await currentAutomationHoldReason(messageLike);
  if (holdReason) {
    throw new Error(`Auto-send blocked: ${holdReason}`);
  }

  return sendReply(messageLike, replyText, featureSettings);
}

function replyMessages(replyLike) {
  const messages = Array.isArray(replyLike?.messages)
    ? replyLike.messages
    : [replyLike?.reply || replyLike];

  return messages
    .map((message) => cleanProspectReply(String(message || "").trim()))
    .filter(Boolean);
}

function joinedReplyText(replyLike) {
  return replyMessages(replyLike).join("\n\n");
}

async function sendReplySequence(messageLike, replyLike, featureSettings) {
  const messages = replyMessages(replyLike);
  const messageDelays = Array.isArray(replyLike?.message_delays_ms)
    ? replyLike.message_delays_ms
    : [];

  for (let index = 0; index < messages.length; index += 1) {
    const delayMs = Number(messageDelays[index]);

    if (index > 0 || delayMs > 0) {
      await sleep(Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : CALENDAR_SEQUENCE_GAP_MS);
    }

    const sendSettings =
      index === 0
        ? featureSettings
        : {
            ...featureSettings,
            human_send_delay: false
          };

    await sendAutoReply(messageLike, messages[index], sendSettings);
  }

  return messages;
}

async function generateFollowUpReply(memory, featureSettings) {
  const followUpNumber = Number(memory.follow_up?.count || 0) + 1;
  const triggerType = String(memory.follow_up?.trigger_type || "");
  const questionText = String(memory.follow_up?.question_text || "");
  let replies;

  if (
    triggerType === "booking_link_sent" ||
    (memory.booking_link_sent && !memory.booking_confirmed)
  ) {
    replies = [
      memory.booking_link_clicked
        ? "Did you see a time on the calendar that works for you?"
        : "Were you able to open the calendar link?",
      "If the calendar opened but you didn't see a time that works, just let me know.",
      "When you get a second, grab a weekday time and we'll look at your market together."
    ];
  } else if (
    triggerType === "calendar_permission" ||
    /send you a link to my calendar|send (?:you )?(?:the|a) calendar link|link to my calendar|calendar link/i.test(questionText)
  ) {
    replies = [
      "Want me to send that calendar link over?",
      "If you want to look at a time, I can send the calendar link.",
      "When you're ready for the next step, just tell me to send the link."
    ];
  } else if (
    triggerType === "soft_learning_bridge" ||
    /something you(?:'d| would)? want to learn more about|want to learn more|learn more about/i.test(questionText)
  ) {
    replies = [
      "Did you want to see how this could work in your area?",
      "If you're still curious, the next step is seeing if your market makes sense.",
      "If you want to look into it later, message me and we'll take it from there."
    ];
  } else {
    replies = [
      "Still interested in getting this started?",
      "No pressure, just checking if this is still something you want to look into.",
      "If you want the next step, message me back and I'll point you in the right direction."
    ];
  }

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
    recordKpiEvent(store, {
      type: "touch_point",
      timestamp: incomingAt,
      conversation_id: memory.key,
      prospect_id: incoming.contact_id || incoming.chat_id || memory.key,
      source: "incoming_dm",
      dedupe_key: `touch_point:${businessDateKey(incomingAt)}:${memory.key}`
    });
    memory.last_incoming_at = incomingAt;
    noteIncomingSignals(memory, incoming.text, incomingAt);
    if (isBookingConfirmation(incoming.text)) {
      const wasConfirmed = Boolean(memory.booking_confirmed);
      memory.booking_confirmed = true;
      memory.booking_link_sent = true;
      memory.booking_confirmed_at = incomingAt;
      markConversationState(memory, "BOOKED");
      if (!wasConfirmed) {
        recordDailyStat(store, memory.key, { appointments_scheduled: 1 });
        recordKpiEvent(store, {
          type: "call_booked",
          timestamp: incomingAt,
          conversation_id: memory.key,
          prospect_id: incoming.contact_id || incoming.chat_id || memory.key,
          source: "incoming_booking_confirmation",
          dedupe_key: `call_booked:${memory.key}:${businessDateKey(incomingAt)}`
        });
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
  const replyReason =
    options.reason || replyReasonForText(replyText, { source, memory });
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
    source,
    reason: replyReason
  });
  memory.last_outgoing_at = sentAt;
  memory.last_outgoing_source = source;
  noteReplyReason(memory, replyReason, sentAt);
  updateLinkMemory(memory, replyText);
  const linkStats = linkStatsForText(replyText);
  if (linkStats.booking_links_sent) {
    markConversationState(memory, "CALENDAR_SENT");
  }
  if (replyPitchesCall(replyText) || linkStats.booking_links_sent) {
    memory.call_pitched = true;
    memory.call_pitched_at = memory.call_pitched_at || sentAt;
    recordKpiEvent(store, {
      type: "call_pitched",
      timestamp: sentAt,
      conversation_id: conversationKey,
      prospect_id: messageLike.contact_id || messageLike.chat_id || conversationKey,
      source,
      dedupe_key: `call_pitched:${businessDateKey(sentAt)}:${conversationKey}`
    });
  }
  if (linkStats.booking_links_sent) {
    recordKpiEvent(store, {
      type: "booking_link_sent",
      timestamp: sentAt,
      conversation_id: conversationKey,
      prospect_id: messageLike.contact_id || messageLike.chat_id || conversationKey,
      source,
      dedupe_key: `booking_link_sent:${businessDateKey(sentAt)}:${conversationKey}`
    });
  }
  recordKpiEvent(store, {
    type: "touch_point",
    timestamp: sentAt,
    conversation_id: conversationKey,
    prospect_id: messageLike.contact_id || messageLike.chat_id || conversationKey,
    source: `${source}_outgoing`,
    dedupe_key: `touch_point:${businessDateKey(sentAt)}:${conversationKey}`
  });
  if (source === "follow_up") {
    recordKpiEvent(store, {
      type: "follow_up",
      timestamp: sentAt,
      conversation_id: conversationKey,
      prospect_id: messageLike.contact_id || messageLike.chat_id || conversationKey,
      source,
      dedupe_key: `follow_up:${sentAt}:${conversationKey}`
    });
  }
  updateQuestionMemory(memory, replyText);
  scheduleFollowUpIfNeeded(memory, replyText, sentAtMs, featureSettings);
  refreshMemorySummary(memory);

  recordDailyStat(store, conversationKey, {
    prospects_touched: 1,
    ai_replies_sent: 1,
    auto_replies_sent: source === "auto" ? 1 : 0,
    manual_approvals_sent: source === "manual_approval" ? 1 : 0,
    followups_sent: source === "follow_up" ? 1 : 0,
    ...linkStats
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
  const conversationKey = memory.key || makeConversationKey(outgoing);
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
  const shouldPauseForManualTakeover = hasProspectMessages(memory);
  const featureSettings = getFeatureSettings(store);
  const takeoverUntil = new Date(Date.now() + manualTakeoverMs(featureSettings)).toISOString();
  const settings = getConversationSettings(store, outgoing.talk_id);

  cancelFollowUp(memory);
  clearPendingIncomingReply(conversationKey);
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
  if (shouldPauseForManualTakeover) {
    memory.ai_paused = true;
    memory.manual_takeover_since = sentAt;
    memory.manual_takeover_until = takeoverUntil;

    settings.manual_takeover_since = sentAt;
    settings.manual_takeover_until = takeoverUntil;
    settings.manual_takeover_reason = "Manual Zernio reply detected.";
  } else {
    memory.ai_paused = false;
    memory.manual_takeover_since = null;
    memory.manual_takeover_until = null;
    settings.manual_takeover_since = null;
    settings.manual_takeover_until = null;
    settings.manual_takeover_reason = "";
  }
  refreshMemorySummary(memory);

  await writeStore(store);
  if (shouldPauseForManualTakeover) {
    console.log(
      `Manual takeover active for talk_id=${outgoing.talk_id} until ${takeoverUntil}.`
    );
  } else {
    console.log(
      `Manual opener saved for talk_id=${outgoing.talk_id}; AI remains available for prospect replies.`
    );
  }
}

async function activateManualCompanionTakeover(messageLike, reason) {
  const store = await readStore();
  const memory = getConversationMemory(store, messageLike);
  const featureSettings = getFeatureSettings(store);
  const takeoverUntil = new Date(Date.now() + manualTakeoverMs(featureSettings)).toISOString();
  const settings = getConversationSettings(store, memory.current_talk_id || messageLike.talk_id);
  const since = new Date().toISOString();

  cancelFollowUp(memory);
  memory.ai_paused = true;
  memory.manual_takeover_since = since;
  memory.manual_takeover_until = takeoverUntil;
  refreshMemorySummary(memory);

  settings.manual_takeover_since = since;
  settings.manual_takeover_until = takeoverUntil;
  settings.manual_takeover_reason = reason || "Manual dashboard reply sent.";

  await writeStore(store);

  return { memory, settings, store };
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
        !memory.booking_confirmed &&
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

  if (memory.booking_confirmed) {
    memory.follow_up.active = false;
    memory.follow_up.due_at = null;
    await writeStore(store);
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
    await sendAutoReply(memory, replyText, featureSettings);
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

  if (memory?.needs_human_review && memory.needs_human_review_at === memory.last_incoming_at) {
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
      reason: memory.needs_human_review_reason || "Needs manual review."
    });
    await appendAutomationEvent({
      level: "warn",
      type: "needs_human_review",
      message: "Automation paused for this prospect; manual review required.",
      talk_id: incoming.talk_id,
      contact_id: incoming.contact_id,
      conversation_key: conversationKey,
      reason: memory.needs_human_review_reason || ""
    });
    console.log(`Paused automation for ${conversationKey}: ${memory.needs_human_review_reason}`);
    return;
  }

  await scheduleIncomingReply(incoming, parsedPayload, conversationKey);
}

function clearPendingIncomingReply(conversationKey) {
  const key = String(conversationKey || "").trim();
  if (!key) {
    return false;
  }

  const pending = pendingIncomingReplies.get(key);
  if (!pending) {
    return false;
  }

  if (pending.timer) {
    clearTimeout(pending.timer);
  }

  pendingIncomingReplies.delete(key);
  return true;
}

async function scheduleIncomingReply(incoming, parsedPayload, conversationKey) {
  if (INCOMING_REPLY_DEBOUNCE_MS <= 0) {
    await processIncomingReply(incoming, parsedPayload, conversationKey);
    return;
  }

  const debounceKey = conversationKey || makeConversationKey(incoming);
  const existing = pendingIncomingReplies.get(debounceKey);

  if (existing?.timer) {
    clearTimeout(existing.timer);
  }

  const timer = setTimeout(() => {
    const pending = pendingIncomingReplies.get(debounceKey);
    pendingIncomingReplies.delete(debounceKey);

    if (!pending) {
      return;
    }

    processIncomingReply(
      pending.incoming,
      pending.parsedPayload,
      pending.conversationKey
    ).catch((error) => {
      appendAutomationEvent({
        level: "error",
        type: "processing_failed",
        message: "Debounced webhook processing failed.",
        talk_id: pending.incoming.talk_id,
        contact_id: pending.incoming.contact_id,
        conversation_key: pending.conversationKey,
        reason: error.message
      }).catch((loggingError) =>
        console.error("Automation event logging failed:", loggingError)
      );
      console.error("Debounced webhook processing failed:", error);
    });
  }, INCOMING_REPLY_DEBOUNCE_MS);

  pendingIncomingReplies.set(debounceKey, {
    timer,
    incoming,
    parsedPayload,
    conversationKey: debounceKey
  });

  await appendAutomationEvent({
    level: "info",
    type: "debounce_scheduled",
    message: "Incoming reply queued briefly to combine rapid prospect messages.",
    talk_id: incoming.talk_id,
    contact_id: incoming.contact_id,
    conversation_key: debounceKey,
    reason: `${INCOMING_REPLY_DEBOUNCE_MS}ms`
  });
}

async function processIncomingReply(incoming, parsedPayload, conversationKey) {
  const memoryStore = await readStore();
  const featureSettings = getFeatureSettings(memoryStore);
  const memory = getConversationMemory(memoryStore, incoming);
  const resolvedConversationKey = memory.key || conversationKey || makeConversationKey(incoming);
  await writeStore(memoryStore);

  const ruleBasedReply = isBookingConfirmation(incoming.text)
    ? bookingConfirmationReply()
    : appointmentSetterRuleReply(memory, incoming, featureSettings);

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
          conversation_key: resolvedConversationKey
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
    aiReply.reply = cleanProspectReply(withTrackedBookingUrl(aiReply.reply, incoming));
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
      await sendAutoReply(incoming, aiReply.reply, featureSettings);
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
    const { leadId, publicId } = await recordBookingLinkClick(req);
    const redirectUrl = new URL(BOOKING_URL);
    const tidyCalLeadId = publicId || publicTrackingCode(leadId) || leadId;

    if (tidyCalLeadId) {
      redirectUrl.searchParams.set("lead_id", tidyCalLeadId);
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

app.get("/api/learning-review", async (_req, res, next) => {
  try {
    const store = await readStore();
    res.json({
      state: store.learningState || {},
      latest: latestLearningGuidance(store),
      insights: (Array.isArray(store.learningInsights) ? store.learningInsights : [])
        .slice()
        .sort((a, b) => Date.parse(b.generated_at || 0) - Date.parse(a.generated_at || 0))
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/learning-review/run", async (req, res, next) => {
  try {
    const store = await readStore();
    const timeframe = resolveTimeframe(req.body?.timeframe || req.query.timeframe || "7d");
    const result = await runLearningReview(store, {
      timeframe,
      force: req.body?.force !== false
    });

    if (result.store) {
      await writeStore(result.store);
    }

    res.json({
      ok: true,
      ran: result.ran,
      reason: result.reason || "",
      insight: result.insight || null
    });
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
    const kpiQuery = { ...req.query, range: req.query.range || timeframe };
    const analytics = kpiAnalytics(store, kpiQuery);
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
      setter_kpis: analytics.totals,
      setter_funnel: {
        touch_points: analytics.totals.touch_points,
        calls_pitched: analytics.totals.calls_pitched,
        calls_booked: analytics.totals.calls_booked,
        calls_showed: analytics.totals.calls_showed
      },
      kpi_targets: analytics.targets,
      kpi_diagnosis: analytics.diagnosis,
      learning_review: {
        latest: latestLearningGuidance(store),
        cadence_days: Math.round(LEARNING_REVIEW_INTERVAL_MS / (24 * 60 * 60 * 1000)),
        last_run_at: store.learningState?.last_run_at || null,
        last_attempt_at: store.learningState?.last_attempt_at || null,
        last_error: store.learningState?.last_error || ""
      },
      business_time_zone: BUSINESS_TIME_ZONE,
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
        app_build_marker: APP_BUILD_MARKER,
        business_time_zone: BUSINESS_TIME_ZONE,
        incoming_reply_debounce_ms: INCOMING_REPLY_DEBOUNCE_MS,
        identity_guard_enabled: true,
        self_usernames: Array.from(SELF_INSTAGRAM_USERNAMES),
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

app.get("/api/kpi-analytics", async (req, res, next) => {
  try {
    const store = await readStore();
    res.json(kpiAnalytics(store, req.query || {}));
  } catch (error) {
    next(error);
  }
});

app.get("/api/kpi-targets", async (_req, res, next) => {
  try {
    const store = await readStore();
    res.json({ targets: normalizeKpiTargets(store.kpiTargets) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/kpi-targets", async (req, res, next) => {
  try {
    const store = await readStore();
    store.kpiTargets = normalizeKpiTargets({
      ...store.kpiTargets,
      ...(req.body || {})
    });
    await writeStore(store);
    res.json({ ok: true, targets: store.kpiTargets });
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
          getConversationSettings(store, memory.current_talk_id),
          store
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

app.get("/api/setter-review", async (req, res, next) => {
  try {
    const store = await readStore();
    const timeframe = resolveTimeframe(req.query.timeframe || "7d");
    res.json(setterReviewForTimeframe(store, timeframe));
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
    res.json({ ok: true, conversation: publicConversation(memory, settings, store) });
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
    memory.needs_human_review = false;
    memory.needs_human_review_reason = "";
    memory.needs_human_review_at = null;
    refreshMemorySummary(memory);

    await writeStore(store);
    res.json({ ok: true, conversation: publicConversation(memory, settings, store) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/conversations/:key/send-message", async (req, res, next) => {
  try {
    const store = await readStore();
    const memory = store.conversations[req.params.key];
    const reply = String(req.body?.reply || "").trim();

    if (!memory) {
      res.status(404).json({ ok: false, error: "Conversation not found" });
      return;
    }

    if (!reply) {
      res.status(400).json({ ok: false, error: "Reply cannot be empty" });
      return;
    }

    if (reply.length > 1200) {
      res.status(400).json({ ok: false, error: "Reply must be 1200 characters or less" });
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
    const featureSettings = getFeatureSettings(store);

    try {
      await sendReply(messageLike, reply, featureSettings);
    } catch (error) {
      res.status(502).json({ ok: false, error: error.message });
      return;
    }

    await recordOutgoingForMemory(messageLike, reply, { source: "manual_companion" });
    const takeover = await activateManualCompanionTakeover(
      messageLike,
      "Manual dashboard reply sent."
    );
    const updatedMemory = takeover.store.conversations[req.params.key] || takeover.memory;
    const settings = getConversationSettings(
      takeover.store,
      updatedMemory.current_talk_id || messageLike.talk_id
    );

    res.json({
      ok: true,
      reply,
      conversation: publicConversation(updatedMemory, settings, takeover.store)
    });
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
      conversation: publicConversation(updatedMemory, settings, updatedStore)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/conversations/:key/appointment-status", async (req, res, next) => {
  try {
    const allowed = new Set(["showed", "no_show", "cancelled", "rescheduled", "unknown"]);
    const status = String(req.body?.status || "").toLowerCase();
    if (!allowed.has(status)) {
      res.status(400).json({ ok: false, error: "Unknown appointment status." });
      return;
    }

    const store = await readStore();
    const memory = store.conversations[req.params.key];
    if (!memory) {
      res.status(404).json({ ok: false, error: "Conversation not found" });
      return;
    }

    const timestamp = new Date().toISOString();
    memory.appointment_status = status;
    memory.appointment_status_at = timestamp;
    if (status === "showed") {
      memory.lead_status = "showed";
    }
    refreshMemorySummary(memory);

    const eventType = {
      showed: "call_showed",
      no_show: "call_no_show",
      cancelled: "call_cancelled",
      rescheduled: "call_rescheduled"
    }[status];

    if (eventType) {
      recordKpiEvent(store, {
        type: eventType,
        timestamp,
        conversation_id: memory.key,
        prospect_id: memory.contact_id || memory.chat_id || memory.key,
        source: "manual_appointment_status",
        dedupe_key: `${eventType}:${memory.key}:${businessDateKey(timestamp)}`
      });
    }

    await writeStore(store);
    res.json({
      ok: true,
      conversation: publicConversation(
        memory,
        getConversationSettings(store, memory.current_talk_id),
        store
      )
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/feedback", async (req, res, next) => {
  try {
    const type = String(req.body.type || "").trim().slice(0, 40);
    const note = String(req.body.note || "").trim().slice(0, 500);
    const rating = String(req.body.rating || "").trim().slice(0, 60);
    const messageId = String(req.body.message_id || "").trim().slice(0, 160);

    if (!type) {
      res.status(400).json({ ok: false, error: "Feedback type is required." });
      return;
    }

    const store = await readStore();
    store.feedback.push({
      id: crypto.randomUUID(),
      type,
      rating,
      note,
      conversation_key: String(req.body.conversation_key || ""),
      draft_id: String(req.body.draft_id || ""),
      message_id: messageId,
      reply: String(req.body.reply || "").slice(0, 2000),
      incoming_text: String(req.body.incoming_text || "").slice(0, 2000),
      lead_status: String(req.body.lead_status || "").slice(0, 80),
      source: String(req.body.source || "").slice(0, 80),
      created_at: new Date().toISOString()
    });
    store.feedback = store.feedback.slice(-1000);

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
      : appointmentSetterRuleReply(memory, newMessage, featureSettings);

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
  <meta name="apple-mobile-web-app-title" content="Pulse">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/app-icon.svg" type="image/svg+xml">
  <title>Pulse by KRAZYJAYDOTCOM</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #05080c;
      --bg-2: #080d13;
      --panel: rgba(8, 13, 18, 0.86);
      --panel-strong: rgba(11, 17, 23, 0.96);
      --panel-soft: rgba(255, 255, 255, 0.035);
      --border: rgba(148, 163, 184, 0.18);
      --border-strong: rgba(59, 130, 246, 0.55);
      --text: #f8fafc;
      --muted: #a7b0bd;
      --dim: #6f7a88;
      --green: #39df9f;
      --teal: #22d3ee;
      --violet: #7c3aed;
      --gold: #f4c95d;
      --red: #ff6b7a;
      --blue: #2f73ff;
      --pulse-purple: #6d28ff;
      --pulse-magenta: #db2cff;
      --pulse-pink: #ff3f8f;
      --pulse-orange: #ff9f1c;
      --ig-gradient: linear-gradient(135deg, #5b2cff 0%, #b12cff 34%, #ff367f 66%, #ff9f1c 100%);
      --pulse-glow: 0 0 18px rgba(219, 44, 255, 0.34), 0 0 42px rgba(255, 63, 143, 0.18);
      --shadow: 0 18px 52px rgba(0, 0, 0, 0.28);
      --radius: 8px;
    }

    * { box-sizing: border-box; }

    html {
      min-height: 100%;
      background:
        linear-gradient(180deg, rgba(16, 24, 34, 0.9), transparent 34%),
        linear-gradient(145deg, var(--bg), #080d13 58%, #030506);
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
      grid-template-columns: 132px minmax(0, 1fr);
      min-height: 100vh;
    }

    .sidebar {
      border-right: 1px solid var(--border);
      background: rgba(5, 9, 13, 0.96);
      backdrop-filter: blur(18px);
      padding: 15px 10px;
      position: sticky;
      top: 0;
      height: 100vh;
    }

    .brand {
      align-items: center;
      display: flex;
      gap: 9px;
      margin-bottom: 18px;
    }

    .brand-mark {
      align-items: center;
      background: linear-gradient(135deg, #b91c1c, #ef4444);
      border: 1px solid rgba(248, 113, 113, 0.42);
      border-radius: 8px;
      display: grid;
      font-size: 13px;
      font-weight: 900;
      height: 34px;
      justify-items: center;
      width: 34px;
    }

    .brand strong {
      display: block;
      font-size: 12px;
      line-height: 1.15;
    }

    .brand span {
      color: var(--muted);
      display: block;
      font-size: 10px;
      margin-top: 3px;
    }

    .nav {
      display: grid;
      gap: 5px;
    }

    .nav a,
    .bottom-nav a {
      align-items: center;
      border: 1px solid transparent;
      border-radius: 8px;
      color: var(--muted);
      display: flex;
      font-size: 12px;
      gap: 8px;
      min-height: 34px;
      padding: 0 9px;
      text-decoration: none;
    }

    .nav a.active,
    .nav a:hover,
    .bottom-nav a.active {
      background: linear-gradient(90deg, rgba(47, 115, 255, 0.18), rgba(47, 115, 255, 0.04));
      border-color: rgba(47, 115, 255, 0.22);
      color: var(--text);
    }

    .main {
      min-width: 0;
      padding: 18px 20px 32px;
    }

    .topbar {
      align-items: flex-start;
      display: flex;
      justify-content: space-between;
      gap: 18px;
      margin-bottom: 14px;
    }

    .eyebrow {
      color: var(--teal);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.08em;
      margin: 0 0 4px;
      text-transform: uppercase;
    }

    h1,
    h2,
    h3,
    p {
      margin-top: 0;
    }

    h1 {
      font-size: clamp(28px, 3.8vw, 48px);
      line-height: 0.95;
      margin-bottom: 8px;
    }

    .subhead {
      color: var(--muted);
      font-size: 12px;
      max-width: 780px;
      margin-bottom: 0;
    }

    .status-stack {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: flex-end;
      min-width: 275px;
    }

    .status-pill {
      align-items: center;
      background: linear-gradient(90deg, rgba(57, 223, 159, 0.84), rgba(22, 163, 74, 0.9));
      border: 1px solid rgba(134, 239, 172, 0.42);
      border-radius: 999px;
      color: #052e1b;
      display: inline-flex;
      font-size: 11px;
      font-weight: 900;
      gap: 8px;
      min-height: 28px;
      padding: 0 10px;
      white-space: nowrap;
    }

    .status-pill::before {
      background: #ecfdf5;
      border-radius: 50%;
      box-shadow: 0 0 16px rgba(57, 223, 159, 0.8);
      content: "";
      height: 8px;
      width: 8px;
    }

    .timeframe {
      background: rgba(15, 23, 42, 0.74);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-bottom: 12px;
      padding: 5px;
    }

    .timeframe button {
      background: transparent;
      border-radius: 6px;
      color: var(--muted);
      font-size: 11px;
      min-height: 30px;
      padding: 0 12px;
    }

    .timeframe button.active {
      background: linear-gradient(135deg, #2563eb, #3b82f6);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 6px 20px rgba(37, 99, 235, 0.28);
      color: #eff6ff;
      font-weight: 900;
    }

    .grid {
      display: grid;
      gap: 8px;
    }

    .kpis {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-bottom: 8px;
    }

    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      backdrop-filter: blur(16px);
    }

    .kpi {
      min-height: 82px;
      overflow: hidden;
      padding: 12px;
      position: relative;
    }

    .kpi::after {
      background: var(--red);
      border-radius: 50%;
      content: "";
      height: 7px;
      position: absolute;
      right: 10px;
      top: 11px;
      width: 7px;
    }

    .kpi span {
      color: var(--muted);
      display: block;
      font-size: 11px;
      font-weight: 900;
      margin-bottom: 10px;
    }

    .kpi strong {
      display: block;
      font-size: 25px;
      line-height: 1;
      position: relative;
      z-index: 1;
    }

    .kpi small {
      color: var(--teal);
      background: rgba(148, 163, 184, 0.14);
      border-radius: 5px;
      display: block;
      font-size: 10px;
      font-weight: 800;
      margin-top: 6px;
      padding: 2px 5px;
      position: relative;
      width: fit-content;
      z-index: 1;
    }

    .content-grid {
      align-items: start;
      grid-template-columns: minmax(0, 1.25fr) minmax(340px, 0.75fr);
    }

    .panel {
      padding: 12px;
    }

    .panel-head {
      align-items: center;
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }

    .panel h2 {
      font-size: 14px;
      margin: 0;
    }

    .panel-note {
      color: var(--muted);
      font-size: 11px;
    }

    .funnel {
      display: grid;
      gap: 8px;
    }

    .funnel-row {
      display: grid;
      gap: 5px;
    }

    .funnel-label {
      align-items: center;
      display: flex;
      justify-content: space-between;
      color: var(--muted);
      font-size: 11px;
      font-weight: 900;
    }

    .bar {
      background: rgba(148, 163, 184, 0.14);
      border-radius: 4px;
      height: 16px;
      overflow: hidden;
    }

    .bar span {
      background: linear-gradient(90deg, #1d4ed8, #3b82f6);
      border-radius: inherit;
      display: block;
      height: 100%;
      min-width: 4px;
      transition: width 240ms ease;
    }

    .activity {
      display: grid;
      gap: 8px;
      max-height: 520px;
      overflow: auto;
      padding-right: 3px;
    }

    .lead {
      background: rgba(15, 23, 42, 0.52);
      border: 1px solid var(--border);
      border-radius: 8px;
      display: grid;
      gap: 8px;
      padding: 10px;
    }

    .lead-top {
      align-items: center;
      display: grid;
      gap: 10px;
      grid-template-columns: 38px minmax(0, 1fr) auto;
    }

    .avatar {
      align-items: center;
      background: linear-gradient(135deg, rgba(47, 115, 255, 0.42), rgba(34, 211, 238, 0.22));
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 50%;
      display: grid;
      font-weight: 900;
      height: 38px;
      justify-items: center;
      overflow: visible;
      position: relative;
      width: 38px;
    }

    .avatar img {
      border-radius: 50%;
      height: 100%;
      object-fit: cover;
      width: 100%;
    }

    .lead-name {
      display: block;
      font-size: 13px;
      font-weight: 900;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lead-meta,
    .lead-message {
      color: var(--muted);
      font-size: 11px;
    }

    .lead-message {
      line-height: 1.4;
    }

    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }

    .tag {
      background: rgba(148, 163, 184, 0.09);
      border: 1px solid var(--border);
      border-radius: 5px;
      color: var(--muted);
      display: inline-flex;
      font-size: 9px;
      font-weight: 900;
      min-height: 20px;
      padding: 4px 6px;
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
      gap: 6px;
    }

    .action {
      background: rgba(15, 23, 42, 0.82);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-size: 11px;
      font-weight: 900;
      min-height: 32px;
      padding: 0 10px;
    }

    .action.primary {
      background: linear-gradient(135deg, rgba(37, 99, 235, 0.96), rgba(59, 130, 246, 0.94));
      border-color: rgba(96, 165, 250, 0.42);
      color: #f8fafc;
    }

    .action.warn {
      background: rgba(148, 163, 184, 0.12);
      border-color: rgba(148, 163, 184, 0.22);
    }

    .companion-backdrop {
      align-items: stretch;
      background: rgba(2, 6, 7, 0.62);
      backdrop-filter: blur(18px);
      display: flex;
      inset: 0;
      justify-content: flex-end;
      padding: 18px;
      position: fixed;
      z-index: 60;
    }

    .companion-backdrop[hidden] {
      display: none;
    }

    .companion {
      background:
        linear-gradient(145deg, rgba(17, 28, 28, 0.96), rgba(6, 11, 13, 0.96)),
        var(--panel-strong);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 22px;
      box-shadow: 0 28px 90px rgba(0, 0, 0, 0.42);
      display: grid;
      grid-template-rows: auto 1fr auto;
      max-width: 520px;
      min-height: 0;
      overflow: hidden;
      width: min(520px, 100%);
    }

    .companion-head {
      align-items: center;
      border-bottom: 1px solid var(--border);
      display: grid;
      gap: 12px;
      grid-template-columns: 48px minmax(0, 1fr) auto;
      padding: 16px;
    }

    .companion-title {
      font-size: 16px;
      font-weight: 900;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .companion-subtitle {
      color: var(--muted);
      font-size: 12px;
      margin-top: 2px;
    }

    .companion-close {
      align-items: center;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid var(--border);
      border-radius: 12px;
      color: var(--text);
      display: grid;
      font-size: 20px;
      height: 42px;
      justify-items: center;
      width: 42px;
    }

    .companion-thread {
      display: grid;
      gap: 10px;
      min-height: 0;
      overflow: auto;
      padding: 16px;
    }

    .bubble {
      border: 1px solid var(--border);
      border-radius: 16px;
      color: var(--text);
      line-height: 1.42;
      max-width: 88%;
      padding: 10px 12px;
      white-space: pre-wrap;
    }

    .bubble.user {
      background: rgba(255, 255, 255, 0.08);
      justify-self: start;
    }

    .bubble.assistant {
      background: linear-gradient(135deg, rgba(57, 223, 159, 0.18), rgba(156, 124, 255, 0.14));
      border-color: rgba(57, 223, 159, 0.22);
      justify-self: end;
    }

    .bubble small {
      color: var(--dim);
      display: block;
      font-size: 10px;
      margin-top: 6px;
      text-transform: uppercase;
    }

    .companion-composer {
      border-top: 1px solid var(--border);
      display: grid;
      gap: 10px;
      padding: 14px;
    }

    .companion-composer textarea {
      background: rgba(255, 255, 255, 0.075);
      border: 1px solid var(--border);
      border-radius: 16px;
      color: var(--text);
      min-height: 118px;
      padding: 12px;
      resize: vertical;
      width: 100%;
    }

    .companion-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
    }

    .scorecard {
      background: rgba(15, 23, 42, 0.46);
      border: 1px solid var(--border);
      border-radius: 8px;
      display: grid;
      gap: 7px;
      padding: 8px;
    }

    .scorecard-title {
      color: var(--muted);
      font-size: 10px;
      font-weight: 900;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .scorecard-reply {
      color: var(--text);
      font-size: 11px;
      line-height: 1.35;
    }

    .scorecard-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
    }

    .scorecard-button {
      background: rgba(15, 23, 42, 0.84);
      border: 1px solid var(--border);
      border-radius: 5px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 900;
      min-height: 28px;
      padding: 0 8px;
    }

    .scorecard-button.good,
    .scorecard-button.active {
      background: rgba(57, 223, 159, 0.14);
      border-color: rgba(57, 223, 159, 0.38);
      color: #dffdf2;
    }

    .scorecard-button.bad {
      background: rgba(255, 107, 122, 0.1);
      border-color: rgba(255, 107, 122, 0.34);
      color: #ffd8de;
    }

    .review-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }

    .review-card {
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px;
      min-height: 150px;
    }

    .review-card h3 {
      margin: 0 0 8px;
      font-size: 13px;
    }

    .review-card ul {
      display: grid;
      gap: 7px;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .review-card li {
      color: var(--muted);
      font-size: 11px;
      line-height: 1.35;
    }

    .review-card strong {
      color: var(--text);
      display: block;
      font-size: 12px;
    }

    .review-card .reason-pill {
      background: rgba(59, 130, 246, 0.12);
      border: 1px solid rgba(59, 130, 246, 0.22);
      border-radius: 999px;
      color: #bfdbfe;
      display: inline-block;
      font-size: 10px;
      margin-top: 3px;
      padding: 2px 6px;
    }

    .controls {
      display: grid;
      gap: 8px;
    }

    .control-row {
      align-items: center;
      display: grid;
      gap: 7px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .toggle {
      align-items: center;
      background: rgba(15, 23, 42, 0.76);
      border: 1px solid var(--border);
      border-radius: 7px;
      color: var(--muted);
      display: flex;
      font-size: 10px;
      font-weight: 900;
      justify-content: space-between;
      min-height: 34px;
      padding: 0 8px;
      text-align: left;
      width: 100%;
    }

    .toggle::after {
      background: rgba(148, 163, 184, 0.76);
      border-radius: 999px;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
      content: "";
      flex: 0 0 auto;
      height: 15px;
      width: 28px;
    }

    .toggle.on {
      background: rgba(15, 23, 42, 0.84);
      border-color: rgba(57, 223, 159, 0.24);
      color: #dffdf2;
    }

    .toggle.on::after {
      background: linear-gradient(90deg, #22c55e 48%, #bbf7d0 49%);
    }

    .toggle.off {
      background: rgba(15, 23, 42, 0.68);
      border-color: var(--border);
      color: var(--muted);
    }

    .test-grid {
      display: grid;
      gap: 8px;
      grid-template-columns: 1fr 1fr;
      margin-top: 8px;
    }

    textarea {
      background: rgba(3, 7, 12, 0.66);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 12px;
      min-height: 96px;
      padding: 10px;
      resize: vertical;
      width: 100%;
    }

    textarea:focus {
      border-color: rgba(59, 130, 246, 0.72);
      outline: none;
    }

    .result {
      color: var(--muted);
      font-size: 12px;
      margin-top: 10px;
      white-space: pre-wrap;
    }

    .drafts {
      display: grid;
      gap: 8px;
    }

    .events {
      display: grid;
      gap: 6px;
      margin-top: 8px;
      max-height: 210px;
      overflow: auto;
    }

    .event {
      background: rgba(15, 23, 42, 0.52);
      border: 1px solid var(--border);
      border-radius: 7px;
      color: var(--muted);
      display: grid;
      gap: 3px;
      font-size: 10px;
      padding: 8px;
    }

    .event strong {
      color: var(--text);
      font-size: 11px;
    }

    .event.error { border-color: rgba(255, 107, 122, 0.42); }
    .event.warn { border-color: rgba(244, 201, 93, 0.42); }
    .event.success { border-color: rgba(57, 223, 159, 0.42); }

    .empty {
      border: 1px dashed var(--border);
      border-radius: 8px;
      color: var(--muted);
      font-size: 12px;
      padding: 18px;
      text-align: center;
    }

    .toast {
      color: var(--muted);
      font-size: 11px;
      min-height: 17px;
    }

    .bottom-nav {
      display: none;
    }

    .mobile-shell {
      display: none;
    }

    .ghost-link {
      background: transparent;
      color: var(--teal);
      font-size: 12px;
      font-weight: 900;
      min-height: 34px;
      padding: 0;
    }

    .mobile-screen {
      display: none;
    }

    .mobile-screen.active {
      display: grid;
      gap: 14px;
    }

    .mobile-header h1 {
      font-size: 32px;
      line-height: 1;
      margin: 0;
    }

    .mobile-header.compact h1 {
      font-size: 28px;
      margin-bottom: 4px;
    }

    .mobile-header p {
      color: var(--muted);
      font-size: 13px;
      margin: 4px 0 0;
    }

    .bot-health {
      align-items: center;
      background: rgba(15, 23, 42, 0.52);
      border: 1px solid var(--border);
      border-radius: 18px;
      display: flex;
      justify-content: space-between;
      min-height: 78px;
      padding: 16px;
    }

    .bot-health strong {
      align-items: center;
      display: flex;
      font-size: 18px;
      gap: 10px;
      margin-bottom: 4px;
    }

    .bot-health strong::before {
      border-radius: 50%;
      content: "";
      height: 11px;
      width: 11px;
    }

    .bot-health.ok strong::before {
      background: var(--green);
      box-shadow: 0 0 18px rgba(57, 223, 159, 0.52);
    }

    .bot-health.needs strong::before {
      background: var(--red);
      box-shadow: 0 0 18px rgba(255, 107, 122, 0.48);
    }

    .bot-health span {
      color: var(--muted);
      display: block;
      font-size: 12px;
    }

    .hero-metric {
      align-items: center;
      background:
        radial-gradient(circle at 80% 12%, rgba(57, 223, 159, 0.18), transparent 34%),
        rgba(15, 23, 42, 0.56);
      border: 1px solid rgba(57, 223, 159, 0.16);
      border-radius: 24px;
      display: grid;
      justify-items: center;
      min-height: 178px;
      padding: 24px;
      text-align: center;
    }

    .hero-metric strong {
      font-size: 82px;
      line-height: 0.9;
    }

    .hero-metric span {
      color: var(--muted);
      font-size: 12px;
      font-weight: 900;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .mobile-supporting-metrics {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .mobile-supporting-metrics article {
      background: rgba(15, 23, 42, 0.46);
      border: 1px solid var(--border);
      border-radius: 16px;
      min-height: 82px;
      padding: 13px;
    }

    .mobile-supporting-metrics strong {
      display: block;
      font-size: 28px;
      line-height: 1;
      margin-bottom: 8px;
    }

    .mobile-supporting-metrics span {
      color: var(--muted);
      font-size: 11px;
      font-weight: 900;
    }

    .mobile-ratios,
    .mobile-diagnosis,
    .analytics-controls,
    .analytics-breakdown,
    .target-grid,
    .appointment-panel {
      background: rgba(15, 23, 42, 0.52);
      border: 1px solid var(--border);
      border-radius: 16px;
      display: grid;
      gap: 10px;
      padding: 12px;
    }

    .mobile-ratios {
      grid-template-columns: repeat(3, 1fr);
    }

    .mobile-ratios article,
    .analytics-breakdown article {
      display: grid;
      gap: 3px;
    }

    .mobile-ratios strong {
      font-size: 18px;
    }

    .mobile-ratios span,
    .mobile-diagnosis p,
    .analytics-breakdown span,
    .target-grid label {
      color: var(--muted);
      font-size: 11px;
      font-weight: 800;
      margin: 0;
    }

    .mobile-diagnosis.ok { border-color: rgba(57, 223, 159, 0.34); }
    .mobile-diagnosis.watch { border-color: rgba(244, 201, 93, 0.36); }
    .mobile-diagnosis.needs { border-color: rgba(255, 107, 122, 0.36); }

    .analytics-controls,
    .target-grid,
    .appointment-actions {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .analytics-subhead {
      margin-top: 14px;
    }

    .analytics-controls select,
    .analytics-controls input,
    .target-grid input {
      background: rgba(2, 6, 12, 0.54);
      border: 1px solid var(--border);
      border-radius: 10px;
      color: var(--text);
      min-height: 42px;
      padding: 0 10px;
      width: 100%;
    }

    .target-grid label {
      display: grid;
      gap: 5px;
    }

    .appointment-actions {
      display: grid;
      gap: 8px;
    }

    .attention-row,
    .more-menu button {
      align-items: center;
      background: rgba(15, 23, 42, 0.54);
      border: 1px solid var(--border);
      border-radius: 16px;
      color: var(--text);
      display: flex;
      justify-content: space-between;
      min-height: 58px;
      padding: 0 16px;
      width: 100%;
    }

    .attention-row strong {
      color: var(--red);
      font-size: 16px;
    }

    .mobile-funnel-card,
    .more-panel {
      background: rgba(15, 23, 42, 0.46);
      border: 1px solid var(--border);
      border-radius: 18px;
      padding: 15px;
    }

    .funnel-summary,
    .mobile-note {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.45;
      margin: 0;
    }

    .mobile-search {
      background: rgba(248, 250, 252, 0.92);
      border: 0;
      border-radius: 14px;
      color: #111827;
      display: block;
      flex: none;
      font-size: 16px;
      height: 44px;
      line-height: 44px;
      min-height: 0;
      padding: 0 16px;
      width: 100%;
    }

    .mobile-search:focus {
      border-color: rgba(59, 130, 246, 0.6);
      outline: none;
    }

    .mobile-inbox-tools {
      align-items: center;
      display: grid;
      gap: 12px;
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .mobile-filter-text {
      background: transparent;
      border: 0;
      color: #0095f6;
      font-size: 16px;
      font-weight: 800;
      min-height: 40px;
      padding: 0;
    }

    .mobile-filters {
      display: flex;
      border-bottom: 1px solid rgba(148, 163, 184, 0.18);
      gap: 24px;
      overflow-x: auto;
      padding: 2px 0 0;
      scrollbar-width: none;
      white-space: nowrap;
    }

    .mobile-filters::-webkit-scrollbar {
      display: none;
    }

    .mobile-filters button {
      background: transparent;
      border: 0;
      border-radius: 0;
      color: rgba(226, 232, 240, 0.62);
      flex: 0 0 auto;
      font-size: 14px;
      font-weight: 900;
      min-height: 42px;
      padding: 0 0 9px;
      position: relative;
    }

    .mobile-filters button.active {
      background: transparent;
      color: var(--text);
    }

    .mobile-filters button.active::after {
      background: var(--text);
      border-radius: 999px 999px 0 0;
      bottom: 0;
      content: "";
      height: 2px;
      left: 0;
      position: absolute;
      right: 0;
    }

    .mobile-inbox-list,
    .more-menu,
    .mobile-control-list {
      display: grid;
      gap: 0;
    }

    .mobile-thread-row {
      align-items: center;
      background: transparent;
      border: 0;
      border-bottom: 1px solid rgba(148, 163, 184, 0.12);
      color: var(--text);
      display: grid;
      gap: 12px;
      grid-template-columns: 58px minmax(0, 1fr) 34px;
      min-height: 74px;
      padding: 9px 0;
      text-align: left;
      width: 100%;
    }

    .mobile-thread-row .avatar {
      box-shadow: 0 0 0 2px rgba(236, 72, 153, 0.75), 0 0 0 4px rgba(245, 158, 11, 0.65);
      height: 56px;
      width: 56px;
    }

    .mobile-thread-row .avatar::after,
    .companion-head .avatar::after {
      background: #22c55e;
      border: 2px solid #fff;
      border-radius: 50%;
      bottom: 2px;
      content: "";
      height: 11px;
      position: absolute;
      right: 2px;
      width: 11px;
    }

    .thread-name {
      display: block;
      font-size: 15px;
      font-weight: 900;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .thread-preview {
      color: var(--muted);
      display: block;
      font-size: 13px;
      margin-top: 3px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .thread-side {
      display: grid;
      gap: 6px;
      justify-items: end;
    }

    .thread-camera {
      border: 2px solid rgba(226, 232, 240, 0.48);
      border-radius: 8px;
      display: block;
      height: 24px;
      position: relative;
      width: 28px;
    }

    .thread-camera::before {
      background: rgba(226, 232, 240, 0.48);
      border-radius: 999px;
      content: "";
      height: 8px;
      left: 8px;
      position: absolute;
      top: 6px;
      width: 8px;
    }

    .thread-time {
      color: var(--dim);
      font-size: 11px;
    }

    .thread-state {
      border-radius: 999px;
      font-size: 10px;
      font-weight: 900;
      padding: 4px 8px;
      white-space: nowrap;
    }

    .thread-state.active { background: rgba(57, 223, 159, 0.12); color: #c9ffe9; }
    .thread-state.needs { background: rgba(255, 107, 122, 0.14); color: #ffd7dd; }
    .thread-state.link { background: rgba(96, 165, 250, 0.14); color: #d7e8ff; }
    .thread-state.booked { background: rgba(57, 223, 159, 0.16); color: #c9ffe9; }
    .thread-state.paused { background: rgba(244, 201, 93, 0.14); color: #ffe7a3; }

    .more-menu button {
      font-size: 15px;
      font-weight: 850;
    }

    .more-menu span,
    .more-menu strong {
      color: var(--muted);
      font-size: 13px;
    }

    .mobile-control {
      align-items: center;
      background: rgba(15, 23, 42, 0.52);
      border: 1px solid var(--border);
      border-radius: 16px;
      color: var(--text);
      display: grid;
      gap: 3px;
      grid-template-columns: minmax(0, 1fr) auto;
      min-height: 64px;
      padding: 12px 14px;
      text-align: left;
      width: 100%;
    }

    .mobile-control small {
      color: var(--muted);
      display: block;
      font-size: 11px;
      margin-top: 3px;
    }

    .switch-dot {
      background: rgba(148, 163, 184, 0.58);
      border-radius: 999px;
      height: 26px;
      position: relative;
      width: 46px;
    }

    .switch-dot::after {
      background: #fff;
      border-radius: 50%;
      content: "";
      height: 20px;
      left: 3px;
      position: absolute;
      top: 3px;
      transition: transform 160ms ease;
      width: 20px;
    }

    .mobile-control.on .switch-dot {
      background: var(--green);
    }

    .mobile-control.on .switch-dot::after {
      transform: translateX(20px);
    }

    .pulse-brand-title {
      background: var(--ig-gradient);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      font-weight: 950;
      letter-spacing: 0;
      text-shadow: 0 0 30px rgba(255, 63, 143, 0.18);
    }

    .pulse-brand-subtitle {
      color: rgba(255, 255, 255, 0.62);
      font-size: 10px;
      font-weight: 850;
      letter-spacing: 0.32em;
      margin: 6px 0 0;
      text-transform: uppercase;
    }

    .pulse-bot-art {
      border: 2px solid rgba(255, 63, 143, 0.38);
      border-radius: 18px;
      box-shadow: inset 0 -18px 35px rgba(255, 159, 28, 0.1);
      height: 58px;
      opacity: 0.72;
      position: relative;
      width: 68px;
    }

    .pulse-bot-art::before,
    .pulse-bot-art::after {
      background: rgba(255, 63, 143, 0.58);
      border-radius: 50%;
      content: "";
      height: 10px;
      position: absolute;
      top: 24px;
      width: 10px;
    }

    .pulse-bot-art::before { left: 18px; }
    .pulse-bot-art::after { right: 18px; }

    .pulse-bot-antenna {
      background: rgba(255, 63, 143, 0.48);
      border-radius: 999px;
      height: 22px;
      left: 50%;
      position: absolute;
      top: -23px;
      transform: translateX(-50%);
      width: 4px;
    }

    .pulse-bot-antenna::before {
      background: rgba(219, 44, 255, 0.68);
      border-radius: 50%;
      content: "";
      height: 20px;
      left: 50%;
      position: absolute;
      top: -12px;
      transform: translateX(-50%);
      width: 20px;
    }

    .mobile-status-orb {
      background: rgba(57, 223, 159, 0.1);
      border: 1px solid rgba(57, 223, 159, 0.32);
      border-radius: 999px;
      box-shadow: 0 0 22px rgba(57, 223, 159, 0.18);
      display: grid !important;
      flex: 0 0 auto;
      height: 58px;
      place-items: center;
      width: 58px;
    }

    .mobile-status-orb::before {
      background: #35f6a6;
      border-radius: 50%;
      box-shadow: 0 0 18px rgba(57, 223, 159, 0.88), 0 0 42px rgba(57, 223, 159, 0.28);
      content: "";
      display: block;
      height: 20px;
      width: 20px;
    }

    .hero-metric.pulse-card {
      isolation: isolate;
      overflow: hidden;
      position: relative;
    }

    .hero-metric.pulse-card::before {
      background:
        radial-gradient(circle at 92% 18%, rgba(255, 159, 28, 0.42), transparent 24%),
        radial-gradient(circle at 18% 8%, rgba(109, 40, 255, 0.28), transparent 35%),
        linear-gradient(135deg, rgba(109, 40, 255, 0.24), rgba(255, 63, 143, 0.14) 58%, rgba(255, 159, 28, 0.2));
      content: "";
      inset: 0;
      position: absolute;
      z-index: -2;
    }

    .hero-metric.pulse-card::after {
      background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.22), transparent);
      content: "";
      height: 1px;
      left: 14%;
      opacity: 0.5;
      position: absolute;
      right: 14%;
      top: 50%;
      z-index: -1;
    }

    .pulse-ecg {
      bottom: 18px;
      height: 76px;
      left: 0;
      opacity: 0.92;
      overflow: visible;
      position: absolute;
      right: 0;
      width: 100%;
      z-index: -1;
    }

    .pulse-ecg .ecg-line {
      filter: drop-shadow(0 0 10px rgba(255, 63, 143, 0.58));
      stroke-dasharray: 440;
      stroke-dashoffset: 0;
      animation: ecgIdle 8s linear infinite;
    }

    .pulse-ecg .ecg-glow {
      opacity: 0;
      stroke-dasharray: 48 440;
      stroke-dashoffset: 440;
    }

    .pulse-card.message-pulse .ecg-line {
      animation: ecgMessage 1.15s ease-out;
    }

    .pulse-card.message-pulse .ecg-glow {
      animation: ecgGlow 1.15s ease-out;
    }

    .pulse-card.booking-pulse {
      animation: bookingCardPulse 1.35s ease-out;
    }

    .pulse-card.booking-pulse .ecg-line {
      animation: ecgBooking 1.35s ease-out;
    }

    .pulse-card.booking-pulse .ecg-glow {
      animation: ecgGlow 1.35s ease-out;
    }

    .count-pop {
      animation: countPop 460ms ease-out;
    }

    .attention-row.has-attention {
      border-color: rgba(255, 63, 143, 0.56);
      box-shadow: 0 0 30px rgba(255, 63, 143, 0.12);
    }

    .attention-row.has-attention strong {
      color: #ff3f8f;
      text-shadow: 0 0 18px rgba(255, 63, 143, 0.34);
    }

    .sound-toggle {
      align-items: center;
      background: rgba(255, 255, 255, 0.045);
      border: 1px solid rgba(255, 255, 255, 0.11);
      border-radius: 16px;
      color: var(--text);
      display: grid;
      gap: 4px;
      grid-template-columns: minmax(0, 1fr) auto;
      min-height: 62px;
      padding: 12px 14px;
      text-align: left;
      width: 100%;
    }

    .sound-toggle small {
      color: var(--muted);
      display: block;
      font-size: 11px;
      margin-top: 2px;
    }

    .sound-toggle.on .switch-dot {
      background: var(--ig-gradient);
      box-shadow: 0 0 18px rgba(255, 63, 143, 0.24);
    }

    .sound-toggle.on .switch-dot::after {
      transform: translateX(20px);
    }

    @keyframes mobileScreenEnter {
      from {
        opacity: 0;
        transform: translate3d(18px, 0, 0) scale(0.992);
      }
      to {
        opacity: 1;
        transform: translate3d(0, 0, 0) scale(1);
      }
    }

    @keyframes ecgIdle {
      0% { stroke-dashoffset: 0; }
      100% { stroke-dashoffset: -34; }
    }

    @keyframes ecgMessage {
      0% { transform: translateY(0) scaleY(1); }
      28% { transform: translateY(-3px) scaleY(1.22); }
      64% { transform: translateY(2px) scaleY(0.94); }
      100% { transform: translateY(0) scaleY(1); }
    }

    @keyframes ecgBooking {
      0% { transform: translateY(0) scaleY(1); }
      18% { transform: translateY(-5px) scaleY(1.34); }
      38% { transform: translateY(3px) scaleY(0.92); }
      58% { transform: translateY(-4px) scaleY(1.26); }
      100% { transform: translateY(0) scaleY(1); }
    }

    @keyframes ecgGlow {
      0% { opacity: 0; stroke-dashoffset: 440; }
      18% { opacity: 1; }
      78% { opacity: 0.75; }
      100% { opacity: 0; stroke-dashoffset: 0; }
    }

    @keyframes bookingCardPulse {
      0% { box-shadow: var(--pulse-glow); }
      34% { box-shadow: 0 0 34px rgba(255, 159, 28, 0.38), 0 0 70px rgba(255, 63, 143, 0.2); }
      100% { box-shadow: var(--pulse-glow); }
    }

    @keyframes countPop {
      0% { transform: scale(1); }
      45% { transform: scale(1.08); }
      100% { transform: scale(1); }
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition-duration: 0.001ms !important;
      }
    }

    @media (prefers-color-scheme: light) {
      :root {
        color-scheme: dark;
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
        padding: max(22px, env(safe-area-inset-top)) 18px 82px;
      }

      .desktop-shell {
        display: none !important;
      }

      .mobile-shell {
        display: block;
        margin: 0 auto;
        max-width: 460px;
        min-height: 0;
        position: relative;
      }

      .mobile-screen {
        min-height: 0;
        transform-origin: center;
      }

      .mobile-screen.active {
        animation: mobileScreenEnter 240ms cubic-bezier(0.2, 0.72, 0.2, 1);
      }

      #mobile-pulse.active {
        align-content: start;
        display: grid;
        gap: 14px;
      }

      #mobile-inbox-screen.active {
        align-content: start;
        background: rgba(255, 255, 255, 0.965);
        border-radius: 24px;
        color: #050505;
        display: grid;
        gap: 10px;
        grid-template-rows: auto auto auto minmax(0, 1fr);
        margin: -4px -4px 0;
        min-height: calc(100dvh - 126px);
        padding: 12px 16px 18px;
      }

      #mobile-stats-screen.active {
        align-content: start;
        display: grid;
        gap: 12px;
      }

      #mobile-more-screen.active {
        align-content: start;
        display: grid;
        gap: 12px;
      }

      .mobile-header {
        padding: 4px 2px 8px;
      }

      .mobile-header h1 {
        font-size: 36px;
        line-height: 0.95;
      }

      .mobile-header.compact h1 {
        font-size: 28px;
      }

      .bot-health {
        background:
          radial-gradient(circle at 98% 82%, rgba(255, 159, 28, 0.22), transparent 24%),
          radial-gradient(circle at 6% 50%, rgba(57, 223, 159, 0.12), transparent 24%),
          rgba(14, 7, 24, 0.78);
        border-color: rgba(219, 44, 255, 0.42);
        border-radius: 26px;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.035), var(--pulse-glow);
        min-height: 116px;
        overflow: hidden;
        padding: 20px;
        position: relative;
      }

      .bot-health > div:first-child {
        align-items: center;
        display: flex;
        gap: 16px;
        min-width: 0;
      }

      .bot-health strong {
        font-size: 24px;
      }

      .bot-health span {
        font-size: 15px;
      }

      .bot-health strong::before {
        display: none;
      }

      .timeframe.mobile-timeframe {
        background: rgba(255, 255, 255, 0.045);
        border: 1px solid rgba(219, 44, 255, 0.22);
        border-radius: 22px;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.025);
        display: grid;
        gap: 0;
        grid-template-columns: repeat(3, 1fr);
        padding: 8px;
      }

      .timeframe.mobile-timeframe button {
        background: transparent;
        border: 0;
        border-radius: 18px;
        color: rgba(255, 255, 255, 0.62);
        font-size: 15px;
        font-weight: 850;
        min-height: 52px;
      }

      .timeframe.mobile-timeframe button.active {
        background: var(--ig-gradient);
        box-shadow: 0 0 24px rgba(255, 63, 143, 0.32), 0 0 42px rgba(255, 159, 28, 0.16);
        color: #fff;
      }

      .hero-metric {
        border: 1px solid rgba(255, 63, 143, 0.56);
        border-radius: 28px;
        box-shadow: var(--pulse-glow);
        min-height: 224px;
        padding: 28px 22px;
      }

      .hero-metric strong {
        font-size: 86px;
        letter-spacing: 0;
        text-shadow: 0 6px 40px rgba(255, 255, 255, 0.18);
      }

      .hero-metric span {
        color: rgba(255, 255, 255, 0.62);
        font-size: 13px;
        letter-spacing: 0.36em;
      }

      .mobile-supporting-metrics {
        gap: 12px;
      }

      .mobile-supporting-metrics article {
        background: rgba(255, 255, 255, 0.04);
        border-color: rgba(255, 63, 143, 0.28);
        border-radius: 22px;
        box-shadow: 0 16px 34px rgba(0, 0, 0, 0.18);
        min-height: 118px;
        padding: 16px 14px;
      }

      .mobile-supporting-metrics article::before {
        background: var(--ig-gradient);
        border-radius: 50%;
        box-shadow: 0 0 22px rgba(255, 63, 143, 0.26);
        color: #fff;
        display: grid;
        font-size: 18px;
        height: 42px;
        margin-bottom: 12px;
        place-items: center;
        width: 42px;
      }

      .mobile-supporting-metrics article:nth-child(1)::before { content: "T"; }
      .mobile-supporting-metrics article:nth-child(2)::before { content: "P"; }
      .mobile-supporting-metrics article:nth-child(3)::before { content: "S"; }

      .mobile-supporting-metrics strong {
        font-size: 34px;
        margin-bottom: 6px;
      }

      .mobile-supporting-metrics span {
        color: rgba(255, 255, 255, 0.62);
        font-size: 12px;
      }

      .mobile-ratios {
        background: rgba(255, 255, 255, 0.04);
        border-color: rgba(255, 159, 28, 0.28);
        border-radius: 22px;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.025);
        gap: 0;
        padding: 16px 6px;
      }

      .mobile-ratios article {
        border-right: 1px solid rgba(255, 255, 255, 0.14);
        padding: 0 10px;
        text-align: center;
      }

      .mobile-ratios article:last-child {
        border-right: 0;
      }

      .mobile-ratios strong {
        font-size: 28px;
      }

      .mobile-ratios span {
        font-size: 12px;
      }

      .attention-row {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 63, 143, 0.32);
        border-radius: 22px;
        color: #fff;
        min-height: 76px;
      }

      .mobile-funnel-card,
      .mobile-diagnosis,
      .analytics-controls,
      .analytics-breakdown,
      .target-grid,
      .appointment-panel {
        background: rgba(255, 255, 255, 0.04);
        border-color: rgba(255, 255, 255, 0.1);
        border-radius: 20px;
      }

      #mobile-pulse .mobile-funnel-card,
      #mobile-pulse .mobile-diagnosis {
        display: none;
      }

      #mobile-inbox-screen .mobile-header {
        display: grid;
        gap: 2px;
      }

      #mobile-inbox-screen .mobile-header.compact h1 {
        font-size: 28px;
        line-height: 1.05;
        margin: 0;
      }

      #mobile-inbox-screen .mobile-header h1,
      #mobile-inbox-screen .thread-name {
        color: #050505;
      }

      #mobile-inbox-screen .mobile-header p,
      #mobile-inbox-screen .thread-preview,
      #mobile-inbox-screen .thread-time {
        color: #8e8e93;
      }

      #mobile-inbox-screen .mobile-header p {
        font-size: 12px;
        margin: 0;
      }

      #mobile-inbox-screen .mobile-search {
        background: #f1f2f5;
        box-shadow: none;
        color: #050505;
        height: 42px;
        margin: 4px 0 0;
      }

      #mobile-inbox-screen .mobile-inbox-list {
        align-content: start;
        min-height: 0;
        overflow: auto;
      }

      #mobile-inbox-screen .empty {
        background: transparent;
        border: 0;
        color: #8e8e93;
        font-size: 13px;
        margin-top: 18px;
        padding: 14px 8px;
      }

      #mobile-inbox-screen .mobile-filters {
        border-bottom-color: #eef0f3;
      }

      #mobile-inbox-screen .mobile-filters button {
        color: #8e8e93;
      }

      #mobile-inbox-screen .mobile-filters button.active {
        color: #050505;
      }

      #mobile-inbox-screen .mobile-filters button.active::after {
        background: #050505;
      }

      #mobile-inbox-screen .mobile-thread-row {
        border-bottom-color: #eef0f3;
      }

      #mobile-inbox-screen .thread-camera {
        border-color: #9ca3af;
      }

      #mobile-inbox-screen .thread-camera::before {
        background: #9ca3af;
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
        background: rgba(7, 7, 15, 0.86);
        backdrop-filter: blur(24px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 26px;
        bottom: 0;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        left: 8px;
        padding: 8px;
        position: fixed;
        right: 8px;
        bottom: max(8px, env(safe-area-inset-bottom));
        z-index: 20;
      }

      .bottom-nav a {
        border: 0;
        border-radius: 20px;
        display: grid;
        font-size: 12px;
        gap: 2px;
        justify-items: center;
        min-height: 54px;
        padding: 8px 4px;
      }

      .bottom-nav a.active {
        background: var(--ig-gradient);
        box-shadow: 0 0 24px rgba(255, 63, 143, 0.3), 0 0 38px rgba(255, 159, 28, 0.13);
        color: #fff;
      }

      .companion-backdrop {
        background: #fff;
        backdrop-filter: none;
        padding: 0;
        z-index: 80;
      }

      .companion {
        background: #fff;
        color: #050505;
        border: 0;
        border-radius: 0;
        height: 100dvh;
        max-width: none;
        width: 100%;
      }

      .companion-head {
        background: #fff;
        border-bottom: 1px solid #eef0f3;
        color: #050505;
        grid-template-columns: 42px 48px minmax(0, 1fr);
        min-height: 86px;
        padding: max(12px, env(safe-area-inset-top)) 18px 12px;
      }

      .companion-head .avatar {
        height: 48px;
        width: 48px;
      }

      .companion-close {
        background: transparent;
        border: 0;
        color: #050505;
        font-size: 42px;
        height: 48px;
        line-height: 1;
        order: -1;
        width: 32px;
      }

      .companion-title {
        color: #050505;
        font-size: 20px;
      }

      .companion-subtitle {
        color: #8e8e93;
        font-size: 15px;
      }

      .companion-thread {
        align-content: start;
        background: #fff;
        gap: 4px;
        padding: 28px 26px 16px;
      }

      .bubble {
        border-color: #d7d7dc;
        border-radius: 22px;
        color: #050505;
        font-size: 20px;
        line-height: 1.18;
        max-width: 82%;
        padding: 13px 18px;
      }

      .bubble.user {
        background: #fff;
        justify-self: start;
      }

      .bubble.assistant {
        background: #efeff2;
        border-color: #efeff2;
        justify-self: end;
      }

      .bubble small {
        color: #8e8e93;
        font-size: 13px;
        font-weight: 500;
        letter-spacing: 0;
        text-transform: none;
      }

      .companion-composer {
        align-items: center;
        background: #fff;
        border-top: 1px solid #eef0f3;
        display: grid;
        gap: 8px;
        grid-template-columns: auto minmax(0, 1fr) auto;
        padding: 10px 16px max(10px, env(safe-area-inset-bottom));
      }

      .companion-composer textarea {
        background: #fff;
        border: 1px solid #d7d7dc;
        border-radius: 999px;
        color: #050505;
        font-size: 18px;
        grid-column: 2;
        min-height: 46px;
        padding: 11px 18px;
        resize: none;
      }

      .companion-actions {
        display: contents;
      }

      .companion-actions .action {
        border-radius: 999px;
        min-height: 42px;
        padding: 0 12px;
      }

      #dm-companion-booking {
        background: #f3f4f6;
        border-color: #e5e7eb;
        color: #374151;
        font-size: 12px;
        grid-column: 1;
        grid-row: 1;
        min-width: 84px;
      }

      #dm-companion-send {
        background: transparent;
        border: 0;
        color: #0095f6;
        font-size: 17px;
        grid-column: 3;
        grid-row: 1;
        min-width: 54px;
        padding: 0;
      }
    }

    @media (max-width: 560px) {
      .main {
        padding-left: 10px;
        padding-right: 10px;
      }

      .timeframe {
        display: flex;
        flex-wrap: nowrap;
        overflow-x: auto;
      }

      .timeframe button {
        flex: 1 0 auto;
        min-height: 44px;
        padding: 0 8px;
      }

      .kpi {
        min-height: 78px;
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

      .control-row {
        grid-template-columns: 1fr;
      }

      .companion-actions {
        display: grid;
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 430px) {
      .main {
        padding-top: max(14px, env(safe-area-inset-top));
      }

      #mobile-pulse.active {
        gap: 8px;
      }

      .mobile-header h1 {
        font-size: 32px;
      }

      .pulse-brand-subtitle {
        font-size: 9px;
        letter-spacing: 0.24em;
      }

      .bot-health {
        min-height: 86px;
        padding: 14px;
      }

      .bot-health strong {
        font-size: 21px;
      }

      .bot-health span {
        font-size: 13px;
      }

      .mobile-status-orb {
        height: 50px;
        width: 50px;
      }

      .pulse-bot-art {
        height: 48px;
        width: 56px;
      }

      .timeframe.mobile-timeframe {
        padding: 6px;
      }

      .timeframe.mobile-timeframe button {
        min-height: 46px;
      }

      .hero-metric {
        min-height: 138px;
        padding: 16px;
      }

      .hero-metric strong {
        font-size: 62px;
      }

      .mobile-supporting-metrics {
        gap: 8px;
      }

      .mobile-supporting-metrics article {
        min-height: 86px;
        padding: 11px;
      }

      .mobile-supporting-metrics article::before {
        height: 34px;
        margin-bottom: 8px;
        width: 34px;
      }

      .mobile-ratios {
        padding: 12px 4px;
      }

      .mobile-ratios strong {
        font-size: 22px;
      }

      .attention-row {
        min-height: 58px;
      }
    }

    @media (max-width: 360px) {
      .main {
        padding-left: 8px;
        padding-right: 8px;
      }

      .mobile-supporting-metrics strong {
        font-size: 24px;
      }

      .thread-state {
        font-size: 9px;
        padding: 4px 6px;
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
        <a href="#activity">DM Inbox</a>
        <a href="#settings">Prompt Settings</a>
        <a href="#analytics">Analytics</a>
      </nav>
    </aside>

    <main class="main">
      <section class="topbar desktop-shell" id="dashboard">
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

      <section class="mobile-shell">
        <section class="mobile-screen active" data-screen="pulse" id="mobile-pulse">
          <div class="mobile-header">
            <h1 class="pulse-brand-title">Pulse</h1>
            <p class="pulse-brand-subtitle">by KRAZYJAYDOTCOM</p>
          </div>

          <section class="bot-health ok" id="mobile-bot-health">
            <div>
              <span class="mobile-status-orb" aria-hidden="true"></span>
              <span>
                <strong id="mobile-health-label">Bot Working</strong>
                <span id="mobile-health-detail">Checking latest activity...</span>
              </span>
            </div>
            <button class="ghost-link" id="mobile-view-issue" type="button" hidden>View Issue</button>
            <span class="pulse-bot-art" aria-hidden="true"><span class="pulse-bot-antenna"></span></span>
          </section>

          <section class="timeframe mobile-timeframe" aria-label="Mobile timeframe selector">
            <button type="button" data-range="24h">Today</button>
            <button type="button" data-range="7d" class="active">7 Days</button>
            <button type="button" data-range="30d">30 Days</button>
          </section>

          <section class="hero-metric pulse-card" id="mobile-calls-card">
            <svg class="pulse-ecg" viewBox="0 0 420 120" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="pulseGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#5b2cff"></stop>
                  <stop offset="38%" stop-color="#db2cff"></stop>
                  <stop offset="68%" stop-color="#ff3f8f"></stop>
                  <stop offset="100%" stop-color="#ff9f1c"></stop>
                </linearGradient>
              </defs>
              <path class="ecg-line" d="M0 72 C62 72 70 70 100 70 C132 70 140 78 164 74 C188 70 198 60 220 60 C244 60 252 70 274 68 C302 66 318 48 338 24 C358 2 374 16 392 0 C402 -8 414 -10 420 -12" fill="none" stroke="url(#pulseGradient)" stroke-width="3.5" stroke-linecap="round"></path>
              <path class="ecg-glow" d="M0 72 C62 72 70 70 100 70 C132 70 140 78 164 74 C188 70 198 60 220 60 C244 60 252 70 274 68 C302 66 318 48 338 24 C358 2 374 16 392 0 C402 -8 414 -10 420 -12" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"></path>
            </svg>
            <strong id="mobile-calls-booked">0</strong>
            <span>Calls Booked</span>
          </section>

          <section class="mobile-supporting-metrics" aria-label="Supporting metrics">
            <article><strong id="mobile-leads">0</strong><span>Touch Points</span></article>
            <article><strong id="mobile-links-sent">0</strong><span>Calls Pitched</span></article>
            <article><strong id="mobile-link-clicks">0</strong><span>Showed</span></article>
          </section>

          <section class="mobile-ratios" aria-label="Setter conversion rates">
            <article><strong id="mobile-touch-pitch">0%</strong><span>Touch -> Pitch</span></article>
            <article><strong id="mobile-pitch-book">0%</strong><span>Pitch -> Book</span></article>
            <article><strong id="mobile-show-rate">0%</strong><span>Show Rate</span></article>
          </section>

          <button class="attention-row" id="mobile-needs-attention" type="button">
            <span>Needs Attention</span>
            <strong><span id="mobile-attention-count">0</span> ></strong>
          </button>

          <section class="mobile-funnel-card">
            <div class="panel-head">
              <h2>Conversion Funnel</h2>
              <button class="ghost-link" id="mobile-funnel-toggle" type="button">View Funnel</button>
            </div>
            <p id="mobile-funnel-summary" class="funnel-summary">0 Touch -> 0 Pitch -> 0 Book -> 0 Show</p>
            <div class="funnel compact" id="mobile-funnel-detail" hidden></div>
          </section>
          <section class="mobile-diagnosis ok" id="mobile-kpi-diagnosis">
            <strong id="mobile-diagnosis-title">Setter flow is healthy</strong>
            <p id="mobile-diagnosis-message">Waiting for enough DM activity to diagnose.</p>
          </section>
        </section>

        <section class="mobile-screen" data-screen="stats" id="mobile-stats-screen">
          <div class="mobile-header compact">
            <h1>Stats</h1>
            <p>Performance trends by timeframe.</p>
          </div>
          <div class="analytics-controls">
            <select id="analytics-range" aria-label="Analytics date range">
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="7d" selected>Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="this_week">This Week</option>
              <option value="last_week">Last Week</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="this_quarter">This Quarter</option>
              <option value="last_quarter">Last Quarter</option>
              <option value="ytd">YTD</option>
              <option value="this_year">This Year</option>
              <option value="last_year">Last Year</option>
              <option value="all">All Time</option>
              <option value="custom">Custom Date Range</option>
            </select>
            <select id="analytics-group" aria-label="Analytics grouping">
              <option value="day">Group by Day</option>
              <option value="week">Group by Week</option>
              <option value="month">Group by Month</option>
              <option value="year">Group by Year</option>
            </select>
            <input id="analytics-start" type="date" aria-label="Custom start date">
            <input id="analytics-end" type="date" aria-label="Custom end date">
          </div>
          <div class="analytics-breakdown" id="analytics-breakdown"></div>
        </section>

        <section class="mobile-screen" data-screen="inbox" id="mobile-inbox-screen">
          <div class="mobile-header compact">
            <h1>Inbox</h1>
            <p id="mobile-inbox-count">0 conversations</p>
          </div>
          <div class="mobile-inbox-tools">
            <input class="mobile-search" id="mobile-inbox-search" type="search" placeholder="Search" aria-label="Search conversations">
            <button class="mobile-filter-text" type="button" data-inbox-filter-jump>Filter</button>
          </div>
          <div class="mobile-filters" aria-label="Inbox filters">
            <button type="button" data-inbox-filter="initial" class="active">Initial Contact</button>
            <button type="button" data-inbox-filter="pitched">Pitched</button>
            <button type="button" data-inbox-filter="youtube">YouTube</button>
            <button type="button" data-inbox-filter="booked">Booked</button>
            <button type="button" data-inbox-filter="showed">Showed</button>
            <button type="button" data-inbox-filter="needs">Needs Me</button>
          </div>
          <div class="mobile-inbox-list" id="mobile-inbox-list"></div>
        </section>

        <section class="mobile-screen" data-screen="more" id="mobile-more-screen">
          <div class="mobile-header compact">
            <h1>More</h1>
            <p>Controls, drafts, analytics, and testing.</p>
          </div>
          <div class="more-menu">
            <button type="button" data-more-panel="controls">AI Controls <span>></span></button>
            <button type="button" data-more-panel="instructions">AI Instructions <span>></span></button>
            <button type="button" data-more-panel="learning">Learning Review <span>></span></button>
            <button type="button" data-more-panel="drafts">Pending Drafts <strong id="mobile-drafts-count">0</strong></button>
            <button type="button" data-more-panel="targets">KPI Targets <span>></span></button>
            <button type="button" data-more-panel="tester">AI Tester <span>></span></button>
            <button type="button" data-more-panel="system">System <span>></span></button>
          </div>

          <section class="more-panel" id="more-controls" hidden>
            <div class="panel-head"><h2>AI Controls</h2><button class="ghost-link" data-more-close type="button">Close</button></div>
            <button class="sound-toggle" id="booking-sound-toggle" type="button" aria-pressed="true">
              <span><strong>Booking Sounds</strong><small>Soft ping when a new call is booked.</small></span>
              <span class="switch-dot" aria-hidden="true"></span>
            </button>
            <div class="mobile-control-list" id="mobile-features"></div>
          </section>

          <section class="more-panel" id="more-instructions" hidden>
            <div class="panel-head"><h2>AI Instructions</h2><button class="ghost-link" data-more-close type="button">Close</button></div>
            <p class="mobile-note">The current playbook is optimized for short, booking-first Instagram conversations. Edit deeper business knowledge from the desktop prompt tools for now.</p>
          </section>

          <section class="more-panel" id="more-learning" hidden>
            <div class="panel-head"><h2>Learning Review</h2><button class="ghost-link" data-more-close type="button">Close</button></div>
            <p class="mobile-note">Every 7 days, Pulse reviews recent DMs and feeds the newest guidance into future AI replies.</p>
            <div class="events" id="mobile-learning-review"></div>
            <div class="actions" style="margin-top:10px;">
              <button id="mobile-learning-run" class="action primary" type="button">Run Review Now</button>
            </div>
          </section>

          <section class="more-panel" id="more-drafts" hidden>
            <div class="panel-head"><h2>Pending Drafts</h2><button class="ghost-link" data-more-close type="button">Close</button></div>
            <div id="mobile-drafts" class="drafts"></div>
          </section>

          <section class="more-panel" id="more-targets" hidden>
            <div class="panel-head"><h2>KPI Targets</h2><button class="ghost-link" data-more-close type="button">Close</button></div>
            <form class="target-grid" id="kpi-target-form">
              <label>Daily Touch Target<input name="daily_touch_points_target" type="number" min="0" step="1"></label>
              <label>Touch -> Pitch %<input name="touch_pitch_min_rate" type="number" min="0" step="1"></label>
              <label>Pitch -> Book %<input name="pitch_book_min_rate" type="number" min="0" step="1"></label>
              <label>Book -> Show %<input name="book_show_min_rate" type="number" min="0" step="1"></label>
              <label>Weekly Calls Goal<input name="weekly_calls_booked_goal" type="number" min="0" step="1"></label>
              <button class="action primary" type="submit">Save Targets</button>
            </form>
          </section>

          <section class="more-panel" id="more-tester" hidden>
            <div class="panel-head"><h2>AI Tester</h2><button class="ghost-link" data-more-close type="button">Close</button></div>
            <div class="test-grid">
              <textarea id="mobile-test-transcript" aria-label="Mobile test transcript" placeholder="Prospect: I want to learn pallets&#10;You: Is this something you want to pursue?"></textarea>
              <textarea id="mobile-test-new-message" aria-label="Mobile newest test message" placeholder="Newest prospect message"></textarea>
            </div>
            <div class="actions" style="margin-top:10px;">
              <button id="mobile-test-button" class="action primary" type="button">Preview Reply</button>
            </div>
            <div id="mobile-test-result" class="result"></div>
          </section>

          <section class="more-panel" id="more-system" hidden>
            <div class="panel-head"><h2>System</h2><button class="ghost-link" data-more-close type="button">Close</button></div>
            <div class="events" id="mobile-automation-events"></div>
          </section>
        </section>
      </section>

      <section class="timeframe desktop-shell" aria-label="Timeframe selector">
        <button type="button" data-range="24h" class="active">24 Hours</button>
        <button type="button" data-range="7d">7 Days</button>
        <button type="button" data-range="30d">30 Days</button>
        <button type="button" data-range="90d">90 Days</button>
        <button type="button" data-range="ytd">YTD</button>
        <button type="button" data-range="all">All Time</button>
      </section>

      <section class="grid kpis desktop-shell" id="kpis" aria-label="KPI summary"></section>

      <section class="grid content-grid desktop-shell">
        <section class="card panel" id="analytics">
          <div class="panel-head">
            <h2>Conversion Funnel</h2>
            <span class="panel-note" id="range-label">24 Hours</span>
          </div>
          <div class="funnel" id="funnel"></div>
          <div class="panel-head analytics-subhead">
            <h2>Performance Breakdown</h2>
            <span class="panel-note">Grouped by selected range</span>
          </div>
          <div class="analytics-breakdown" id="desktop-analytics-breakdown"></div>
        </section>

        <section class="card panel" id="settings">
          <div class="panel-head">
            <h2>Operations (Live Controls)</h2>
            <span class="panel-note">Live controls</span>
          </div>
          <div class="controls">
            <div class="control-row" id="features"></div>
            <div class="control-row" id="flags"></div>
            <div class="events" id="learning-review"></div>
            <div class="actions" style="margin:10px 0 12px;">
              <button id="learning-run" class="action primary" type="button">Run 7-Day Learning Review</button>
            </div>
            <div class="events" id="automation-events"></div>
          </div>
        </section>
      </section>

      <section class="grid content-grid desktop-shell" style="margin-top:14px;">
        <section class="card panel" id="activity">
          <div class="panel-head">
            <h2>DM Inbox</h2>
            <span class="panel-note" id="activity-count">Open a thread to reply</span>
          </div>
          <div class="activity" id="conversations"></div>
        </section>

        <section class="card panel">
          <div class="panel-head">
            <h2>Test Reply Sandbox</h2>
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

      <section class="card panel desktop-shell" style="margin-top:14px;">
        <div class="panel-head">
          <h2>Setter Review</h2>
          <span class="panel-note">Hot leads, ghosting, reply reasons</span>
        </div>
        <div class="review-grid" id="setter-review"></div>
      </section>

      <section class="card panel desktop-shell" style="margin-top:14px;">
        <div class="panel-head">
          <h2>Pending Drafts</h2>
          <span class="panel-note">Approval queue</span>
        </div>
        <div id="drafts" class="drafts"></div>
      </section>
    </main>
  </div>

  <nav class="bottom-nav" aria-label="Mobile navigation">
    <a class="active" href="#pulse" data-mobile-tab="pulse">Pulse</a>
    <a href="#inbox" data-mobile-tab="inbox">Inbox</a>
    <a href="#stats" data-mobile-tab="stats">Stats</a>
    <a href="#more" data-mobile-tab="more">More</a>
  </nav>

  <div class="companion-backdrop" id="dm-companion" hidden>
    <section class="companion" role="dialog" aria-modal="true" aria-labelledby="dm-companion-title">
      <header class="companion-head">
        <div class="avatar" id="dm-companion-avatar">IG</div>
        <div>
          <div class="companion-title" id="dm-companion-title">DM Companion</div>
          <div class="companion-subtitle" id="dm-companion-subtitle">Recent Instagram context</div>
        </div>
        <button class="companion-close" id="dm-companion-close" type="button" aria-label="Back to inbox">&lt;</button>
      </header>
      <div class="companion-thread" id="dm-companion-thread"></div>
      <form class="companion-composer" id="dm-companion-form">
        <textarea id="dm-companion-text" aria-label="Manual Instagram reply" maxlength="1200" placeholder="Type a message..."></textarea>
        <div class="companion-actions">
          <button class="action" id="dm-companion-booking" type="button">Turn Bot Off</button>
          <button class="action primary" id="dm-companion-send" type="submit">Send DM</button>
        </div>
      </form>
    </section>
  </div>

  <script>
    const state = {
      timeframe: "7d",
      conversations: [],
      activeConversationKey: "",
      mobileScreen: "pulse",
      inboxFilter: "initial",
      inboxSearch: "",
      latestStats: null,
      latestDrafts: [],
      latestEvents: [],
      latestLearning: null,
      latestAnalytics: null,
      hasLoadedOnce: false,
      lastIncomingSignature: "",
      lastBookedCount: null,
      bookingSoundEnabled: localStorage.getItem("pulseBookingSound") !== "off",
      audioUnlocked: false
    };
    const conversationsEl = document.getElementById("conversations");
    const draftsEl = document.getElementById("drafts");
    const setterReviewEl = document.getElementById("setter-review");
    const featuresEl = document.getElementById("features");
    const flagsEl = document.getElementById("flags");
    const automationEventsEl = document.getElementById("automation-events");
    const learningReviewEl = document.getElementById("learning-review");
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
    const companionEl = document.getElementById("dm-companion");
    const companionAvatarEl = document.getElementById("dm-companion-avatar");
    const companionTitleEl = document.getElementById("dm-companion-title");
    const companionSubtitleEl = document.getElementById("dm-companion-subtitle");
    const companionThreadEl = document.getElementById("dm-companion-thread");
    const companionFormEl = document.getElementById("dm-companion-form");
    const companionTextEl = document.getElementById("dm-companion-text");
    const companionCloseEl = document.getElementById("dm-companion-close");
    const companionBookingEl = document.getElementById("dm-companion-booking");
    const companionSendEl = document.getElementById("dm-companion-send");
    const companionAppointmentPanelEl = document.getElementById("dm-appointment-panel");
    const companionAppointmentStatusEl = document.getElementById("dm-appointment-status");
    const mobileCallsBookedEl = document.getElementById("mobile-calls-booked");
    const mobileCallsCardEl = document.getElementById("mobile-calls-card");
    const mobileLeadsEl = document.getElementById("mobile-leads");
    const mobileLinksSentEl = document.getElementById("mobile-links-sent");
    const mobileLinkClicksEl = document.getElementById("mobile-link-clicks");
    const mobileTouchPitchEl = document.getElementById("mobile-touch-pitch");
    const mobilePitchBookEl = document.getElementById("mobile-pitch-book");
    const mobileShowRateEl = document.getElementById("mobile-show-rate");
    const mobileDiagnosisEl = document.getElementById("mobile-kpi-diagnosis");
    const mobileDiagnosisTitleEl = document.getElementById("mobile-diagnosis-title");
    const mobileDiagnosisMessageEl = document.getElementById("mobile-diagnosis-message");
    const mobileAttentionCountEl = document.getElementById("mobile-attention-count");
    const mobileNeedsAttentionEl = document.getElementById("mobile-needs-attention");
    const mobileHealthEl = document.getElementById("mobile-bot-health");
    const mobileHealthLabelEl = document.getElementById("mobile-health-label");
    const mobileHealthDetailEl = document.getElementById("mobile-health-detail");
    const mobileViewIssueEl = document.getElementById("mobile-view-issue");
    const mobileFunnelSummaryEl = document.getElementById("mobile-funnel-summary");
    const mobileFunnelDetailEl = document.getElementById("mobile-funnel-detail");
    const mobileFunnelToggleEl = document.getElementById("mobile-funnel-toggle");
    const mobileInboxListEl = document.getElementById("mobile-inbox-list");
    const mobileInboxCountEl = document.getElementById("mobile-inbox-count");
    const mobileInboxSearchEl = document.getElementById("mobile-inbox-search");
    const mobileFeaturesEl = document.getElementById("mobile-features");
    const mobileDraftsEl = document.getElementById("mobile-drafts");
    const mobileDraftsCountEl = document.getElementById("mobile-drafts-count");
    const analyticsRangeEl = document.getElementById("analytics-range");
    const analyticsGroupEl = document.getElementById("analytics-group");
    const analyticsStartEl = document.getElementById("analytics-start");
    const analyticsEndEl = document.getElementById("analytics-end");
    const analyticsBreakdownEl = document.getElementById("analytics-breakdown");
    const desktopAnalyticsBreakdownEl = document.getElementById("desktop-analytics-breakdown");
    const kpiTargetFormEl = document.getElementById("kpi-target-form");
    const mobileAutomationEventsEl = document.getElementById("mobile-automation-events");
    const mobileLearningReviewEl = document.getElementById("mobile-learning-review");
    const learningRunButton = document.getElementById("learning-run");
    const mobileLearningRunButton = document.getElementById("mobile-learning-run");
    const mobileTestButton = document.getElementById("mobile-test-button");
    const mobileTestTranscript = document.getElementById("mobile-test-transcript");
    const mobileTestNewMessage = document.getElementById("mobile-test-new-message");
    const mobileTestResult = document.getElementById("mobile-test-result");
    const bookingSoundToggleEl = document.getElementById("booking-sound-toggle");

    function setStatus(message) {
      statusEl.textContent = message || "";
    }

    function restartClassAnimation(element, className) {
      if (!element) return;
      element.classList.remove(className);
      void element.offsetWidth;
      element.classList.add(className);
      window.setTimeout(() => element.classList.remove(className), className === "booking-pulse" ? 1500 : 1250);
    }

    function triggerMessagePulse() {
      restartClassAnimation(mobileCallsCardEl, "message-pulse");
    }

    function triggerBookingPulse(previousValue, nextValue) {
      restartClassAnimation(mobileCallsCardEl, "booking-pulse");
      restartClassAnimation(mobileCallsBookedEl, "count-pop");
      animateCount(mobileCallsBookedEl, previousValue, nextValue);
      playBookingSound();
    }

    function animateCount(element, fromValue, toValue) {
      if (!element) return;
      const from = Number(fromValue || 0);
      const to = Number(toValue || 0);
      if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) {
        element.textContent = to;
        return;
      }
      const start = performance.now();
      const duration = 420;
      function tick(now) {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        element.textContent = Math.round(from + (to - from) * eased);
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    function unlockBookingAudio() {
      state.audioUnlocked = true;
    }

    function playBookingSound() {
      if (!state.bookingSoundEnabled || !state.audioUnlocked) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const context = new AudioContext();
        const now = context.currentTime;
        const gain = context.createGain();
        const first = context.createOscillator();
        const second = context.createOscillator();
        first.type = "sine";
        second.type = "triangle";
        first.frequency.setValueAtTime(740, now);
        first.frequency.exponentialRampToValueAtTime(980, now + 0.18);
        second.frequency.setValueAtTime(1240, now + 0.04);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.075, now + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
        first.connect(gain);
        second.connect(gain);
        gain.connect(context.destination);
        first.start(now);
        second.start(now + 0.04);
        first.stop(now + 0.52);
        second.stop(now + 0.46);
        window.setTimeout(() => context.close().catch(() => {}), 650);
      } catch (error) {
        // Browsers may block audio until interaction; the visual booking pulse still runs.
      }
    }

    function renderBookingSoundToggle() {
      if (!bookingSoundToggleEl) return;
      bookingSoundToggleEl.classList.toggle("on", state.bookingSoundEnabled);
      bookingSoundToggleEl.setAttribute("aria-pressed", state.bookingSoundEnabled ? "true" : "false");
    }

    function latestIncomingSignature(conversations) {
      const incoming = [];
      (conversations || []).forEach((conversation) => {
        (conversation.recent_messages || []).forEach((message) => {
          if (message && message.role === "user") {
            incoming.push([
              Date.parse(String(message.at || "")) || 0,
              conversation.key || "",
              message.id || "",
              message.text || ""
            ].join(":"));
          }
        });
      });
      incoming.sort();
      return incoming.length + "|" + (incoming[incoming.length - 1] || "");
    }

    window.triggerMessagePulse = triggerMessagePulse;
    window.triggerBookingPulse = triggerBookingPulse;
    window.playBookingSound = playBookingSound;

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
      const source = displayLeadName(conversation) || "IG";
      return String(source).replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "IG";
    }

    function looksLikeInternalId(value) {
      const text = String(value || "").trim();
      if (!text) return true;
      return Boolean(
        text.includes(":") ||
          /^zernio/i.test(text) ||
          /^\d{8,}$/.test(text) ||
          /^[a-f0-9]{16,}$/i.test(text) ||
          /^[a-z0-9_-]{20,}$/i.test(text)
      );
    }

    function displayLeadName(conversation) {
      if (!conversation) return "Instagram lead";
      if (conversation.display_name && !looksLikeInternalId(conversation.display_name)) {
        return conversation.display_name;
      }
      if (conversation.username) {
        return "@" + String(conversation.username).replace(/^@/, "");
      }
      const candidate = conversation.contact_id || conversation.talk_id || conversation.key || "";
      if (candidate && !looksLikeInternalId(candidate)) {
        return String(candidate);
      }
      return "Instagram lead";
    }

    function displayLeadSubtitle(conversation) {
      if (!conversation) return "Profile name unavailable";
      if (conversation.username) {
        return conversation.origin || "instagram";
      }
      const candidate = conversation.contact_id || conversation.talk_id || conversation.key || "";
      if (candidate && looksLikeInternalId(candidate)) {
        return "Profile name unavailable";
      }
      return conversation.origin || "instagram";
    }

    function relativeTime(value) {
      if (!value) return "";
      const time = new Date(value).getTime();
      if (!Number.isFinite(time)) return "";
      const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
      if (seconds < 60) return seconds + "s";
      const minutes = Math.round(seconds / 60);
      if (minutes < 60) return minutes + "m";
      const hours = Math.round(minutes / 60);
      if (hours < 24) return hours + "h";
      return Math.round(hours / 24) + "d";
    }

    function conversationTime(conversation) {
      return conversation.last_incoming_at || conversation.last_outgoing_at || conversation.booking_confirmed_at || "";
    }

    function needsHumanAttention(conversation) {
      if (conversation.needs_human_review) {
        return true;
      }

      const lastMessage = conversation.last_message || {};
      const lastUserMs = Date.parse(conversation.last_incoming_at || "");
      const lastOutMs = Date.parse(conversation.last_outgoing_at || "");
      const newestUserNeedsReply =
        lastMessage.role === "user" &&
        (!Number.isFinite(lastOutMs) || (Number.isFinite(lastUserMs) && lastUserMs > lastOutMs));
      const asksForOwner = /\b(real person|human|owner|you personally|can i talk to you|call me|speak to you)\b/i.test(
        lastMessage.text || ""
      );
      const badScore =
        conversation.reply_scorecard &&
        conversation.reply_scorecard.rating &&
        conversation.reply_scorecard.rating !== "good";

      return Boolean(
        conversation.ai_paused ||
          conversation.manual_takeover_active ||
          badScore ||
          asksForOwner ||
          (conversation.lead_status === "hot" && !conversation.booking_link_sent && !conversation.booking_confirmed) ||
          newestUserNeedsReply
      );
    }

    function primaryConversationState(conversation) {
      if (conversation.appointment_status === "showed") return { label: "Showed", tone: "booked" };
      if (conversation.appointment_status === "no_show") return { label: "No Show", tone: "needs" };
      if (conversation.appointment_status === "rescheduled") return { label: "Rescheduled", tone: "paused" };
      if (conversation.booking_confirmed) return { label: "Booked", tone: "booked" };
      if (conversation.ai_paused || conversation.manual_takeover_active) return { label: "Paused", tone: "paused" };
      if (needsHumanAttention(conversation)) return { label: "Needs You", tone: "needs" };
      if (conversation.call_pitched) return { label: "Pitched", tone: "link" };
      if (conversation.booking_link_sent) return { label: "Link Sent", tone: "link" };
      return { label: "AI Active", tone: "active" };
    }

    function conversationStage(conversation) {
      if (needsHumanAttention(conversation)) return "needs";
      if (conversation.appointment_status === "showed") return "showed";
      if (conversation.booking_confirmed) return "booked";
      if (conversation.youtube_link_sent || conversation.training_link_sent || conversation.lead_status === "content_only") return "youtube";
      if (conversation.call_pitched || conversation.booking_link_sent || conversation.booking_link_clicked) return "pitched";
      return "initial";
    }

    function stageLabel(stage) {
      return {
        initial: "Initial Contact",
        pitched: "Pitched",
        youtube: "YouTube",
        booked: "Booked",
        showed: "Showed",
        needs: "Needs Me"
      }[stage] || "Initial Contact";
    }

    function stageMatches(conversation, filter) {
      const stage = conversationStage(conversation);
      if (filter === "all") return true;
      if (filter === "not_booked") return stage === "pitched" && !conversation.booking_confirmed;
      if (filter === "follow_up_due") return Boolean(conversation.follow_up && conversation.follow_up.next_due_at);
      if (filter === "no_show") return conversation.appointment_status === "no_show";
      return stage === filter;
    }

    function refreshInboxStageCounts(conversations) {
      const counts = {};
      (conversations || []).forEach((conversation) => {
        const stage = conversationStage(conversation);
        counts[stage] = Number(counts[stage] || 0) + 1;
      });
      document.querySelectorAll("[data-inbox-filter]").forEach((button) => {
        const stage = button.dataset.inboxFilter;
        const base = button.dataset.label || button.textContent.replace(/\s+\d+$/, "");
        button.dataset.label = base;
        const count = Number(counts[stage] || 0);
        button.textContent = count ? base + " " + count : base;
      });
    }

    function attentionConversations() {
      return state.conversations.filter(needsHumanAttention);
    }

    function setMobileScreen(screen) {
      state.mobileScreen = screen;
      document.querySelectorAll(".mobile-screen").forEach((section) => {
        section.classList.toggle("active", section.dataset.screen === screen);
      });
      document.querySelectorAll("[data-mobile-tab]").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.mobileTab === screen);
      });
    }

    function openMorePanel(name) {
      document.querySelectorAll(".more-panel").forEach((panel) => {
        panel.hidden = panel.id !== "more-" + name;
      });
    }

    async function api(path, options) {
      const response = await fetch(path, options);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Request failed");
      return data;
    }

    function renderKpis(data) {
      const kpis = data.setter_kpis || {};
      const cards = [
        ["Touch Points", kpis.touch_points || 0, timeframeLabel(state.timeframe)],
        ["Calls Pitched", kpis.calls_pitched || 0, percent(kpis.touch_to_pitch_rate || 0) + " touch -> pitch"],
        ["Calls Booked", kpis.calls_booked || 0, percent(kpis.pitch_to_book_rate || 0) + " pitch -> book"],
        ["Calls Showed", kpis.calls_showed || 0, percent(kpis.book_to_show_rate || 0) + " show rate"],
        ["Needs You", attentionConversations().length, "manual review"],
        ["Touch -> Book", percent(kpis.touch_to_book_rate || 0), "overall conversion"]
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

    function metricCards(data) {
      const kpis = data.setter_kpis || {};
      return [
        ["Touch Points", kpis.touch_points || 0, timeframeLabel(state.timeframe)],
        ["Calls Pitched", kpis.calls_pitched || 0, percent(kpis.touch_to_pitch_rate || 0) + " touch -> pitch"],
        ["Calls Booked", kpis.calls_booked || 0, percent(kpis.pitch_to_book_rate || 0) + " pitch -> book"],
        ["Calls Showed", kpis.calls_showed || 0, percent(kpis.book_to_show_rate || 0) + " show rate"],
        ["No Shows", kpis.no_shows || 0, "manual outcomes"],
        ["Touch -> Book", percent(kpis.touch_to_book_rate || 0), "overall conversion"]
      ];
    }

    function renderMetricCards(target, data) {
      if (!target) return;
      target.innerHTML = "";
      metricCards(data).forEach(([label, value, detail]) => {
        const card = document.createElement("article");
        card.className = "card kpi";
        const title = document.createElement("span");
        title.textContent = label;
        const metric = document.createElement("strong");
        metric.textContent = value;
        const small = document.createElement("small");
        small.textContent = detail;
        card.append(title, metric, small);
        target.appendChild(card);
      });
    }

    function renderFunnel(data) {
      const kpis = data.setter_kpis || {};
      const stages = [
        ["Touch Points", kpis.touch_points || 0],
        ["Calls Pitched", kpis.calls_pitched || 0],
        ["Calls Booked", kpis.calls_booked || 0],
        ["Calls Showed", kpis.calls_showed || 0]
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

    function renderFunnelInto(target, data) {
      if (!target) return;
      const kpis = data.setter_kpis || {};
      const stages = [
        ["Touch", kpis.touch_points || 0],
        ["Pitch", kpis.calls_pitched || 0],
        ["Book", kpis.calls_booked || 0],
        ["Show", kpis.calls_showed || 0]
      ];
      const max = Math.max(...stages.map(([, value]) => Number(value || 0)), 1);
      target.innerHTML = "";
      stages.forEach(([label, value]) => {
        const row = document.createElement("div");
        row.className = "funnel-row";
        const top = document.createElement("div");
        top.className = "funnel-label";
        top.innerHTML =
          "<span>" +
          label +
          "</span><strong>" +
          value +
          " · " +
          percent((Number(value || 0) / max) * 100) +
          "</strong>";
        const bar = document.createElement("div");
        bar.className = "bar";
        const fill = document.createElement("span");
        fill.style.width = Math.max(4, Math.round((Number(value || 0) / max) * 100)) + "%";
        bar.appendChild(fill);
        row.append(top, bar);
        target.appendChild(row);
      });
    }

    function renderMobilePulse(data) {
      if (!data) return;
      const kpis = data.setter_kpis || {};
      const diagnosis = data.kpi_diagnosis || {};
      const settings = data.settings || {};
      const attentionCount = attentionConversations().length;
      const lastActivity = state.conversations
        .map(conversationTime)
        .filter(Boolean)
        .sort()
        .pop();
      const healthy = Boolean(settings.auto_send && settings.zernio_configured && settings.knowledge_base_configured);

      mobileHealthEl.className = "bot-health " + (healthy ? "ok" : "needs");
      mobileHealthLabelEl.textContent = healthy ? "Bot Working" : "Bot Needs Attention";
      mobileHealthDetailEl.textContent = healthy
        ? "Last activity: " + (lastActivity ? relativeTime(lastActivity) + " ago" : "waiting for messages")
        : "One or more connection/settings checks need attention.";
      mobileViewIssueEl.hidden = healthy;

      mobileCallsBookedEl.textContent = kpis.calls_booked || 0;
      mobileLeadsEl.textContent = kpis.touch_points || 0;
      mobileLinksSentEl.textContent = kpis.calls_pitched || 0;
      mobileLinkClicksEl.textContent = kpis.calls_showed || 0;
      mobileTouchPitchEl.textContent = percent(kpis.touch_to_pitch_rate || 0);
      mobilePitchBookEl.textContent = percent(kpis.pitch_to_book_rate || 0);
      mobileShowRateEl.textContent = percent(kpis.book_to_show_rate || 0);
      mobileAttentionCountEl.textContent = attentionCount;
      mobileNeedsAttentionEl.classList.toggle("has-attention", attentionCount > 0);
      mobileFunnelSummaryEl.textContent =
        (kpis.touch_points || 0) +
        " Touch -> " +
        (kpis.calls_pitched || 0) +
        " Pitch -> " +
        (kpis.calls_booked || 0) +
        " Book -> " +
        (kpis.calls_showed || 0) +
        " Show";
      mobileDiagnosisEl.className = "mobile-diagnosis " + (diagnosis.level || "ok");
      mobileDiagnosisTitleEl.textContent = diagnosis.title || "Setter flow is healthy";
      mobileDiagnosisMessageEl.textContent = diagnosis.message || "Waiting for enough DM activity to diagnose.";
      renderFunnelInto(mobileFunnelDetailEl, data);
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
      mobileFeaturesEl.innerHTML = "";
      [
        ["auto_send", "Auto-send Replies", "Send qualified replies without review."],
        ["follow_ups", "AI Follow-ups", "Let the app follow up when a lead goes quiet."],
        ["approval_mode", "Approval Mode", "Hold replies as drafts until approved."],
        ["humanize_replies", "Human Tone", "Keep replies casual and natural."],
        ["conversation_memory", "Contact Memory", "Use prior messages as context."]
      ].forEach(([feature, label, description]) => {
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

        const mobileButton = document.createElement("button");
        mobileButton.className = "mobile-control " + (enabled ? "on" : "off");
        mobileButton.type = "button";
        mobileButton.innerHTML =
          "<span><strong>" +
          label +
          "</strong><small>" +
          description +
          "</small></span><span class='switch-dot' aria-hidden='true'></span>";
        mobileButton.addEventListener("click", async () => {
          mobileButton.disabled = true;
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
            mobileButton.disabled = false;
          }
        });
        mobileFeaturesEl.appendChild(mobileButton);
      });
    }

    function activeConversation() {
      return state.conversations.find((conversation) => conversation.key === state.activeConversationKey) || null;
    }

    function renderCompanionAvatar(conversation) {
      companionAvatarEl.innerHTML = "";
      if (conversation && conversation.avatar_url) {
        const image = document.createElement("img");
        image.src = conversation.avatar_url;
        image.alt = "";
        image.loading = "lazy";
        image.onerror = () => {
          companionAvatarEl.textContent = initials(conversation);
        };
        companionAvatarEl.appendChild(image);
        return;
      }
      companionAvatarEl.textContent = conversation ? initials(conversation) : "IG";
    }

    function renderCompanion(conversation) {
      if (!conversation) return;
      renderCompanionAvatar(conversation);
      companionTitleEl.textContent = displayLeadName(conversation);
      companionSubtitleEl.textContent =
        conversation.ai_paused || conversation.manual_takeover_active
          ? "Bot paused"
          : displayLeadSubtitle(conversation);
      if (companionAppointmentPanelEl) {
        companionAppointmentPanelEl.hidden = !conversation.booking_confirmed && !conversation.call_pitched;
        companionAppointmentStatusEl.textContent =
          String(conversation.appointment_status || "unknown").replace("_", " ");
      }
      if (companionBookingEl) {
        const botPaused = Boolean(conversation.ai_paused || conversation.manual_takeover_active);
        companionBookingEl.textContent = botPaused ? "Turn Bot On" : "Turn Bot Off";
        companionBookingEl.classList.toggle("primary", botPaused);
        companionBookingEl.setAttribute(
          "aria-pressed",
          botPaused ? "false" : "true"
        );
        companionBookingEl.title = botPaused
          ? "Resume automation for this prospect"
          : "Pause automation for this prospect while you reply manually";
      }
      companionThreadEl.innerHTML = "";

      const messages = Array.isArray(conversation.recent_messages) ? conversation.recent_messages : [];
      if (!messages.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No saved messages for this lead yet.";
        companionThreadEl.appendChild(empty);
        companionThreadEl.scrollTop = companionThreadEl.scrollHeight;
        return;
      }

      messages.forEach((message) => {
        const bubble = document.createElement("div");
        const isAssistant = message.role === "assistant";
        bubble.className = "bubble " + (isAssistant ? "assistant" : "user");
        const text = document.createElement("div");
        text.textContent = message.text || "";
        const meta = document.createElement("small");
        meta.textContent =
          (isAssistant ? (String(message.source || "").startsWith("manual") ? "You" : "AI") : "Prospect") +
          " | " +
          formatDate(message.at);
        bubble.append(text, meta);
        companionThreadEl.appendChild(bubble);
      });
      companionThreadEl.scrollTop = companionThreadEl.scrollHeight;
    }

    function openCompanion(conversation) {
      state.activeConversationKey = conversation.key;
      renderCompanion(conversation);
      companionEl.hidden = false;
      setTimeout(() => companionTextEl.focus(), 30);
    }

    function closeCompanion() {
      companionEl.hidden = true;
      state.activeConversationKey = "";
      companionTextEl.value = "";
    }

    async function sendCompanionReply() {
      const conversation = activeConversation();
      const reply = companionTextEl.value.trim();
      if (!conversation || !reply) return;

      companionSendEl.disabled = true;
      companionBookingEl.disabled = true;
      setStatus("Sending manual DM...");
      try {
        const data = await api("/api/conversations/" + encodeURIComponent(conversation.key) + "/send-message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reply })
        });
        companionTextEl.value = "";
        await loadAll(true);
        if (data.conversation) {
          state.activeConversationKey = data.conversation.key;
          renderCompanion(data.conversation);
        } else {
          renderCompanion(activeConversation());
        }
        setStatus("Manual DM sent. AI is paused briefly for this lead.");
      } catch (error) {
        setStatus(error.message);
      } finally {
        companionSendEl.disabled = false;
        companionBookingEl.disabled = false;
      }
    }

    function statusTags(conversation) {
      const tags = [];
      if (conversation.needs_human_review) tags.push(["Needs Me", "red"]);
      if (conversation.hot_reason && !conversation.booking_confirmed) tags.push(["Hot", "gold"]);
      if (conversation.last_outgoing_at) tags.push(["AI Replied", "green"]);
      if (conversation.booking_link_sent) tags.push(["Link Sent", "blue"]);
      if (conversation.booking_link_clicked) tags.push(["Link Clicked", "gold"]);
      if (conversation.booking_confirmed) tags.push(["Appointment Scheduled", "violet"]);
      if (conversation.ai_paused || conversation.manual_takeover_active) tags.push(["Paused", "red"]);
      return tags.length ? tags : [["New Lead", "blue"]];
    }

    function renderReplyScorecard(conversation) {
      const assistantMessage = conversation.last_assistant_message;
      if (!assistantMessage || !assistantMessage.text) {
        return null;
      }

      const wrap = document.createElement("div");
      wrap.className = "scorecard";

      const title = document.createElement("div");
      title.className = "scorecard-title";
      title.textContent = conversation.reply_scorecard
        ? "Reply Scorecard · last marked " + conversation.reply_scorecard.rating.replaceAll("_", " ")
        : "Reply Scorecard";

      const reply = document.createElement("div");
      reply.className = "scorecard-reply";
      reply.textContent = assistantMessage.text;

      const buttons = document.createElement("div");
      buttons.className = "scorecard-buttons";
      [
        ["good", "Good", "good"],
        ["too_pushy", "Too pushy", "bad"],
        ["too_vague", "Too vague", "bad"],
        ["wrong_direction", "Wrong direction", "bad"],
        ["did_not_answer", "Didn't answer", "bad"],
        ["too_robotic", "Too robotic", "bad"]
      ].forEach(([rating, label, tone]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className =
          "scorecard-button " +
          tone +
          (conversation.reply_scorecard && conversation.reply_scorecard.rating === rating
            ? " active"
            : "");
        button.textContent = label;
        button.addEventListener("click", async () => {
          button.disabled = true;
          setStatus("Saving scorecard...");
          try {
            await api("/api/feedback", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "reply_scorecard",
                rating,
                conversation_key: conversation.key,
                message_id: assistantMessage.scorecard_id || assistantMessage.id || "",
                reply: assistantMessage.text || "",
                incoming_text:
                  conversation.last_message && conversation.last_message.role === "user"
                    ? conversation.last_message.text || ""
                    : "",
                lead_status: conversation.lead_status || "",
                source: assistantMessage.source || conversation.last_outgoing_source || ""
              })
            });
            await loadAll(true);
            setStatus("Scorecard saved: " + label + ".");
          } catch (error) {
            setStatus(error.message);
            button.disabled = false;
          }
        });
        buttons.appendChild(button);
      });

      wrap.append(title, reply, buttons);
      return wrap;
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
      name.textContent = displayLeadName(conversation);
      const meta = document.createElement("div");
      meta.className = "lead-meta";
      meta.textContent = formatDate(conversation.last_incoming_at || conversation.last_outgoing_at) + " | " + displayLeadSubtitle(conversation);
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
      const scorecard = renderReplyScorecard(conversation);

      const actions = document.createElement("div");
      actions.className = "actions";
      const paused = Boolean(conversation.ai_paused || conversation.manual_takeover_active);
      const openDmButton = document.createElement("button");
      openDmButton.className = "action primary";
      openDmButton.type = "button";
      openDmButton.textContent = "Open DM";
      openDmButton.addEventListener("click", () => openCompanion(conversation));

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

      actions.append(openDmButton, pauseButton, linkButton);
      card.append(top, tags, message);
      if (scorecard) card.appendChild(scorecard);
      card.appendChild(actions);
      return card;
    }

    function renderMobileInbox(conversations) {
      mobileInboxListEl.innerHTML = "";
      refreshInboxStageCounts(conversations);
      const search = state.inboxSearch.trim().toLowerCase();
      const filtered = (conversations || []).filter((conversation) => {
        const haystack = [
          conversation.display_name,
          conversation.username,
          conversation.contact_id,
          conversation.talk_id,
          conversation.summary,
          conversation.last_message && conversation.last_message.text
        ]
          .join(" ")
          .toLowerCase();
        const matchesSearch = !search || haystack.includes(search);
        const matchesFilter = stageMatches(conversation, state.inboxFilter);
        return matchesSearch && matchesFilter;
      });

      mobileInboxCountEl.textContent =
        stageLabel(state.inboxFilter) + " - " + filtered.length;

      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent =
          state.inboxFilter === "needs"
            ? "Nothing needs you right now."
            : "No conversations in " + stageLabel(state.inboxFilter).toLowerCase() + " yet.";
        mobileInboxListEl.appendChild(empty);
        return;
      }

      filtered.slice(0, 60).forEach((conversation) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "mobile-thread-row";
        row.addEventListener("click", () => openCompanion(conversation));

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

        const body = document.createElement("div");
        const name = document.createElement("strong");
        name.className = "thread-name";
        name.textContent = displayLeadName(conversation);
        const preview = document.createElement("span");
        preview.className = "thread-preview";
        preview.textContent =
          (conversation.last_message && conversation.last_message.text) ||
          conversation.summary ||
          "No recent message yet.";
        body.append(name, preview);

        const side = document.createElement("div");
        side.className = "thread-side";
        const camera = document.createElement("span");
        camera.className = "thread-camera";
        camera.setAttribute("aria-hidden", "true");
        const time = document.createElement("span");
        time.className = "thread-time";
        time.textContent = relativeTime(conversationTime(conversation));
        side.append(camera, time);

        row.append(avatar, body, side);
        mobileInboxListEl.appendChild(row);
      });
    }

    function renderConversations(conversations) {
      conversationsEl.innerHTML = "";
      const visible = (conversations || []).slice(0, 20);
      activityCountEl.textContent = visible.length + " visible";
      if (!visible.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No DMs have reached the app in this timeframe yet. When Zernio sends an Instagram message webhook, the thread will appear here with an Open DM button.";
        conversationsEl.appendChild(empty);
        return;
      }
      visible.forEach((conversation) => conversationsEl.appendChild(renderConversation(conversation)));
    }

    function buildMobileDraftCard(draft) {
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
      return card;
    }

    function renderDrafts(drafts) {
      draftsEl.innerHTML = "";
      mobileDraftsEl.innerHTML = "";
      mobileDraftsCountEl.textContent = String((drafts || []).length || 0);
      if (!drafts || !drafts.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No pending drafts.";
        draftsEl.appendChild(empty);
        mobileDraftsEl.appendChild(empty.cloneNode(true));
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
        mobileDraftsEl.appendChild(buildMobileDraftCard(draft));
      });
    }

    function renderAutomationEvents(events) {
      automationEventsEl.innerHTML = "";
      mobileAutomationEventsEl.innerHTML = "";
      const visible = (events || []).slice(0, 8);
      if (!visible.length) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No automation events yet.";
        automationEventsEl.appendChild(empty);
        mobileAutomationEventsEl.appendChild(empty.cloneNode(true));
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
        mobileAutomationEventsEl.appendChild(row.cloneNode(true));
      });
    }

    function renderLearningReview(data) {
      const targets = [learningReviewEl, mobileLearningReviewEl].filter(Boolean);
      const latest = data && data.latest ? data.latest : null;
      targets.forEach((target) => {
        target.innerHTML = "";
        if (!latest) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = "No learning review yet. Run one after you have recent DM activity.";
          target.appendChild(empty);
          return;
        }

        const row = document.createElement("div");
        row.className = "event info";
        const title = document.createElement("strong");
        title.textContent =
          "Latest review · " +
          formatDate(latest.generated_at) +
          " · " +
          String(latest.source || "analysis");
        const summary = document.createElement("span");
        summary.textContent = latest.summary || "Review completed.";
        row.append(title, summary);
        target.appendChild(row);

        const guidance = (latest.prompt_guidance || []).slice(0, 5);
        guidance.forEach((item) => {
          const note = document.createElement("div");
          note.className = "event success";
          const top = document.createElement("strong");
          top.textContent = "Reply guidance";
          const text = document.createElement("span");
          text.textContent = item;
          note.append(top, text);
          target.appendChild(note);
        });
      });
    }

    function renderSetterReview(review) {
      if (!setterReviewEl) return;
      const safe = review || {};
      const sections = [
        ["Hot Leads", safe.hot_leads || [], "No hot leads in this range."],
        ["Needs Me", safe.needs_me || [], "No manual-review threads."],
        ["Ghosted", safe.ghosted || [], "No ghosted threads yet."],
        [
          "Reply Reasons",
          (safe.reply_reasons || []).map((item) => ({
            name: String(item.reason || "unknown").replaceAll("_", " "),
            reason: String(item.count || 0) + " replies",
            last_message: ""
          })),
          "No reply reasons logged yet."
        ]
      ];

      setterReviewEl.innerHTML = "";
      sections.forEach(([title, rows, emptyText]) => {
        const card = document.createElement("article");
        card.className = "review-card";
        const heading = document.createElement("h3");
        heading.textContent = title;
        const list = document.createElement("ul");
        const visible = rows.slice(0, 5);

        if (!visible.length) {
          const empty = document.createElement("li");
          empty.textContent = emptyText;
          list.appendChild(empty);
        } else {
          visible.forEach((row) => {
            const item = document.createElement("li");
            const name = document.createElement("strong");
            name.textContent = row.name || row.username || "Unknown";
            const detail = document.createElement("span");
            detail.textContent = row.last_message || row.reason || "";
            const pill = document.createElement("span");
            pill.className = "reason-pill";
            pill.textContent = String(row.reason || row.last_reply_reason || "").replaceAll("_", " ");
            item.append(name);
            if (detail.textContent) item.appendChild(detail);
            if (pill.textContent) item.appendChild(pill);
            list.appendChild(item);
          });
        }

        card.append(heading, list);
        setterReviewEl.appendChild(card);
      });
    }

    function renderAnalyticsBreakdown(analytics) {
      const targets = [analyticsBreakdownEl, desktopAnalyticsBreakdownEl].filter(Boolean);
      if (!targets.length) return;
      const rows = analytics && Array.isArray(analytics.breakdown) ? analytics.breakdown.slice(-12) : [];
      const totals = analytics?.totals || {};

      targets.forEach((target) => {
        target.innerHTML = "";

        const totalItem = document.createElement("article");
        totalItem.innerHTML =
          "<strong>Totals</strong><span>" +
          (totals.touch_points || 0) +
          " touches - " +
          (totals.calls_pitched || 0) +
          " pitched - " +
          (totals.calls_booked || 0) +
          " booked - " +
          (totals.calls_showed || 0) +
          " showed</span>";
        target.appendChild(totalItem);

        if (!rows.length) {
          const empty = document.createElement("div");
          empty.className = "empty";
          empty.textContent = "No grouped KPI events in this range yet.";
          target.appendChild(empty);
          return;
        }

        rows.forEach((row) => {
          const item = document.createElement("article");
          item.innerHTML =
            "<strong>" +
            row.key +
            "</strong><span>" +
            (row.touch_points || 0) +
            " touches - " +
            (row.calls_pitched || 0) +
            " pitched - " +
            (row.calls_booked || 0) +
            " booked - " +
            (row.calls_showed || 0) +
            " showed</span>";
          target.appendChild(item);
        });
      });
    }

    function analyticsQuery() {
      const range = analyticsRangeEl ? analyticsRangeEl.value : state.timeframe;
      const group = analyticsGroupEl ? analyticsGroupEl.value : "day";
      const params = new URLSearchParams({ range, group_by: group });
      if (range === "custom") {
        if (analyticsStartEl && analyticsStartEl.value) params.set("start", analyticsStartEl.value);
        if (analyticsEndEl && analyticsEndEl.value) params.set("end", analyticsEndEl.value);
      }
      return "?" + params.toString();
    }

    async function loadKpiAnalytics() {
      try {
        const analytics = await api("/api/kpi-analytics" + analyticsQuery());
        state.latestAnalytics = analytics;
        renderAnalyticsBreakdown(analytics);
      } catch (error) {
        setStatus(error.message);
      }
    }

    function fillTargetForm(targets) {
      if (!kpiTargetFormEl || !targets) return;
      for (const input of kpiTargetFormEl.querySelectorAll("input[name]")) {
        input.value = targets[input.name] ?? "";
      }
    }

    async function loadAll(silent) {
      if (!silent) setStatus("Refreshing...");
      try {
        const query = "?timeframe=" + encodeURIComponent(state.timeframe);
        const [stats, conversations, drafts, events, review, learning] = await Promise.all([
          api("/api/stats" + query),
          api("/api/conversations" + query),
          api("/api/drafts"),
          api("/api/automation-events?limit=25"),
          api("/api/setter-review" + query),
          api("/api/learning-review")
        ]);
        rangeLabelEl.textContent = timeframeLabel(state.timeframe);
        renderKpis(stats);
        renderFunnel(stats);
        renderStatuses(stats.settings || {});
        state.conversations = conversations.conversations || [];
        state.latestStats = stats;
        state.latestDrafts = drafts.drafts || [];
        state.latestEvents = events.events || [];
        state.latestLearning = learning || null;
        const incomingSignature = latestIncomingSignature(state.conversations);
        const bookedCount = Number(stats.setter_kpis?.calls_booked || 0);
        const hasNewIncoming =
          state.hasLoadedOnce &&
          incomingSignature &&
          state.lastIncomingSignature &&
          incomingSignature !== state.lastIncomingSignature;
        const hasNewBooking =
          state.hasLoadedOnce &&
          state.lastBookedCount !== null &&
          bookedCount > state.lastBookedCount;
        fillTargetForm(stats.kpi_targets || {});
        renderConversations(conversations.conversations || []);
        renderMobileInbox(state.conversations);
        renderMobilePulse(stats);
        if (hasNewBooking) {
          triggerBookingPulse(state.lastBookedCount, bookedCount);
        } else if (hasNewIncoming) {
          triggerMessagePulse();
        }
        state.lastIncomingSignature = incomingSignature;
        state.lastBookedCount = bookedCount;
        state.hasLoadedOnce = true;
        loadKpiAnalytics();
        if (!companionEl.hidden && state.activeConversationKey) {
          renderCompanion(activeConversation());
        }
        renderDrafts(drafts.drafts || []);
        renderAutomationEvents(events.events || []);
        renderSetterReview(review);
        renderLearningReview(learning);
        if (!silent) setStatus("Live.");
      } catch (error) {
        setStatus(error.message);
      }
    }

    document.querySelectorAll("[data-range]").forEach((button) => {
      button.addEventListener("click", () => {
        state.timeframe = button.dataset.range;
        document.querySelectorAll("[data-range]").forEach((item) => item.classList.toggle("active", item.dataset.range === state.timeframe));
        loadAll();
      });
    });

    document.querySelectorAll("[data-mobile-tab]").forEach((tab) => {
      tab.addEventListener("click", (event) => {
        event.preventDefault();
        unlockBookingAudio();
        setMobileScreen(tab.dataset.mobileTab);
      });
    });

    ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
      window.addEventListener(eventName, unlockBookingAudio, { once: true, passive: true });
    });

    if (bookingSoundToggleEl) {
      bookingSoundToggleEl.addEventListener("click", () => {
        unlockBookingAudio();
        state.bookingSoundEnabled = !state.bookingSoundEnabled;
        localStorage.setItem("pulseBookingSound", state.bookingSoundEnabled ? "on" : "off");
        renderBookingSoundToggle();
      });
      renderBookingSoundToggle();
    }

    async function runLearningReviewNow(button) {
      if (button) button.disabled = true;
      setStatus("Running 7-day learning review...");
      try {
        const result = await api("/api/learning-review/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timeframe: "7d", force: true })
        });
        renderLearningReview({ latest: result.insight, insights: result.insight ? [result.insight] : [] });
        await loadAll(true);
        setStatus("Learning review saved.");
      } catch (error) {
        setStatus(error.message);
      } finally {
        if (button) button.disabled = false;
      }
    }

    [learningRunButton, mobileLearningRunButton].filter(Boolean).forEach((button) => {
      button.addEventListener("click", () => runLearningReviewNow(button));
    });

    mobileNeedsAttentionEl.addEventListener("click", () => {
      state.inboxFilter = "needs";
      document.querySelectorAll("[data-inbox-filter]").forEach((button) => {
        button.classList.toggle("active", button.dataset.inboxFilter === "needs");
      });
      renderMobileInbox(state.conversations);
      setMobileScreen("inbox");
    });

    mobileViewIssueEl.addEventListener("click", () => {
      setMobileScreen("more");
      openMorePanel("system");
    });

    mobileFunnelToggleEl.addEventListener("click", () => {
      const isHidden = mobileFunnelDetailEl.hidden;
      mobileFunnelDetailEl.hidden = !isHidden;
      mobileFunnelToggleEl.textContent = isHidden ? "Hide Funnel" : "View Funnel";
    });

    document.querySelectorAll("[data-inbox-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        state.inboxFilter = button.dataset.inboxFilter;
        document.querySelectorAll("[data-inbox-filter]").forEach((item) => item.classList.toggle("active", item === button));
        renderMobileInbox(state.conversations);
      });
    });

    document.querySelectorAll("[data-inbox-filter-jump]").forEach((button) => {
      button.addEventListener("click", () => {
        state.inboxFilter = "needs";
        document.querySelectorAll("[data-inbox-filter]").forEach((item) => {
          item.classList.toggle("active", item.dataset.inboxFilter === "needs");
        });
        renderMobileInbox(state.conversations);
      });
    });

    [analyticsRangeEl, analyticsGroupEl, analyticsStartEl, analyticsEndEl].forEach((element) => {
      if (!element) return;
      element.addEventListener("change", loadKpiAnalytics);
    });

    if (kpiTargetFormEl) {
      kpiTargetFormEl.addEventListener("submit", async (event) => {
        event.preventDefault();
        const payload = {};
        for (const input of kpiTargetFormEl.querySelectorAll("input[name]")) {
          payload[input.name] = Number(input.value || 0);
        }
        try {
          const result = await api("/api/kpi-targets", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          fillTargetForm(result.targets || {});
          await loadAll(true);
          setStatus("KPI targets saved.");
        } catch (error) {
          setStatus(error.message);
        }
      });
    }

    mobileInboxSearchEl.addEventListener("input", () => {
      state.inboxSearch = mobileInboxSearchEl.value || "";
      renderMobileInbox(state.conversations);
    });

    document.querySelectorAll("[data-more-panel]").forEach((button) => {
      button.addEventListener("click", () => openMorePanel(button.dataset.morePanel));
    });

    document.querySelectorAll("[data-more-close]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".more-panel").forEach((panel) => {
          panel.hidden = true;
        });
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

    mobileTestButton.addEventListener("click", async () => {
      mobileTestButton.disabled = true;
      mobileTestResult.textContent = "";
      setStatus("Generating preview...");
      try {
        const data = await api("/api/test-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcript: mobileTestTranscript.value,
            new_message: mobileTestNewMessage.value
          })
        });
        mobileTestResult.textContent =
          "Lead status: " +
          String(data.lead_status || "cold").replace("_", " ") +
          "\\nNeeds review: " +
          (data.needs_review ? "yes" : "no") +
          "\\n\\n" +
          data.reply;
        setStatus("Preview ready.");
      } catch (error) {
        setStatus(error.message);
      } finally {
        mobileTestButton.disabled = false;
      }
    });

    companionCloseEl.addEventListener("click", closeCompanion);
    companionEl.addEventListener("click", (event) => {
      if (event.target === companionEl) closeCompanion();
    });
    companionFormEl.addEventListener("submit", async (event) => {
      event.preventDefault();
      await sendCompanionReply();
    });
    companionBookingEl.addEventListener("click", async () => {
      const conversation = activeConversation();
      if (!conversation) return;
      const botPaused = Boolean(conversation.ai_paused || conversation.manual_takeover_active);
      companionBookingEl.disabled = true;
      companionSendEl.disabled = true;
      setStatus(botPaused ? "Turning bot on for this lead..." : "Turning bot off for this lead...");
      try {
        const data = await api(
          "/api/conversations/" +
            encodeURIComponent(conversation.key) +
            (botPaused ? "/resume" : "/pause"),
          { method: "POST" }
        );
        await loadAll(true);
        if (data.conversation) {
          state.activeConversationKey = data.conversation.key;
          renderCompanion(data.conversation);
        } else {
          renderCompanion(activeConversation());
        }
        setStatus(botPaused ? "Bot is back on for this lead." : "Bot is off for this lead.");
      } catch (error) {
        setStatus(error.message);
      } finally {
        companionBookingEl.disabled = false;
        companionSendEl.disabled = false;
      }
    });

    document.querySelectorAll("[data-appointment-status]").forEach((button) => {
      button.addEventListener("click", async () => {
        const conversation = activeConversation();
        if (!conversation) return;
        button.disabled = true;
        try {
          const data = await api("/api/conversations/" + encodeURIComponent(conversation.key) + "/appointment-status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: button.dataset.appointmentStatus })
          });
          await loadAll(true);
          if (data.conversation) {
            state.activeConversationKey = data.conversation.key;
            renderCompanion(data.conversation);
          }
          setStatus("Call outcome saved.");
        } catch (error) {
          setStatus(error.message);
        } finally {
          button.disabled = false;
        }
      });
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

    setInterval(() => {
      processLearningReviewIfDue().catch((error) => {
        console.error("Learning review interval failed:", error);
      });
    }, LEARNING_REVIEW_CHECK_MS);

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
