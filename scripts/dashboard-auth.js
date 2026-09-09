const crypto = require("node:crypto");

function equalSecret(actual, expected) {
  return crypto.timingSafeEqual(
    crypto.createHash("sha256").update(String(actual || "")).digest(),
    crypto.createHash("sha256").update(String(expected || "")).digest()
  );
}

function dashboardAuth({ required, username, password }) {
  return (req, res, next) => {
    const protectedRoute = req.path === "/" || req.path.startsWith("/dashboard") || req.path.startsWith("/api/");
    if (!required || !protectedRoute || req.path === "/api/webhooks/booking-confirmed") return next();
    res.setHeader("Cache-Control", "no-store");
    if (!password) return res.status(503).json({ error: "Dashboard login has not been configured." });
    const header = String(req.headers.authorization || "");
    let credentials = "";
    if (header.startsWith("Basic ")) credentials = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = credentials.indexOf(":");
    if (separator >= 0 && equalSecret(credentials.slice(0, separator), username) && equalSecret(credentials.slice(separator + 1), password)) return next();
    res.setHeader("WWW-Authenticate", 'Basic realm="Pulse", charset="UTF-8"');
    return res.status(401).json({ error: "Sign in to Pulse to continue." });
  };
}

module.exports = { dashboardAuth, equalSecret };
