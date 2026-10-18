import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase-server";

const allowedPermissions = new Set(["pos", "inventory", "repairs", "purchases", "employees", "tasks", "roadmap", "ledger"]);

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
  if (!body || typeof body !== "object") return NextResponse.json({ message: "البيانات المدخلة غير صالحة." }, { status: 400 });
  const data = body as { email?: unknown; fullName?: unknown; permissions?: unknown };
  const email = typeof data.email === "string" ? data.email.trim() : "";
  const fullName = typeof data.fullName === "string" ? data.fullName.trim() : "";
  const permissions = Array.isArray(data.permissions) ? data.permissions.filter((permission): permission is string => typeof permission === "string" && allowedPermissions.has(permission)) : [];
  if (!email || !fullName || !permissions.length) {
    return NextResponse.json({ message: "أدخل البريد والاسم واختر صلاحية واحدة على الأقل." }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ message: "إعداد دعوات الموظفين غير مكتمل على الخادم." }, { status: 503 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: invitation, error: invitationError } = await adminClient.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin}/login`,
  });
  const invitedUser = invitation.user;
  if (invitationError || !invitedUser) {
    return NextResponse.json({ message: "تعذر إرسال دعوة الموظف. تحقق من البريد وإعداد البريد الصادر." }, { status: 400 });
  }

  const { error: profileError } = await adminClient.from("profiles").upsert({ id: invitedUser.id, full_name: fullName, role: "employee" });
  const { error: memberError } = profileError ? { error: profileError } : await adminClient.from("store_members").insert({ store_id: storeId, user_id: invitedUser.id, permissions });
  if (profileError || memberError) {
    await adminClient.auth.admin.deleteUser(invitedUser.id);
    return NextResponse.json({ message: "تعذر إنشاء عضوية الموظف لهذا المتجر." }, { status: 400 });
  }

  return NextResponse.json({ message: "تم إرسال دعوة الموظف وإضافته إلى المتجر." }, { status: 201 });
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
  const data = body as { userId?: unknown; permissions?: unknown };
  const userId = typeof data.userId === "string" ? data.userId : "";
  const permissions = Array.isArray(data.permissions) ? data.permissions.filter((permission): permission is string => typeof permission === "string" && allowedPermissions.has(permission)) : [];
  if (!userId || !permissions.length) {
    return NextResponse.json({ message: "اختر الموظف وصلاحية واحدة على الأقل." }, { status: 400 });
  }

  const { data: targetProfile } = await sessionClient.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (targetProfile?.role !== "employee") {
    return NextResponse.json({ message: "يمكن تعديل صلاحيات الموظفين فقط." }, { status: 400 });
  }

  const { error } = await sessionClient.from("store_members").update({ permissions }).eq("store_id", storeId).eq("user_id", userId);
  if (error) return NextResponse.json({ message: "تعذر تحديث صلاحيات الموظف." }, { status: 400 });
  return NextResponse.json({ message: "تم تحديث صلاحيات الموظف." });
}