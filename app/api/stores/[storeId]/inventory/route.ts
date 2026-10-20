import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase-server";

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
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  if (!user) return { authorized: false as const, sessionClient, user: null };

  const [{ data: profile }, { data: membership }] = await Promise.all([
    sessionClient.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    sessionClient.from("store_members").select("store_id, permissions").eq("user_id", user.id).eq("store_id", storeId).maybeSingle(),
  ]);

  const isAdmin = profile?.role === "owner" || profile?.role === "admin";
  const permissions = Array.isArray(membership?.permissions) ? (membership.permissions as string[]) : [];
  const canInventory = isAdmin || Boolean(membership && (permissions.includes("inventory") || permissions.includes("purchases") || permissions.includes("pos")));

  if (!canInventory) return { authorized: false as const, sessionClient, user };
  return { authorized: true as const, sessionClient, user, isAdmin };
}

export async function GET(_request: NextRequest, context: RouteContext<"/api/stores/[storeId]/inventory">) {
  const { storeId } = await context.params;
  const { authorized, sessionClient } = await verifyStoreAccess(storeId);
  if (!authorized) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });

  const db = getAdminClient() ?? sessionClient;
  const { data, error } = await db
    .from("inventory_items")
    .select("id, store_id, name, category, sku, barcode, quantity, cost_price, selling_price, discount, imei_tracking, supplier_id")
    .eq("store_id", storeId)
    .order("name");

  if (error) {
    return NextResponse.json({ message: "تعذر تحميل عناصر المخزون." }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: NextRequest, context: RouteContext<"/api/stores/[storeId]/inventory">) {
  const { storeId } = await context.params;
  const { authorized, sessionClient } = await verifyStoreAccess(storeId);
  if (!authorized) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "بيانات الطلب غير صالحة." }, { status: 400 });
  }

  const p = body as {
    name?: string;
    category?: string;
    sku?: string;
    barcode?: string;
    quantity?: number;
    cost_price?: number;
    selling_price?: number;
    discount?: number;
    imei_tracking?: boolean;
    supplier_id?: string | null;
  };

  const name = (p.name ?? "").trim();
  const category = (p.category ?? "").trim() || "accessory";
  const sku = (p.sku ?? "").trim();
  const barcode = (p.barcode ?? "").trim() || null;
  const quantity = Math.max(0, Math.floor(Number(p.quantity) || 0));
  const costPrice = Math.max(0, Number(p.cost_price) || 0);
  const sellingPrice = Math.max(0, Number(p.selling_price) || 0);
  const discount = Math.min(100, Math.max(0, Number(p.discount) || 0));
  const imeiTracking = Boolean(p.imei_tracking);
  const supplierId = p.supplier_id && p.supplier_id.length > 0 ? p.supplier_id : null;

  if (!name || !sku) {
    return NextResponse.json({ message: "اسم المنتج ورقم SKU مطلوبان." }, { status: 400 });
  }

  const db = getAdminClient() ?? sessionClient;
  const { data, error } = await db
    .from("inventory_items")
    .insert({
      store_id: storeId,
      name,
      category,
      sku,
      barcode,
      quantity,
      cost_price: costPrice,
      selling_price: sellingPrice,
      discount,
      imei_tracking: imeiTracking,
      supplier_id: supplierId,
    })
    .select("id, store_id, name, category, sku, barcode, quantity, cost_price, selling_price, discount, imei_tracking, supplier_id")
    .single();

  if (error || !data) {
    const errorMsg = error?.message?.includes("sku")
      ? "رقم SKU مسجل مسبقاً في هذا المتجر."
      : error?.message?.includes("barcode")
        ? "الباركود مسجل مسبقاً في هذا المتجر."
        : "تعذر إضافة العنصر إلى المخزون.";
    return NextResponse.json({ message: errorMsg }, { status: 400 });
  }

  return NextResponse.json({ item: data, message: "تمت إضافة العنصر بنجاح." }, { status: 201 });
}

export async function PATCH(request: NextRequest, context: RouteContext<"/api/stores/[storeId]/inventory">) {
  const { storeId } = await context.params;
  const { authorized, sessionClient } = await verifyStoreAccess(storeId);
  if (!authorized) return NextResponse.json({ message: "غير مصرح بتعديل المخزون." }, { status: 403 });

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "بيانات الطلب غير صالحة." }, { status: 400 });
  }

  const p = body as {
    id?: string;
    name?: string;
    category?: string;
    sku?: string;
    barcode?: string | null;
    quantity?: number;
    cost_price?: number;
    selling_price?: number;
    discount?: number;
    imei_tracking?: boolean;
    supplier_id?: string | null;
  };

  const itemId = p.id;
  if (!itemId) {
    return NextResponse.json({ message: "معرف العنصر مطلوب للتعديل." }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {};
  if (p.name !== undefined) updateData.name = p.name.trim();
  if (p.category !== undefined) updateData.category = p.category.trim();
  if (p.sku !== undefined) updateData.sku = p.sku.trim();
  if (p.barcode !== undefined) updateData.barcode = p.barcode ? p.barcode.trim() : null;
  if (p.quantity !== undefined) updateData.quantity = Math.max(0, Math.floor(Number(p.quantity) || 0));
  if (p.cost_price !== undefined) updateData.cost_price = Math.max(0, Number(p.cost_price) || 0);
  if (p.selling_price !== undefined) updateData.selling_price = Math.max(0, Number(p.selling_price) || 0);
  if (p.discount !== undefined) updateData.discount = Math.min(100, Math.max(0, Number(p.discount) || 0));
  if (p.imei_tracking !== undefined) updateData.imei_tracking = Boolean(p.imei_tracking);
  if (p.supplier_id !== undefined) updateData.supplier_id = p.supplier_id && p.supplier_id.length > 0 ? p.supplier_id : null;

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ message: "لا توجد حقول لتعديلها." }, { status: 400 });
  }

  const db = getAdminClient() ?? sessionClient;
  const { data, error } = await db
    .from("inventory_items")
    .update(updateData)
    .eq("id", itemId)
    .eq("store_id", storeId)
    .select("id, store_id, name, category, sku, barcode, quantity, cost_price, selling_price, discount, imei_tracking, supplier_id")
    .single();

  if (error || !data) {
    const errorMsg = error?.message?.includes("sku")
      ? "رقم SKU مسجل مسبقاً لعنصر آخر."
      : error?.message?.includes("barcode")
        ? "الباركود مسجل مسبقاً لعنصر آخر."
        : "تعذر تعديل العنصر. تحقق من البيانات المدخلة.";
    return NextResponse.json({ message: errorMsg }, { status: 400 });
  }

  return NextResponse.json({ item: data, message: "تم تعديل بيانات العنصر في المخزون بنجاح." });
}

export async function DELETE(request: NextRequest, context: RouteContext<"/api/stores/[storeId]/inventory">) {
  const { storeId } = await context.params;
  const { authorized, sessionClient } = await verifyStoreAccess(storeId);
  if (!authorized) return NextResponse.json({ message: "غير مصرح بحذف عناصر المخزون." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const itemId = searchParams.get("id");

  if (!itemId) {
    return NextResponse.json({ message: "معرف العنصر مطلوب للحذف." }, { status: 400 });
  }

  const db = getAdminClient() ?? sessionClient;
  const { error } = await db
    .from("inventory_items")
    .delete()
    .eq("id", itemId)
    .eq("store_id", storeId);

  if (error) {
    return NextResponse.json({ message: "تعذر حذف العنصر من المخزون." }, { status: 500 });
  }

  return NextResponse.json({ message: "تم حذف العنصر من المخزون بنجاح." });
}
