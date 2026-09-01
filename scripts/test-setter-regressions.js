const assert = require("assert");
const fs = require("fs/promises");
const http = require("http");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const fixtures = require(path.join(root, "tests", "fixtures", "setter-regressions.json"));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(baseUrl, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Test server exited with code ${child.exitCode}.`);
    }
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Timed out waiting for the test server.");
}

async function run() {
  const port = await freePort();
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "pallet-pros-controller-test-"));
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [path.join(root, "server.js")], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      STORE_BACKEND: "json",
      OPENAI_API_KEY: "",
      AUTO_SEND: "false",
      FOLLOW_UPS_ENABLED: "false",
      HUMAN_SEND_DELAY_ENABLED: "false"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let serverOutput = "";
  child.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
  child.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

  try {
    await waitForServer(baseUrl, child);

    for (const fixture of fixtures) {
      const response = await fetch(`${baseUrl}/api/test-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: fixture.transcript,
          new_message: fixture.new_message
        })
      });
      const body = await response.json();
      assert.strictEqual(response.ok, true, `${fixture.name}: ${JSON.stringify(body)}`);
      assert.strictEqual(body.source, "rule", `${fixture.name}: expected deterministic rule route`);

      const reply = String(body.reply || "").toLowerCase();
      for (const expected of fixture.includes || []) {
        assert.ok(
          reply.includes(String(expected).toLowerCase()),
          `${fixture.name}: expected reply to include ${JSON.stringify(expected)}; got ${body.reply}`
        );
      }
      for (const forbidden of fixture.excludes || []) {
        assert.ok(
          !reply.includes(String(forbidden).toLowerCase()),
          `${fixture.name}: expected reply to exclude ${JSON.stringify(forbidden)}; got ${body.reply}`
        );
      }
      if (fixture.message_count !== undefined) {
        assert.strictEqual(
          Array.isArray(body.messages) ? body.messages.length : 0,
          fixture.message_count,
          `${fixture.name}: unexpected message count`
        );
      }
      assert.strictEqual(body.safety?.safe, true, `${fixture.name}: ${body.safety?.reason || "unsafe"}`);
    }

    console.log(`Setter regression tests passed (${fixtures.length} scenarios)`);
  } catch (error) {
    if (serverOutput.trim()) console.error(serverOutput.trim());
    throw error;
  } finally {
    child.kill();
    await new Promise((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once("exit", resolve);
      setTimeout(resolve, 2000);
    });
    const resolvedDataDir = path.resolve(dataDir);
    const resolvedTempDir = path.resolve(os.tmpdir());
    if (resolvedDataDir.startsWith(`${resolvedTempDir}${path.sep}`)) {
      await fs.rm(resolvedDataDir, { recursive: true, force: true });
    }
  }
}

run().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
