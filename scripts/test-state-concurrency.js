const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function run() {
  const source = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const start = source.indexOf("const storeVersions = new WeakMap();");
  const end = source.indexOf("function normalizeStore(store)", start);
  assert.ok(start >= 0 && end > start);
  let row = { value: { count: 0 }, updated_at: "2026-09-08T00:00:00.000Z" };
  const context = vm.createContext({
    process: { env: { STATE_VERSION_CHECKS: "true" } },
    storeBackend: () => "supabase", ensureSupabaseStore: async () => {},
    normalizeStore: value => structuredClone(value),
    SUPABASE_STATE_TABLE: "app_state", SUPABASE_STATE_KEY: "fixture",
    supabaseRestRequest: async (route, options = {}) => {
      if (options.method === "GET") return [structuredClone(row)];
      assert.equal(options.method, "PATCH");
      const query = new URL("https://fixture.invalid/" + route).searchParams;
      if (query.get("updated_at") !== "eq." + row.updated_at) return [];
      row = JSON.parse(options.body);
      return [{ updated_at: row.updated_at }];
    }
  });
  vm.runInContext(source.slice(start, end), context);
  const first = await context.readStore();
  const stale = await context.readStore();
  first.count = 1;
  await context.writeStore(first);
  stale.count = 999;
  await assert.rejects(context.writeStore(stale), error => error.code === "STATE_CONFLICT");
  assert.equal(row.value.count, 1);
  first.count = 2;
  await context.writeStore(first);
  assert.equal(row.value.count, 2);
  await assert.rejects(context.writeStore({ count: 3 }), /revision missing/);
  console.log("State concurrency: stale writes rejected, current snapshots reusable, unversioned writes blocked");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
