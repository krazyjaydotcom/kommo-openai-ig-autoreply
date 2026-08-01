const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'server.js');
let source = fs.readFileSync(file, 'utf8');

function replaceOnce(before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Could not find ${label}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
`const DEFAULT_MANUAL_TAKEOVER_MINUTES = 8;
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
const FOLLOW_UP_WINDOW_MS = 23 * 60 * 60 * 1000;`,
`const DEFAULT_MANUAL_TAKEOVER_MINUTES = 240;
const DEFAULT_HUMAN_SEND_DELAY_MIN_MS = 6500;
const DEFAULT_HUMAN_SEND_DELAY_MAX_MS = 18000;
const APP_OUTGOING_ECHO_WINDOW_MS = 15 * 60 * 1000;
const CALENDAR_SEQUENCE_GAP_MS = 8 * 1000;
const INCOMING_DEBOUNCE_MS = Number(process.env.INCOMING_DEBOUNCE_MS || 9000);
const FOLLOW_UP_OFFSETS_MS = [20 * 60 * 60 * 1000];
const FOLLOW_UP_CHECK_MS = 60 * 1000;
const FOLLOW_UP_WINDOW_MS = 23 * 60 * 60 * 1000;`,
'conversation timing constants'
);

replaceOnce(
`Return only valid JSON in this exact shape:
{
  \"reply\": \"short reply text\",
  \"needs_review\": false
}

Set needs_review to true when the reply should be reviewed before sending.\`;`,
`Return only valid JSON in this exact shape:
{
  \"reply\": \"short reply text\",
  \"intent\": \"answer|explore|qualify|ask_calendar_permission|send_calendar|acknowledge_booking|redirect|follow_up\",
  \"confidence\": 0.0,
  \"answered_user_question\": true,
  \"next_action\": \"continue_conversation|ask_one_question|ask_calendar_permission|send_calendar|stop_follow_up|review\",
  \"should_send_booking_link\": false,
  \"follow_up_allowed\": false,
  \"needs_review\": false,
  \"reason\": \"brief internal reason\"
}

Never place a booking link in the reply unless the prospect directly requested scheduling or the immediately previous assistant message asked permission and the prospect clearly agreed. Set needs_review true whenever confidence is below 0.78, context is unclear, a factual answer is uncertain, or the proposed reply could feel pushy.\`;`,
'OpenAI response contract'
);

replaceOnce(
`function appointmentSetterCalendarAskReply() {
  return {
    reply:
      \"That's exactly what the Zoom is for. We can research your area, answer your questions, and see if the academy fits your goals.\\n\\nDo you mind if I send the calendar link?\",
    needs_review: false,
    handled: true
  };
}`,
`function appointmentSetterCalendarAskReply() {
  return {
    reply: \"A quick discovery call would probably be the easiest way to look at your area and answer your questions. Want me to send the calendar link?\",
    needs_review: false,
    handled: true
  };
}`,
'calendar permission copy'
);

replaceOnce(
`function appointmentSetterCalendarLinkReply(messageLike) {
  const calendarUrl = trackedBookingUrl(messageLike);
  const messages = [
    \`Bet. Here's the calendar: \${calendarUrl}\`,
    \"Pick a time that works for you and I'll verify it on my end.\"
  ];`,
`function appointmentSetterCalendarLinkReply(messageLike) {
  const calendarUrl = trackedBookingUrl(messageLike);
  const messages = [
    \`Sounds good. Here's the calendar: \${calendarUrl}\`,
    \"Choose a weekday time that works best for you.\"
  ];`,
'calendar link copy'
);

replaceOnce(
`function appointmentSetterWarmQualifierReply() {
  return {
    reply: \"Got you. Is this business something you'd be interested in pursuing, or are you mostly checking it out right now?\",
    needs_review: false,
    handled: true
  };
}`,
`function appointmentSetterWarmQualifierReply() {
  return {
    reply: \"Got you. What part of the pallet business caught your attention?\",
    needs_review: false,
    handled: true
  };
}`,
'warm qualifier copy'
);

replaceOnce(
`function lastAssistantAskedForCalendarPermission(memory) {
  return (Array.isArray(memory?.last_messages) ? memory.last_messages : [])
    .slice(-5)
    .some(
      (message) =>
        message.role === \"assistant\" &&
        /send you a link to my calendar|link to my calendar/i.test(message.text || \"\")
    );
}`,
`function lastAssistantAskedForCalendarPermission(memory) {
  const messages = Array.isArray(memory?.last_messages) ? memory.last_messages : [];
  const lastMessage = messages[messages.length - 1];
  return Boolean(
    lastMessage?.role === \"assistant\" &&
    /send (?:you )?(?:the|a) calendar link|send you a link to my calendar|want me to send the calendar link/i.test(lastMessage.text || \"\")
  );
}`,
'immediate calendar consent check'
);

replaceOnce(
`  if (
    isSimplePalletBusinessIntent(text) &&
    !memory?.booking_link_sent &&
    !lastAssistantAskedForCalendarPermission(memory)
  ) {
    return askedWarmQualifier(memory)
      ? appointmentSetterCalendarAskReply()
      : appointmentSetterWarmQualifierReply();
  }

  return null;`,
`  // Interest keywords alone are not enough to advance the sales flow. Let OpenAI
  // answer naturally from the full conversation and decide the next best question.
  return null;`,
'broad keyword interception'
);

replaceOnce(
`function scheduleFollowUpIfNeeded(memory, replyText, sentAtMs = Date.now(), settings) {
  if (!isFollowUpsEnabled(settings) || !replyLooksLikeQuestion(replyText)) {
    memory.follow_up.active = false;
    return;
  }

  memory.follow_up = {
    active: true,
    count: 0,
    question_text: String(replyText || \"\").slice(0, 500),
    question_sent_at: new Date(sentAtMs).toISOString(),
    due_at: new Date(sentAtMs + FOLLOW_UP_OFFSETS_MS[0]).toISOString(),
    last_sent_at: null
  };
}`,
`function scheduleFollowUpIfNeeded(memory, replyText, sentAtMs = Date.now(), settings) {
  const recent = recentConversationText(memory, 12);
  const eligibleStatus = [\"qualified\", \"hot\"].includes(classifyLeadStatus(memory));
  const optedOut = /\\b(not interested|stop|leave me alone|do not message|don't message|not right now|maybe later)\\b/i.test(recent);
  const terminal = memory?.booking_confirmed || optedOut;

  if (
    !isFollowUpsEnabled(settings) ||
    !replyLooksLikeQuestion(replyText) ||
    !eligibleStatus ||
    terminal
  ) {
    memory.follow_up.active = false;
    return;
  }

  memory.follow_up = {
    active: true,
    count: 0,
    question_text: String(replyText || \"\").slice(0, 500),
    question_sent_at: new Date(sentAtMs).toISOString(),
    due_at: new Date(sentAtMs + FOLLOW_UP_OFFSETS_MS[0]).toISOString(),
    last_sent_at: null
  };
}`,
'follow-up eligibility'
);

replaceOnce(
`async function generateFollowUpReply(memory, featureSettings) {
  const followUpNumber = Number(memory.follow_up?.count || 0) + 1;
  const replies = [
    \"Still interested in getting this started?\",
    \"No pressure, just checking if this is still something you want to look into.\",
    \"I'll leave it with you for now. If you want the next step, just message me back.\"
  ];

  return {
    reply: replies[Math.min(followUpNumber, replies.length) - 1],
    needs_review: false
  };
}`,
`async function generateFollowUpReply(memory, featureSettings) {
  const messages = Array.isArray(memory?.last_messages) ? memory.last_messages : [];
  const lastUser = [...messages].reverse().find((message) => message.role === \"user\");
  const context = compactMemoryText(lastUser?.text || memory?.follow_up?.question_text || \"\", 180);
  const promptMemory = memoryForPrompt(memory, featureSettings);
  const response = await fetch(\"https://api.openai.com/v1/chat/completions\", {
    method: \"POST\",
    headers: {
      Authorization: \`Bearer \${requireEnv(\"OPENAI_API_KEY\")}\`,
      \"Content-Type\": \"application/json\"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      temperature: 0.35,
      response_format: { type: \"json_object\" },
      messages: [
        {
          role: \"system\",
          content: \"Write one natural Instagram DM follow-up. It has been about 20 hours. Reference one real detail when available. Be warm, low-pressure, and under 28 words. Do not include a booking link. Do not say 'still interested' unless that wording clearly fits. Return JSON with reply, needs_review, confidence, and reason.\"
        },
        {
          role: \"user\",
          content: JSON.stringify({ context, conversation_memory: promptMemory })
        }
      ]
    })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(\`OpenAI follow-up failed: \${response.status} \${text}\`);
  const body = safeJsonParse(text);
  const parsed = safeJsonParse(body?.choices?.[0]?.message?.content || \"\");
  const reply = String(parsed?.reply || \"\").trim();
  return {
    reply,
    needs_review: parsed?.needs_review !== false || Number(parsed?.confidence || 0) < 0.78 || /https?:\\/\\//i.test(reply)
  };
}`,
'contextual follow-up generation'
);

replaceOnce(
`  return {
    reply: parsed.reply.trim(),
    needs_review: parsed.needs_review !== false
  };
}`,
`  return {
    reply: parsed.reply.trim(),
    intent: String(parsed.intent || \"\"),
    confidence: Number(parsed.confidence || 0),
    answered_user_question: parsed.answered_user_question !== false,
    next_action: String(parsed.next_action || \"\"),
    should_send_booking_link: parsed.should_send_booking_link === true,
    follow_up_allowed: parsed.follow_up_allowed === true,
    reason: String(parsed.reason || \"\"),
    needs_review:
      parsed.needs_review !== false ||
      Number(parsed.confidence || 0) < 0.78
  };
}`,
'OpenAI response parsing'
);

const safetyHelpers = `
function latestUserMessageId(memory) {
  const messages = Array.isArray(memory?.last_messages) ? memory.last_messages : [];
  return [...messages].reverse().find((message) => message.role === \"user\")?.id || \"\";
}

async function incomingStillCurrent(incoming) {
  if (!incoming?.incoming_message_id) return true;
  const store = await readStore();
  const memory = store.conversations[makeConversationKey(incoming)];
  return !memory || latestUserMessageId(memory) === incoming.incoming_message_id;
}

function directSchedulingRequest(text) {
  return /\\b(send (?:me )?(?:the|a) link|calendar link|booking link|schedule|book (?:a|the) call|appointment|consultation|zoom call|discovery call)\\b/i.test(String(text || \"\"));
}

function replySafetyReview(memory, incoming, aiReply) {
  const reply = String(aiReply?.reply || \"\");
  const hasBookingLink = reply.includes(BOOKING_URL) || reply.includes(TRACKED_BOOKING_BASE_URL);
  const calendarAllowed =
    directSchedulingRequest(incoming?.text) ||
    (lastAssistantAskedForCalendarPermission(memory) && yesToCalendarLink(incoming?.text));

  if (hasBookingLink && !calendarAllowed) {
    return \"Booking link blocked because the prospect did not explicitly request or approve it.\";
  }
  if (prospectAskedQuestion(incoming?.text) && aiReply?.answered_user_question === false) {
    return \"Reply did not answer the prospect's question.\";
  }
  if (/\\b(guaranteed|you will make|easy money|get rich|no risk)\\b/i.test(reply)) {
    return \"Reply contained an unsafe or unsupported outcome claim.\";
  }
  if ((reply.match(/\\?/g) || []).length > 1) {
    return \"Reply asked more than one question.\";
  }
  if (reply.length > 600) {
    return \"Reply was too long for an Instagram DM.\";
  }
  return \"\";
}
`;
replaceOnce(
`async function processIncomingMessage(incoming, parsedPayload) {`,
`${safetyHelpers}\nasync function processIncomingMessage(incoming, parsedPayload) {`,
'safety helper insertion'
);

replaceOnce(
`  if (duplicate) {
    console.log(\`Webhook ignored: duplicate message \${incoming.incoming_message_id}.\`);
    return;
  }

  const ruleBasedReply`,
`  if (duplicate) {
    console.log(\`Webhook ignored: duplicate message \${incoming.incoming_message_id}.\`);
    return;
  }

  if (INCOMING_DEBOUNCE_MS > 0) {
    await sleep(INCOMING_DEBOUNCE_MS);
    if (!(await incomingStillCurrent(incoming))) {
      console.log(\`Webhook ignored: a newer message arrived for talk_id=\${incoming.talk_id}.\`);
      return;
    }
  }

  const ruleBasedReply`,
'incoming debounce'
);

replaceOnce(
`  if (replyRepeatsRecentAssistant(memory, aiReply.reply)) {
    aiReply.needs_review = true;
    reviewReason = \"AI reply repeated a recent assistant message.\";
  }

  const store = await readStore();`,
`  if (replyRepeatsRecentAssistant(memory, aiReply.reply)) {
    aiReply.needs_review = true;
    reviewReason = \"AI reply repeated a recent assistant message.\";
  }

  const safetyReason = replySafetyReview(memory, incoming, aiReply);
  if (safetyReason) {
    aiReply.needs_review = true;
    reviewReason = safetyReason;
  }

  const store = await readStore();`,
'reply safety review'
);

replaceOnce(
`  if (shouldAutoSend) {
    await sendReply(incoming, aiReply.reply, featureSettings);`,
`  if (shouldAutoSend) {
    if (!(await incomingStillCurrent(incoming))) {
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
        reason: \"A newer prospect message arrived before this reply could send.\"
      });
      return;
    }
    await sendReply(incoming, aiReply.reply, featureSettings);`,
'pre-send stale check'
);

fs.writeFileSync(file, source);
console.log('Conversation engine upgraded successfully.');
