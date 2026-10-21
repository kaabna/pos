import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isLogin = pathname === '/login';
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return isLogin ? NextResponse.next() : NextResponse.redirect(new URL('/login', request.url));
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, {
              ...options,
              path: '/',
              sameSite: 'lax',
            })
          );
        },
      },
    }
  );

  function redirectTo(path: string) {
    if (pathname === path) {
      return supabaseResponse;
    }
    const response = NextResponse.redirect(new URL(path, request.url));
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie.name, cookie.value, {
        path: '/',
        sameSite: 'lax',
      });
    });
    return response;
  }

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  if (!user) {
    return isLogin ? supabaseResponse : redirectTo('/login');
  }

  let profile: { role: string } | null = null;
  let memberships: Array<{ store_id: string; permissions: string[] }> = [];

  try {
    const [profileRes, membershipsRes] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
      supabase.from('store_members').select('store_id, permissions').eq('user_id', user.id),
    ]);
    profile = profileRes.data;
    memberships = (membershipsRes.data as Array<{ store_id: string; permissions: string[] }>) ?? [];
  } catch {
    profile = null;
    memberships = [];
  }

  if (!profile || !['owner', 'admin', 'employee'].includes(profile.role)) {
    if (isLogin) return supabaseResponse;
    return redirectTo('/login');
  }

  const isAdmin = profile.role === 'owner' || profile.role === 'admin';
  const requestedStore = pathname.match(/^\/s\/([^/]+)/)?.[1];

  if (isLogin) {
    if (isAdmin) return redirectTo('/stores');
    const assignedStore = memberships?.[0];
    if (assignedStore) {
      const permissions = Array.isArray(assignedStore.permissions) ? assignedStore.permissions : [];
      const firstModule = ['pos', 'inventory', 'repairs', 'tasks', 'roadmap', 'purchases', 'employees', 'ledger'].find((module) => permissions.includes(module));
      return redirectTo(firstModule ? `/s/${assignedStore.store_id}/${firstModule}` : `/s/${assignedStore.store_id}`);
    }
    return supabaseResponse;
  }

  if (pathname === '/') {
    if (isAdmin) return redirectTo('/stores');
    const assignedStore = memberships?.[0];
    if (assignedStore) {
      const permissions = Array.isArray(assignedStore.permissions) ? assignedStore.permissions : [];
      const firstModule = ['pos', 'inventory', 'repairs', 'tasks', 'roadmap', 'purchases', 'employees', 'ledger'].find((module) => permissions.includes(module));
      return redirectTo(firstModule ? `/s/${assignedStore.store_id}/${firstModule}` : `/s/${assignedStore.store_id}`);
    }
    return redirectTo('/login');
  }

  if (pathname === '/stores' && !isAdmin) {
    return redirectTo(memberships?.[0]?.store_id ? `/s/${memberships[0].store_id}` : '/login');
  }

  if (requestedStore && !isAdmin && !memberships?.some((membership) => membership.store_id === requestedStore)) {
    const assignedStore = memberships?.[0]?.store_id;
    return redirectTo(assignedStore ? `/s/${assignedStore}` : '/login');
  }

  const requestedModule = pathname.match(/^\/s\/[^/]+\/([^/]+)/)?.[1];
  if (requestedStore && requestedModule && !isAdmin) {
    const membership = memberships?.find((item) => item.store_id === requestedStore);
    const permissions = Array.isArray(membership?.permissions) ? membership.permissions : [];
    if (!permissions.includes(requestedModule)) {
      const fallback = ['pos', 'inventory', 'repairs', 'tasks', 'roadmap', 'purchases', 'employees', 'ledger'].find((module) => permissions.includes(module));
      return redirectTo(fallback ? `/s/${requestedStore}/${fallback}` : `/s/${requestedStore}`);
    }
  }

  const legacyModule = pathname.match(/^\/(inventory|pos|repairs|tasks|roadmap)(?:\/|$)/)?.[1];
  if (legacyModule) {
    if (isAdmin) return redirectTo('/stores');
    const assignedStore = memberships?.[0]?.store_id;
    return redirectTo(assignedStore ? `/s/${assignedStore}/${legacyModule}` : '/stores');
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|apple-touch-icon.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
};
