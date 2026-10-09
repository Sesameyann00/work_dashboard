import { supabase, usernameToAuthEmail } from './supabase'

export type MemberRow = {
  id: string
  member_card_number: string
  source_card_number: string | null
  name: string
  phone: string | null
  consultant: string | null
  has_service_group: boolean
  has_mini_program_profile: boolean
  member_kind: 'prospect' | 'member'
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
  prospectCount: number
  prospectConvertedThisMonth: number
  levelVisitCounts: { level: string; visits: number }[]
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

export type CardSyncEntry = {
  cardNumber: string
  name: string
  phone: string
  consultant: string
  joinedOn: string
}

export type CardSyncResult = {
  sourceRows: number
  matched: number
  updated: number
  unchanged: number
  unmatched: string[]
  ambiguous: string[]
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
  const { data, error } = await client().from('tasks').select('id,member_id,task_type,due_date,status,members(name,level,member_kind,consultant)').order('due_date')
  if (error) throw error
  return data
}

export async function getDashboardData(): Promise<DashboardData> {
  const { data, error } = await client().rpc('get_management_dashboard')
  if (error) throw error
  const payload = data as {
    metrics?: Record<string, unknown>
    trend?: { month: string; member_count: number }[]
    level_visits?: { level: string; member_count: number }[]
  }
  const metrics = payload.metrics ?? {}
  const trend = payload.trend ?? []
  const levelVisits = payload.level_visits ?? []
  return {
    totalMembers: Number(metrics.total_members ?? 0),
    monthlyVisitMembers: Number(metrics.monthly_visit_members ?? 0),
    serviceCompletionRate: Number(metrics.service_completion_rate ?? 0),
    overdueTasks: Number(metrics.overdue_tasks ?? 0),
    prospectCount: Number(metrics.prospect_count ?? 0),
    prospectConvertedThisMonth: Number(metrics.prospect_converted_this_month ?? 0),
    levelVisitCounts: (levelVisits ?? []).map((row) => ({ level: row.level, visits: Number(row.member_count ?? 0) })),
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
  source_card_number: string
  consultant: string | null
  has_service_group: boolean
  has_mini_program_profile: boolean
  member_kind: 'prospect' | 'member'
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
  source_card_number: string | null
  consultant: string | null
  has_service_group: boolean
  has_mini_program_profile: boolean
  member_kind: 'prospect' | 'member'
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

export async function processTaskBatch(taskIds: string[], targetStatus: 'completed' | 'archived') {
  const { data, error } = await client().rpc('process_task_batch', { target_task_ids: taskIds, target_status: targetStatus })
  if (error) throw error
  return Number(data ?? 0)
}

export async function syncMemberCardNumbers(entries: CardSyncEntry[]): Promise<CardSyncResult> {
  const { data: auth } = await client().auth.getUser()
  if (!auth.user) throw new Error('登录会话已失效')

  const { data, error } = await client()
    .from('members')
    .select('id,name,phone,consultant,joined_on,source_card_number,member_card_number')
  if (error) throw error

  const members = data ?? []
  const normalizePhone = (value: unknown) => String(value ?? '').replace(/\D/g, '')
  const byPhone = new Map<string, typeof members>()
  const byName = new Map<string, typeof members>()
  for (const member of members) {
    const phone = normalizePhone(member.phone)
    if (phone && phone !== '00000000000') byPhone.set(phone, [...(byPhone.get(phone) ?? []), member])
    const name = String(member.name ?? '').trim()
    if (name) byName.set(name, [...(byName.get(name) ?? []), member])
  }

  const planned = new Map<string, { id: string; card: string; current: string | null }>()
  const unmatched: string[] = []
  const ambiguous: string[] = []
  for (const entry of entries) {
    const card = entry.cardNumber.trim().toUpperCase()
    const phoneMatches = normalizePhone(entry.phone) && normalizePhone(entry.phone) !== '00000000000'
      ? byPhone.get(normalizePhone(entry.phone)) ?? []
      : []
    let candidates = phoneMatches.length === 1 ? phoneMatches : byName.get(entry.name.trim()) ?? []
    if (candidates.length > 1 && entry.consultant) {
      const consultantMatches = candidates.filter((member) => member.consultant === entry.consultant)
      if (consultantMatches.length) candidates = consultantMatches
    }
    if (candidates.length > 1 && entry.joinedOn) {
      const joinedMatches = candidates.filter((member) => member.joined_on === entry.joinedOn)
      if (joinedMatches.length) candidates = joinedMatches
    }
    if (candidates.length === 0) {
      unmatched.push(`${entry.name}（${card}）`)
      continue
    }
    if (candidates.length !== 1) {
      ambiguous.push(`${entry.name}（${card}）`)
      continue
    }
    const member = candidates[0]
    const prior = planned.get(member.id)
    if (prior && prior.card !== card) {
      ambiguous.push(`${entry.name}（同一档案对应多个卡号）`)
      planned.delete(member.id)
      continue
    }
    planned.set(member.id, { id: member.id, card, current: member.source_card_number })
  }

  const assignedCards = new Set(Array.from(planned.values()).map((item) => item.card))
  if (assignedCards.size !== planned.size) throw new Error('核对失败：多个会员档案对应同一张会员卡')

  const changes = Array.from(planned.values()).filter((item) => item.current !== item.card)
  for (const item of changes) {
    const { error: updateError } = await client()
      .from('members')
      .update({ source_card_number: item.card, updated_by: auth.user.id })
      .eq('id', item.id)
    if (updateError) throw updateError
  }

  return {
    sourceRows: entries.length,
    matched: planned.size,
    updated: changes.length,
    unchanged: planned.size - changes.length,
    unmatched,
    ambiguous,
  }
}
