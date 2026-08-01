const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const serverFile = path.join(root, "server.js");

function serverIncludes(marker) {
  return fs.readFileSync(serverFile, "utf8").includes(marker);
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

if (
  !serverIncludes("const INCOMING_DEBOUNCE_MS") ||
  !serverIncludes("function replySafetyReview") ||
  !serverIncludes("function incomingStillCurrent")
) {
  runScript("upgrade-conversation-engine.js");
}

if (!serverIncludes("const SHORT_BOOKING_LINK_VERSION = 1;")) {
  runScript("upgrade-short-links.js");
}

if (!serverIncludes("const BOOKING_NURTURE_VERSION = 1;")) {
  runScript("upgrade-booking-nurture.js");
}

const syntaxCheck = spawnSync(process.execPath, ["--check", serverFile], {
  cwd: root,
  stdio: "inherit"
});

if (syntaxCheck.status !== 0) {
  process.exit(syntaxCheck.status || 1);
}

require(serverFile);
