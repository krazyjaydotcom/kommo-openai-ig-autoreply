const assert = require("assert");

function safeRate(numerator, denominator) {
  const top = Number(numerator || 0);
  const bottom = Number(denominator || 0);
  if (!bottom || !Number.isFinite(top) || !Number.isFinite(bottom)) return 0;
  return Math.round((top / bottom) * 10000) / 100;
}

function setterKpisForEvents(events) {
  const kpis = {
    touch_points: 0,
    calls_pitched: 0,
    calls_booked: 0,
    calls_showed: 0,
    touch_to_pitch_rate: 0,
    pitch_to_book_rate: 0,
    book_to_show_rate: 0,
    touch_to_book_rate: 0
  };
  const touchKeys = new Set();

  for (const event of events) {
    if (event.type === "touch_point") touchKeys.add(`${event.business_day}:${event.conversation_id}`);
    if (event.type === "call_pitched") kpis.calls_pitched += 1;
    if (event.type === "call_booked") kpis.calls_booked += 1;
    if (event.type === "call_showed") kpis.calls_showed += 1;
  }

  kpis.touch_points = touchKeys.size;
  kpis.touch_to_pitch_rate = safeRate(kpis.calls_pitched, kpis.touch_points);
  kpis.pitch_to_book_rate = safeRate(kpis.calls_booked, kpis.calls_pitched);
  kpis.book_to_show_rate = safeRate(kpis.calls_showed, kpis.calls_booked);
  kpis.touch_to_book_rate = safeRate(kpis.calls_booked, kpis.touch_points);
  return kpis;
}

function mockEvents() {
  const events = [];
  for (let index = 0; index < 100; index += 1) {
    events.push({ type: "touch_point", business_day: "2026-08-08", conversation_id: `lead-${index}` });
  }
  for (let index = 0; index < 10; index += 1) {
    events.push({ type: "call_pitched", business_day: "2026-08-08", conversation_id: `lead-${index}` });
  }
  for (let index = 0; index < 6; index += 1) {
    events.push({ type: "call_booked", business_day: "2026-08-08", conversation_id: `lead-${index}` });
  }
  for (let index = 0; index < 5; index += 1) {
    events.push({ type: "call_showed", business_day: "2026-08-08", conversation_id: `lead-${index}` });
  }
  return events;
}

const kpis = setterKpisForEvents(mockEvents());
assert.strictEqual(kpis.touch_points, 100);
assert.strictEqual(kpis.calls_pitched, 10);
assert.strictEqual(kpis.calls_booked, 6);
assert.strictEqual(kpis.calls_showed, 5);
assert.strictEqual(kpis.touch_to_pitch_rate, 10);
assert.strictEqual(kpis.pitch_to_book_rate, 60);
assert.strictEqual(kpis.book_to_show_rate, 83.33);
assert.strictEqual(kpis.touch_to_book_rate, 6);

const zero = setterKpisForEvents([]);
assert.strictEqual(zero.touch_to_pitch_rate, 0);
assert.strictEqual(zero.pitch_to_book_rate, 0);
assert.strictEqual(zero.book_to_show_rate, 0);

const uniquePerDay = setterKpisForEvents([
  { type: "touch_point", business_day: "2026-08-08", conversation_id: "same-lead" },
  { type: "touch_point", business_day: "2026-08-08", conversation_id: "same-lead" },
  { type: "touch_point", business_day: "2026-08-09", conversation_id: "same-lead" }
]);
assert.strictEqual(uniquePerDay.touch_points, 2);

console.log("KPI calculation tests passed");
