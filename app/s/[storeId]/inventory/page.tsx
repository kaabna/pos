"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Plus, Truck } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabase";

type InventoryRow = {
  id: string; store_id: string; name: string; category: string; sku: string; barcode: string | null;
  quantity: number; cost_price: number; selling_price: number; discount: number; imei_tracking: boolean;
};
type SupplierOption = { id: string; name: string };

const categories = [
  { value: "accessory", label: "إكسسوارات" },
  { value: "repair_part", label: "قطع صيانة" },
  { value: "phone", label: "هواتف" },
  { value: "service", label: "خدمات" },
];
const money = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });
const emptyForm = { name: "", category: "accessory", sku: "", barcode: "", quantity: "0", costPrice: "", sellingPrice: "", discount: "0", imeiTracking: false, supplierId: "" };

export default function StoreInventoryPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = use(params);
  const router = useRouter();
  const [items, setItems] = useState<InventoryRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<"search" | "item">("search");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadInventory() {
      const supabase = getSupabaseClient();
      const [{ data: rows, error }, { data: supplierRows }] = await Promise.all([
        supabase.from("inventory_items").select("id, store_id, name, category, sku, barcode, quantity, cost_price, selling_price, discount, imei_tracking").eq("store_id", storeId).order("name"),
        supabase.from("suppliers").select("id, name").eq("store_id", storeId).order("name"),
      ]);
      if (!active) return;
      if (error) setMessage("تعذر تحميل المخزون. تحقق من إعداد قاعدة البيانات وصلاحيات الحساب.");
      setItems((rows ?? []) as InventoryRow[]);
      setSuppliers((supplierRows ?? []) as SupplierOption[]);
      setLoading(false);
    }
    void loadInventory();
    return () => { active = false; };
  }, [storeId]);

  const visibleItems = useMemo(() => items.filter((item) =>
    (filter === "all" || item.category === filter)
    && `${item.name} ${item.sku} ${item.barcode ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  ), [filter, items, search]);

  async function addItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const { data, error } = await getSupabaseClient().from("inventory_items").insert({
      store_id: storeId,
      name: form.name.trim(),
      category: form.category,
      sku: form.sku.trim(),
      barcode: form.barcode.trim() || null,
      quantity: Number(form.quantity),
      cost_price: Number(form.costPrice),
      selling_price: Number(form.sellingPrice),
      discount: Number(form.discount),
      imei_tracking: form.imeiTracking,
      supplier_id: form.supplierId || null,
    }).select("id, store_id, name, category, sku, barcode, quantity, cost_price, selling_price, discount, imei_tracking").single();

    if (error) setMessage("تعذر حفظ العنصر. تحقق من الرمز أو رقم SKU ومن صلاحياتك.");
    else if (data) {
      setItems((current) => [data as InventoryRow, ...current]);
      setForm(emptyForm);
      setShowForm(false);
      setMessage("تمت إضافة العنصر إلى مخزون هذا المتجر.");
    }
    setSaving(false);
  }

  return (
    <AppShell storeId={storeId}>
      <div className="space-y-6" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm text-cyan-300">المخزون</p><h2 className="mt-2 text-2xl font-semibold text-white">مخزون المتجر</h2></div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => { setForm(emptyForm); setShowForm(true); }}><Plus size={16} /> إضافة عنصر</Button>
            <Button type="button" variant="secondary" onClick={() => router.push(`/s/${storeId}/purchases`)}><Truck size={16} /> استيراد من مورد</Button>
          </div>
        </div>

        {message ? <p role="status" className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">{message}</p> : null}
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-col gap-2 md:flex-row">
              <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }} placeholder="ابحث بالاسم أو SKU أو امسح الرمز هنا" aria-label="بحث المخزون أو قراءة الباركود" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500" />
              <Button type="button" variant="secondary" onClick={() => { setScannerTarget("search"); setShowScanner(true); }} title="مسح بالكاميرا" aria-label="مسح بالكاميرا"><Camera size={16} /> مسح بالكاميرا</Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {[{ value: "all", label: "الكل" }, ...categories].map((category) => (
                <button key={category.value} type="button" onClick={() => setFilter(category.value)} className={`rounded-md px-3 py-2 text-sm ${filter === category.value ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}>{category.label}</button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>عناصر المخزون</CardTitle></CardHeader>
          <CardContent>
            {loading ? <p className="py-8 text-center text-slate-400">جارٍ تحميل المخزون...</p> : null}
            {!loading && visibleItems.length === 0 ? <p className="py-8 text-center text-slate-400">لا توجد عناصر مطابقة في هذا المتجر.</p> : null}
            {visibleItems.length > 0 ? <div className="overflow-x-auto">
              <table className="min-w-full text-right text-sm text-slate-300">
                <thead><tr className="border-b border-slate-800 text-xs text-slate-400"><th className="py-3 pr-3">المنتج</th><th className="py-3 pr-3">الفئة</th><th className="py-3 pr-3">الكمية</th><th className="py-3 pr-3">التكلفة</th><th className="py-3 pr-3">سعر البيع</th><th className="py-3 pr-3">الخصم</th><th className="py-3 pr-3">تتبع IMEI</th></tr></thead>
                <tbody>{visibleItems.map((item) => <tr key={item.id} className="border-b border-slate-800 last:border-0">
                  <td className="py-3 pr-3"><span className="block font-medium text-white">{item.name}</span><span className="text-xs text-slate-500">{item.sku}{item.barcode ? ` · ${item.barcode}` : ""}</span></td>
                  <td className="py-3 pr-3"><Badge variant="info">{categories.find((category) => category.value === item.category)?.label ?? "أخرى"}</Badge></td>
                  <td className="py-3 pr-3 text-white">{money.format(item.quantity)}</td><td className="py-3 pr-3">{money.format(item.cost_price)} د.إ</td><td className="py-3 pr-3">{money.format(item.selling_price)} د.إ</td><td className="py-3 pr-3">{money.format(item.discount)}٪</td><td className="py-3 pr-3">{item.imei_tracking ? "نعم" : "لا"}</td>
                </tr>)}</tbody>
              </table>
            </div> : null}
          </CardContent>
        </Card>
      </div>

      {showForm ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
        <section role="dialog" aria-modal="true" aria-labelledby="item-form-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5">
          <h3 id="item-form-title" className="mb-4 text-xl font-semibold text-white">إضافة عنصر إلى المخزون</h3>
          <form onSubmit={addItem} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="اسم المنتج" required value={form.name} onChange={(name) => setForm({ ...form, name })} />
              <Input label="SKU" required value={form.sku} onChange={(sku) => setForm({ ...form, sku })} />
              <div className="flex items-end gap-2"><Input label="الباركود أو QR" value={form.barcode} onChange={(barcode) => setForm({ ...form, barcode })} /><Button type="button" variant="secondary" onClick={() => { setScannerTarget("item"); setShowScanner(true); }} title="مسح رمز المنتج" aria-label="مسح رمز المنتج"><Camera size={16} /></Button></div>
              <label className="space-y-2 text-sm text-slate-300"><span>الفئة</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">{categories.map((category) => <option value={category.value} key={category.value}>{category.label}</option>)}</select></label>
              <Input label="الكمية" type="number" min="0" required value={form.quantity} onChange={(quantity) => setForm({ ...form, quantity })} />
              <Input label="سعر التكلفة" type="number" min="0" step="0.01" required value={form.costPrice} onChange={(costPrice) => setForm({ ...form, costPrice })} />
              <Input label="سعر البيع" type="number" min="0" step="0.01" required value={form.sellingPrice} onChange={(sellingPrice) => setForm({ ...form, sellingPrice })} />
              <Input label="الخصم بالنسبة المئوية" type="number" min="0" max="100" step="0.01" value={form.discount} onChange={(discount) => setForm({ ...form, discount })} />
              <label className="space-y-2 text-sm text-slate-300"><span>المورد</span><select value={form.supplierId} onChange={(event) => setForm({ ...form, supplierId: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"><option value="">بدون مورد</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-300"><input type="checkbox" checked={form.imeiTracking} onChange={(event) => setForm({ ...form, imeiTracking: event.target.checked })} /><span>تتبع رقم IMEI</span></label>
            </div>
            {message ? <p role="alert" className="text-sm text-rose-200">{message}</p> : null}
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setShowForm(false)}>إلغاء</Button><Button type="submit" disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ العنصر"}</Button></div>
          </form>
        </section>
      </div> : null}
      {showScanner ? <BarcodeScanner onClose={() => setShowScanner(false)} onDetected={(value) => {
        if (scannerTarget === "item") setForm((current) => ({ ...current, barcode: value }));
        else setSearch(value);
        setShowScanner(false);
      }} /> : null}
    </AppShell>
  );
}

function Input({ label, value, onChange, type = "text", min, max, step, required }: {
  label: string; value: string; onChange: (value: string) => void; type?: string;
  min?: string; max?: string; step?: string; required?: boolean;
}) {
  return <label className="space-y-2 text-sm text-slate-300"><span>{label}</span><input type={type} min={min} max={max} step={step} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-500" /></label>;
}