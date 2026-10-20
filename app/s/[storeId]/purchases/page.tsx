"use client";

import { use, useEffect, useState } from "react";
import { Plus, Save, Truck } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabase";

type Supplier = { id: string; name: string; phone: string | null };
type StockItem = { id: string; name: string; sku: string; cost_price: number };
type Purchase = { id: string; invoice_number: string; purchase_date: string; total: number; supplier_id: string; suppliers: { name: string } | null };
type PurchaseLine = { inventoryItemId: string; quantity: string; unitCost: string };

const emptyLine: PurchaseLine = { inventoryItemId: "", quantity: "1", unitCost: "" };

export default function PurchasesPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = use(params);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<StockItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [selectedSupplier, setSelectedSupplier] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<PurchaseLine[]>([{ ...emptyLine }]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadPurchaseData() {
      const supabase = getSupabaseClient();
      const [{ data: supplierRows }, { data: itemRows }, { data: purchaseRows, error }] = await Promise.all([
        supabase.from("suppliers").select("id, name, phone").eq("store_id", storeId).order("name"),
        supabase.from("inventory_items").select("id, name, sku, cost_price").eq("store_id", storeId).order("name"),
        supabase.from("purchases").select("id, invoice_number, purchase_date, total, supplier_id, suppliers(name)").eq("store_id", storeId).order("purchase_date", { ascending: false }).limit(30),
      ]);
      if (!active) return;
      if (error) setMessage("تعذر تحميل سجل المشتريات لهذا المتجر.");
      setSuppliers((supplierRows ?? []) as Supplier[]);
      setItems((itemRows ?? []) as StockItem[]);
      setPurchases((purchaseRows ?? []) as unknown as Purchase[]);
      setSelectedSupplier((supplierRows ?? [])[0]?.id ?? "");
      setLoading(false);
    }
    void loadPurchaseData();
    return () => { active = false; };
  }, [storeId]);

  async function createSupplier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const { data, error } = await getSupabaseClient().from("suppliers")
      .insert({ store_id: storeId, name: supplierName.trim(), phone: supplierPhone.trim() || null })
      .select("id, name, phone").single();
    if (error) setMessage("تعذر حفظ المورد. تحقق من صلاحيات المشتريات ومن عدم تكرار الاسم.");
    else if (data) {
      setSuppliers((current) => [...current, data as Supplier]);
      setSelectedSupplier(data.id);
      setSupplierName("");
      setSupplierPhone("");
      setMessage("تمت إضافة المورد لهذا المتجر.");
    }
  }

  async function savePurchase(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const purchaseItems = lines.filter((line) => line.inventoryItemId).map((line) => ({
      inventory_item_id: line.inventoryItemId,
      quantity: Number(line.quantity),
      unit_cost: Number(line.unitCost),
    }));
    const { error } = await getSupabaseClient().rpc("save_purchase", {
      p_store_id: storeId,
      p_supplier_id: selectedSupplier,
      p_invoice_number: invoiceNumber.trim(),
      p_purchase_date: purchaseDate,
      p_items: purchaseItems,
    });
    if (error) setMessage(error.message.includes("الصنف") ? "الصنف المحدد غير موجود في مخزون هذا المتجر." : "تعذر حفظ فاتورة الشراء. تأكد من بيانات المورد والفاتورة.");
    else {
      setMessage("تم حفظ الفاتورة وتحديث كميات وتكلفة المخزون بنجاح.");
      setInvoiceNumber("");
      setLines([{ ...emptyLine }]);
      const [{ data: itemRows }, { data: purchaseRows }] = await Promise.all([
        getSupabaseClient().from("inventory_items").select("id, name, sku, cost_price").eq("store_id", storeId).order("name"),
        getSupabaseClient().from("purchases").select("id, invoice_number, purchase_date, total, supplier_id, suppliers(name)").eq("store_id", storeId).order("purchase_date", { ascending: false }).limit(30),
      ]);
      setItems((itemRows ?? []) as StockItem[]);
      setPurchases((purchaseRows ?? []) as unknown as Purchase[]);
    }
    setSaving(false);
  }

  return (
    <AppShell storeId={storeId}>
      <div className="space-y-6" dir="rtl">
        <div><p className="text-sm text-cyan-300">المشتريات والموردون</p><h2 className="mt-2 text-2xl font-semibold text-white">توريد المخزون</h2></div>
        {message ? <p role="status" className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">{message}</p> : null}
        <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <Card><CardHeader><CardTitle className="flex items-center gap-2"><Truck size={18} /> إضافة مورد</CardTitle></CardHeader><CardContent>
            <form onSubmit={createSupplier} className="space-y-3">
              <Field label="اسم المورد" value={supplierName} onChange={setSupplierName} required />
              <Field label="رقم الهاتف" value={supplierPhone} onChange={setSupplierPhone} />
              <Button type="submit" className="w-full">حفظ المورد</Button>
            </form>
            <div className="mt-5 space-y-2 border-t border-slate-800 pt-4"><h3 className="text-sm font-medium text-white">الموردون المسجلون</h3>{suppliers.length ? suppliers.map((supplier) => <div key={supplier.id} className="flex justify-between text-sm text-slate-300"><span>{supplier.name}</span><span>{supplier.phone || "لا يوجد هاتف"}</span></div>) : <p className="text-sm text-slate-500">لا يوجد موردون مسجلون.</p>}</div>
          </CardContent></Card>

          <Card><CardHeader><CardTitle>تسجيل فاتورة شراء</CardTitle></CardHeader><CardContent>
            <form onSubmit={savePurchase} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-2 text-sm text-slate-300"><span>المورد</span><select required value={selectedSupplier} onChange={(event) => setSelectedSupplier(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"><option value="">اختر المورد</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
                <Field label="رقم فاتورة المورد" value={invoiceNumber} onChange={setInvoiceNumber} required />
                <Field label="تاريخ الشراء" type="date" value={purchaseDate} onChange={setPurchaseDate} required />
              </div>
              <div className="space-y-3">
                {lines.map((line, index) => <div key={index} className="grid gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3 sm:grid-cols-[1.5fr_0.7fr_0.8fr_auto]">
                  <label className="space-y-2 text-sm text-slate-300"><span>المنتج</span><select required value={line.inventoryItemId} onChange={(event) => updateLine(index, { inventoryItemId: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"><option value="">اختر المنتج</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</select></label>
                  <Field label="الكمية" type="number" min="1" value={line.quantity} onChange={(quantity) => updateLine(index, { quantity })} required />
                  <Field label="تكلفة الوحدة" type="number" min="0" step="0.01" value={line.unitCost} onChange={(unitCost) => updateLine(index, { unitCost })} required />
                  <button type="button" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} aria-label="حذف الصنف" className="self-end rounded-md border border-slate-700 px-3 py-2 text-slate-300 disabled:opacity-40">حذف</button>
                </div>)}
                <Button type="button" variant="secondary" onClick={() => setLines((current) => [...current, { ...emptyLine }])}><Plus size={16} /> إضافة صنف</Button>
              </div>
              <Button type="submit" disabled={saving || !items.length || !suppliers.length} className="w-full">{saving ? "جارٍ تسجيل الفاتورة..." : <><Save size={16} /> حفظ فاتورة الشراء</>}</Button>
            </form>
          </CardContent></Card>
        </div>

        <Card><CardHeader><CardTitle>فواتير المتجر</CardTitle></CardHeader><CardContent>
          {loading ? <p className="py-6 text-center text-slate-400">جارٍ تحميل الفواتير...</p> : purchases.length === 0 ? <p className="py-6 text-center text-slate-400">لا توجد فواتير مشتريات لهذا المتجر.</p> : <div className="overflow-x-auto"><table className="min-w-full text-right text-sm text-slate-300"><thead><tr className="border-b border-slate-800 text-slate-400"><th className="p-3">المورد</th><th className="p-3">رقم الفاتورة</th><th className="p-3">التاريخ</th><th className="p-3">الإجمالي</th></tr></thead><tbody>{purchases.map((purchase) => <tr key={purchase.id} className="border-b border-slate-800 last:border-0"><td className="p-3 text-white">{purchase.suppliers?.name ?? "مورد"}</td><td className="p-3">{purchase.invoice_number}</td><td className="p-3">{new Date(purchase.purchase_date).toLocaleDateString("ar-SA")}</td><td className="p-3">{new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 }).format(purchase.total)} د.إ</td></tr>)}</tbody></table></div>}
        </CardContent></Card>
      </div>
    </AppShell>
  );

  function updateLine(index: number, update: Partial<PurchaseLine>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...update } : line));
  }
}

function Field({ label, value, onChange, type = "text", min, step, required }: {
  label: string; value: string; onChange: (value: string) => void; type?: string; min?: string; step?: string; required?: boolean;
}) {
  return <label className="space-y-2 text-sm text-slate-300"><span>{label}</span><input type={type} min={min} step={step} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>;
}