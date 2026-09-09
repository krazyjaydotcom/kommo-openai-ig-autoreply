const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function run() {
  const source = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const start = source.indexOf("async function sendAutoReply(");
  const end = source.indexOf("function replyMessages(", start);
  assert.ok(start >= 0 && end > start);
  let held = false;
  let current = true;
  let sent = 0;
  let onPrepare = () => {};
  let onReserve = () => {};
  const context = vm.createContext({
    process: { env: { RELIABLE_DELIVERY: "true" } },
    storeBackend: () => "supabase",
    currentAutomationHoldReason: async () => held ? "Manual takeover" : "",
    incomingStillCurrent: async () => current,
    prepareZernioSend: async () => onPrepare(),
    sendReply: async () => { sent++; },
    deliveryLedger: { send: async (_id, _text, transmit) => { onReserve(); return transmit(); } }
  });
  vm.runInContext(source.slice(start, end), context);
  onPrepare = () => { held = true; };
  await assert.rejects(context.sendAutoReply({}, "Hi", {}), /Manual takeover/);
  held = false;
  onPrepare = () => {};
  onReserve = () => { current = false; };
  await assert.rejects(context.sendAutoReply({}, "Hi", {}), error => error.code === "STALE_INCOMING");
  assert.equal(sent, 0);
  current = true;
  onReserve = () => { held = true; };
  await assert.rejects(context.sendAutoReply({}, "Hi", {}), /Manual takeover/);
  held = false;
  onReserve = () => {};
  await context.sendAutoReply({}, "Hi", {});
  assert.equal(sent, 1);
  console.log("Send guards: takeover during delay/reservation and newer messages block transmission");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
