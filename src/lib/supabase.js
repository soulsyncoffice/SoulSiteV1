import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

if (Boolean(supabaseUrl) !== Boolean(supabaseAnonKey)) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY together.')
}

export const supabase = supabaseUrl
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
