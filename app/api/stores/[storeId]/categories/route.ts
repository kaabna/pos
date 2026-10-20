import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase-server";

const defaultCategories = [
  { value: "accessory", label: "إكسسوارات" },
  { value: "repair_part", label: "قطع صيانة" },
  { value: "phone", label: "هواتف" },
  { value: "service", label: "خدمات" },
];

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function verifyStoreAccess(storeId: string) {
  const sessionClient = await createServerSupabaseClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return { authorized: false as const, sessionClient };

  const [{ data: profile }, { data: membership }] = await Promise.all([
    sessionClient.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    sessionClient.from("store_members").select("store_id").eq("user_id", user.id).eq("store_id", storeId).maybeSingle(),
  ]);

  const isAdmin = profile?.role === "owner" || profile?.role === "admin";
  if (!isAdmin && !membership) return { authorized: false as const, sessionClient };
  return { authorized: true as const, sessionClient };
}

export async function GET(_request: NextRequest, context: RouteContext<"/api/stores/[storeId]/categories">) {
  const { storeId } = await context.params;
  const { authorized, sessionClient } = await verifyStoreAccess(storeId);
  if (!authorized) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });

  const db = getAdminClient() ?? sessionClient;
  const [{ data: customRows }, { data: itemRows }] = await Promise.all([
    db.from("store_categories").select("name").eq("store_id", storeId).order("created_at"),
    db.from("inventory_items").select("category").eq("store_id", storeId),
  ]);

  const map = new Map<string, string>();
  for (const cat of defaultCategories) {
    map.set(cat.value, cat.label);
  }
  for (const row of customRows ?? []) {
    if (row.name && !map.has(row.name)) {
      map.set(row.name, row.name);
    }
  }
  for (const row of itemRows ?? []) {
    if (row.category && !map.has(row.category)) {
      map.set(row.category, row.category);
    }
  }

  const categories = [...map.entries()].map(([value, label]) => ({ value, label }));
  return NextResponse.json({ categories });
}

export async function POST(request: NextRequest, context: RouteContext<"/api/stores/[storeId]/categories">) {
  const { storeId } = await context.params;
  const { authorized, sessionClient } = await verifyStoreAccess(storeId);
  if (!authorized) return NextResponse.json({ message: "غير مصرح بإضافة تصنيف." }, { status: 403 });

  const body: unknown = await request.json().catch(() => null);
  const name = body && typeof body === "object" && typeof (body as { name?: unknown }).name === "string"
    ? (body as { name: string }).name.trim()
    : "";

  if (!name) {
    return NextResponse.json({ message: "أدخل اسم التصنيف." }, { status: 400 });
  }

  const db = getAdminClient() ?? sessionClient;
  // محاولة الحفظ في جدول store_categories إن كان مطبقاً في قاعدة البيانات
  await db.from("store_categories").upsert({ store_id: storeId, name }, { onConflict: "store_id,name" });

  return NextResponse.json({ category: { value: name, label: name }, message: "تمت إضافة التصنيف بنجاح." }, { status: 201 });
}
