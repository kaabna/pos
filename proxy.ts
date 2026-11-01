import { createServerClient } from '@supabase/ssr';
import { type NextRequest, NextResponse } from 'next/server';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === '/login';

  let supabaseResponse = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return isLoginPage ? supabaseResponse : NextResponse.redirect(new URL('/login', request.url));
  }

  // دالة مساعدة لإعادة التوجيه مع نقل جميع الكوكيز المحدثة لمنع الحلقات المفرغة
  function redirectWithCookies(targetPath: string) {
    if (pathname === targetPath) {
      return supabaseResponse;
    }
    const redirectUrl = new URL(targetPath, request.url);
    const redirectResponse = NextResponse.redirect(redirectUrl);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });
    return redirectResponse;
  }

  // 1. التحقق من وجود كوكيز المصادقة في المتصفح أولاً قبل أي استدعاء شبكة خارجي
  const allCookies = request.cookies.getAll();
  const hasAuthCookie = allCookies.some(
    (c) => c.name.startsWith('sb-') && c.name.includes('-auth-token')
  );

  // إذا لم يكن لدى الزائر أي كوكيز مصادقة لـ Supabase:
  // فهو حتماً غير مسجل دخول - نتجنب تماماً استدعاء شبكة خارجي ثقيل
  if (!hasAuthCookie) {
    if (isLoginPage) {
      return supabaseResponse;
    }
    return redirectWithCookies('/login');
  }

  // 2. فحص ما إذا كان الطلب مجرد استعلام مسبق في الخلفية (Prefetch) بواسطة Next.js
  // تمريره فوراً لتفريغ سعة الشبكة ومنع طوفان الاتصالات المتزامنة لـ Supabase
  const isPrefetch =
    request.headers.get('next-router-prefetch') === '1' ||
    request.headers.get('purpose') === 'prefetch' ||
    request.headers.get('sec-purpose') === 'prefetch';

  if (isPrefetch) {
    return supabaseResponse;
  }

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
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // تحديث الجلسة والتحقق من وجود المستخدم
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
  }

  // 1. المستخدم غير مسجل دخول ويحاول فتح صفحة محمية
  if (!user) {
    if (isLoginPage) {
      return supabaseResponse;
    }
    return redirectWithCookies('/login');
  }

  // 2. المستخدم مسجل دخول بالفعل ويحاول فتح صفحة تسجيل الدخول
  if (isLoginPage) {
    return redirectWithCookies('/stores');
  }

  // 3. الصفحة الرئيسية يتم توجيهها إلى المحلات
  if (pathname === '/') {
    return redirectWithCookies('/stores');
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * استثناء مسارات الـ API بالكامل والملفات الثابتة والأيقونات
     * لمنع أي استهلاك لموارد الشبكة على سفاري والأجهزة المحمولة
     */
    '/((?!api|_next/static|_next/image|favicon.ico|apple-touch-icon.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
};
