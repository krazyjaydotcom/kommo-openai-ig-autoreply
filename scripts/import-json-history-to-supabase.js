#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_STATE_TABLE = "app_state";
const DEFAULT_STATE_KEY = "default";
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
  "follow_up",
  "human_intervention"
]);
const DAILY_COUNTER_KEYS = [
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
];

function parseArgs(argv) {
  const args = {
    source: "",
    apply: false,
    dryRun: true,
    currentFile: "",
    backupDir: path.join(ROOT_DIR, "backups")
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apply") {
      args.apply = true;
      args.dryRun = false;
    } else if (arg === "--dry-run") {
      args.apply = false;
      args.dryRun = true;
    } else if (arg === "--backup-dir") {
      args.backupDir = path.resolve(argv[index + 1] || "");
      index += 1;
    } else if (arg === "--current-file") {
      args.currentFile = path.resolve(argv[index + 1] || "");
      index += 1;
    } else if (!args.source) {
      args.source = path.resolve(arg);
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!args.source) {
    throw new Error(
      "Usage: node scripts/import-json-history-to-supabase.js <old-store.json> [--dry-run|--apply] [--current-file current-state.json]"
    );
  }

  return args;
}

async function loadDotEnv() {
  const envPath = path.join(ROOT_DIR, ".env");
  let raw = "";
  try {
    raw = await fs.readFile(envPath, "utf8");
  } catch {
    return;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function safeJsonParse(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return safeJsonParse(raw, {});
}

function normalizeState(value) {
  const state = value && typeof value === "object" ? value : {};
  return {
    drafts: Array.isArray(state.drafts) ? state.drafts : [],
    feedback: Array.isArray(state.feedback) ? state.feedback : [],
    conversationSettings:
      state.conversationSettings && typeof state.conversationSettings === "object"
        ? state.conversationSettings
        : {},
    providerSettings:
      state.providerSettings && typeof state.providerSettings === "object"
        ? state.providerSettings
        : { zernio: { enabled: true } },
    featureSettings:
      state.featureSettings && typeof state.featureSettings === "object"
        ? state.featureSettings
        : {},
    conversations:
      state.conversations && typeof state.conversations === "object"
        ? state.conversations
        : {},
    linkClicks: Array.isArray(state.linkClicks) ? state.linkClicks : [],
    bookingEvents: Array.isArray(state.bookingEvents) ? state.bookingEvents : [],
    profileCache:
      state.profileCache && typeof state.profileCache === "object" ? state.profileCache : {},
    automationEvents: Array.isArray(state.automationEvents) ? state.automationEvents : [],
    learningInsights: Array.isArray(state.learningInsights) ? state.learningInsights : [],
    learningState:
      state.learningState && typeof state.learningState === "object" ? state.learningState : {},
    dailyStats:
      state.dailyStats && typeof state.dailyStats === "object" ? state.dailyStats : {},
    kpiEvents: Array.isArray(state.kpiEvents)
      ? state.kpiEvents.filter((event) => KPI_EVENT_TYPES.has(event?.type))
      : [],
    kpiTargets:
      state.kpiTargets && typeof state.kpiTargets === "object" ? state.kpiTargets : {}
  };
}

function isoOrEmpty(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
}

function hash(value) {
  return crypto.createHash("sha1").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function messageKey(message) {
  return String(
    message?.id ||
      [
        message?.role || "",
        isoOrEmpty(message?.at) || message?.at || "",
        String(message?.text || "").slice(0, 240)
      ].join("|")
  );
}

function eventKey(event, fallbackPrefix) {
  return String(
    event?.dedupe_key ||
      event?.id ||
      [
        fallbackPrefix,
        event?.type || "",
        isoOrEmpty(event?.timestamp || event?.booked_at || event?.clicked_at || event?.at) ||
          event?.timestamp ||
          event?.booked_at ||
          event?.clicked_at ||
          "",
        event?.conversation_id || event?.prospect_id || event?.lead_id || event?.public_id || "",
        event?.source || "",
        hash(event || {})
      ].join("|")
  );
}

function pushUnique(target, incoming, keyFn, limit, stats, statName) {
  const existing = new Set(target.map(keyFn));
  let added = 0;
  for (const item of incoming) {
    const key = keyFn(item);
    if (!key || existing.has(key)) continue;
    target.push(item);
    existing.add(key);
    added += 1;
  }
  if (limit && target.length > limit) {
    target.splice(0, target.length - limit);
  }
  stats[statName] = (stats[statName] || 0) + added;
}

function mergeConversation(existing = {}, incoming = {}) {
  const merged = { ...incoming, ...existing };
  const messages = [];
  const seen = new Set();

  for (const message of [
    ...(Array.isArray(incoming.last_messages) ? incoming.last_messages : []),
    ...(Array.isArray(existing.last_messages) ? existing.last_messages : [])
  ]) {
    const key = messageKey(message);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    messages.push(message);
  }

  messages.sort((a, b) => Date.parse(a?.at || "") - Date.parse(b?.at || ""));
  merged.last_messages = messages.slice(-80);

  for (const key of [
    "booking_link_sent",
    "booking_link_clicked",
    "booking_confirmed",
    "call_pitched",
    "bot_paused"
  ]) {
    merged[key] = Boolean(existing[key] || incoming[key]);
  }

  for (const key of [
    "first_seen_at",
    "last_incoming_at",
    "last_outgoing_at",
    "booking_link_sent_at",
    "booking_link_clicked_at",
    "booking_confirmed_at",
    "call_pitched_at"
  ]) {
    merged[key] = existing[key] || incoming[key] || "";
  }

  if (!merged.display_name) merged.display_name = incoming.display_name || incoming.username || "";
  if (!merged.username) merged.username = incoming.username || "";
  if (!merged.avatar_url) merged.avatar_url = incoming.avatar_url || incoming.profile_pic || "";
  return merged;
}

function mergeConversations(target, incoming, stats) {
  for (const [key, memory] of Object.entries(incoming || {})) {
    if (!memory || typeof memory !== "object") continue;
    if (target[key]) {
      target[key] = mergeConversation(target[key], memory);
      stats.conversations_merged += 1;
    } else {
      target[key] = memory;
      stats.conversations_added += 1;
    }
  }
}

function mergeDailyStats(target, incoming, stats) {
  for (const [day, value] of Object.entries(incoming || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !value || typeof value !== "object") {
      continue;
    }

    if (!target[day]) {
      target[day] = value;
      stats.daily_stats_days_added += 1;
      continue;
    }

    const prospectKeys = new Set([
      ...(Array.isArray(target[day].prospect_keys) ? target[day].prospect_keys : []),
      ...(Array.isArray(value.prospect_keys) ? value.prospect_keys : [])
    ]);
    target[day].prospect_keys = [...prospectKeys];
    target[day].prospects_touched = target[day].prospect_keys.length;

    for (const key of DAILY_COUNTER_KEYS) {
      target[day][key] = Math.max(Number(target[day][key] || 0), Number(value[key] || 0));
    }

    stats.daily_stats_days_merged += 1;
  }
}

function mergeObjectsMissingOnly(target, incoming, stats, statName) {
  for (const [key, value] of Object.entries(incoming || {})) {
    if (target[key] !== undefined) continue;
    target[key] = value;
    stats[statName] = (stats[statName] || 0) + 1;
  }
}

function mergeStates(currentState, incomingState) {
  const merged = normalizeState(currentState);
  const incoming = normalizeState(incomingState);
  const stats = {
    conversations_added: 0,
    conversations_merged: 0,
    daily_stats_days_added: 0,
    daily_stats_days_merged: 0
  };

  mergeConversations(merged.conversations, incoming.conversations, stats);
  mergeDailyStats(merged.dailyStats, incoming.dailyStats, stats);
  mergeObjectsMissingOnly(merged.profileCache, incoming.profileCache, stats, "profile_cache_added");
  mergeObjectsMissingOnly(
    merged.conversationSettings,
    incoming.conversationSettings,
    stats,
    "conversation_settings_added"
  );

  pushUnique(merged.kpiEvents, incoming.kpiEvents, (item) => eventKey(item, "kpi"), 5000, stats, "kpi_events_added");
  pushUnique(
    merged.linkClicks,
    incoming.linkClicks,
    (item) => eventKey(item, "click"),
    1000,
    stats,
    "link_clicks_added"
  );
  pushUnique(
    merged.bookingEvents,
    incoming.bookingEvents,
    (item) => eventKey(item, "booking"),
    1000,
    stats,
    "booking_events_added"
  );
  pushUnique(
    merged.automationEvents,
    incoming.automationEvents,
    (item) => eventKey(item, "automation"),
    1000,
    stats,
    "automation_events_added"
  );
  pushUnique(
    merged.feedback,
    incoming.feedback,
    (item) => eventKey(item, "feedback"),
    1000,
    stats,
    "feedback_added"
  );
  pushUnique(
    merged.learningInsights,
    incoming.learningInsights,
    (item) => eventKey(item, "learning"),
    12,
    stats,
    "learning_insights_added"
  );

  merged.providerSettings = { ...incoming.providerSettings, ...merged.providerSettings };
  merged.featureSettings = { ...incoming.featureSettings, ...merged.featureSettings };
  merged.learningState = { ...incoming.learningState, ...merged.learningState };
  merged.kpiTargets = { ...incoming.kpiTargets, ...merged.kpiTargets };

  return { merged, stats };
}

async function supabaseRequest(pathname, options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to fetch or update live state.");
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
  const body = text ? safeJsonParse(text, text) : null;
  if (!response.ok) {
    throw new Error(
      `Supabase REST ${response.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`
    );
  }
  return body;
}

async function readSupabaseState() {
  const table = process.env.SUPABASE_STATE_TABLE || DEFAULT_STATE_TABLE;
  const key = process.env.SUPABASE_STATE_KEY || DEFAULT_STATE_KEY;
  const rows = await supabaseRequest(
    `${encodeURIComponent(table)}?key=eq.${encodeURIComponent(key)}&select=value`,
    { method: "GET" }
  );
  return normalizeState(Array.isArray(rows) ? rows[0]?.value || {} : {});
}

async function writeSupabaseState(state) {
  const table = process.env.SUPABASE_STATE_TABLE || DEFAULT_STATE_TABLE;
  const key = process.env.SUPABASE_STATE_KEY || DEFAULT_STATE_KEY;
  await supabaseRequest(encodeURIComponent(table), {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      key,
      value: state,
      updated_at: new Date().toISOString()
    })
  });
}

async function backupState(state, backupDir) {
  await fs.mkdir(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(backupDir, `supabase-state-before-history-import-${timestamp}.json`);
  await fs.writeFile(file, JSON.stringify(state, null, 2));
  return file;
}

async function main() {
  await loadDotEnv();
  const args = parseArgs(process.argv);
  const source = normalizeState(await readJson(args.source));
  const current = args.currentFile
    ? normalizeState(await readJson(args.currentFile))
    : await readSupabaseState();
  const { merged, stats } = mergeStates(current, source);
  const sourceSummary = {
    conversations: Object.keys(source.conversations).length,
    daily_stat_days: Object.keys(source.dailyStats).length,
    kpi_events: source.kpiEvents.length,
    link_clicks: source.linkClicks.length,
    booking_events: source.bookingEvents.length
  };

  console.log(JSON.stringify({ mode: args.apply ? "apply" : "dry-run", source: args.source, sourceSummary, stats }, null, 2));

  if (!args.apply) {
    console.log("Dry run only. Re-run with --apply to back up Supabase and merge this history.");
    return;
  }

  if (args.currentFile) {
    throw new Error("--apply cannot be used with --current-file because that would not update Supabase.");
  }

  const backupFile = await backupState(current, args.backupDir);
  await writeSupabaseState(merged);
  console.log(JSON.stringify({ ok: true, backupFile }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
