import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase-server";

const allowedPermissions = new Set(["pos", "inventory", "repairs", "purchases", "employees", "tasks", "roadmap", "ledger"]);

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request: NextRequest, context: RouteContext<"/api/stores/[storeId]/employees">) {
  const { storeId } = await context.params;
  const sessionClient = await createServerSupabaseClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ message: "يلزم تسجيل الدخول." }, { status: 401 });

  const { data: profile } = await sessionClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "owner" && profile?.role !== "admin") {
    return NextResponse.json({ message: "ليس لديك صلاحية إضافة موظفين." }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "البيانات المدخلة غير صالحة." }, { status: 400 });
  }

  const data = body as { email?: unknown; fullName?: unknown; password?: unknown; permissions?: unknown };
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const fullName = typeof data.fullName === "string" ? data.fullName.trim() : "";
  const password = typeof data.password === "string" ? data.password.trim() : "";
  const permissions = Array.isArray(data.permissions)
    ? data.permissions.filter((permission): permission is string => typeof permission === "string" && allowedPermissions.has(permission))
    : [];

  if (!email || !fullName || !permissions.length) {
    return NextResponse.json({ message: "أدخل البريد والاسم واختر صلاحية واحدة على الأقل." }, { status: 400 });
  }
  if (password && password.length < 6) {
    return NextResponse.json({ message: "يجب أن تتكون كلمة المرور من 6 أحرف أو أرقام على الأقل." }, { status: 400 });
  }

  const adminClient = getAdminClient();
  if (!adminClient) {
    return NextResponse.json({ message: "مفتاح SUPABASE_SERVICE_ROLE_KEY غير مضبوط على الخادم لإدارة حسابات الموظفين." }, { status: 503 });
  }

  // البحث عما إذا كان المستخدم مضافاً مسبقاً (يدوياً في Supabase Auth أو من قبل)
  const { data: usersList, error: listError } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listError) {
    return NextResponse.json({ message: "تعذر التحقق من قائمة المستخدمين في النظام." }, { status: 400 });
  }

  const existingAuthUser = usersList.users.find((item) => item.email?.toLowerCase() === email);
  let targetUserId = existingAuthUser?.id ?? "";
  let createdNewAuthUser = false;

  if (existingAuthUser) {
    if (existingAuthUser.id === user.id) {
      return NextResponse.json({ message: "لا يمكنك تحويل حساب المدير الحالي إلى حساب موظف." }, { status: 400 });
    }
    const updatePayload: {
      email_confirm: boolean;
      user_metadata: { full_name: string };
      password?: string;
    } = {
      email_confirm: true,
      user_metadata: { ...(existingAuthUser.user_metadata ?? {}), full_name: fullName },
    };
    if (password) {
      updatePayload.password = password;
    }
    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(existingAuthUser.id, updatePayload);
    if (updateAuthError) {
      return NextResponse.json({ message: "تعذر تحديث بيانات دخول الموظف الحالي." }, { status: 400 });
    }
  } else if (password) {
    // إنشاء الحساب مباشرة وتفعيله دون الحاجة لرسالة بريد إلكتروني
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (createError || !created.user) {
      return NextResponse.json({ message: "تعذر إنشاء حساب الموظف. تحقق من صحة البريد الإلكتروني وكلمة المرور." }, { status: 400 });
    }
    targetUserId = created.user.id;
    createdNewAuthUser = true;
  } else {
    // في حال عدم إدخال كلمة مرور والمستخدم غير موجود، نحاول إرسال دعوة بريدية
    const { data: invitation, error: invitationError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin}/login`,
    });
    if (invitationError || !invitation.user) {
      return NextResponse.json({
        message: "تعذر إرسال دعوة البريد. أدخل كلمة مرور للموظف في الحقل المخصص لإضافته وتفعيله مباشرة بدون إيميل.",
      }, { status: 400 });
    }
    targetUserId = invitation.user.id;
    createdNewAuthUser = true;
  }

  // ضبط الدور دائماً كـ employee حتى لا يتمكن من رؤية جميع المحلات
  const { error: profileError } = await adminClient
    .from("profiles")
    .upsert({ id: targetUserId, full_name: fullName, role: "employee" });

  if (profileError) {
    if (createdNewAuthUser) await adminClient.auth.admin.deleteUser(targetUserId);
    return NextResponse.json({ message: "تعذر حفظ الملف الشخصي للموظف." }, { status: 400 });
  }

  // ربط الموظف بهذا المحل الواحد فقط وإزالة أي ارتباط بأي محل آخر
  await adminClient.from("store_members").delete().eq("user_id", targetUserId);
  const { error: memberError } = await adminClient
    .from("store_members")
    .insert({ store_id: storeId, user_id: targetUserId, permissions });

  if (memberError) {
    if (createdNewAuthUser) await adminClient.auth.admin.deleteUser(targetUserId);
    return NextResponse.json({ message: "تعذر ربط الموظف بهذا المتجر." }, { status: 400 });
  }

  return NextResponse.json({
    message: existingAuthUser
      ? "تم ربط حساب الموظف بهذا المتجر فقط وتفعيل دخوله بنجاح."
      : password
        ? "تم إنشاء حساب الموظف وتفعيله وربطه بهذا المتجر فقط بنجاح."
        : "تم إرسال دعوة الموظف وإضافته إلى هذا المتجر فقط.",
  }, { status: 201 });
}

export async function PATCH(request: NextRequest, context: RouteContext<"/api/stores/[storeId]/employees">) {
  const { storeId } = await context.params;
  const sessionClient = await createServerSupabaseClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ message: "يلزم تسجيل الدخول." }, { status: 401 });

  const { data: profile } = await sessionClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "owner" && profile?.role !== "admin") {
    return NextResponse.json({ message: "ليس لديك صلاحية تعديل صلاحيات الموظفين." }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ message: "البيانات المدخلة غير صالحة." }, { status: 400 });
  const data = body as { userId?: unknown; permissions?: unknown; password?: unknown; fullName?: unknown };
  const userId = typeof data.userId === "string" ? data.userId : "";
  const password = typeof data.password === "string" ? data.password.trim() : "";
  const fullName = typeof data.fullName === "string" ? data.fullName.trim() : "";
  const permissions = Array.isArray(data.permissions)
    ? data.permissions.filter((permission): permission is string => typeof permission === "string" && allowedPermissions.has(permission))
    : [];

  if (!userId || !permissions.length) {
    return NextResponse.json({ message: "اختر الموظف وصلاحية واحدة على الأقل." }, { status: 400 });
  }
  if (password && password.length < 6) {
    return NextResponse.json({ message: "يجب أن تتكون كلمة المرور من 6 أحرف أو أرقام على الأقل." }, { status: 400 });
  }

  const adminClient = getAdminClient();
  const dbClient = adminClient ?? sessionClient;

  if (userId !== user.id && adminClient) {
    // التأكد من أن الموظف يحمل دور employee وليس admin لئلا يدخل لجميع المحلات
    const profileUpdate: { role: "employee"; full_name?: string } = { role: "employee" };
    if (fullName) profileUpdate.full_name = fullName;
    await adminClient.from("profiles").update(profileUpdate).eq("id", userId);

    // التأكد من عدم وجود عضوية له في أي محل آخر غير هذا المحل
    await adminClient.from("store_members").delete().eq("user_id", userId).neq("store_id", storeId);

    if (password) {
      const { error: pwdError } = await adminClient.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
      if (pwdError) {
        return NextResponse.json({ message: "تعذر تحديث كلمة مرور الموظف." }, { status: 400 });
      }
    }
  }

  const { error } = await dbClient
    .from("store_members")
    .update({ permissions })
    .eq("store_id", storeId)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ message: "تعذر تحديث صلاحيات الموظف." }, { status: 400 });
  return NextResponse.json({ message: password ? "تم تحديث صلاحيات وكلمة مرور الموظف بنجاح." : "تم تحديث صلاحيات الموظف." });
}

export async function DELETE(request: NextRequest, context: RouteContext<"/api/stores/[storeId]/employees">) {
  const { storeId } = await context.params;
  const sessionClient = await createServerSupabaseClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return NextResponse.json({ message: "يلزم تسجيل الدخول." }, { status: 401 });

  const { data: profile } = await sessionClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "owner" && profile?.role !== "admin") {
    return NextResponse.json({ message: "ليس لديك صلاحية إزالة الموظفين." }, { status: 403 });
  }

  const userId = request.nextUrl.searchParams.get("userId") ?? "";
  if (!userId) return NextResponse.json({ message: "حدد الموظف المراد إزالته." }, { status: 400 });

  const adminClient = getAdminClient() ?? sessionClient;
  const { error } = await adminClient.from("store_members").delete().eq("store_id", storeId).eq("user_id", userId);
  if (error) return NextResponse.json({ message: "تعذر إزالة الموظف من المتجر." }, { status: 400 });

  return NextResponse.json({ message: "تمت إزالة الموظف من هذا المتجر." });
}