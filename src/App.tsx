import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Database,
  FileSpreadsheet,
  Gift,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  demoMembers,
  demoTasks,
  type Member,
  type Role,
  type Task,
} from "./data/demo";
import { hasSupabaseConfig } from "./lib/supabase";
import { getMyProfile, listMembers, restoreSession, signIn } from "./lib/api";
import "./App.css";
import "./extended.css";

type Page =
  "dashboard" | "members" | "tasks" | "visits" | "import" | "settings";
const roleNames: Record<Role, string> = {
  management: "管理层",
  member_admin: "会员中心主管",
  head_nurse: "护士长",
};
const trend = [
  { month: "4月", visits: 86 },
  { month: "5月", visits: 104 },
  { month: "6月", visits: 96 },
  { month: "7月", visits: 112 },
  { month: "8月", visits: 139 },
  { month: "9月", visits: 164 },
];

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [role, setRole] = useState<Role>("member_admin");
  const [page, setPage] = useState<Page>("dashboard");
  const [members, setMembers] = useState(demoMembers);
  const [tasks, setTasks] = useState(demoTasks);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState("");
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    restoreSession()
      .then((profile) => {
        if (profile) {
          setRole(profile.role as Role);
          setLoggedIn(true);
        }
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (!loggedIn || !hasSupabaseConfig) return;
    listMembers()
      .then((rows) =>
        setMembers(
          rows.map((row) => ({
            id: row.id,
            name: row.name,
            phone: row.phone,
            consultant: row.consultant || "",
            level: row.level,
            birthday: row.birthday || "",
            joinedOn: row.joined_on || "",
            validUntil: row.valid_until || "",
            lastVisit: row.last_visit_date || "—",
            visits: row.visit_count,
          })),
        ),
      )
      .catch(() => notify("真实会员数据加载失败，已保留当前页面数据"));
  }, [loggedIn]);

  if (!loggedIn)
    return (
      <Login
        onLogin={(nextRole) => {
          setRole(nextRole);
          setLoggedIn(true);
        }}
      />
    );

  const nav = [
    { id: "dashboard" as Page, label: "经营首页", icon: LayoutDashboard },
    { id: "members" as Page, label: "会员管理", icon: UsersRound },
    {
      id: "tasks" as Page,
      label: "服务任务",
      icon: ClipboardCheck,
      badge: tasks.filter((t) => t.status === "pending").length,
    },
    { id: "visits" as Page, label: "治疗到诊", icon: CalendarDays },
    { id: "import" as Page, label: "数据导入", icon: FileSpreadsheet },
  ].filter(
    (item) => role !== "head_nurse" || ["dashboard", "tasks"].includes(item.id),
  );

  return (
    <div className="app-shell">
      <button
        className="mobile-menu"
        aria-label="打开导航"
        onClick={() => setMobileOpen(true)}
      >
        <Menu size={21} />
      </button>
      <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">千</div>
          <div>
            <strong>千姿薇</strong>
            <span>会员管理系统</span>
          </div>
          <button
            className="sidebar-close"
            aria-label="关闭导航"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} />
          </button>
        </div>
        <nav aria-label="主导航">
          <p className="nav-label">工作台</p>
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={page === item.id ? "nav-item active" : "nav-item"}
                onClick={() => {
                  setPage(item.id);
                  setMobileOpen(false);
                }}
              >
                <Icon size={19} />
                <span>{item.label}</span>
                {item.badge !== undefined && <em>{item.badge}</em>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={page === "settings" ? "nav-item active" : "nav-item"}
            onClick={() => setPage("settings")}
          >
            <Settings size={19} />
            <span>系统设置</span>
          </button>
          <div className="user-card">
            <div className="avatar">{roleNames[role][0]}</div>
            <div>
              <strong>演示账号</strong>
              <span>{roleNames[role]}</span>
            </div>
            <button
              className="logout"
              aria-label="退出登录"
              onClick={() => setLoggedIn(false)}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="scrim"
          aria-label="关闭导航"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">2026年10月1日 · 星期四</p>
            <h1>{nav.find((n) => n.id === page)?.label || "系统设置"}</h1>
          </div>
          <div className="top-actions">
            <label className="search-box">
              <Search size={18} />
              <input aria-label="全局搜索" placeholder="搜索会员姓名或手机号" />
              <kbd>⌘ K</kbd>
            </label>
            <button className="icon-button" aria-label="通知">
              <Bell size={19} />
              <span />
            </button>
            <select
              className="role-switch"
              aria-label="切换演示角色"
              value={role}
              onChange={(e) => {
                setRole(e.target.value as Role);
                setPage("dashboard");
              }}
            >
              <option value="member_admin">会员中心主管</option>
              <option value="head_nurse">护士长</option>
              <option value="management">管理层</option>
            </select>
          </div>
        </header>
        <div className="content">
          {!hasSupabaseConfig && (
            <div className="demo-banner">
              <Database size={15} />
              <span>
                当前为本地演示模式；配置 Supabase 环境变量后使用真实数据。
              </span>
            </div>
          )}
          {page === "dashboard" && (
            <Dashboard
              members={members}
              tasks={tasks}
              role={role}
              onNavigate={setPage}
            />
          )}
          {page === "members" && (
            <Members
              members={members}
              role={role}
              onMembers={setMembers}
              notify={notify}
            />
          )}
          {page === "tasks" && (
            <Tasks
              tasks={tasks}
              role={role}
              onTasks={setTasks}
              notify={notify}
            />
          )}
          {page === "visits" && (
            <Visits
              members={members}
              tasks={tasks}
              role={role}
              onMembers={setMembers}
              onTasks={setTasks}
              notify={notify}
            />
          )}
          {page === "import" && <ImportPage role={role} notify={notify} />}
          {page === "settings" && <SettingsPage />}
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function Login({ onLogin }: { onLogin: (role: Role) => void }) {
  const [username, setUsername] = useState("vip001");
  const [password, setPassword] = useState("Demo123!");
  const [role, setRole] = useState<Role>("member_admin");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || password.length < 8) {
      setError("请输入登录名和至少 8 位密码");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (hasSupabaseConfig) {
        await signIn(username, password);
        const profile = await getMyProfile();
        onLogin(profile.role as Role);
      } else onLogin(role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="login-page">
      <div className="login-brand">
        <div className="brand-mark">千</div>
        <strong>千姿薇</strong>
        <span>会员管理系统</span>
      </div>
      <form className="login-card" onSubmit={submit}>
        <p className="login-kicker">内部工作台</p>
        <h1>登录系统</h1>
        <p className="login-note">使用管理员分配的登录名和密码。</p>
        <label>
          登录名
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label>
          密码
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {!hasSupabaseConfig && (
          <label>
            演示角色
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="member_admin">会员中心主管</option>
              <option value="head_nurse">护士长</option>
              <option value="management">管理层</option>
            </select>
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
        <button className="login-button" disabled={busy}>
          {busy ? "正在登录…" : "登录"}
        </button>
        <small>
          {hasSupabaseConfig
            ? "已连接 Supabase"
            : "演示账号已预填，不连接真实会员数据"}
        </small>
      </form>
    </div>
  );
}

function Dashboard({
  members,
  tasks,
  role,
  onNavigate,
}: {
  members: Member[];
  tasks: Task[];
  role: Role;
  onNavigate: (p: Page) => void;
}) {
  const pending = tasks.filter((t) => t.status === "pending");
  const overdue = pending.filter((t) => t.due < "2026-10-01").length;
  const levelCounts = ["V1", "V2", "V3", "V4", "V5"].map((level) => ({
    level,
    count: members.filter((m) => m.level === level).length,
  }));
  return (
    <>
      <section className="intro-row">
        <div>
          <h2>经营概览</h2>
          <p>
            {role === "head_nurse"
              ? "聚焦今日 D0 护理确认。"
              : "关注会员体系健康度与今日服务执行。"}
          </p>
        </div>
        <div className="data-status">
          <span /> 数据截至 09:30
        </div>
      </section>
      <section className="metrics">
        <Metric
          label="会员总数"
          value={String(members.length)}
          note="当前有效会员"
          icon={UsersRound}
          accent="purple"
        />
        <Metric
          label="本月到诊会员"
          value="164"
          note="较上月 +18.0%"
          icon={TrendingUp}
          accent="blue"
        />
        <Metric
          label="服务完成率"
          value="92.6%"
          note="目标 95%"
          icon={ClipboardCheck}
          accent="green"
        />
        <Metric
          label="逾期任务"
          value={String(overdue)}
          note="需优先处理"
          icon={Clock3}
          accent="red"
        />
      </section>
      <section className="dashboard-grid">
        <article className="panel">
          <PanelHeading title="会员结构" subtitle="当前有效会员等级分布" />
          <div className="level-list">
            {levelCounts.map((x) => (
              <div className="level-row" key={x.level}>
                <div className="level-name">
                  <span />
                  {x.level}
                </div>
                <div className="level-track">
                  <i
                    style={{
                      width: `${Math.max((x.count / members.length) * 100, 4)}%`,
                    }}
                  />
                </div>
                <strong>{x.count}</strong>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <PanelHeading
            title="会员活跃趋势"
            subtitle="近 6 个月去重到诊会员数"
          />
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={trend}
                margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
              >
                <CartesianGrid vertical={false} stroke="#eceaf0" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="visits"
                  stroke="#5b438f"
                  fill="#e9e1f4"
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>
      <section className="execution-section">
        <div className="section-heading">
          <div>
            <h2>今日执行中心</h2>
            <p>共 {pending.length} 项待处理任务</p>
          </div>
          <button className="text-button" onClick={() => onNavigate("tasks")}>
            查看全部任务
          </button>
        </div>
        <div className="task-grid">
          <TaskSummary
            title="术后服务"
            count={pending.filter((t) => t.type.includes("回访")).length}
            icon={ClipboardCheck}
          />
          <TaskSummary
            title="D0 护理确认"
            count={pending.filter((t) => t.type.includes("D0")).length}
            icon={ShieldCheck}
          />
          <TaskSummary
            title="生日礼"
            count={pending.filter((t) => t.type.includes("生日")).length}
            icon={Gift}
          />
          <TaskSummary
            title="权益到期提醒"
            count={
              pending.filter(
                (t) => t.type.includes("有效期") || t.type.includes("权益到期"),
              ).length
            }
            icon={CalendarDays}
          />
        </div>
      </section>
    </>
  );
}

function Members({
  members,
  role,
  onMembers,
  notify,
}: {
  members: Member[];
  role: Role;
  onMembers: (m: Member[]) => void;
  notify: (s: string) => void;
}) {
  const [view, setView] = useState<"service" | "manage">("service");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Member | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const filtered = members.filter((m) =>
    `${m.name}${m.phone}${m.consultant}`.includes(query),
  );
  const add = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const phone = String(data.get("phone")).replace(/\D/g, "");
    if (members.some((m) => m.phone === phone)) {
      notify("手机号已存在");
      return;
    }
    onMembers([
      ...members,
      {
        id: crypto.randomUUID(),
        name: String(data.get("name")),
        phone,
        consultant: String(data.get("consultant")),
        level: String(data.get("level")) as Member["level"],
        birthday: String(data.get("birthday")),
        joinedOn: String(data.get("joinedOn")),
        validUntil: String(data.get("validUntil")),
        lastVisit: "—",
        visits: 0,
      },
    ]);
    setShowAdd(false);
    notify("会员已创建");
  };
  return (
    <>
      <section className="page-heading">
        <div>
          <h2>会员管理</h2>
          <p>会员档案是系统唯一数据源。</p>
        </div>
        {role === "member_admin" && (
          <button
            className="primary-action"
            onClick={() => setShowAdd(!showAdd)}
          >
            <UserRound size={17} />
            新增会员
          </button>
        )}
      </section>
      {showAdd && (
        <form className="inline-form panel" onSubmit={add}>
          <label>
            姓名
            <input name="name" required />
          </label>
          <label>
            手机号
            <input name="phone" required pattern="[0-9 +()-]{7,20}" />
          </label>
          <label>
            所属咨询
            <input name="consultant" />
          </label>
          <label>
            等级
            <select name="level">
              {["V1", "V2", "V3", "V4", "V5"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            生日
            <input name="birthday" type="date" />
          </label>
          <label>
            入会日期
            <input name="joinedOn" type="date" />
          </label>
          <label>
            有效期
            <input name="validUntil" type="date" />
          </label>
          <button className="primary-action">保存会员</button>
        </form>
      )}
      <div className="toolbar">
        <div className="tabs">
          <button
            className={view === "service" ? "active" : ""}
            onClick={() => setView("service")}
          >
            服务执行视图
          </button>
          <button
            className={view === "manage" ? "active" : ""}
            onClick={() => setView("manage")}
          >
            会员管理视图
          </button>
        </div>
        <input
          placeholder="搜索姓名、手机号或所属咨询"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className={`panel data-table ${view === "manage" ? "members-manage" : ""}`}>
        <div className="data-row data-head">
          <span>会员</span>
          <span>等级</span>
          {view === "service" ? (
            <>
              <span>最近到诊</span>
              <span>当前任务</span>
              <span>状态</span>
            </>
          ) : (
            <>
              <span>所属咨询</span>
              <span>有效期</span>
              <span>最近到诊</span>
              <span>到诊次数</span>
            </>
          )}
        </div>
        {filtered.map((m) => (
          <button
            className="data-row"
            key={m.id}
            onClick={() => setSelected(m)}
          >
            <span>
              <strong>{m.name}</strong>
              <small>{m.phone}</small>
            </span>
            <span>
              <b className={`level-badge ${m.level}`}>{m.level}</b>
            </span>
            {view === "service" ? (
              <>
                <span>{m.lastVisit}</span>
                <span>{m.level === "V5" ? "优先服务" : "—"}</span>
                <span>
                  <em className="status">正常</em>
                </span>
              </>
            ) : (
              <>
                <span>{m.consultant || "—"}</span>
                <span>{m.validUntil}</span>
                <span>{m.lastVisit}</span>
                <span>{m.visits}</span>
              </>
            )}
          </button>
        ))}
      </div>
      {selected && (
        <MemberDetail member={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function MemberDetail({
  member,
  onClose,
}: {
  member: Member;
  onClose: () => void;
}) {
  return (
    <div className="drawer">
      <div className="drawer-head">
        <div>
          <span className={`level-badge ${member.level}`}>{member.level}</span>
          <h2>{member.name}</h2>
          <p>{member.phone}</p>
        </div>
        <button className="icon-button" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="detail-grid">
        <span>
          所属咨询<strong>{member.consultant || "—"}</strong>
        </span>
        <span>
          生日<strong>{member.birthday}</strong>
        </span>
        <span>
          入会日期<strong>{member.joinedOn}</strong>
        </span>
        <span>
          有效期<strong>{member.validUntil}</strong>
        </span>
        <span>
          累计到诊<strong>{member.visits} 次</strong>
        </span>
      </div>
      <h3>服务时间轴</h3>
      <div className="timeline">
        <p>
          <i />
          2026-10-01　D0 护理确认 · <b>待确认</b>
        </p>
        <p>
          <i />
          2026-09-28　会员到诊 · <b>已到诊</b>
        </p>
        <p>
          <i />
          2026-09-29　D1 回访 · <b>已完成</b>
        </p>
        <p>
          <i />
          2026-09-12　季度满意度问卷 · <b>已完成</b>
        </p>
      </div>
    </div>
  );
}

function Tasks({
  tasks,
  role,
  onTasks,
  notify,
}: {
  tasks: Task[];
  role: Role;
  onTasks: (t: Task[]) => void;
  notify: (s: string) => void;
}) {
  const visible =
    role === "head_nurse" ? tasks.filter((t) => t.owner === "护士长") : tasks;
  const [filter, setFilter] = useState("all");
  const shown = visible.filter(
    (t) =>
      filter === "all" ||
      (filter === "overdue"
        ? t.due < "2026-10-01" && t.status === "pending"
        : t.status === filter),
  );
  const act = (task: Task) => {
    if (role === "management") {
      notify("管理层账号为只读");
      return;
    }
    if (task.owner === "护士长" && role !== "head_nurse") {
      notify("D0 仅护士长可以确认");
      return;
    }
    if (task.owner === "会员中心" && role !== "member_admin") {
      notify("该任务由会员中心处理");
      return;
    }
    onTasks(
      tasks.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status: task.owner === "护士长" ? "confirmed" : "completed",
            }
          : t,
      ) as Task[],
    );
    notify(task.owner === "护士长" ? "D0 已确认" : "任务已完成");
  };
  const confirmAll = () => {
    onTasks(
      tasks.map((t) =>
        t.owner === "护士长" && t.status === "pending"
          ? { ...t, status: "confirmed" }
          : t,
      ) as Task[],
    );
    notify("已批量确认全部待处理 D0");
  };
  return (
    <>
      <section className="page-heading">
        <div>
          <h2>{role === "head_nurse" ? "D0 护理确认" : "服务任务"}</h2>
          <p>逾期优先，再按会员等级与到期时间排序。</p>
        </div>
        {role === "head_nurse" && (
          <button className="primary-action" onClick={confirmAll}>
            批量确认 D0
          </button>
        )}
      </section>
      <div className="toolbar">
        <div className="tabs">
          {[
            ["all", "全部"],
            ["pending", "待处理"],
            ["overdue", "已逾期"],
            ["completed", "已完成"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "active" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="panel data-table task-table">
        <div className="data-row data-head">
          <span>会员</span>
          <span>任务</span>
          <span>责任人</span>
          <span>到期日</span>
          <span>操作</span>
        </div>
        {shown.map((t) => (
          <div className="data-row" key={t.id}>
            <span>
              <strong>{t.member}</strong>
              <small>{t.level} 会员</small>
            </span>
            <span>{t.type}</span>
            <span>{t.owner}</span>
            <span
              className={
                t.status === "pending" && t.due < "2026-10-01"
                  ? "danger-text"
                  : ""
              }
            >
              {t.due}
            </span>
            <span>
              {t.status === "pending" ? (
                <button className="small-action" onClick={() => act(t)}>
                  {t.owner === "护士长" ? "确认" : "完成"}
                </button>
              ) : (
                <em className="status">
                  {t.status === "confirmed" ? "已确认" : "已完成"}
                </em>
              )}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function Visits({
  members,
  tasks,
  role,
  onMembers,
  onTasks,
  notify,
}: {
  members: Member[];
  tasks: Task[];
  role: Role;
  onMembers: (m: Member[]) => void;
  onTasks: (t: Task[]) => void;
  notify: (s: string) => void;
}) {
  const [phone, setPhone] = useState("");
  const member = members.find((m) => m.phone === phone.replace(/\D/g, ""));
  const today = "2026-10-01";
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (role !== "member_admin" || !member) return;
    const date = String(new FormData(e.currentTarget).get("date"));
    onMembers(
      members.map((m) =>
        m.id === member.id
          ? {
              ...m,
              lastVisit: date,
              visits: m.visits + (date === m.lastVisit ? 0 : 1),
            }
          : m,
      ),
    );
    const offsets = [0, 1, 3, 7, 15, 30];
    const labels = [
      "D0 护理确认",
      "D1 回访",
      "D3 回访",
      "D7 回访",
      "D15 回访",
      "D30 回访",
    ];
    const base = new Date(`${date}T00:00:00`);
    const fresh = offsets.map((offset, i) => {
      const d = new Date(base);
      d.setDate(d.getDate() + offset);
      return {
        id: crypto.randomUUID(),
        memberId: member.id,
        member: member.name,
        level: member.level,
        type: labels[i],
        due: d.toISOString().slice(0, 10),
        status: "pending" as const,
        owner: (i === 0 ? "护士长" : "会员中心") as Task["owner"],
      };
    });
    onTasks([
      ...tasks.map((t) =>
        t.memberId === member.id && t.status === "pending"
          ? { ...t, status: "superseded" as const }
          : t,
      ),
      ...fresh,
    ]);
    notify("治疗到诊与 D0–D30 服务周期已创建");
    setPhone("");
  };
  return (
    <>
      <section className="page-heading">
        <div>
          <h2>新增治疗到诊</h2>
          <p>只有实际治疗才计入到诊统计，并自动生成术后服务周期。</p>
        </div>
      </section>
      <div className="operation-grid">
        <form className="panel operation-card" onSubmit={submit}>
          <label>
            会员手机号
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="输入完整手机号"
              required
            />
          </label>
          {phone && (
            <div className={member ? "match-card" : "match-card error"}>
              {member ? (
                <>
                  <strong>{member.name}</strong>
                  <span>
                    {member.level} · 最近治疗到诊 {member.lastVisit}
                  </span>
                </>
              ) : (
                <>未找到会员，请先建立会员档案</>
              )}
            </div>
          )}
          <label>
            治疗日期
            <input name="date" type="date" defaultValue={today} required />
          </label>
          <button
            className="primary-action wide"
            disabled={!member || role !== "member_admin"}
          >
            保存治疗并创建服务周期
          </button>
        </form>
        <article className="panel info-card">
          <ShieldCheck size={25} />
          <h3>统计口径</h3>
          <p>
            系统不记录复查、面诊、领取礼品或活动体验等非治疗型到诊。保存治疗会在同一事务中写入治疗到诊和六项服务任务；再次治疗会覆盖旧周期未完成任务。
          </p>
        </article>
      </div>
    </>
  );
}

function ImportPage({
  role,
  notify,
}: {
  role: Role;
  notify: (s: string) => void;
}) {
  const [result, setResult] = useState<{
    rows: number;
    errors: string[];
  } | null>(null);
  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { default: readXlsxFile } = await import("read-excel-file");
      const rows = await readXlsxFile(file);
      const headers = rows[0]?.map(String) || [];
      const required = ["姓名", "手机号", "会员等级"];
      const missing = required.filter((x) => !headers.includes(x));
      setResult({
        rows: Math.max(rows.length - 1, 0),
        errors: missing.map((x) => `缺少必填列：${x}`),
      });
      notify(
        missing.length
          ? "文件校验完成，存在错误"
          : "文件校验通过，可进入导入队列",
      );
    } catch {
      setResult({
        rows: 0,
        errors: ["无法读取文件，请确认是有效的 .xlsx 文件"],
      });
    }
  };
  return (
    <>
      <section className="page-heading">
        <div>
          <h2>Excel 数据导入</h2>
          <p>先校验和预览，再分批写入；错误行不会静默丢失。</p>
        </div>
      </section>
      <div className="panel import-card">
        <FileSpreadsheet size={34} />
        <h3>会员档案与历史治疗</h3>
        <p>
          必填列：姓名、手机号、会员等级。支持附带所属咨询、生日、入会日期、有效期和历史治疗日期。
        </p>
        <label className="upload-button">
          选择 .xlsx 文件
          <input
            type="file"
            accept=".xlsx"
            disabled={role !== "member_admin"}
            onChange={handle}
          />
        </label>
        {role !== "member_admin" && <small>当前角色没有导入权限</small>}
        {result && (
          <div
            className={
              result.errors.length ? "import-result error" : "import-result"
            }
          >
            <strong>读取 {result.rows} 行</strong>
            {result.errors.length ? (
              result.errors.map((x) => <p key={x}>{x}</p>)
            ) : (
              <p>字段完整，正式环境将创建导入批次并逐行去重。</p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function SettingsPage() {
  return (
    <>
      <section className="page-heading">
        <div>
          <h2>系统设置</h2>
          <p>生产接入与上线检查。</p>
        </div>
      </section>
      <div className="settings-grid">
        <article className="panel setting-card">
          <Database />
          <h3>Supabase</h3>
          <p>
            {hasSupabaseConfig
              ? "已配置项目连接"
              : "尚未配置；复制 .env.example 为 .env.local 后填写项目参数。"}
          </p>
        </article>
        <article className="panel setting-card">
          <ShieldCheck />
          <h3>安全基线</h3>
          <p>RLS、固定角色、事务函数与操作审计已包含在版本化迁移中。</p>
        </article>
        <article className="panel setting-card">
          <Clock3 />
          <h3>定时任务</h3>
          <p>每天上海时间 00:05 生成提醒，00:20 汇总趋势指标。</p>
        </article>
      </div>
      <div className="panel launch-checklist">
        <h3>正式上线门槛</h3>
        {[
          "连接开发与生产 Supabase 项目",
          "使用脱敏真实样表完成导入演练",
          "创建三角色账号并完成权限测试",
          "执行备份恢复演练",
          "完成 3 个工作日试运行",
        ].map((x, i) => (
          <p key={x}>
            <span>{i + 1}</span>
            {x}
          </p>
        ))}
      </div>
    </>
  );
}

function Metric({
  label,
  value,
  note,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof UsersRound;
  accent: string;
}) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${accent}`}>
        <Icon size={20} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}
function PanelHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="panel-heading">
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}
function TaskSummary({
  title,
  count,
  icon: Icon,
}: {
  title: string;
  count: number;
  icon: typeof ClipboardCheck;
}) {
  return (
    <article className="task-card">
      <span className="task-icon violet">
        <Icon size={20} />
      </span>
      <span className="task-copy">
        <strong>{title}</strong>
        <small>今日待处理</small>
      </span>
      <b>{count}</b>
      <i>待处理</i>
    </article>
  );
}
export default App;
