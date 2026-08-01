const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const serverFile = path.join(root, 'server.js');
const serverSource = fs.readFileSync(serverFile, 'utf8');
const alreadyUpgraded =
  serverSource.includes('const INCOMING_DEBOUNCE_MS') &&
  serverSource.includes('function replySafetyReview') &&
  serverSource.includes('function incomingStillCurrent');

if (!alreadyUpgraded) {
  const migration = spawnSync(process.execPath, [path.join(__dirname, 'upgrade-conversation-engine.js')], {
    cwd: root,
    stdio: 'inherit'
  });

  if (migration.status !== 0) {
    process.exit(migration.status || 1);
  }
}

require(serverFile);
