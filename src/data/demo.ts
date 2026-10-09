export type Role = "management" | "member_admin" | "head_nurse";
export type Member = {
  id: string;
  cardNumber: string;
  sourceCardNumber?: string | null;
  name: string;
  consultant: string;
  hasServiceGroup: boolean;
  hasMiniProgramProfile: boolean;
  kind: "prospect" | "member";
  level: "V1" | "V2" | "V3" | "V4" | "V5";
  birthday: string;
  joinedOn: string;
  membershipChangedOn?: string;
  validUntil: string;
  lastVisit: string;
  visits: number;
};
export type Task = {
  id: string;
  memberId: string;
  member: string;
  level: string;
  taskType: string;
  type: string;
  due: string;
  status: "pending" | "completed" | "confirmed" | "superseded" | "cancelled" | "archived";
  owner: string;
  responsibilityRole: "member_admin" | "head_nurse";
};

export const demoMembers: Member[] = [
  {
    id: "m1",
    cardNumber: "QZW5831047296",
    name: "林女士",
    consultant: "张顾问",
    hasServiceGroup: true,
    hasMiniProgramProfile: true,
    kind: "member",
    level: "V5",
    birthday: "1988-10-08",
    joinedOn: "2023-03-12",
    validUntil: "2027-03-11",
    lastVisit: "2026-09-28",
    visits: 18,
  },
  {
    id: "m2",
    cardNumber: "QZW2719460358",
    name: "陈女士",
    consultant: "李顾问",
    hasServiceGroup: true,
    hasMiniProgramProfile: true,
    kind: "member",
    level: "V4",
    birthday: "1991-04-16",
    joinedOn: "2024-01-08",
    validUntil: "2027-01-07",
    lastVisit: "2026-10-01",
    visits: 12,
  },
  {
    id: "m3",
    cardNumber: "QZW8043175629",
    name: "周女士",
    consultant: "张顾问",
    hasServiceGroup: false,
    hasMiniProgramProfile: true,
    kind: "member",
    level: "V5",
    birthday: "1985-12-03",
    joinedOn: "2022-09-21",
    validUntil: "2026-10-01",
    lastVisit: "2026-10-01",
    visits: 26,
  },
  {
    id: "m4",
    cardNumber: "QZW4196827503",
    name: "王女士",
    consultant: "王顾问",
    hasServiceGroup: true,
    hasMiniProgramProfile: true,
    kind: "member",
    level: "V3",
    birthday: "1994-10-21",
    joinedOn: "2025-02-17",
    validUntil: "2027-02-16",
    lastVisit: "2026-09-30",
    visits: 7,
  },
  {
    id: "m5",
    cardNumber: "QZW9362051847",
    name: "赵女士",
    consultant: "李顾问",
    hasServiceGroup: false,
    hasMiniProgramProfile: true,
    kind: "member",
    level: "V2",
    birthday: "1990-07-11",
    joinedOn: "2025-06-01",
    validUntil: "2026-12-31",
    lastVisit: "2026-09-18",
    visits: 4,
  },
];

export function createDemoCardNumber() {
  const values = crypto.getRandomValues(new Uint32Array(2));
  const randomNumber =
    ((BigInt(values[0]) << 32n) | BigInt(values[1])) % 10_000_000_000n;
  return `QZW${randomNumber.toString().padStart(10, "0")}`;
}

export const demoTasks: Task[] = [
  {
    id: "t1",
    memberId: "m1",
    member: "林女士",
    level: "V5",
    taskType: "followup_d3",
    type: "D3 回访",
    due: "2026-09-30",
    status: "pending",
    owner: "张顾问",
    responsibilityRole: "member_admin",
  },
  {
    id: "t2",
    memberId: "m2",
    member: "陈女士",
    level: "V4",
    taskType: "care_d0",
    type: "D0 护理确认",
    due: "2026-10-01",
    status: "pending",
    owner: "护士长",
    responsibilityRole: "head_nurse",
  },
  {
    id: "t3",
    memberId: "m3",
    member: "周女士",
    level: "V5",
    taskType: "validity_7d",
    type: "有效期提醒",
    due: "2026-10-01",
    status: "pending",
    owner: "张顾问",
    responsibilityRole: "member_admin",
  },
  {
    id: "t4",
    memberId: "m4",
    member: "王女士",
    level: "V3",
    taskType: "birthday_notify",
    type: "生日礼告知",
    due: "2026-10-01",
    status: "pending",
    owner: "会员中心",
    responsibilityRole: "member_admin",
  },
  {
    id: "t5",
    memberId: "m5",
    member: "赵女士",
    level: "V2",
    taskType: "share_benefit_7d",
    type: "分享权益剩余 7 天提醒",
    due: "2025-09-01",
    status: "pending",
    owner: "会员中心",
    responsibilityRole: "member_admin",
  },
];
