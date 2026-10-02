import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const hasSupabaseConfig = Boolean(url && key)
export const supabase = hasSupabaseConfig ? createClient(url, key) : null

export function usernameToAuthEmail(username: string) {
  const normalized = username.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(normalized)) throw new Error('登录名格式不正确')
  return `${normalized}@auth.charmsway.internal`
}
