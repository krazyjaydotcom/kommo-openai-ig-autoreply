const assert = require("node:assert/strict");
const { createDeliveryLedger } = require("./delivery-ledger");

async function run() {
  const rows = new Map();
  let failReceipt = false;
  const request = async (route, options = {}) => {
    const body = options.body && JSON.parse(options.body);
    if (options.method === "POST") {
      if (rows.has(body.id)) return [];
      rows.set(body.id, { ...body });
      return [body];
    }
    const id = route.match(/id=eq\.([^&]+)/)[1];
    if (options.method === "PATCH") {
      if (failReceipt) throw new Error("Database offline");
      Object.assign(rows.get(id), body);
      return null;
    }
    return rows.has(id) ? [rows.get(id)] : [];
  };
  const ledger = createDeliveryLedger(request);
  const identity = { account: "fixture-account", conversation: "fixture-thread", trigger: "incoming-1" };
  let sent = 0;
  const transmit = async () => { sent++; };
  await ledger.send(identity, "Calendar", transmit);
  await ledger.send(identity, "Calendar", transmit);
  assert.equal(sent, 1, "duplicate must not transmit");
  await assert.rejects(ledger.send(identity, "Regenerated copy", transmit));
  const parallel = { ...identity, trigger: "incoming-2" };
  await Promise.allSettled([ledger.send(parallel, "Hi", transmit), ledger.send(parallel, "Hi", transmit)]);
  assert.equal(sent, 2, "concurrent reservation transmits once");
  const uncertain = { ...identity, trigger: "incoming-3" };
  await assert.rejects(ledger.send(uncertain, "Link", async () => { sent++; throw new Error("Provider timeout"); }));
  await assert.rejects(createDeliveryLedger(request).send(uncertain, "Link", transmit));
  assert.equal(sent, 3, "restart must not retry uncertain delivery");
  failReceipt = true;
  const lostReceipt = { ...identity, trigger: "incoming-4" };
  await assert.rejects(ledger.send(lostReceipt, "Sent but receipt lost", transmit));
  failReceipt = false;
  await assert.rejects(ledger.send(lostReceipt, "Sent but receipt lost", transmit));
  assert.equal(sent, 4);
  await assert.rejects(ledger.send({ account: "missing" }, "Hi", transmit));
  console.log("Delivery ledger: duplicates, concurrency, restart, changed copy, lost receipt, and identity checks passed");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
