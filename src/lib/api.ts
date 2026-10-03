import { supabase, usernameToAuthEmail } from './supabase'

export type MemberRow = {
  id: string
  member_card_number: string
  name: string
  phone: string
  consultant: string | null
  has_service_group: boolean
  level: 'V1' | 'V2' | 'V3' | 'V4' | 'V5'
  birthday: string | null
  joined_on: string | null
  membership_changed_on: string | null
  valid_until: string | null
  last_visit_date: string | null
  visit_count: number
}

export type DashboardData = {
  totalMembers: number
  monthlyVisitMembers: number
  serviceCompletionRate: number
  overdueTasks: number
  v1UpgradedMembers: string[]
  trend: { month: string; visits: number }[]
}

export type TimelineEvent = {
  source_id: string
  event_date: string
  event_type: string
  display_status: string
  is_historical: boolean
}

export type ImportBatch = {
  id: string
  file_name: string
  status: string
  total_rows: number
  success_rows: number
  failed_rows: number
  created_at: string
}

function client() {
  if (!supabase) throw new Error('尚未配置 Supabase 环境变量')
  return supabase
}

export async function signIn(username: string, password: string) {
  const { data, error } = await client().auth.signInWithPassword({ email: usernameToAuthEmail(username), password })
  if (error) throw new Error('登录名或密码错误')
  return data
}

export async function signOut() {
  const { error } = await client().auth.signOut()
  if (error) throw error
}

export async function getMyProfile() {
  const { data: auth } = await client().auth.getUser()
  if (!auth.user) throw new Error('登录会话已失效')
  const { data, error } = await client().from('profiles').select('id,username,display_name,role,is_enabled,must_change_password').eq('id', auth.user.id).single()
  if (error || !data?.is_enabled) throw new Error('账号不存在或已停用')
  return data
}

export async function restoreSession() {
  const { data } = await client().auth.getSession()
  if (!data.session) return null
  return getMyProfile()
}

export function onAuthStateChange(callback: (authenticated: boolean) => void) {
  const { data } = client().auth.onAuthStateChange((_event, session) => callback(Boolean(session)))
  return () => data.subscription.unsubscribe()
}

export async function listMembers() {
  const { data, error } = await client().from('members').select('*').eq('is_archived', false).order('name')
  if (error) throw error
  return data as MemberRow[]
}

export async function listTasks() {
  const { data, error } = await client().from('tasks').select('id,member_id,task_type,due_date,status,members(name,level)').order('due_date')
  if (error) throw error
  return data
}

export async function getDashboardData(): Promise<DashboardData> {
  const [{ data: metrics, error: metricsError }, { data: trend, error: trendError }, { data: upgrades, error: upgradesError }] = await Promise.all([
    client().from('dashboard_live_metrics').select('*').single(),
    client().from('monthly_visit_trend').select('month,member_count').order('month'),
    client().from('v1_member_upgrades').select('member_id'),
  ])
  if (metricsError) throw metricsError
  if (trendError) throw trendError
  if (upgradesError) throw upgradesError
  return {
    totalMembers: Number(metrics.total_members ?? 0),
    monthlyVisitMembers: Number(metrics.monthly_visit_members ?? 0),
    serviceCompletionRate: Number(metrics.service_completion_rate ?? 0),
    overdueTasks: Number(metrics.overdue_tasks ?? 0),
    v1UpgradedMembers: (upgrades ?? []).map((row) => row.member_id),
    trend: (trend ?? []).map((row) => ({ month: row.month, visits: Number(row.member_count ?? 0) })),
  }
}

export async function getMemberTimeline(memberId: string) {
  const { data, error } = await client()
    .from('member_timeline')
    .select('source_id,event_date,event_type,display_status,is_historical')
    .eq('member_id', memberId)
    .order('event_date', { ascending: false })
    .limit(100)
  if (error) throw error
  return data as TimelineEvent[]
}

export async function createMember(input: {
  name: string
  phone: string
  consultant: string | null
  has_service_group: boolean
  level: 'V1' | 'V2' | 'V3' | 'V4' | 'V5'
  birthday: string | null
  joined_on: string | null
  membership_changed_on: string | null
}) {
  const { data: auth } = await client().auth.getUser()
  if (!auth.user) throw new Error('登录会话已失效')
  const { data, error } = await client()
    .from('members')
    .insert({ ...input, created_by: auth.user.id, updated_by: auth.user.id })
    .select('*')
    .single()
  if (error) throw error
  return data as MemberRow
}

export async function updateMember(memberId: string, input: {
  name: string
  phone: string
  consultant: string | null
  has_service_group: boolean
  level: 'V1' | 'V2' | 'V3' | 'V4' | 'V5'
  birthday: string | null
  joined_on: string | null
  membership_changed_on: string | null
}) {
  const { data: auth } = await client().auth.getUser()
  if (!auth.user) throw new Error('登录会话已失效')
  const { data, error } = await client()
    .from('members')
    .update({ ...input, updated_by: auth.user.id })
    .eq('id', memberId)
    .select('*')
    .single()
  if (error) throw error
  return data as MemberRow
}

export async function listImportBatches() {
  const { data, error } = await client()
    .from('import_batches')
    .select('id,file_name,status,total_rows,success_rows,failed_rows,created_at')
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw error
  return data as ImportBatch[]
}

export async function createTreatment(memberId: string, date: string) {
  const { data, error } = await client().rpc('create_treatment_cycle', { target_member_id: memberId, target_date: date })
  if (error) throw error
  return data
}

export async function completeTask(taskId: string) {
  const { data, error } = await client().rpc('complete_task', { target_task_id: taskId })
  if (error) throw error
  return data
}

export async function confirmD0(taskIds: string[]) {
  const { data, error } = await client().rpc('confirm_d0', { target_task_ids: taskIds })
  if (error) throw error
  return data
}

export async function processTaskBatch(taskIds: string[]) {
  const { data, error } = await client().rpc('process_task_batch', { target_task_ids: taskIds })
  if (error) throw error
  return Number(data ?? 0)
}
