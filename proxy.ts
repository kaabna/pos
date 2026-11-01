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

  // تحديث الجلسة والتحقق من وجود المستخدم بطريقة قياسية وخفيفة
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    user = null;
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
     * لمنع أي إعادة توجيه خاطئة أو تعليق لطلبات الـ JSON على سفاري والآيفون
     */
    '/((?!api|_next/static|_next/image|favicon.ico|apple-touch-icon.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)',
  ],
};
