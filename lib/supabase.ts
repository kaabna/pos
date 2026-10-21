import { createBrowserClient } from '@supabase/ssr';

let client: ReturnType<typeof createBrowserClient> | null = null;

function getSupabaseEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error('إعدادات Supabase غير مكتملة.');
  }

  return { url, anonKey };
}

export function getSupabaseClient() {
  if (client) return client;
  const { url, anonKey } = getSupabaseEnvironment();
  client = createBrowserClient(url, anonKey, {
    cookieOptions: {
      path: '/',
      sameSite: 'lax',
    },
  });
  return client;
}
