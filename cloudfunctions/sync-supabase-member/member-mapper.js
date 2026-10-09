const LEVEL_LABELS = Object.freeze({
  PROSPECT: "准会员",
  V1: "一星会员",
  V2: "二星会员",
  V3: "三星会员",
  V4: "四星会员",
  V5: "五星会员",
  V6: "六星会员",
});

const PROJECTS = Object.freeze({
  ccLight: { id: "cc-light", name: "CC 光" },
  sevenColorBottle: { id: "seven-color-bottle", name: "七色瓶" },
  blackGoldPhoton: { id: "black-gold-photon", name: "黑金超光子" },
  goldCannon: { id: "gold-cannon", name: "大金炮两刀两炮" },
  jiesuoOrange: { id: "jiesuo-orange", name: "解索橙除皱年卡" },
  juvedermVolift: { id: "juvederm-volift", name: "乔雅登越致" },
  caha: { id: "caha", name: "CAHA" },
});

function entitlementForLevel(level) {
  const basicProjects = [PROJECTS.ccLight];
  if (["V1", "V2", "V3", "V4", "V5", "V6"].includes(level)) basicProjects.push(PROJECTS.sevenColorBottle);
  if (["V2", "V3", "V4", "V5", "V6"].includes(level)) basicProjects.push(PROJECTS.blackGoldPhoton);
  if (["V3", "V4", "V5", "V6"].includes(level)) basicProjects.push(PROJECTS.goldCannon);

  const advancedProjects = [];
  if (["V4", "V5", "V6"].includes(level)) advancedProjects.push(PROJECTS.jiesuoOrange);
  if (["V5", "V6"].includes(level)) advancedProjects.push(PROJECTS.juvedermVolift);
  if (level === "V6") advancedProjects.push(PROJECTS.caha);

  const rules = {
    basic: { id: "basic", label: "基础权益池", total: 3, projects: basicProjects },
  };
  if (advancedProjects.length > 0) {
    rules.advanced = { id: "advanced", label: "进阶权益池", total: 2, projects: advancedProjects };
  }

  return {
    pool_totals: { basic: 3, advanced: advancedProjects.length > 0 ? 2 : 0 },
    rules,
  };
}

function requireText(value, fieldName) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${fieldName} is required`);
  return text;
}

function toIsoTimestamp(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const parsed = new Date(dateOnly ? `${text}T00:00:00+08:00` : text);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid date: ${text}`);
  return parsed.toISOString();
}

function addCalendarMonths(value, months) {
  if (!value) return null;
  const source = new Date(toIsoTimestamp(value));
  const result = new Date(source);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result.toISOString();
}

function mapMember(record) {
  if (!record || typeof record !== "object") throw new Error("record is required");
  const cardNo = requireText(record.source_card_number || record.member_card_number, "card_no");
  const level = record.member_kind === "prospect" ? "PROSPECT" : requireText(record.level, "level");
  if (!Object.hasOwn(LEVEL_LABELS, level)) throw new Error(`Unsupported level: ${level}`);

  const joinedAt = toIsoTimestamp(record.joined_on || record.created_at);
  if (!joinedAt) throw new Error("joined_at is required");
  const changedAt = toIsoTimestamp(record.membership_changed_on || record.joined_on || record.created_at);

  return {
    id: requireText(record.id, "id"),
    card_no: cardNo,
    name: requireText(record.name, "name"),
    organization: "",
    gender: "",
    level,
    level_label: LEVEL_LABELS[level],
    joined_at: joinedAt,
    membership_changed_at: changedAt,
    membership_expires_at: toIsoTimestamp(record.valid_until),
    benefit_expires_at: addCalendarMonths(changedAt, 3),
    benefit_never_expires: false,
    updated_at: new Date().toISOString(),
  };
}

function extractRecord(body) {
  if (!body || typeof body !== "object") throw new Error("JSON body is required");
  const eventType = String(body.type || body.eventType || "").toUpperCase();
  if (eventType && eventType !== "INSERT" && eventType !== "UPDATE") {
    throw new Error(`Unsupported event type: ${eventType}`);
  }
  return body.record || body.new || body;
}

module.exports = { LEVEL_LABELS, addCalendarMonths, entitlementForLevel, extractRecord, mapMember, toIsoTimestamp };
