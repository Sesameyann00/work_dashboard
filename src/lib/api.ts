import { supabase, usernameToAuthEmail } from './supabase'

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

export async function listMembers() {
  const { data, error } = await client().from('members').select('*').eq('is_archived', false).order('name')
  if (error) throw error
  return data
}

export async function listTasks() {
  const { data, error } = await client().from('tasks').select('id,member_id,task_type,due_date,status,members(name,level)').order('due_date')
  if (error) throw error
  return data
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
