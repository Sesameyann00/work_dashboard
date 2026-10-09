const test = require("node:test");
const assert = require("node:assert/strict");
const { entitlementForLevel, extractRecord, mapMember } = require("./member-mapper");

test("maps a Supabase member webhook record", () => {
  const mapped = mapMember({
    id: "11111111-1111-1111-1111-111111111111",
    name: "测试会员",
    source_card_number: "CARD-001",
    member_card_number: "QZW0000000001",
    member_kind: "member",
    level: "V2",
    joined_on: "2026-10-09",
    membership_changed_on: "2026-10-09",
    valid_until: "2027-10-09",
  });
  assert.equal(mapped.card_no, "CARD-001");
  assert.equal(mapped.level, "V2");
  assert.equal(mapped.level_label, "二星会员");
  assert.equal(mapped.benefit_expires_at, "2027-01-08T16:00:00.000Z");
});

test("maps prospects into the PROSPECT level", () => {
  const mapped = mapMember({
    id: "22222222-2222-2222-2222-222222222222",
    name: "准会员",
    member_card_number: "QZW0000000002",
    member_kind: "prospect",
    level: "V1",
    joined_on: "2026-10-09",
  });
  assert.equal(mapped.level, "PROSPECT");
  assert.equal(mapped.level_label, "准会员");
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
