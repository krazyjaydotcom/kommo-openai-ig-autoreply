const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "server.js");
let source = fs.readFileSync(file, "utf8");

if (source.includes("const BOOKING_NURTURE_VERSION = 1;")) {
  console.log("Booking nurture already enabled.");
  process.exit(0);
}

function replaceOnce(before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Could not find ${label}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
`const FOLLOW_UP_WINDOW_MS = 23 * 60 * 60 * 1000;`,
`const FOLLOW_UP_WINDOW_MS = 23 * 60 * 60 * 1000;
const BOOKING_NURTURE_VERSION = 1;
const BOOKING_CONGRATS_DELAY_MS = Number(
  process.env.BOOKING_CONGRATS_DELAY_MS || 10 * 60 * 1000
);
const TRUSTED_LINK_DRAFT_TTL_MS = Number(
  process.env.TRUSTED_LINK_DRAFT_TTL_MS || 60 * 1000
);
const BOOKING_NURTURE_SWEEP_MS = Number(
  process.env.BOOKING_NURTURE_SWEEP_MS || 15 * 1000
);`,
"booking nurture constants"
);

replaceOnce(
`16. If they say they booked, scheduled, or got on the calendar, acknowledge it naturally and do not ask what it was for.
17. After someone confirms they booked, send this free training playlist once so they can better understand the opportunity:
   https://www.youtube.com/playlist?list=PLPFyOjF-83nJ0B5xCreYqoQzcGx-SQsvs
18. After someone confirms they booked, do not send the booking link again and do not keep qualifying them.`,
`16. If they say they booked, scheduled, or got on the calendar, acknowledge it naturally and do not ask what it was for.
17. Do not send the mini-course link in the booking acknowledgment. The app asks permission in a separate message about 10 minutes later.
18. Only send the mini-course after the prospect clearly gives permission or directly asks for it.
19. After someone confirms they booked, do not send the booking link again and do not keep qualifying them.`,
"post-booking rules"
);

replaceOnce(
`    bookingEvents: Array.isArray(parsed.bookingEvents) ? parsed.bookingEvents : [],
    profileCache:`,
`    bookingEvents: Array.isArray(parsed.bookingEvents) ? parsed.bookingEvents : [],
    bookingNurtures: Array.isArray(parsed.bookingNurtures) ? parsed.bookingNurtures : [],
    profileCache:`,
"booking nurture store normalization"
);

const helpers = `
function assistantMessageBeforeLatestUser(memory) {
  const messages = Array.isArray(memory?.last_messages) ? memory.last_messages : [];
  let latestUserIndex = -1;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      latestUserIndex = index;
      break;
    }
  }

  for (let index = latestUserIndex - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") return messages[index];
  }

  return null;
}

function lastAssistantAskedForMiniCoursePermission(memory) {
  const message = assistantMessageBeforeLatestUser(memory);
  return Boolean(
    message &&
      /mini[- ]?course|short course|training playlist/i.test(message.text || "") &&
      /want me to send|can i send|may i send|send it over/i.test(message.text || "")
  );
}

function yesToMiniCoursePermission(text) {
  return /^(yes|yea|yeah|yep|yup|sure|of course|please|yes please|ok|okay|send it|send it over|sounds good|lets do it|let's do it)\\b/i.test(
    String(text || "").trim()
  );
}

function directMiniCourseRequest(text) {
  return /\\b(send|share|give me|let me get|where is).{0,30}(mini[- ]?course|training playlist|course link|training link)\\b/i.test(
    String(text || "")
  );
}

function miniCoursePermissionReply() {
  return {
    reply:
      "Congratulations on getting your call booked. Before we meet, I have a short mini-course that will help you get more from the call. Want me to send it over?",
    needs_review: false,
    handled: true
  };
}

function miniCourseLinkReply() {
  return {
    reply: "Absolutely. Here is the mini-course: " + TRAINING_PLAYLIST_URL,
    needs_review: false,
    handled: true
  };
}

function scheduleBookingNurture(store, memory, bookedAt = new Date().toISOString()) {
  store.bookingNurtures = Array.isArray(store.bookingNurtures)
    ? store.bookingNurtures
    : [];
  const conversationKey = memory?.key || makeConversationKey(memory || {});
  if (!conversationKey) return;

  const existing = store.bookingNurtures.find(
    (item) => item.conversation_key === conversationKey && !item.sent_at
  );
  if (existing) return;

  const bookedAtMs = Date.parse(String(bookedAt || ""));
  const baseMs = Number.isFinite(bookedAtMs) ? bookedAtMs : Date.now();
  store.bookingNurtures.push({
    id: crypto.randomUUID(),
    conversation_key: conversationKey,
    due_at: new Date(baseMs + BOOKING_CONGRATS_DELAY_MS).toISOString(),
    sent_at: null,
    created_at: new Date().toISOString()
  });
  store.bookingNurtures = store.bookingNurtures.slice(-1000);
}

function trustedLinkDraftKind(draft, memory) {
  const reply = String(draft?.reply || "");
  const incomingText = String(draft?.incoming_text || "");
  const reason = String(draft?.reason || "");
  if (!reply || /blocked because|newer prospect message/i.test(reason)) return "";

  const bookingLink =
    reply.includes(BOOKING_URL) || reply.includes(TRACKED_BOOKING_BASE_URL);
  const trainingLink = reply.includes(TRAINING_PLAYLIST_URL);

  if (
    bookingLink &&
    (directSchedulingRequest(incomingText) ||
      (lastAssistantAskedForCalendarPermission(memory) && yesToCalendarLink(incomingText)))
  ) return "booking";

  if (
    trainingLink &&
    (directMiniCourseRequest(incomingText) ||
      (lastAssistantAskedForMiniCoursePermission(memory) &&
        yesToMiniCoursePermission(incomingText)))
  ) return "training";

  return "";
}
`;

replaceOnce(
`function leadTrackingId(messageLike = {}) {`,
`${helpers}\nfunction leadTrackingId(messageLike = {}) {`,
"booking nurture helper insertion"
);

replaceOnce(
`function lastAssistantAskedForCalendarPermission(memory) {
  const messages = Array.isArray(memory?.last_messages) ? memory.last_messages : [];
  const lastMessage = messages[messages.length - 1];
  return Boolean(
    lastMessage?.role === "assistant" &&
    /send (?:you )?(?:the|a) calendar link|send you a link to my calendar|want me to send the calendar link/i.test(lastMessage.text || "")
  );
}`,
`function lastAssistantAskedForCalendarPermission(memory) {
  const message = assistantMessageBeforeLatestUser(memory);
  return Boolean(
    message?.role === "assistant" &&
    /send (?:you )?(?:the|a) calendar link|send you a link to my calendar|want me to send the calendar link/i.test(message.text || "")
  );
}`,
"calendar permission context"
);

replaceOnce(
`  if (!text.trim()) {
    return null;
  }

  if (wantsDirectPhoneCall(text) && !hasRichProspectContext(text)) {`,
`  if (!text.trim()) {
    return null;
  }

  if (
    (directMiniCourseRequest(text) ||
      (lastAssistantAskedForMiniCoursePermission(memory) && yesToMiniCoursePermission(text))) &&
    !hasRichProspectContext(text)
  ) {
    return memory?.training_link_sent
      ? {
          reply: "You are all set. The mini-course link is already in our conversation above.",
          needs_review: false,
          handled: true
        }
      : miniCourseLinkReply();
  }

  if (wantsDirectPhoneCall(text) && !hasRichProspectContext(text)) {`,
"mini-course permission rule"
);

replaceOnce(
`function bookingConfirmationReply() {
  return {
    reply:
      \`Perfect, glad you got it booked. Before the call, go through this free training so you have a better feel for the opportunity: \${TRAINING_PLAYLIST_URL}\`,
    needs_review: false,
    handled: true
  };
}`,
`function bookingConfirmationReply() {
  return {
    reply:
      "Got it, you are officially on the calendar. I will follow up shortly with one quick prep step before the call.",
    needs_review: false,
    handled: true
  };
}`,
"booking confirmation reply"
);

replaceOnce(
`      memory.booking_confirmed_at = incomingAt;
      if (!wasConfirmed) {`,
`      memory.booking_confirmed_at = incomingAt;
      scheduleBookingNurture(store, memory, incomingAt);
      if (!wasConfirmed) {`,
"DM booking nurture schedule"
);

replaceOnce(
`      memory.booking_confirmed_at = memory.booking_confirmed_at || bookedAt;
      memory.booking_link_clicked = true;`,
`      memory.booking_confirmed_at = memory.booking_confirmed_at || bookedAt;
      scheduleBookingNurture(store, memory, bookedAt);
      memory.booking_link_clicked = true;`,
"webhook booking nurture schedule"
);

replaceOnce(
`  const hasBookingLink = reply.includes(BOOKING_URL) || reply.includes(TRACKED_BOOKING_BASE_URL);
  const calendarAllowed =
    directSchedulingRequest(incoming?.text) ||
    (lastAssistantAskedForCalendarPermission(memory) && yesToCalendarLink(incoming?.text));

  if (hasBookingLink && !calendarAllowed) {
    return "Booking link blocked because the prospect did not explicitly request or approve it.";
  }`,
`  const hasBookingLink = reply.includes(BOOKING_URL) || reply.includes(TRACKED_BOOKING_BASE_URL);
  const hasTrainingLink = reply.includes(TRAINING_PLAYLIST_URL);
  const calendarAllowed =
    directSchedulingRequest(incoming?.text) ||
    (lastAssistantAskedForCalendarPermission(memory) && yesToCalendarLink(incoming?.text));
  const trainingAllowed =
    directMiniCourseRequest(incoming?.text) ||
    (lastAssistantAskedForMiniCoursePermission(memory) &&
      yesToMiniCoursePermission(incoming?.text));

  if (hasBookingLink && !calendarAllowed) {
    return "Booking link blocked because the prospect did not explicitly request or approve it.";
  }
  if (hasTrainingLink && !trainingAllowed) {
    return "Mini-course link blocked because the prospect did not explicitly request or approve it.";
  }`,
"mini-course safety"
);

replaceOnce(
`async function saveDraft(draft) {
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
}`,
`async function saveDraft(draft) {
  const store = await readStore();
  getConversationSettings(store, draft.talk_id);
  const conversationKey = draft.conversation_key || makeConversationKey(draft);
  const memory =
    store.conversations[conversationKey] || getConversationMemory(store, draft);
  const trustedLinkKind = trustedLinkDraftKind(draft, memory);
  const now = new Date();

  const existingIndex = draft.incoming_message_id
    ? store.drafts.findIndex(
        (item) => item.incoming_message_id === draft.incoming_message_id
      )
    : -1;
  const existing = existingIndex >= 0 ? store.drafts[existingIndex] : null;
  const releaseFields = trustedLinkKind
    ? {
        trusted_link_kind: trustedLinkKind,
        auto_release_at:
          existing?.auto_release_at ||
          new Date(now.getTime() + TRUSTED_LINK_DRAFT_TTL_MS).toISOString()
      }
    : { trusted_link_kind: "", auto_release_at: null };

  if (existingIndex >= 0) {
    store.drafts[existingIndex] = {
      ...store.drafts[existingIndex],
      ...draft,
      ...releaseFields,
      updated_at: now.toISOString()
    };
  } else {
    store.drafts.push({
      ...draft,
      ...releaseFields,
      conversation_key: conversationKey,
      id: draft.id || crypto.randomUUID(),
      created_at: now.toISOString(),
      updated_at: now.toISOString()
    });
    recordDailyStat(store, conversationKey, { drafts_created: 1 });
  }

  await writeStore(store);
}`,
"trusted link draft timeout"
);

const automation = `
let bookingNurtureSweepRunning = false;

async function sendDueBookingNurture(taskId) {
  const store = await readStore();
  const task = store.bookingNurtures.find((item) => item.id === taskId);
  if (!task || task.sent_at || Date.parse(task.due_at) > Date.now()) return;

  const memory = store.conversations[task.conversation_key];
  if (!memory || memory.training_link_sent || !memory.current_talk_id) {
    task.sent_at = new Date().toISOString();
    await writeStore(store);
    return;
  }

  const settings = getConversationSettings(store, memory.current_talk_id);
  if (
    !isProviderEnabled(store, memory.provider) ||
    memoryAutomationPaused(memory) ||
    conversationHoldReason(settings)
  ) return;

  try {
    const reply = miniCoursePermissionReply().reply;
    await sendReply(memory, reply, getFeatureSettings(store));
    await recordOutgoingForMemory(memory, reply, { source: "booking_nurture" });
    const updatedStore = await readStore();
    const updatedTask = updatedStore.bookingNurtures.find((item) => item.id === taskId);
    if (updatedTask) updatedTask.sent_at = new Date().toISOString();
    await writeStore(updatedStore);
  } catch (error) {
    task.due_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await writeStore(store);
    console.error("Post-booking nurture failed:", error);
  }
}

async function autoReleaseTrustedLinkDraft(draftId) {
  const store = await readStore();
  const draft = store.drafts.find((item) => item.id === draftId);
  if (!draft || !draft.trusted_link_kind || Date.parse(draft.auto_release_at) > Date.now()) return;

  const memory =
    store.conversations[draft.conversation_key] || getConversationMemory(store, draft);
  if (
    draft.incoming_message_id &&
    latestUserMessageId(memory) &&
    latestUserMessageId(memory) !== draft.incoming_message_id
  ) {
    await updateDraft(draft.id, {
      trusted_link_kind: "",
      auto_release_at: null,
      reason: "Auto-release canceled because a newer prospect message arrived."
    });
    return;
  }

  const trustedKind = trustedLinkDraftKind(draft, memory);
  if (!trustedKind || trustedKind !== draft.trusted_link_kind) {
    await updateDraft(draft.id, {
      trusted_link_kind: "",
      auto_release_at: null,
      reason: "Auto-release canceled because permission could not be revalidated."
    });
    return;
  }

  const settings = getConversationSettings(store, memory.current_talk_id || draft.talk_id);
  if (
    !isProviderEnabled(store, draft.provider) ||
    memoryAutomationPaused(memory) ||
    conversationHoldReason(settings)
  ) return;

  try {
    await sendReply(draft, draft.reply, getFeatureSettings(store));
    await recordOutgoingForMemory(draft, draft.reply, {
      source: "auto_release_" + trustedKind
    });
    await removeDraft(draft.id);
  } catch (error) {
    await updateDraft(draft.id, {
      auto_release_at: new Date(Date.now() + TRUSTED_LINK_DRAFT_TTL_MS).toISOString(),
      reason: "Trusted link send failed and will retry: " + error.message
    });
  }
}

async function processBookingNurtureAutomation() {
  if (bookingNurtureSweepRunning) return;
  bookingNurtureSweepRunning = true;

  try {
    const store = await readStore();
    const now = Date.now();
    const nurtureIds = store.bookingNurtures
      .filter((item) => !item.sent_at && Date.parse(item.due_at) <= now)
      .map((item) => item.id);
    const draftIds = store.drafts
      .filter(
        (item) =>
          item.trusted_link_kind &&
          item.auto_release_at &&
          Date.parse(item.auto_release_at) <= now
      )
      .map((item) => item.id);

    for (const id of nurtureIds) await sendDueBookingNurture(id);
    for (const id of draftIds) await autoReleaseTrustedLinkDraft(id);
  } catch (error) {
    console.error("Booking nurture sweep failed:", error);
  } finally {
    bookingNurtureSweepRunning = false;
  }
}
`;

replaceOnce(
`let followUpSweepRunning = false;`,
`${automation}\nlet followUpSweepRunning = false;`,
"booking nurture automation"
);

replaceOnce(
`    setInterval(() => {
      processDueFollowUps().catch((error) => {
        console.error("Follow-up interval failed:", error);
      });
    }, FOLLOW_UP_CHECK_MS);

    app.listen(PORT, () => {`,
`    setInterval(() => {
      processDueFollowUps().catch((error) => {
        console.error("Follow-up interval failed:", error);
      });
    }, FOLLOW_UP_CHECK_MS);

    setInterval(() => {
      processBookingNurtureAutomation().catch((error) => {
        console.error("Booking nurture interval failed:", error);
      });
    }, BOOKING_NURTURE_SWEEP_MS);

    processBookingNurtureAutomation().catch((error) => {
      console.error("Initial booking nurture sweep failed:", error);
    });

    app.listen(PORT, () => {`,
"booking nurture timer"
);

fs.writeFileSync(file, source);
console.log("Booking nurture enabled.");
