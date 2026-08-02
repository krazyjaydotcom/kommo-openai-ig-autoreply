const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const serverFile = path.join(root, "server.js");

function readServer() {
  return fs.readFileSync(serverFile, "utf8");
}

function serverIncludes(marker) {
  return readServer().includes(marker);
}

function runScript(filename) {
  const result = spawnSync(process.execPath, [path.join(__dirname, filename)], {
    cwd: root,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const serverSource = readServer();
const hasConversationEngineUpgrade =
  serverSource.includes("const INCOMING_DEBOUNCE_MS") &&
  serverSource.includes("function replySafetyReview") &&
  serverSource.includes("function incomingStillCurrent");
const hasModernAutomationUpgrade =
  serverSource.includes("function touchpointKpisForTimeframe") &&
  serverSource.includes('app.get("/api/automation-events"') &&
  serverSource.includes('featureEnabled(raw, "approval_mode", "APPROVAL_MODE", false)');
const canApplyConversationEngineUpgrade = serverSource.includes(
  "const DEFAULT_MANUAL_TAKEOVER_MINUTES = 8;"
) && serverSource.includes("const FOLLOW_UP_WINDOW_MS = 23 * 60 * 60 * 1000;");

if (
  !hasConversationEngineUpgrade &&
  !hasModernAutomationUpgrade &&
  canApplyConversationEngineUpgrade
) {
  runScript("upgrade-conversation-engine.js");
} else if (!hasConversationEngineUpgrade && !hasModernAutomationUpgrade) {
  console.warn(
    "Skipping conversation-engine upgrade because server.js no longer matches the expected upgrade markers."
  );
}

if (
  !serverIncludes("const SHORT_BOOKING_LINK_VERSION = 1;") &&
  serverIncludes("const INCOMING_DEBOUNCE_MS = Number(process.env.INCOMING_DEBOUNCE_MS || 9000);")
) {
  runScript("upgrade-short-links.js");
} else if (
  !serverIncludes("const SHORT_BOOKING_LINK_VERSION = 1;") &&
  serverIncludes("function trackedBookingUrl")
) {
  console.warn(
    "Skipping short-link upgrade because booking-link tracking already exists without the legacy marker."
  );
}

if (
  !serverIncludes("const BOOKING_NURTURE_VERSION = 1;") &&
  serverIncludes("function assistantMessageBeforeLatestUser")
) {
  runScript("upgrade-booking-nurture.js");
} else if (
  !serverIncludes("const BOOKING_NURTURE_VERSION = 1;") &&
  serverIncludes("const TRAINING_PLAYLIST_URL") &&
  serverIncludes("booking_confirmed")
) {
  console.warn(
    "Skipping booking-nurture upgrade because booking confirmation logic already exists without the legacy marker."
  );
}

const syntaxCheck = spawnSync(process.execPath, ["--check", serverFile], {
  cwd: root,
  stdio: "inherit"
});

if (syntaxCheck.status !== 0) {
  process.exit(syntaxCheck.status || 1);
}

require(serverFile);
