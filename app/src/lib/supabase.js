import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Клиент создаётся только если сборка получила переменные.
// Иначе App покажет внятную ошибку вместо белого экрана.
export const supabase = url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
  : null;

export const missingConfig = !url || !key
  ? 'Сборка без VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — проверь Variables и Secrets в GitHub Actions'
  : null;
