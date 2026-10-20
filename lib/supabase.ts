import { createBrowserClient } from '@supabase/ssr';

function getSupabaseEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('إعدادات Supabase غير مكتملة.');
  }

  return { url, anonKey };
}

export function getSupabaseClient() {
  const { url, anonKey } = getSupabaseEnvironment();
  return createBrowserClient(url, anonKey);
}
