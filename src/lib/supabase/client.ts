import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null = url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY para conectar o banco.');
  return supabase;
}


export function getPublicSupabaseConfig(): { url: string; key: string } {
  if (!url || !key) throw new Error('A configuração pública do Supabase não está disponível.');
  return { url, key };
}
