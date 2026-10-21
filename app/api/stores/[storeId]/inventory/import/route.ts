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

type ImportItemRequest = {
  barcode?: string | null;
  sku?: string;
  name: string;
  category?: string;
  quantity?: number;
  cost_price?: number;
  selling_price?: number;
  discount?: number;
  matchedItemId?: string;
};

export async function POST(request: NextRequest, context: { params: Promise<{ storeId: string }> }) {
  const { storeId } = await context.params;
  const { authorized, sessionClient } = await verifyStoreAccess(storeId);
  if (!authorized) return NextResponse.json({ message: "غير مصرح باستيراد المخزون." }, { status: 403 });

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "بيانات الطلب غير صالحة." }, { status: 400 });
  }

  const {
    items = [],
    mode = "add",
    updatePrices = true,
  } = body as {
    items?: ImportItemRequest[];
    mode?: "add" | "replace";
    updatePrices?: boolean;
  };

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ message: "لا توجد عناصر للاستيراد." }, { status: 400 });
  }

  const db = getAdminClient() ?? sessionClient;

  // 1. Fetch current items in the store to match and prevent uniqueness violations
  const { data: existingRows, error: fetchErr } = await db
    .from("inventory_items")
    .select("id, name, sku, barcode, quantity, cost_price, selling_price, category")
    .eq("store_id", storeId);

  if (fetchErr) {
    return NextResponse.json({ message: "تعذر قراءة المخزون الحالي للتحقق." }, { status: 500 });
  }

  const existingItems = existingRows ?? [];
  const idMap = new Map<string, (typeof existingItems)[0]>();
  const barcodeMap = new Map<string, (typeof existingItems)[0]>();
  const skuMap = new Map<string, (typeof existingItems)[0]>();
  const nameMap = new Map<string, (typeof existingItems)[0]>();
  const usedSkus = new Set<string>();

  for (const item of existingItems) {
    idMap.set(item.id, item);
    if (item.barcode && item.barcode.trim()) {
      barcodeMap.set(item.barcode.trim().toLowerCase(), item);
    }
    if (item.sku && item.sku.trim()) {
      const cleanSku = item.sku.trim().toLowerCase();
      skuMap.set(cleanSku, item);
      usedSkus.add(cleanSku);
    }
    if (item.name && item.name.trim()) {
      nameMap.set(item.name.trim().toLowerCase(), item);
    }
  }

  const toUpdate: Array<{
    id: string;
    payload: Record<string, unknown>;
  }> = [];

  const toInsert: Array<{
    store_id: string;
    name: string;
    category: string;
    sku: string;
    barcode: string | null;
    quantity: number;
    cost_price: number;
    selling_price: number;
    discount: number;
  }> = [];

  const errors: string[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const raw = items[idx];
    const name = (raw.name ?? "").trim();
    if (!name) {
      errors.push(`السطر ${idx + 1}: اسم الصنف مفقود.`);
      continue;
    }

    const barcode = raw.barcode && String(raw.barcode).trim().length > 0 ? String(raw.barcode).trim() : null;
    const barcodeLower = barcode ? barcode.toLowerCase() : "";
    const skuRaw = raw.sku ? String(raw.sku).trim() : "";
    const skuLower = skuRaw.toLowerCase();
    const nameLower = name.toLowerCase();

    const qty = Math.max(0, Math.round(Number(raw.quantity) || 0));
    const costPrice = Math.max(0, Number(raw.cost_price) || 0);
    const sellingPrice = Math.max(0, Number(raw.selling_price) || 0);
    const discount = Math.min(100, Math.max(0, Number(raw.discount) || 0));
    const category = (raw.category ?? "").trim() || "accessory";

    // Matching logic
    let matched: (typeof existingItems)[0] | undefined;
    if (raw.matchedItemId && idMap.has(raw.matchedItemId)) {
      matched = idMap.get(raw.matchedItemId);
    } else if (barcodeLower && barcodeMap.has(barcodeLower)) {
      matched = barcodeMap.get(barcodeLower);
    } else if (skuLower && skuMap.has(skuLower)) {
      matched = skuMap.get(skuLower);
    } else if (nameMap.has(nameLower)) {
      matched = nameMap.get(nameLower);
    }

    if (matched) {
      // Calculate new quantity
      const newQty = mode === "add" ? (matched.quantity || 0) + qty : qty;
      const updateData: Record<string, unknown> = {
        quantity: newQty,
      };

      if (updatePrices) {
        if (costPrice > 0) updateData.cost_price = costPrice;
        if (sellingPrice > 0) updateData.selling_price = sellingPrice;
        if (discount > 0) updateData.discount = discount;
      }

      if (!matched.barcode && barcode) {
        updateData.barcode = barcode;
      }

      toUpdate.push({
        id: matched.id,
        payload: updateData,
      });

      // Update in-memory item for consecutive rows in the same sheet
      matched.quantity = newQty;
      if (updatePrices && costPrice > 0) matched.cost_price = costPrice;
      if (updatePrices && sellingPrice > 0) matched.selling_price = sellingPrice;
    } else {
      // Generate unique SKU if missing or taken
      let uniqueSku = skuRaw;
      if (!uniqueSku || usedSkus.has(uniqueSku.toLowerCase())) {
        let counter = 1;
        const base = skuRaw || (barcode ? `SKU-${barcode}` : `SKU-${Date.now().toString(36).toUpperCase()}`);
        uniqueSku = base;
        while (usedSkus.has(uniqueSku.toLowerCase())) {
          uniqueSku = `${base}-${counter++}`;
        }
      }
      usedSkus.add(uniqueSku.toLowerCase());

      const newInsertItem = {
        store_id: storeId,
        name,
        category,
        sku: uniqueSku,
        barcode,
        quantity: qty,
        cost_price: costPrice,
        selling_price: sellingPrice,
        discount,
      };

      toInsert.push(newInsertItem);

      // Add to in-memory lookup so next rows in sheet don't collide
      if (barcodeLower) barcodeMap.set(barcodeLower, { id: "", ...newInsertItem });
      skuMap.set(uniqueSku.toLowerCase(), { id: "", ...newInsertItem });
      nameMap.set(nameLower, { id: "", ...newInsertItem });
    }
  }

  // 2. Perform updates
  let updatedCount = 0;
  for (const up of toUpdate) {
    const { error } = await db
      .from("inventory_items")
      .update(up.payload)
      .eq("id", up.id)
      .eq("store_id", storeId);

    if (!error) {
      updatedCount++;
    } else {
      errors.push(`فشل تحديث العنصر (ID: ${up.id}): ${error.message}`);
    }
  }

  // 3. Perform inserts
  let insertedCount = 0;
  if (toInsert.length > 0) {
    // Insert in batches of 50 to avoid potential payload size limits
    const BATCH_SIZE = 50;
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const { data: insertedData, error: insertErr } = await db
        .from("inventory_items")
        .insert(batch)
        .select("id");

      if (!insertErr && insertedData) {
        insertedCount += insertedData.length;
      } else if (insertErr) {
        errors.push(`فشلت إضافة دفعة من الأصناف الجديدة: ${insertErr.message}`);
      }
    }
  }

  return NextResponse.json({
    success: true,
    message: `تم بنجاح تحديث ${updatedCount} صنف وإضافة ${insertedCount} صنف جديد إلى المخزون.`,
    updatedCount,
    insertedCount,
    totalProcessed: items.length,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
}
