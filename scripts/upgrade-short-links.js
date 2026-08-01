const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "server.js");
let source = fs.readFileSync(file, "utf8");

if (source.includes("const SHORT_BOOKING_LINK_VERSION = 1;")) {
  console.log("Short booking links already enabled.");
  process.exit(0);
}

function replaceOnce(before, after, label) {
  if (!source.includes(before)) {
    throw new Error(`Could not find ${label}`);
  }
  source = source.replace(before, after);
}

replaceOnce(
`const INCOMING_DEBOUNCE_MS = Number(process.env.INCOMING_DEBOUNCE_MS || 9000);`,
`const INCOMING_DEBOUNCE_MS = Number(process.env.INCOMING_DEBOUNCE_MS || 9000);
const SHORT_BOOKING_LINK_VERSION = 1;`,
"short-link version marker"
);

const helpers = `
function encodeLeadIdBase64(leadId) {
  const id = String(leadId || "").trim();
  if (!/^\\d+$/.test(id)) return "";

  let hex = BigInt(id).toString(16);
  if (hex.length % 2) hex = "0" + hex;
  return Buffer.from(hex, "hex").toString("base64url");
}

function decodeLeadIdBase64(code) {
  const cleanCode = String(code || "").trim();
  if (!/^[A-Za-z0-9_-]+$/.test(cleanCode)) return "";

  try {
    const bytes = Buffer.from(cleanCode, "base64url");
    if (!bytes.length) return "";
    return BigInt("0x" + bytes.toString("hex")).toString(10);
  } catch {
    return "";
  }
}
`;

replaceOnce(
`function leadTrackingId(messageLike = {}) {`,
`${helpers}\nfunction leadTrackingId(messageLike = {}) {`,
"Base64 helper insertion"
);

replaceOnce(
`function trackedBookingUrl(messageLike = {}) {
  const leadId = leadTrackingId(messageLike);
  const params = new URLSearchParams();

  if (leadId) {
    params.set("id", leadId);
  }

  return params.toString()
    ? \`${TRACKED_BOOKING_BASE_URL}?\${params.toString()}\`
    : TRACKED_BOOKING_BASE_URL;
}`,
`function trackedBookingUrl(messageLike = {}) {
  const leadId = leadTrackingId(messageLike);
  const code = encodeLeadIdBase64(leadId);
  if (!code) return TRACKED_BOOKING_BASE_URL;

  try {
    const url = new URL(TRACKED_BOOKING_BASE_URL);
    url.pathname = \`/d/\${code}\`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return TRACKED_BOOKING_BASE_URL.replace(/\\/discovery\\/?$/, "") + "/d/" + code;
  }
}`,
"tracked booking URL"
);

replaceOnce(
`async function recordBookingLinkClick(req) {
  const leadId = String(req.query.id || req.query.lead_id || "").trim().slice(0, 160);`,
`async function recordBookingLinkClick(req) {
  const leadId = String(
    req.tracked_lead_id || req.query.id || req.query.lead_id || ""
  )
    .trim()
    .slice(0, 160);`,
"decoded lead id"
);

replaceOnce(
`app.get("/discovery", async (req, res, next) => {`,
`app.get("/d/:code", async (req, res, next) => {
  try {
    const leadId = decodeLeadIdBase64(req.params.code);
    if (!leadId) {
      res.status(404).send("Invalid booking link.");
      return;
    }

    req.tracked_lead_id = leadId;
    await recordBookingLinkClick(req);
    const redirectUrl = new URL(BOOKING_URL);
    redirectUrl.searchParams.set("lead_id", leadId);
    res.redirect(302, redirectUrl.toString());
  } catch (error) {
    next(error);
  }
});

app.get("/discovery", async (req, res, next) => {`,
"short booking route"
);

fs.writeFileSync(file, source);
console.log("Short booking links enabled.");
