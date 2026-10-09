import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Bell,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  Database,
  FileSpreadsheet,
  Gift,
  LayoutDashboard,
  ListTodo,
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
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
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
import { hasSupabaseConfig, isDemoAuthEnabled } from "./lib/supabase";
import {
  completeTask,
  confirmD0,
  createMember,
  createTreatment,
  getDashboardData,
  getMemberTimeline,
  getMyProfile,
  listMembers,
  listImportBatches,
  listTasks,
  onAuthStateChange,
  processTaskBatch,
  restoreSession,
  signIn,
  signOut,
  type DashboardData,
  type ImportBatch,
  type MemberRow,
  type TimelineEvent,
  syncMemberCardNumbers,
  updateMember,
} from "./lib/api";
import "./App.css";
import "./extended.css";

type Page =
  "dashboard" | "today" | "members" | "tasks" | "visits" | "import" | "settings";
const roleNames: Record<Role, string> = {
  management: "管理层",
  member_admin: "会员中心主管",
  head_nurse: "护士长",
  readonly: "只读账号",
};
const taskNames: Record<string, string> = {
  care_d0: "D0 护理确认",
  followup_d1: "D1 回访",
  followup_d3: "D3 回访",
  followup_d7: "D7 回访",
  followup_d15: "D15 回访",
  followup_d30: "D30 回访",
  birthday_notify: "生日礼月初提醒",
  birthday_unclaimed: "生日礼 25 日提醒",
  validity_90d: "有效期 90 天提醒",
  validity_30d: "有效期 30 天提醒",
  validity_7d: "有效期 7 天提醒",
  share_benefit_expiry: "分享权益到期提醒",
  share_benefit_day_30: "分享权益第 30 天提醒",
  share_benefit_end_30d: "分享权益剩余 30 天提醒",
  share_benefit_end_15d: "分享权益结束前 15 天提醒",
  share_benefit_end_7d: "分享权益剩余 7 天提醒",
};

function todayInShanghai() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function fullDateInShanghai() {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    dateStyle: "full",
  }).format(new Date());
}

function displayDate(date: string | null | undefined) {
  return date || "—";
}

function dateInShanghai(date: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(date));
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function calendarDay(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function matchesCreatedRange(member: Member, range: "all" | "today" | "week" | "month") {
  if (range === "all") return true;
  if (!member.createdAt) return false;
  const ageInDays = calendarDay(todayInShanghai()) - calendarDay(dateInShanghai(member.createdAt));
  if (range === "today") return ageInDays === 0;
  if (range === "week") return ageInDays >= 0 && ageInDays <= 6;
  return ageInDays >= 0 && ageInDays <= 29;
}

function mapMember(row: MemberRow): Member {
  return {
    id: row.id,
    cardNumber: row.source_card_number || row.member_card_number,
    sourceCardNumber: row.source_card_number,
    name: row.name,
    consultant: row.consultant || "",
    hasServiceGroup: row.has_service_group,
    hasMiniProgramProfile: row.has_mini_program_profile,
    kind: row.member_kind,
    level: row.level,
    birthday: displayDate(row.birthday),
    joinedOn: displayDate(row.joined_on),
    membershipChangedOn: displayDate(row.membership_changed_on),
    validUntil: displayDate(row.valid_until),
    lastVisit: displayDate(row.last_visit_date),
    visits: row.visit_count,
    createdAt: row.created_at,
  };
}

function mapTask(row: Record<string, unknown>): Task {
  const member = row.members as { name?: string; level?: string; member_kind?: string; consultant?: string | null } | null;
  const taskType = String(row.task_type);
  const isCareTask = taskType === "care_d0";
  const belongsToConsultant = taskType.startsWith("followup_") || taskType.startsWith("validity_");
  return {
    id: String(row.id),
    memberId: String(row.member_id),
    member: member?.name || "未知会员",
    level: member?.member_kind === "prospect" ? "准会员" : member?.level || "—",
    taskType,
    type: taskNames[taskType] || taskType,
    due: String(row.due_date),
    status: row.status as Task["status"],
    owner: isCareTask
      ? "护士长"
      : belongsToConsultant
        ? member?.consultant || "未分配咨询"
        : "会员中心",
    responsibilityRole: isCareTask ? "head_nurse" : "member_admin",
  };
}

function App() {
  return (
    <BrowserRouter>
      <AuthRoutes />
    </BrowserRouter>
  );
}

function AuthRoutes() {
  const [authState, setAuthState] = useState<
    "loading" | "authenticated" | "anonymous"
  >(hasSupabaseConfig ? "loading" : "anonymous");
  const [role, setRole] = useState<Role>("member_admin");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("演示账号");

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    let active = true;
    void restoreSession()
      .then((profile) => {
        if (!active) return;
      if (profile) {
        setRole(profile.role as Role);
        setUsername(profile.username);
        setDisplayName(profile.display_name);
        setAuthState("authenticated");
        } else setAuthState("anonymous");
      })
      .catch(() => active && setAuthState("anonymous"));
    const unsubscribe = onAuthStateChange((authenticated) => {
      if (!authenticated) return setAuthState("anonymous");
      void getMyProfile()
        .then((profile) => {
        if (!active) return;
        setRole(profile.role as Role);
        setUsername(profile.username);
        setDisplayName(profile.display_name);
        setAuthState("authenticated");
        })
        .catch(() => active && setAuthState("anonymous"));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (authState === "loading")
    return (
      <div className="auth-loading" role="status">
        正在验证登录会话…
      </div>
    );
  return (
    <Routes>
      <Route
        path="/login"
        element={
          authState === "authenticated" ? (
            <Navigate to="/" replace />
          ) : (
            <Login
              onLogin={(nextRole, nextUsername) => {
                setRole(nextRole);
                setUsername(nextUsername);
                setAuthState("authenticated");
              }}
            />
          )
        }
      />
      <Route
        path="/*"
        element={
          authState === "authenticated" ? (
            <Workspace
              initialRole={role}
              username={username}
              displayName={displayName}
              onSignedOut={() => setAuthState("anonymous")}
            />
          ) : (
            <RequireLogin />
          )
        }
      />
    </Routes>
  );
}

function RequireLogin() {
  const location = useLocation();
  return <Navigate to="/login" replace state={{ from: location.pathname }} />;
}

function Workspace({
  initialRole,
  username,
  displayName,
  onSignedOut,
}: {
  initialRole: Role;
  username: string;
  displayName: string;
  onSignedOut: () => void;
}) {
  const [role, setRole] = useState<Role>(initialRole);
  const accountUsername = username.trim().toLowerCase();
  const canViewDashboard = accountUsername === "002";
  const canViewImport = !["001", "004"].includes(accountUsername);
  const [page, setPage] = useState<Page>(canViewDashboard ? "dashboard" : "today");
  const demoMode = isDemoAuthEnabled && !hasSupabaseConfig;
  const [members, setMembers] = useState<Member[]>(demoMode ? demoMembers : []);
  const [tasks, setTasks] = useState<Task[]>(demoMode ? demoTasks : []);
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    totalMembers: 0,
    monthlyVisitMembers: 0,
    serviceCompletionRate: 0,
    overdueTasks: 0,
    prospectCount: 0,
    prospectConvertedThisMonth: 0,
    levelVisitCounts: [],
    trend: [],
  });
  const [dataLoading, setDataLoading] = useState(hasSupabaseConfig);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [globalQuery, setGlobalQuery] = useState("");
  const [dateLabel] = useState(fullDateInShanghai);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState("");
  const today = todayInShanghai();
  const dueTaskCount = tasks.filter(
    (task) => task.status === "pending" && task.due <= today,
  ).length;
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };

  const refreshData = useCallback(async () => {
    if (!hasSupabaseConfig) return;
    try {
      const [memberRows, taskRows, metrics, batches] = await Promise.all([
        listMembers(),
        listTasks(),
        canViewDashboard ? getDashboardData() : Promise.resolve(null),
        listImportBatches(),
      ]);
      setMembers(memberRows.map(mapMember));
      setTasks(taskRows.map((row) => mapTask(row as Record<string, unknown>)));
      if (metrics) setDashboardData(metrics);
      setImportBatches(
        batches.map((batch) => ({
          ...batch,
          created_at: new Date(batch.created_at).toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
          }),
        })),
      );
    } catch {
      setToast("真实数据加载失败，请刷新重试");
    } finally {
      setDataLoading(false);
    }
  }, [canViewDashboard]);

  useEffect(() => {
    queueMicrotask(() => void refreshData());
  }, [refreshData]);

  const nav = [
    { id: "dashboard" as Page, label: "经营首页", icon: LayoutDashboard },
    {
      id: "today" as Page,
      label: "今日待办",
      icon: ListTodo,
      badge: dueTaskCount,
    },
    { id: "members" as Page, label: "会员管理", icon: UsersRound },
    {
      id: "tasks" as Page,
      label: "服务任务",
      icon: ClipboardCheck,
      badge: dueTaskCount,
    },
    { id: "visits" as Page, label: "治疗到诊", icon: CalendarDays },
    { id: "import" as Page, label: "数据导入", icon: FileSpreadsheet },
  ].filter((item) =>
    (item.id !== "dashboard" || canViewDashboard) &&
    (item.id !== "import" || canViewImport) &&
    (role !== "head_nurse" || ["today", "tasks"].includes(item.id)),
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
              <strong>{displayName}</strong>
              <span>{roleNames[role]}</span>
            </div>
            <button
              className="logout"
              aria-label="退出登录"
              onClick={async () => {
                try {
                  if (hasSupabaseConfig) await signOut();
                } catch {
                  notify("退出登录失败，请重试");
                  return;
                }
                onSignedOut();
              }}
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
            <p className="eyebrow">{dateLabel}</p>
            <h1>{nav.find((n) => n.id === page)?.label || "系统设置"}</h1>
          </div>
          <div className="top-actions">
            <label className="search-box">
              <Search size={18} />
              <input
                aria-label="全局搜索"
                placeholder="搜索会员姓名或卡号"
                value={globalQuery}
                onChange={(event) => {
                  setGlobalQuery(event.target.value);
                  if (event.target.value) setPage("members");
                }}
              />
              <kbd>⌘ K</kbd>
            </label>
            <button
              className="icon-button"
              aria-label={`${dueTaskCount} 项今日及逾期待处理任务`}
              onClick={() => setPage("today")}
            >
              <Bell size={19} />
              {dueTaskCount > 0 && <span />}
            </button>
            {demoMode && (
              <select
                className="role-switch"
                aria-label="切换演示角色"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value as Role);
                  setPage(e.target.value === "management" ? "dashboard" : "today");
                }}
              >
                <option value="member_admin">会员中心主管</option>
                <option value="head_nurse">护士长</option>
                <option value="management">管理层</option>
                <option value="readonly">只读账号</option>
              </select>
            )}
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
          {dataLoading && <div className="demo-banner">正在同步 Supabase 数据…</div>}
          {page === "dashboard" && canViewDashboard && (
            <Dashboard
              members={members}
              tasks={tasks}
              data={dashboardData}
              role={role}
              onNavigate={setPage}
            />
          )}
          {page === "members" && (
            <Members
              members={members}
              tasks={tasks}
              role={role}
              searchQuery={globalQuery}
              onRefresh={refreshData}
              notify={notify}
            />
          )}
          {page === "today" && (
            <Tasks
              tasks={tasks}
              role={role}
              todayOnly
              onRefresh={refreshData}
              notify={notify}
            />
          )}
          {page === "tasks" && (
            <Tasks
              tasks={tasks}
              role={role}
              todayOnly={false}
              onRefresh={refreshData}
              notify={notify}
            />
          )}
          {page === "visits" && (
            <Visits
              members={members}
              role={role}
              onRefresh={refreshData}
              notify={notify}
            />
          )}
          {page === "import" && canViewImport && (
            <ImportPage role={role} batches={importBatches} notify={notify} />
          )}
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

function Login({ onLogin }: { onLogin: (role: Role, username: string) => void }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
        onLogin(profile.role as Role, profile.username);
      } else if (isDemoAuthEnabled) onLogin(role, username.trim().toLowerCase());
      else throw new Error("尚未配置 Supabase，无法登录");
      const destination =
        (location.state as { from?: string } | null)?.from || "/";
      navigate(destination, { replace: true });
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
        {!hasSupabaseConfig && isDemoAuthEnabled && (
          <label>
            演示角色
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              <option value="member_admin">会员中心主管</option>
              <option value="head_nurse">护士长</option>
              <option value="management">管理层</option>
              <option value="readonly">只读账号</option>
            </select>
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
        <button
          className="login-button"
          disabled={busy || (!hasSupabaseConfig && !isDemoAuthEnabled)}
        >
          {busy ? "正在登录…" : "登录"}
        </button>
        <small>
          {hasSupabaseConfig
            ? "已连接 Supabase"
            : isDemoAuthEnabled
              ? "开发演示认证已启用，不连接真实会员数据"
              : "请先配置 VITE_SUPABASE_URL 与 VITE_SUPABASE_PUBLISHABLE_KEY"}
        </small>
      </form>
    </div>
  );
}

function Dashboard({
  members,
  tasks,
  data,
  role,
  onNavigate,
}: {
  members: Member[];
  tasks: Task[];
  data: DashboardData;
  role: Role;
  onNavigate: (p: Page) => void;
}) {
  const [detail, setDetail] = useState<{
    title: string;
    subtitle: string;
    members?: Member[];
    tasks?: Task[];
  } | null>(null);
  const today = todayInShanghai();
  const currentMonth = today.slice(0, 7);
  const pending = tasks.filter((t) => t.status === "pending");
  const actionable = pending.filter((t) => t.due <= today);
  const trend = data.trend.slice(-6).map((item) => ({
    month: `${Number(item.month.slice(5, 7))}月`,
    visits: item.visits,
  }));
  const formalMembers = members.filter((member) => member.kind === "member");
  const prospectMembers = members.filter((member) => member.kind === "prospect");
  const levelVisitCounts = ["V1", "V2", "V3", "V4", "V5"].map((level) => ({
    level,
    count: data.levelVisitCounts.find((item) => item.level === level)?.visits ?? 0,
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
          <span /> Supabase 实时数据
        </div>
      </section>
      <section className="metrics">
        <Metric
          label="会员总数"
          value={String(data.totalMembers)}
          note="当前有效会员"
          icon={UsersRound}
          accent="purple"
          onClick={() =>
            setDetail({ title: "有效会员明细", subtitle: `共 ${formalMembers.length} 名正式会员`, members: formalMembers })
          }
        />
        <Metric
          label="本月到诊会员"
          value={String(data.monthlyVisitMembers)}
          note="本月去重到诊会员"
          icon={TrendingUp}
          accent="blue"
          onClick={() => {
            const rows = formalMembers.filter((member) => member.lastVisit.startsWith(currentMonth));
            setDetail({ title: "本月到诊会员", subtitle: `${currentMonth} 去重到诊会员`, members: rows });
          }}
        />
        <Metric
          label="服务完成率"
          value={`${data.serviceCompletionRate}%`}
          note="已完成服务任务占比"
          icon={ClipboardCheck}
          accent="green"
          onClick={() =>
            setDetail({
              title: "服务任务完成明细",
              subtitle: "全部已完成或已确认任务",
              tasks: tasks.filter((task) => ["completed", "confirmed"].includes(task.status)),
            })
          }
        />
        <Metric
          label="逾期任务"
          value={String(data.overdueTasks)}
          note="需优先处理"
          icon={Clock3}
          accent="red"
          onClick={() =>
            setDetail({ title: "逾期任务明细", subtitle: "待处理且到期日早于今天", tasks: actionable.filter((task) => task.due < today) })
          }
        />
        <Metric
          label="准会员蓄水池"
          value={String(data.prospectCount)}
          note={`本月已转正式会员 ${data.prospectConvertedThisMonth} 人`}
          icon={TrendingUp}
          accent="purple"
          onClick={() => setDetail({
            title: "准会员蓄水池",
            subtitle: "当前准会员档案，用于跟踪后续转化",
            members: prospectMembers,
          })}
        />
      </section>
      <section className="dashboard-grid">
        <article
          className="panel clickable-panel"
          onClick={() => setDetail({
            title: "本月各级会员到诊明细",
            subtitle: `${currentMonth} 正式会员治疗型到诊`,
            members: formalMembers.filter((member) => member.lastVisit.startsWith(currentMonth)),
          })}
        >
          <PanelHeading title="本月各级会员到诊量" subtitle="按当前会员等级去重统计" />
          <div className="level-chart" aria-label="本月各级会员到诊量柱状图">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={levelVisitCounts} margin={{ top: 22, right: 10, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#eceaf0" />
                <XAxis dataKey="level" axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "#f7f4fa" }} formatter={(value) => [`${value} 人`, "到诊会员"]} />
                <Bar dataKey="count" name="到诊会员" fill="#6f5298" radius={[7, 7, 0, 0]} maxBarSize={48}>
                  <LabelList dataKey="count" position="top" fill="#332e38" fontSize={12} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
        <article
          className="panel clickable-panel"
          onClick={() => setDetail({ title: "会员活跃明细", subtitle: "正式会员最近一次治疗型到诊", members: formalMembers.filter((member) => member.lastVisit !== "—").sort((a, b) => b.lastVisit.localeCompare(a.lastVisit)) })}
        >
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
            <p>今日及逾期共 {actionable.length} 项待处理任务</p>
          </div>
          <button className="text-button" onClick={() => onNavigate("tasks")}>
            查看全部任务
          </button>
        </div>
        <div className="task-grid">
          <TaskSummary
            title="术后服务"
            count={actionable.filter((t) => t.type.includes("回访")).length}
            icon={ClipboardCheck}
            onClick={() => setDetail({ title: "回访提醒", subtitle: "今日及逾期待处理", tasks: actionable.filter((task) => task.type.includes("回访")) })}
          />
          <TaskSummary
            title="D0 护理确认"
            count={actionable.filter((t) => t.type.includes("D0")).length}
            icon={ShieldCheck}
            onClick={() => setDetail({ title: "D0 护理确认", subtitle: "今日及逾期待处理", tasks: actionable.filter((task) => task.type.includes("D0")) })}
          />
          <TaskSummary
            title="生日礼"
            count={actionable.filter((t) => t.type.includes("生日")).length}
            icon={Gift}
            onClick={() => setDetail({ title: "生日月提醒", subtitle: "今日及逾期待处理", tasks: actionable.filter((task) => task.type.includes("生日")) })}
          />
          <TaskSummary
            title="权益到期提醒"
            count={
              actionable.filter(
                (t) => t.type.includes("有效期") || t.type.includes("权益到期"),
              ).length
            }
            icon={CalendarDays}
            onClick={() => setDetail({ title: "到期提醒", subtitle: "会员有效期及分享权益到期", tasks: actionable.filter((task) => task.type.includes("有效期") || task.type.includes("权益到期")) })}
          />
        </div>
      </section>
      {detail && (
        <aside className="drawer dashboard-detail" aria-label={detail.title}>
          <div className="drawer-head">
            <div><h2>{detail.title}</h2><p>{detail.subtitle}</p></div>
            <button className="icon-button" aria-label="关闭明细" onClick={() => setDetail(null)}><X size={18} /></button>
          </div>
          <div className="detail-list">
            {detail.members?.map((member) => (
              <button key={member.id} onClick={() => onNavigate("members")}>
                <span><strong>{member.name}</strong><small>{member.cardNumber} · {member.kind === "prospect" ? "准会员" : member.level}</small></span>
                <span>{member.lastVisit === "—" ? member.validUntil : `最近到诊 ${member.lastVisit}`}</span>
              </button>
            ))}
            {detail.tasks?.map((task) => (
              <button key={task.id} onClick={() => onNavigate("tasks")}>
                <span><strong>{task.member}</strong><small>{task.level} · {task.type}</small></span>
                <span className={task.status === "pending" && task.due < today ? "danger-text" : ""}>{task.due}</span>
              </button>
            ))}
            {!detail.members?.length && !detail.tasks?.length && <p className="empty-state">暂无涉及记录</p>}
          </div>
        </aside>
      )}
    </>
  );
}

function Members({
  members,
  tasks,
  role,
  searchQuery,
  onRefresh,
  notify,
}: {
  members: Member[];
  tasks: Task[];
  role: Role;
  searchQuery: string;
  onRefresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [view, setView] = useState<"service" | "manage">("service");
  const [memberScope, setMemberScope] = useState<"all" | "member" | "prospect">("all");
  const [levelFilter, setLevelFilter] = useState<"all" | Member["level"]>("all");
  const [visitSort, setVisitSort] = useState<"default" | "asc" | "desc">("default");
  const [createdRange, setCreatedRange] = useState<"all" | "today" | "week" | "month">("all");
  const [localQuery, setLocalQuery] = useState("");
  const [selected, setSelected] = useState<Member | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const defaultMembershipDate = todayInShanghai();
  const query = searchQuery || localQuery;
  const filtered = members
    .filter((m) =>
      (memberScope === "all" || m.kind === memberScope) &&
      (levelFilter === "all" || (m.kind === "member" && m.level === levelFilter)) &&
      matchesCreatedRange(m, createdRange) &&
      `${m.name}${m.cardNumber}${m.consultant}`.includes(query),
    )
    .sort((a, b) => {
      if (visitSort === "asc") return a.visits - b.visits || a.name.localeCompare(b.name, "zh-CN");
      if (visitSort === "desc") return b.visits - a.visits || a.name.localeCompare(b.name, "zh-CN");
      return 0;
    });
  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const selectedLevel = String(data.get("level"));
    const isProspect = selectedLevel === "prospect";
    const sourceCardNumber = String(data.get("sourceCardNumber")).trim().toUpperCase();
    if (members.some((m) => m.cardNumber.toUpperCase() === sourceCardNumber)) {
      notify("会员卡号已存在");
      return;
    }
    try {
      if (hasSupabaseConfig) {
        await createMember({
          name: String(data.get("name")),
          source_card_number: sourceCardNumber,
          consultant: String(data.get("consultant")) || null,
          has_service_group: isProspect ? false : data.get("hasServiceGroup") === "yes",
          has_mini_program_profile: data.get("hasMiniProgramProfile") === "yes",
          member_kind: isProspect ? "prospect" : "member",
          level: (isProspect ? "V1" : selectedLevel) as Member["level"],
          birthday: String(data.get("birthday")) || null,
          joined_on: String(data.get("joinedOn")) || null,
          membership_changed_on: String(data.get("membershipChangedOn")) || String(data.get("joinedOn")) || null,
        });
        await onRefresh();
      }
      setShowAdd(false);
      notify("会员已创建");
    } catch (error) {
      notify(error instanceof Error ? error.message : "会员创建失败");
    }
  };
  return (
    <>
      <section className="page-heading">
        <div>
          <h2>会员管理</h2>
          <p>会员档案是系统唯一数据源。</p>
        </div>
        {(role === "member_admin" || role === "management") && (
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
            会员卡号
            <input name="sourceCardNumber" required placeholder="请输入原始会员卡号" />
          </label>
          <label>
            所属咨询
            <select name="consultant" defaultValue="" required>
              <option value="" disabled>请选择所属咨询</option>
              <option value="孙亚亚">孙亚亚</option>
              <option value="马芷怡">马芷怡</option>
            </select>
          </label>
          <label>
            是否建会员服务群
            <select name="hasServiceGroup" defaultValue="no">
              <option value="no">否</option>
              <option value="yes">是</option>
            </select>
          </label>
          <label>
            是否建档小程序
            <select name="hasMiniProgramProfile" defaultValue="" required>
              <option value="" disabled>请选择</option>
              <option value="yes">是</option>
              <option value="no">否</option>
            </select>
          </label>
          <label>
            等级
            <select name="level">
              {["prospect", "V1", "V2", "V3", "V4", "V5"].map((x) => (
                <option key={x} value={x}>{x === "prospect" ? "准会员" : x}</option>
              ))}
            </select>
          </label>
          <label>
            生日
            <input name="birthday" type="date" />
          </label>
          <label>
            入会日期
            <input name="joinedOn" type="date" defaultValue={defaultMembershipDate} />
          </label>
          <label>
            会员变动日期
            <input name="membershipChangedOn" type="date" defaultValue={defaultMembershipDate} required />
          </label>
          <label>有效期<input value="保存后按会员变动日期自动计算 1 年" readOnly /></label>
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
        <div className="tabs">
          {([
            ["all", `全部 ${members.length}`],
            ["member", `正式会员 ${members.filter((member) => member.kind === "member").length}`],
            ["prospect", `准会员 ${members.filter((member) => member.kind === "prospect").length}`],
          ] as const).map(([id, label]) => (
            <button key={id} className={memberScope === id ? "active" : ""} onClick={() => setMemberScope(id)}>{label}</button>
          ))}
        </div>
        <label className="toolbar-select">
          <span>会员等级</span>
          <select aria-label="按会员等级筛选" value={levelFilter} onChange={(event) => setLevelFilter(event.target.value as "all" | Member["level"])}>
            <option value="all">全部等级</option>
            {(["V1", "V2", "V3", "V4", "V5"] as const).map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>
        <label className="toolbar-select">
          <span>新增时间</span>
          <select aria-label="按新增时间筛选" value={createdRange} onChange={(event) => setCreatedRange(event.target.value as "all" | "today" | "week" | "month")}>
            <option value="all">全部时间</option>
            <option value="today">今日新增</option>
            <option value="week">近一周新增</option>
            <option value="month">近一月新增</option>
          </select>
        </label>
        <label className="toolbar-select">
          <span>到诊次数</span>
          <select aria-label="按到诊次数排序" value={visitSort} onChange={(event) => setVisitSort(event.target.value as "default" | "asc" | "desc")}>
            <option value="default">默认排序</option>
            <option value="desc">从高到低</option>
            <option value="asc">从低到高</option>
          </select>
        </label>
        <input
          placeholder="搜索姓名、卡号或所属咨询"
          value={query}
          onChange={(e) => setLocalQuery(e.target.value)}
        />
      </div>
      <div
        className={`panel data-table ${view === "manage" ? "members-manage" : ""}`}
      >
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
              <span>新增日期</span>
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
              <small>
                {m.cardNumber}
              </small>
            </span>
            <span>
              <b className={`level-badge ${m.kind === "prospect" ? "prospect" : m.level}`}>
                {m.kind === "prospect" ? "准会员" : m.level}
              </b>
            </span>
            {view === "service" ? (
              <>
                <span>{m.lastVisit}</span>
                <span>
                  {tasks
                    .filter((task) => task.memberId === m.id && task.status === "pending")
                    .sort((a, b) => a.due.localeCompare(b.due))[0]?.type || "—"}
                </span>
                <span>
                  <em className="status">
                    {tasks.some(
                      (task) =>
                        task.memberId === m.id &&
                        task.status === "pending" &&
                        task.due < todayInShanghai(),
                    )
                      ? "有逾期"
                      : "正常"}
                  </em>
                </span>
              </>
            ) : (
              <>
                <span>{m.consultant || "—"}</span>
                <span>{m.createdAt ? dateInShanghai(m.createdAt) : "—"}</span>
                <span>{m.validUntil}</span>
                <span>{m.lastVisit}</span>
                <span>{m.visits}</span>
              </>
            )}
          </button>
        ))}
      </div>
      {selected && (
        <MemberDetail
          member={selected}
          role={role}
          onRefresh={onRefresh}
          notify={notify}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function MemberDetail({
  member,
  role,
  onRefresh,
  notify,
  onClose,
}: {
  member: Member;
  role: Role;
  onRefresh: () => Promise<void>;
  notify: (message: string) => void;
  onClose: () => void;
}) {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(hasSupabaseConfig);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!hasSupabaseConfig) return;
    let active = true;
    void getMemberTimeline(member.id)
      .then((events) => active && setTimeline(events))
      .finally(() => active && setTimelineLoading(false));
    return () => {
      active = false;
    };
  }, [member.id]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const selectedLevel = String(data.get("level"));
    const isProspect = selectedLevel === "prospect";
    try {
      await updateMember(member.id, {
        name: String(data.get("name")),
        source_card_number: String(data.get("sourceCardNumber")).trim().toUpperCase() || null,
        consultant: String(data.get("consultant")) || null,
        has_service_group: isProspect ? false : data.get("hasServiceGroup") === "yes",
        has_mini_program_profile: data.get("hasMiniProgramProfile") === "yes",
        member_kind: isProspect ? "prospect" : "member",
        level: (isProspect ? "V1" : selectedLevel) as Member["level"],
        birthday: String(data.get("birthday")) || null,
        joined_on: String(data.get("joinedOn")) || null,
        membership_changed_on: String(data.get("membershipChangedOn")) || null,
      });
      await onRefresh();
      notify("会员档案已更新");
      onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : "会员档案更新失败");
    }
  };

  return (
    <div className="drawer">
      <div className="drawer-head">
        <div>
          <span className={`level-badge ${member.kind === "prospect" ? "prospect" : member.level}`}>
            {member.kind === "prospect" ? "准会员" : member.level}
          </span>
          <h2>{member.name}</h2>
          <p>{member.cardNumber}</p>
        </div>
        <button className="icon-button" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      {(role === "management" || role === "member_admin") && (
        <button className="small-action" onClick={() => setEditing(!editing)}>
          {editing ? "取消编辑" : "编辑档案"}
        </button>
      )}
      {editing && (
        <form className="inline-form" onSubmit={save}>
          <label>姓名<input name="name" defaultValue={member.name} required /></label>
          <label>会员卡号<input name="sourceCardNumber" defaultValue={member.sourceCardNumber || ""} placeholder="请输入原始会员卡号" /></label>
          <label>
            所属咨询
            <select name="consultant" defaultValue={member.consultant} required>
              <option value="孙亚亚">孙亚亚</option>
              <option value="马芷怡">马芷怡</option>
            </select>
          </label>
          <label>
            会员服务群
            <select name="hasServiceGroup" defaultValue={member.hasServiceGroup ? "yes" : "no"}>
              <option value="yes">已建群</option>
              <option value="no">未建群</option>
            </select>
          </label>
          <label>
            建档小程序
            <select name="hasMiniProgramProfile" defaultValue={member.hasMiniProgramProfile ? "yes" : "no"} required>
              <option value="yes">是</option>
              <option value="no">否</option>
            </select>
          </label>
          <label>
            等级
            <select name="level" defaultValue={member.kind === "prospect" ? "prospect" : member.level}>
              {(["prospect", "V1", "V2", "V3", "V4", "V5"] as const).map((level) => (
                <option key={level} value={level}>{level === "prospect" ? "准会员" : level}</option>
              ))}
            </select>
          </label>
          <label>生日<input name="birthday" type="date" defaultValue={member.birthday === "—" ? "" : member.birthday} /></label>
          <label>入会日期<input name="joinedOn" type="date" defaultValue={member.joinedOn === "—" ? "" : member.joinedOn} /></label>
          <label>会员变动日期<input name="membershipChangedOn" type="date" defaultValue={member.membershipChangedOn === "—" ? "" : member.membershipChangedOn} required /></label>
          <label>有效期<input value={member.validUntil} readOnly /></label>
          <button className="primary-action">保存修改</button>
        </form>
      )}
      <div className="detail-grid">
        <span>
          会员卡号<strong>{member.cardNumber}</strong>
        </span>
        <span>
          会员服务群
          <strong>{member.hasServiceGroup ? "已建群" : "未建群"}</strong>
        </span>
        <span>
          建档小程序
          <strong>{member.hasMiniProgramProfile ? "是" : "否"}</strong>
        </span>
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
          会员变动日期<strong>{member.membershipChangedOn || "—"}</strong>
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
        {timelineLoading && <p>正在加载时间轴…</p>}
        {!timelineLoading && timeline.length === 0 && <p>暂无服务记录</p>}
        {timeline.map((event) => (
          <p key={`${event.event_type}-${event.source_id}`}>
            <i />
            {event.event_date}　
            {event.event_type === "visit"
              ? "会员到诊"
              : event.event_type === "birthday_gift"
                ? "生日礼"
                : taskNames[event.event_type] || event.event_type}
            {event.is_historical ? "（历史）" : ""} · <b>{event.display_status}</b>
          </p>
        ))}
      </div>
    </div>
  );
}

function Tasks({
  tasks,
  role,
  todayOnly,
  onRefresh,
  notify,
}: {
  tasks: Task[];
  role: Role;
  todayOnly: boolean;
  onRefresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const today = todayInShanghai();
  const roleVisible =
    role === "head_nurse" ? tasks.filter((t) => t.responsibilityRole === "head_nurse") : tasks;
  const visible = todayOnly
    ? roleVisible.filter((task) => task.status === "pending" && task.due <= today)
    : roleVisible;
  const [filter, setFilter] = useState("all");
  const [category, setCategory] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchStatus, setBatchStatus] = useState<"completed" | "archived">("completed");
  const categoryOf = (task: Task) =>
    task.type.includes("有效期")
      ? "member_expiry"
      : task.type.includes("分享权益") || task.type.includes("权益到期")
        ? "share_expiry"
        : task.type.includes("生日")
          ? "birthday"
          : task.type.includes("回访")
            ? "followup"
            : task.type.includes("D0")
              ? "care"
              : "other";
  const shown = visible.filter(
    (t) =>
      (category === "all" || categoryOf(t) === category) &&
      (filter === "all" ||
        (filter === "overdue"
          ? t.due < today && t.status === "pending"
          : t.status === filter)),
  );
  const dueVisible = visible.filter(
    (task) => task.status === "pending" && task.due <= today,
  );
  const pendingShown = shown.filter((task) => task.status === "pending");
  const allShownSelected = pendingShown.length > 0 && pendingShown.every((task) => selectedIds.includes(task.id));
  const toggleAllShown = () => {
    const ids = pendingShown.map((task) => task.id);
    setSelectedIds((current) =>
      ids.every((id) => current.includes(id))
        ? current.filter((id) => !ids.includes(id))
        : Array.from(new Set([...current, ...ids])),
    );
  };
  const processSelected = async () => {
    if (!selectedIds.length) return notify("请先选择待处理任务");
    try {
      const changed = await processTaskBatch(selectedIds, batchStatus);
      setSelectedIds([]);
      await onRefresh();
      notify(`已将 ${changed} 项任务标记为${batchStatus === "completed" ? "已完成" : "已归档"}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "批量处理失败");
    }
  };
  const act = async (task: Task) => {
    if (task.responsibilityRole === "head_nurse" && role !== "head_nurse" && role !== "management") {
      notify("D0 仅护士长可以确认");
      return;
    }
    if (task.responsibilityRole === "member_admin" && role !== "member_admin" && role !== "management") {
      notify("该任务由会员中心处理");
      return;
    }
    try {
      if (task.responsibilityRole === "head_nurse") await confirmD0([task.id]);
      else await completeTask(task.id);
      await onRefresh();
      notify(task.responsibilityRole === "head_nurse" ? "D0 已确认" : "任务已完成");
    } catch (error) {
      notify(error instanceof Error ? error.message : "任务处理失败");
    }
  };
  return (
    <>
      <section className="page-heading">
        <div>
          <h2>{todayOnly ? "今日待办" : role === "head_nurse" ? "D0 护理确认" : "服务任务"}</h2>
          <p>{todayOnly ? `今天及逾期共 ${visible.length} 项，按任务分类统筹执行。` : "逾期优先，再按会员等级与到期时间排序。"}</p>
        </div>
        {role !== "readonly" && <div className="batch-actions">
          {selectedIds.length > 0 && <span>已选 {selectedIds.length} 项</span>}
          <select aria-label="批量处理结果" value={batchStatus} onChange={(event) => setBatchStatus(event.target.value as "completed" | "archived")}>
            <option value="completed">已完成</option>
            <option value="archived">已归档</option>
          </select>
          <button className="primary-action" onClick={processSelected}>批量处理所选</button>
        </div>}
      </section>
      <div className="toolbar">
        <div className="tabs category-tabs" aria-label="任务分类">
          {[
            ["all", "全部任务"],
            ["member_expiry", "会员到期"],
            ["share_expiry", "分享权益提醒"],
            ["birthday", "生日月提醒"],
            ["followup", "回访提醒"],
            ["care", "D0 护理确认"],
          ].map(([id, label]) => (
            <button key={id} className={category === id ? "active" : ""} onClick={() => setCategory(id)}>
              {label}<small>{dueVisible.filter((task) => id === "all" || categoryOf(task) === id).length}</small>
            </button>
          ))}
        </div>
      </div>
      {!todayOnly && <div className="toolbar">
        <div className="tabs">
          {[
            ["all", "全部"],
            ["pending", "待处理"],
            ["overdue", "已逾期"],
            ["completed", "已完成"],
            ["archived", "已归档"],
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
      </div>}
      <div className="panel data-table task-table">
        <div className="data-row data-head">
          <span>{role !== "readonly" && <input type="checkbox" aria-label="选择当前列表全部待处理任务" checked={allShownSelected} onChange={toggleAllShown} />}</span>
          <span>会员</span>
          <span>任务</span>
          <span>责任人</span>
          <span>到期日</span>
          <span>操作</span>
        </div>
        {shown.map((t) => (
          <div className="data-row" key={t.id}>
            <span>
              {t.status === "pending" && role !== "readonly" && (
                <input
                  type="checkbox"
                  aria-label={`选择 ${t.member} ${t.type}`}
                  checked={selectedIds.includes(t.id)}
                  onChange={() => setSelectedIds((current) => current.includes(t.id) ? current.filter((id) => id !== t.id) : [...current, t.id])}
                />
              )}
            </span>
            <span>
              <strong>{t.member}</strong>
              <small>{t.level} 会员</small>
            </span>
            <span>{t.type}</span>
            <span>{t.owner}</span>
            <span
              className={
                t.status === "pending" && t.due < today
                  ? "danger-text"
                  : ""
              }
            >
              {t.due}
            </span>
            <span>
              {t.status === "pending" && role !== "readonly" ? (
                <button className="small-action" onClick={() => act(t)}>
                  {t.responsibilityRole === "head_nurse" ? "确认" : "完成"}
                </button>
              ) : (
                <em className="status">
                  {t.status === "confirmed"
                    ? "已确认"
                    : t.status === "completed"
                      ? "已完成"
                      : t.status === "archived"
                        ? "已归档"
                      : t.status === "superseded"
                        ? "已覆盖"
                        : "已取消"}
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
  role,
  onRefresh,
  notify,
}: {
  members: Member[];
  role: Role;
  onRefresh: () => Promise<void>;
  notify: (s: string) => void;
}) {
  const [cardNumber, setCardNumber] = useState("");
  const normalizedCardNumber = cardNumber.trim().toUpperCase();
  const member = members.find((m) => m.cardNumber.toUpperCase() === normalizedCardNumber);
  const today = todayInShanghai();
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if ((role !== "member_admin" && role !== "management") || !member || member.kind === "prospect") return;
    const date = String(new FormData(e.currentTarget).get("date"));
    try {
      await createTreatment(member.id, date);
      await onRefresh();
      notify("治疗到诊与 D0–D30 服务周期已创建");
      setCardNumber("");
    } catch (error) {
      notify(error instanceof Error ? error.message : "治疗到诊保存失败");
    }
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
            会员卡号
            <input
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              placeholder="输入完整会员卡号"
              required
            />
          </label>
          {cardNumber && (
            <div className={member ? "match-card" : "match-card error"}>
              {member ? (
                <>
                  <strong>{member.name}</strong>
                  <span>
                    {member.kind === "prospect" ? "准会员 · 不记录到诊及回访" : `${member.level} · 最近治疗到诊 ${member.lastVisit}`}
                  </span>
                </>
              ) : (
                <>未找到该会员卡号，请先补齐会员档案</>
              )}
            </div>
          )}
          <label>
            治疗日期
            <input name="date" type="date" defaultValue={today} required />
          </label>
          <button
            className="primary-action wide"
            disabled={!member || member.kind === "prospect" || (role !== "member_admin" && role !== "management")}
          >
            保存治疗并创建服务周期
          </button>
        </form>
        <article className="panel info-card">
          <ShieldCheck size={25} />
          <h3>统计口径</h3>
          <p>
            准会员不生成任何到诊记录和回访提醒。正式会员仅记录实际治疗到诊，保存后在同一事务中生成六项服务任务。
          </p>
        </article>
      </div>
    </>
  );
}

function ImportPage({
  role,
  batches,
  notify,
}: {
  role: Role;
  batches: ImportBatch[];
  notify: (s: string) => void;
}) {
  const [result, setResult] = useState<{
    rows: number;
    errors: string[];
    summary?: string;
  } | null>(null);
  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { default: readXlsxFile } = await import("read-excel-file");
      const workbook = await readXlsxFile(file);
      const rows = Array.isArray(workbook[0]) ? workbook : (workbook[0] as unknown as { data: unknown[][] })?.data;
      if (!rows?.length) throw new Error("工作表为空");
      const headers = rows[0]?.map(String) || [];
      const officialExport = headers.includes("会员姓名") && headers.includes("手机");
      const required = officialExport
        ? ["会员卡号", "会员姓名", "手机"]
        : ["会员卡号", "姓名", "会员等级"];
      const missing = required.filter((x) => !headers.includes(x));
      if (missing.length) {
        setResult({ rows: Math.max(rows.length - 1, 0), errors: missing.map((x) => `缺少必填列：${x}`) });
        notify("文件校验完成，存在错误");
        return;
      }
      if (officialExport) {
        const column = (name: string) => headers.indexOf(name);
        const entries = rows.slice(1).map((row) => ({
          cardNumber: String(row[column("会员卡号")] ?? "").trim(),
          name: String(row[column("会员姓名")] ?? "").trim(),
          phone: String(row[column("手机")] ?? "").trim(),
          consultant: String(row[column("所属顾问")] ?? "").trim(),
          joinedOn: String(row[column("入会时间")] ?? "").slice(0, 10),
        })).filter((entry) => entry.cardNumber && entry.name);
        const sync = await syncMemberCardNumbers(entries);
        const exceptions = [
          ...sync.unmatched.map((item) => `未匹配：${item}`),
          ...sync.ambiguous.map((item) => `待人工确认：${item}`),
        ];
        setResult({
          rows: sync.sourceRows,
          errors: exceptions,
          summary: `匹配 ${sync.matched} 人；更新 ${sync.updated} 人；原卡号已一致 ${sync.unchanged} 人`,
        });
        notify(`会员卡号同步完成：已更新 ${sync.updated} 人`);
        return;
      }
      setResult({
        rows: Math.max(rows.length - 1, 0),
        errors: [],
      });
      notify(
        missing.length
          ? "文件校验完成，存在错误"
          : "文件预检通过",
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
          必填列：会员卡号、姓名、会员等级。支持附带所属咨询、是否建会员服务群、是否建档小程序、生日、入会日期、有效期和历史治疗日期；会员卡号作为导入与治疗到诊的唯一匹配依据。
        </p>
        <label className="upload-button">
          选择 .xlsx 文件
          <input
            type="file"
            accept=".xlsx"
            disabled={role !== "member_admin" && role !== "management"}
            onChange={handle}
          />
        </label>
        {role !== "member_admin" && role !== "management" && (
          <small>当前角色没有导入权限</small>
        )}
        {result && (
          <div
            className={
              result.errors.length ? "import-result error" : "import-result"
            }
          >
            <strong>读取 {result.rows} 行</strong>
            {result.summary && <p>{result.summary}</p>}
            {result.errors.length ? (
              result.errors.map((x) => <p key={x}>{x}</p>)
            ) : (
              <p>字段完整；当前页面完成预检，正式写入前仍需确认匹配与异常清单。</p>
            )}
          </div>
        )}
      </div>
      <section className="execution-section">
        <div className="section-heading">
          <div>
            <h2>最近导入记录</h2>
            <p>来自 Supabase 的真实导入批次状态。</p>
          </div>
        </div>
        <div className="panel data-table task-table">
          <div className="data-row data-head">
            <span>文件</span>
            <span>状态</span>
            <span>总行数</span>
            <span>成功 / 失败</span>
            <span>导入时间</span>
          </div>
          {batches.map((batch) => (
            <div className="data-row" key={batch.id}>
              <span>{batch.file_name}</span>
              <span>{batch.status === "completed" ? "已完成" : batch.status}</span>
              <span>{batch.total_rows}</span>
              <span>{batch.success_rows} / {batch.failed_rows}</span>
              <span>{batch.created_at}</span>
            </div>
          ))}
          {!batches.length && <p className="panel-footnote">暂无导入记录</p>}
        </div>
      </section>
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
  onClick,
}: {
  label: string;
  value: string;
  note: string;
  icon: typeof UsersRound;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button className="metric-card" onClick={onClick}>
      <div className={`metric-icon ${accent}`}>
        <Icon size={20} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </button>
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
  onClick,
}: {
  title: string;
  count: number;
  icon: typeof ClipboardCheck;
  onClick: () => void;
}) {
  return (
    <button className="task-card" onClick={onClick}>
      <span className="task-icon violet">
        <Icon size={20} />
      </span>
      <span className="task-copy">
        <strong>{title}</strong>
        <small>今日待处理</small>
      </span>
      <b>{count}</b>
      <i>待处理</i>
    </button>
  );
}
export default App;
