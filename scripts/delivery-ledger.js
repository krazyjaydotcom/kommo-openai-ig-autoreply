const crypto = require("node:crypto");

function createDeliveryLedger(request) {
  return {
    async send(identity, text, transmit) {
      if (!identity.account || !identity.conversation || !identity.trigger) {
        throw new Error("Delivery identity is incomplete; held for review.");
      }
      const id = crypto.createHash("sha256").update(JSON.stringify([
        identity.account, identity.conversation, identity.trigger, identity.step || "reply"
      ])).digest("hex");
      const rows = await request("outgoing_deliveries?on_conflict=id", {
        method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify({ id, status: "sending", message_text: text })
      });
      if (!Array.isArray(rows)) throw new Error("Could not verify delivery reservation.");
      if (!rows.length) {
        const prior = await request("outgoing_deliveries?id=eq." + id + "&select=status,message_text");
        if (prior?.[0]?.status === "sent" && prior[0].message_text === text) return { alreadySent: true };
        throw new Error("Previous delivery is pending, uncertain, or changed; reconcile before retrying.");
      }
      // Reserve before the external side effect. Unknown outcomes never retry automatically.
      try {
        const result = await transmit();
        await request("outgoing_deliveries?id=eq." + id, {
          method: "PATCH", body: JSON.stringify({ status: "sent", sent_at: new Date().toISOString() })
        });
        return result;
      } catch (error) {
        try {
          await request("outgoing_deliveries?id=eq." + id, {
            method: "PATCH", body: JSON.stringify({ status: "needs_review" })
          });
        } catch { /* A retained sending reservation also prevents unsafe retries. */ }
        throw error;
      }
    }
  };
}

module.exports = { createDeliveryLedger };
