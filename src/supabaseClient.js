import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Customer-facing session (default storage key)
export const supabase = createClient(supabaseUrl, supabaseKey)

// Admin session — separate storage key so logging into /admin
// does not share or interfere with a customer's login on the
// same browser, even though it's the same Supabase project.
export const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storageKey: 'sb-admin-auth',
    persistSession: true,
    autoRefreshToken: true,
  },
})