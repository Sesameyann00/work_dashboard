const test = require("node:test");
const assert = require("node:assert/strict");
const { entitlementForLevel, extractRecord, mapMember } = require("./member-mapper");

test("maps a Supabase member webhook record", () => {
  const mapped = mapMember({
    id: "11111111-1111-1111-1111-111111111111",
    name: "测试会员",
    phone: "188 5113 1079",
    source_card_number: "CARD-001",
    member_card_number: "QZW0000000001",
    member_kind: "member",
    level: "V2",
    joined_on: "2026-10-09",
    membership_changed_on: "2026-10-09",
    valid_until: "2027-10-09",
  });
  assert.equal(mapped.card_no, "CARD-001");
  assert.equal(mapped.phone, "18851131079");
  assert.equal(mapped.level, "V2");
  assert.equal(mapped.level_label, "二星会员");
  assert.equal(mapped.joined_at, "2026-10-08T16:00:00.000Z");
  assert.equal(mapped.membership_changed_at, "2026-10-08T16:00:00.000Z");
  assert.equal(mapped.benefit_expires_at, "2027-01-08T16:00:00.000Z");
});

test("maps prospects into the PROSPECT level", () => {
  const mapped = mapMember({
    id: "22222222-2222-2222-2222-222222222222",
    name: "准会员",
    phone: "18800330106",
    member_card_number: "QZW0000000002",
    member_kind: "prospect",
    level: "V1",
    joined_on: "2026-10-09",
  });
  assert.equal(mapped.level, "PROSPECT");
  assert.equal(mapped.level_label, "准会员");
});

test("rejects records without a valid mainland China mobile number", () => {
  assert.throws(() => mapMember({
    id: "33333333-3333-3333-3333-333333333333",
    name: "缺少手机号",
    phone: "",
    member_card_number: "QZW0000000003",
    member_kind: "member",
    level: "V1",
    joined_on: "2026-10-09",
  }), /phone is invalid/);
});

test("extracts INSERT and UPDATE webhook records", () => {
  const record = { id: "member-id" };
  assert.equal(extractRecord({ type: "INSERT", record }), record);
  assert.equal(extractRecord({ type: "UPDATE", record }), record);
  assert.throws(() => extractRecord({ type: "DELETE", old_record: record }), /Unsupported event/);
});

test("assigns guest-card pools and projects from membership level", () => {
  assert.deepEqual(entitlementForLevel("V1").pool_totals, { basic: 3, advanced: 0 });
  assert.deepEqual(entitlementForLevel("V4").pool_totals, { basic: 3, advanced: 2 });
  assert.equal(entitlementForLevel("V5").rules.advanced.projects.length, 2);
  assert.equal(entitlementForLevel("V6").rules.advanced.projects.length, 3);
});
