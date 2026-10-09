const crypto = require("crypto");
const http = require("http");
const cloudbase = require("@cloudbase/js-sdk");
const { entitlementForLevel, extractRecord, mapMember } = require("./member-mapper");

const MAX_BODY_BYTES = 256 * 1024;
const envId = process.env.TCB_ENV || process.env.TCBENV || "charmsway-d8g4rudqda2f7525c";
const app = cloudbase.init({
  env: envId,
  accessKey: process.env.CLOUDBASE_APIKEY,
});
const db = app.rdb();

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function secureEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      raw += chunk;
      if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

async function syncMember(member) {
  const { data: existing, error: readError } = await db
    .from("members")
    .select("card_no,level,version")
    .eq("card_no", member.card_no)
    .limit(1);
  if (readError) throw readError;

  if (existing && existing.length > 0) {
    const nextVersion = Number(existing[0].version || 0) + 1;
    const levelChanged = existing[0].level !== member.level;
    const { error } = await db
      .from("members")
      .update({
        ...member,
        ...(levelChanged ? entitlementForLevel(member.level) : {}),
        version: nextVersion,
      })
      .eq("card_no", member.card_no);
    if (error) throw error;
    return "updated";
  }

  const { error } = await db.from("members").insert({
    ...member,
    ...entitlementForLevel(member.level),
    version: 1,
    created_at: new Date().toISOString(),
  });
  if (error) {
    // A concurrent delivery may have inserted the same card number. Retry as an update.
    const { error: retryError } = await db
      .from("members")
      .update(member)
      .eq("card_no", member.card_no);
    if (retryError) throw error;
    return "updated";
  }
  return "inserted";
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (url.pathname !== "/sync/member") {
    sendJson(res, 404, { error: "Not Found" });
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method Not Allowed" });
    return;
  }
  const sharedSecret = process.env.SYNC_SHARED_SECRET || process.env.SYNCSECRET;
  if (!secureEqual(req.headers["x-sync-secret"], sharedSecret)) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const record = extractRecord(body);
    if (record.is_archived === true) {
      sendJson(res, 202, { ok: true, action: "ignored_archived" });
      return;
    }
    const member = mapMember(record);
    const action = await syncMember(member);
    sendJson(res, 200, { ok: true, action, card_no: member.card_no });
  } catch (error) {
    console.error("member sync failed", { message: error && error.message ? error.message : "unknown" });
    sendJson(res, 400, { ok: false, error: "Member sync failed" });
  }
});

server.listen(9000, "0.0.0.0");
