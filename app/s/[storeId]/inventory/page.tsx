"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, Camera, FolderPlus, Pencil, Plus, Trash2, Truck } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabase";

type InventoryRow = {
  id: string;
  store_id: string;
  name: string;
  category: string;
  sku: string;
  barcode: string | null;
  quantity: number;
  cost_price: number;
  selling_price: number;
  discount: number;
  imei_tracking: boolean;
  supplier_id?: string | null;
};
type SupplierOption = { id: string; name: string };
type CategoryOption = { value: string; label: string };

const defaultCategories: CategoryOption[] = [
  { value: "accessory", label: "إكسسوارات" },
  { value: "repair_part", label: "قطع صيانة" },
  { value: "phone", label: "هواتف" },
  { value: "service", label: "خدمات" },
];
const money = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });
const emptyForm = {
  name: "",
  category: "accessory",
  customCategory: "",
  sku: "",
  barcode: "",
  quantity: "0",
  costPrice: "",
  sellingPrice: "",
  discount: "0",
  imeiTracking: false,
  supplierId: "",
};

export default function StoreInventoryPage() {
  const routeParams = useParams();
  const storeId = (routeParams?.storeId as string) || "";
  const router = useRouter();
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [customCategories, setCustomCategories] = useState<CategoryOption[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showCategoryInput, setShowCategoryInput] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryRow | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [showEditModal, setShowEditModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<InventoryRow | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<"search" | "item" | "edit">("search");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!storeId) return;
    let active = true;
    async function loadInventory() {
      try {
        const supabase = getSupabaseClient();
        const [{ data: rows, error }, { data: supplierRows }, categoriesRes] = await Promise.all([
          supabase
            .from("inventory_items")
            .select("id, store_id, name, category, sku, barcode, quantity, cost_price, selling_price, discount, imei_tracking")
            .eq("store_id", storeId)
            .order("name"),
          supabase.from("suppliers").select("id, name").eq("store_id", storeId).order("name"),
          fetch(`/api/stores/${storeId}/categories`).then((res) => (res.ok ? res.json() : null)).catch(() => null),
        ]);
        if (!active) return;
        if (error) setMessage("تعذر تحميل المخزون. تحقق من إعداد قاعدة البيانات وصلاحيات الحساب.");
        setItems((rows ?? []) as InventoryRow[]);
        setSuppliers((supplierRows ?? []) as SupplierOption[]);
        if (categoriesRes && Array.isArray((categoriesRes as { categories?: CategoryOption[] }).categories)) {
          setCustomCategories((categoriesRes as { categories: CategoryOption[] }).categories);
        }
        setLoading(false);
      } catch {
        if (active) setLoading(false);
      }
    }
    void loadInventory();
    return () => {
      active = false;
    };
  }, [storeId]);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of defaultCategories) map.set(cat.value, cat.label);
    for (const cat of customCategories) map.set(cat.value, cat.label);
    for (const item of items) {
      if (item.category && !map.has(item.category)) {
        map.set(item.category, item.category);
      }
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [customCategories, items]);

  function getCategoryLabel(categoryValue: string) {
    return categories.find((cat) => cat.value === categoryValue)?.label ?? categoryValue;
  }

  const visibleItems = useMemo(
    () =>
      (items ?? []).filter(
        (item) =>
          item &&
          (filter === "all" || item.category === filter) &&
          `${item.name ?? ""} ${item.sku ?? ""} ${item.barcode ?? ""} ${getCategoryLabel(item.category ?? "")}`
            .toLocaleLowerCase()
            .includes(search.toLocaleLowerCase()),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter, items, search, categories],
  );

  async function handleCreateCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    const response = await fetch(`/api/stores/${storeId}/categories`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    if (response.ok) {
      setCustomCategories((current) =>
        current.some((cat) => cat.value === trimmed) ? current : [...current, { value: trimmed, label: trimmed }],
      );
      setNewCategoryName("");
      setShowCategoryInput(false);
      setMessage(`تمت إضافة التصنيف "${trimmed}" بنجاح.`);
    } else {
      setMessage("تعذر حفظ التصنيف الجديد.");
    }
  }

  async function addItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const finalCategory = form.category === "__custom__" ? form.customCategory.trim() : form.category;
    if (!finalCategory) {
      setMessage("الرجاء اختيار الفئة أو كتابة اسم التصنيف الجديد.");
      setSaving(false);
      return;
    }

    if (form.category === "__custom__") {
      await fetch(`/api/stores/${storeId}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: finalCategory }),
      }).catch(() => null);
      setCustomCategories((current) =>
        current.some((cat) => cat.value === finalCategory)
          ? current
          : [...current, { value: finalCategory, label: finalCategory }],
      );
    }

    const { data, error } = await getSupabaseClient()
      .from("inventory_items")
      .insert({
        store_id: storeId,
        name: form.name.trim(),
        category: finalCategory,
        sku: form.sku.trim(),
        barcode: form.barcode.trim() || null,
        quantity: Number(form.quantity),
        cost_price: Number(form.costPrice),
        selling_price: Number(form.sellingPrice),
        discount: Number(form.discount),
        imei_tracking: form.imeiTracking,
        supplier_id: form.supplierId || null,
      })
      .select("id, store_id, name, category, sku, barcode, quantity, cost_price, selling_price, discount, imei_tracking")
      .single();

    if (error) setMessage("تعذر حفظ العنصر. تحقق من الرمز أو رقم SKU ومن صلاحياتك.");
    else if (data) {
      setItems((current) => [data as InventoryRow, ...current]);
      setForm(emptyForm);
      setShowForm(false);
      setMessage("تمت إضافة العنصر إلى مخزون هذا المتجر.");
    }
    setSaving(false);
  }

  function handleStartEdit(item: InventoryRow) {
    const isStandardCategory = categories.some((c) => c.value === item.category);
    setEditingItem(item);
    setEditForm({
      name: item.name,
      category: isStandardCategory ? item.category : "__custom__",
      customCategory: isStandardCategory ? "" : item.category,
      sku: item.sku,
      barcode: item.barcode ?? "",
      quantity: String(item.quantity),
      costPrice: String(item.cost_price),
      sellingPrice: String(item.selling_price),
      discount: String(item.discount),
      imeiTracking: item.imei_tracking,
      supplierId: item.supplier_id ?? "",
    });
    setMessage("");
    setShowEditModal(true);
  }

  async function handleSaveEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingItem) return;
    setSaving(true);
    setMessage("");

    const finalCategory = editForm.category === "__custom__" ? editForm.customCategory.trim() : editForm.category;
    if (!finalCategory) {
      setMessage("الرجاء اختيار الفئة أو كتابة اسم التصنيف الجديد.");
      setSaving(false);
      return;
    }

    if (editForm.category === "__custom__") {
      await fetch(`/api/stores/${storeId}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: finalCategory }),
      }).catch(() => null);
      setCustomCategories((current) =>
        current.some((cat) => cat.value === finalCategory)
          ? current
          : [...current, { value: finalCategory, label: finalCategory }],
      );
    }

    const response = await fetch(`/api/stores/${storeId}/inventory`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingItem.id,
        name: editForm.name.trim(),
        category: finalCategory,
        sku: editForm.sku.trim(),
        barcode: editForm.barcode.trim() || null,
        quantity: Number(editForm.quantity),
        cost_price: Number(editForm.costPrice),
        selling_price: Number(editForm.sellingPrice),
        discount: Number(editForm.discount),
        imei_tracking: editForm.imeiTracking,
        supplier_id: editForm.supplierId || null,
      }),
    });

    const result = (await response.json()) as { item?: InventoryRow; message?: string };
    if (response.ok && result.item) {
      const updated = result.item;
      setItems((current) => current.map((i) => (i.id === updated.id ? updated : i)));
      setShowEditModal(false);
      setEditingItem(null);
      setMessage(result.message ?? "تم تحديث بيانات المنتج بالمخزون بنجاح.");
    } else {
      setMessage(result.message ?? "تعذر تعديل العنصر بالمخزون.");
    }
    setSaving(false);
  }

  async function handleDeleteItem() {
    if (!itemToDelete) return;
    setSaving(true);
    setMessage("");

    const response = await fetch(`/api/stores/${storeId}/inventory?id=${itemToDelete.id}`, {
      method: "DELETE",
    });

    const result = (await response.json()) as { message?: string };
    if (response.ok) {
      setItems((current) => current.filter((i) => i.id !== itemToDelete.id));
      setShowDeleteConfirm(false);
      setItemToDelete(null);
      setMessage(result.message ?? "تم حذف العنصر من المخزون بنجاح.");
    } else {
      setMessage(result.message ?? "تعذر حذف العنصر من المخزون.");
    }
    setSaving(false);
  }

  return (
    <AppShell storeId={storeId}>
      <div className="space-y-6" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-cyan-300">المخزون</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">مخزون المتجر</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                setForm(emptyForm);
                setShowForm(true);
              }}
            >
              <Plus size={16} /> إضافة عنصر
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowCategoryInput((prev) => !prev)}>
              <FolderPlus size={16} /> إضافة تصنيف جديد
            </Button>
            <Button type="button" variant="secondary" onClick={() => router.push(`/s/${storeId}/purchases`)}>
              <Truck size={16} /> استيراد من مورد
            </Button>
          </div>
        </div>

        {message ? (
          <p role="status" className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">
            {message}
          </p>
        ) : null}

        {showCategoryInput ? (
          <Card className="border-cyan-500/30">
            <CardContent className="p-4">
              <form onSubmit={handleCreateCategory} className="flex flex-wrap items-end gap-3">
                <label className="min-w-60 flex-1 space-y-2 text-sm text-slate-300">
                  <span>اسم التصنيف الجديد</span>
                  <input
                    required
                    value={newCategoryName}
                    onChange={(event) => setNewCategoryName(event.target.value)}
                    placeholder="مثال: ساعات ذكية، سماعات، شواحن، كفرات..."
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  />
                </label>
                <Button type="submit">حفظ التصنيف</Button>
                <Button type="button" variant="secondary" onClick={() => setShowCategoryInput(false)}>
                  إلغاء
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-col gap-2 md:flex-row">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.preventDefault();
                }}
                placeholder="ابحث بالاسم أو SKU أو التصنيف أو امسح الرمز هنا"
                aria-label="بحث المخزون أو قراءة الباركود"
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setScannerTarget("search");
                  setShowScanner(true);
                }}
                title="مسح بالكاميرا"
                aria-label="مسح بالكاميرا"
              >
                <Camera size={16} /> مسح بالكاميرا
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {[{ value: "all", label: "الكل" }, ...categories].map((category) => (
                <button
                  key={category.value}
                  type="button"
                  onClick={() => setFilter(category.value)}
                  className={`rounded-md px-3 py-2 text-sm ${
                    filter === category.value
                      ? "bg-cyan-500 text-slate-950"
                      : "bg-slate-800 text-slate-200 hover:bg-slate-700"
                  }`}
                >
                  {category.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>عناصر المخزون</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? <p className="py-8 text-center text-slate-400">جارٍ تحميل المخزون...</p> : null}
            {!loading && visibleItems.length === 0 ? (
              <p className="py-8 text-center text-slate-400">لا توجد عناصر مطابقة في هذا المتجر.</p>
            ) : null}
            {visibleItems.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-right text-sm text-slate-300">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs text-slate-400">
                      <th className="py-3 pr-3">المنتج</th>
                      <th className="py-3 pr-3">الفئة</th>
                      <th className="py-3 pr-3">الكمية</th>
                      <th className="py-3 pr-3">التكلفة</th>
                      <th className="py-3 pr-3">سعر البيع</th>
                      <th className="py-3 pr-3">الخصم</th>
                      <th className="py-3 pr-3">تتبع IMEI</th>
                      <th className="py-3 pr-3 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((item) => (
                      <tr key={item.id} className="border-b border-slate-800 last:border-0 hover:bg-slate-900/40 transition">
                        <td className="py-3 pr-3">
                          <span className="block font-medium text-white">{item.name}</span>
                          <span className="text-xs text-slate-500">
                            {item.sku}
                            {item.barcode ? ` · ${item.barcode}` : ""}
                          </span>
                        </td>
                        <td className="py-3 pr-3">
                          <Badge variant="info">{getCategoryLabel(item.category)}</Badge>
                        </td>
                        <td className="py-3 pr-3 text-white font-semibold">{money.format(item.quantity)}</td>
                        <td className="py-3 pr-3">{money.format(item.cost_price)} د.إ</td>
                        <td className="py-3 pr-3">{money.format(item.selling_price)} د.إ</td>
                        <td className="py-3 pr-3">{money.format(item.discount)}٪</td>
                        <td className="py-3 pr-3">{item.imei_tracking ? "نعم" : "لا"}</td>
                        <td className="py-3 pr-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(item)}
                              className="flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-300 hover:border-cyan-400 hover:bg-cyan-500/20 transition"
                              title="تعديل هذا العنصر والكمية والأسعار"
                            >
                              <Pencil size={12} />
                              تعديل
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setItemToDelete(item);
                                setShowDeleteConfirm(true);
                              }}
                              className="rounded-md border border-slate-800 bg-slate-950 p-1 text-slate-500 hover:text-rose-400 hover:border-rose-500/40 transition"
                              title="حذف هذا العنصر من المخزون"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="item-form-title"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5"
          >
            <h3 id="item-form-title" className="mb-4 text-xl font-semibold text-white">
              إضافة عنصر إلى المخزون
            </h3>
            <form onSubmit={addItem} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="اسم المنتج" required value={form.name} onChange={(name) => setForm({ ...form, name })} />
                <Input label="SKU" required value={form.sku} onChange={(sku) => setForm({ ...form, sku })} />
                <div className="flex items-end gap-2">
                  <Input
                    label="الباركود أو QR"
                    value={form.barcode}
                    onChange={(barcode) => setForm({ ...form, barcode })}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setScannerTarget("item");
                      setShowScanner(true);
                    }}
                    title="مسح رمز المنتج"
                    aria-label="مسح رمز المنتج"
                  >
                    <Camera size={16} />
                  </Button>
                </div>
                <div className="space-y-2 text-sm text-slate-300">
                  <label className="block space-y-2">
                    <span>الفئة / التصنيف</span>
                    <select
                      value={form.category}
                      onChange={(event) => setForm({ ...form, category: event.target.value })}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    >
                      {categories.map((category) => (
                        <option value={category.value} key={category.value}>
                          {category.label}
                        </option>
                      ))}
                      <option value="__custom__">+ إضافة تصنيف جديد...</option>
                    </select>
                  </label>
                  {form.category === "__custom__" ? (
                    <input
                      required
                      value={form.customCategory}
                      onChange={(event) => setForm({ ...form, customCategory: event.target.value })}
                      placeholder="اكتب اسم التصنيف الجديد هنا"
                      className="w-full rounded-lg border border-cyan-500/60 bg-slate-950 px-3 py-2 text-sm text-white"
                    />
                  ) : null}
                </div>
                <Input
                  label="الكمية"
                  type="number"
                  min="0"
                  required
                  value={form.quantity}
                  onChange={(quantity) => setForm({ ...form, quantity })}
                />
                <Input
                  label="سعر التكلفة"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={form.costPrice}
                  onChange={(costPrice) => setForm({ ...form, costPrice })}
                />
                <Input
                  label="سعر البيع"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={form.sellingPrice}
                  onChange={(sellingPrice) => setForm({ ...form, sellingPrice })}
                />
                <Input
                  label="الخصم بالنسبة المئوية"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.discount}
                  onChange={(discount) => setForm({ ...form, discount })}
                />
                <label className="space-y-2 text-sm text-slate-300">
                  <span>المورد</span>
                  <select
                    value={form.supplierId}
                    onChange={(event) => setForm({ ...form, supplierId: event.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  >
                    <option value="">بدون مورد</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.imeiTracking}
                    onChange={(event) => setForm({ ...form, imeiTracking: event.target.checked })}
                  />
                  <span>تتبع رقم IMEI</span>
                </label>
              </div>
              {message ? (
                <p role="alert" className="text-sm text-rose-200">
                  {message}
                </p>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                  إلغاء
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "جارٍ الحفظ..." : "حفظ العنصر"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {/* نافذة تعديل عنصر بالمخزون */}
      {showEditModal && editingItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-item-form-title"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            dir="rtl"
          >
            <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 id="edit-item-form-title" className="text-xl font-semibold text-white">
                  تعديل بيانات المنتج في المخزون
                </h3>
                <p className="mt-1 text-xs text-slate-400">
                  يمكنك تعديل الكمية المتوفرة أو الأسعار أو الباركود أو الاسم لتصحيح أي خطأ.
                </p>
              </div>
              <Badge variant="info">{getCategoryLabel(editingItem.category)}</Badge>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="اسم المنتج"
                  required
                  value={editForm.name}
                  onChange={(name) => setEditForm({ ...editForm, name })}
                />
                <Input
                  label="SKU (رمز التعريف)"
                  required
                  value={editForm.sku}
                  onChange={(sku) => setEditForm({ ...editForm, sku })}
                />
                <div className="flex items-end gap-2">
                  <Input
                    label="الباركود أو QR"
                    value={editForm.barcode}
                    onChange={(barcode) => setEditForm({ ...editForm, barcode })}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setScannerTarget("edit");
                      setShowScanner(true);
                    }}
                    title="مسح رمز المنتج بالكاميرا"
                    aria-label="مسح رمز المنتج بالكاميرا"
                  >
                    <Camera size={16} />
                  </Button>
                </div>
                <div className="space-y-2 text-sm text-slate-300">
                  <label className="block space-y-2">
                    <span>الفئة / التصنيف</span>
                    <select
                      value={editForm.category}
                      onChange={(event) => setEditForm({ ...editForm, category: event.target.value })}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                    >
                      {categories.map((cat) => (
                        <option value={cat.value} key={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                      <option value="__custom__">+ تصنيف مخصص آخر...</option>
                    </select>
                  </label>
                  {editForm.category === "__custom__" ? (
                    <input
                      required
                      value={editForm.customCategory}
                      onChange={(event) => setEditForm({ ...editForm, customCategory: event.target.value })}
                      placeholder="اكتب اسم التصنيف الجديد هنا"
                      className="w-full rounded-lg border border-cyan-500/60 bg-slate-950 px-3 py-2 text-sm text-white"
                    />
                  ) : null}
                </div>
                <Input
                  label="الكمية المتوفرة في المخزون"
                  type="number"
                  min="0"
                  required
                  value={editForm.quantity}
                  onChange={(quantity) => setEditForm({ ...editForm, quantity })}
                />
                <Input
                  label="سعر التكلفة"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={editForm.costPrice}
                  onChange={(costPrice) => setEditForm({ ...editForm, costPrice })}
                />
                <Input
                  label="سعر البيع"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  value={editForm.sellingPrice}
                  onChange={(sellingPrice) => setEditForm({ ...editForm, sellingPrice })}
                />
                <Input
                  label="الخصم بالنسبة المئوية (٪)"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={editForm.discount}
                  onChange={(discount) => setEditForm({ ...editForm, discount })}
                />
                <label className="space-y-2 text-sm text-slate-300">
                  <span>المورد</span>
                  <select
                    value={editForm.supplierId}
                    onChange={(event) => setEditForm({ ...editForm, supplierId: event.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  >
                    <option value="">بدون مورد</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={editForm.imeiTracking}
                    onChange={(event) => setEditForm({ ...editForm, imeiTracking: event.target.checked })}
                  />
                  <span>تتبع رقم IMEI</span>
                </label>
              </div>

              {message ? (
                <p role="alert" className="text-sm text-rose-200">
                  {message}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setItemToDelete(editingItem);
                    setShowEditModal(false);
                    setShowDeleteConfirm(true);
                  }}
                  className="text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/40"
                >
                  <Trash2 size={15} /> حذف هذا العنصر
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => setShowEditModal(false)}>
                    إلغاء
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}
                  </Button>
                </div>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {/* نافذة تأكيد حذف عنصر */}
      {showDeleteConfirm && itemToDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            className="w-full max-w-md rounded-xl border border-rose-500/40 bg-slate-900 p-5 shadow-2xl"
            dir="rtl"
          >
            <div className="flex items-center gap-2 text-rose-400">
              <AlertTriangle size={22} />
              <h3 id="delete-confirm-title" className="text-lg font-semibold text-white">
                تأكيد حذف العنصر من المخزون
              </h3>
            </div>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              هل أنت متأكد من رغبتك في حذف المنتج <strong className="text-white">{itemToDelete.name}</strong> (SKU: {itemToDelete.sku})؟ لا يمكن التراجع عن هذا الإجراء بعد الحذف.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setItemToDelete(null);
                }}
              >
                إلغاء
              </Button>
              <Button
                type="button"
                onClick={handleDeleteItem}
                disabled={saving}
                className="bg-rose-600 text-white hover:bg-rose-700"
              >
                {saving ? "جارٍ الحذف..." : "نعم، حذف العنصر"}
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      {showScanner ? (
        <BarcodeScanner
          onClose={() => setShowScanner(false)}
          onDetected={(value) => {
            if (scannerTarget === "item") setForm((current) => ({ ...current, barcode: value }));
            else if (scannerTarget === "edit") setEditForm((current) => ({ ...current, barcode: value }));
            else setSearch(value);
            setShowScanner(false);
          }}
        />
      ) : null}
    </AppShell>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  min,
  max,
  step,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  max?: string;
  step?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-2 text-sm text-slate-300">
      <span>{label}</span>
      <input
        type={type}
        min={min}
        max={max}
        step={step}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-500"
      />
    </label>
  );
}