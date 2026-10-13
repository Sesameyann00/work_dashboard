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
  const [cardResult, phoneResult] = await Promise.all([
    db.from("members").select("id,card_no,phone,level,version").eq("card_no", member.card_no).limit(1),
    db.from("members").select("id,card_no,phone,level,version").eq("phone", member.phone).limit(1),
  ]);
  if (cardResult.error) throw cardResult.error;
  if (phoneResult.error) throw phoneResult.error;

  const cardMatch = cardResult.data && cardResult.data[0];
  const phoneMatch = phoneResult.data && phoneResult.data[0];
  if (cardMatch && phoneMatch && cardMatch.id !== phoneMatch.id) {
    throw new Error("card number and phone resolve to different members");
  }
  const existing = cardMatch || phoneMatch;

  if (existing) {
    const nextVersion = Number(existing.version || 0) + 1;
    const levelChanged = existing.level !== member.level;
    const { error } = await db
      .from("members")
      .update({
        ...member,
        id: existing.id,
        ...(levelChanged ? entitlementForLevel(member.level) : {}),
        version: nextVersion,
      })
      .eq("id", existing.id);
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
    // A concurrent delivery may have inserted the same card number or phone.
    const { data: concurrent, error: lookupError } = await db
      .from("members")
      .select("id")
      .eq("phone", member.phone)
      .limit(1);
    if (lookupError || !concurrent || concurrent.length === 0) throw error;
    const { error: retryError } = await db
      .from("members")
      .update({ ...member, id: concurrent[0].id })
      .eq("id", concurrent[0].id);
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
