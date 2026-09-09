const assert = require("node:assert/strict");
const { dashboardAuth } = require("./dashboard-auth");
const check = (path, authorization, password = "fixture-only") => {
  let status = 200;
  let allowed = false;
  const res = { setHeader() {}, status(code) { status = code; return this; }, json() {} };
  dashboardAuth({ required: true, username: "admin", password })({ path, headers: { authorization } }, res, () => { allowed = true; });
  return { status, allowed };
};
assert.equal(check("/api/conversations").status, 401);
assert.equal(check("/dashboard", "Basic " + Buffer.from("admin:wrong").toString("base64")).status, 401);
assert.equal(check("/api/conversations", "Basic " + Buffer.from("admin:fixture-only").toString("base64")).allowed, true);
assert.equal(check("/", "", "").status, 503);
assert.equal(check("/webhook/zernio").allowed, true);
assert.equal(check("/discovery").allowed, true);
console.log("Dashboard auth: anonymous/wrong credentials blocked, authenticated requests and provider callbacks preserved");
