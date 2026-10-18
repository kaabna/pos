"use client";

import { use, useEffect, useMemo, useState } from "react";
import { Camera, Minus, Plus, Printer, Trash2 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabase";

type Product = { id: string; name: string; category: string; sku: string; barcode: string | null; quantity: number; selling_price: number; discount: number };
type CartLine = { product: Product; quantity: number; discountPercent: number };
type PaymentMethod = "cash" | "card" | "transfer";

const categoryNames: Record<string, string> = { accessory: "إكسسوارات", repair_part: "قطع صيانة", phone: "هواتف", service: "خدمات" };
const paymentMethods: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "نقدي" }, { value: "card", label: "بطاقة" }, { value: "transfer", label: "تحويل بنكي" },
];
const money = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });

export default function StorePOSPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = use(params);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [invoiceDiscount, setInvoiceDiscount] = useState("0");
  const [showScanner, setShowScanner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [lastSale, setLastSale] = useState<{ id: string; date: string; lines: CartLine[]; subtotal: number; discount: number; total: number; method: PaymentMethod } | null>(null);

  useEffect(() => {
    let active = true;
    async function loadProducts() {
      const { data, error } = await getSupabaseClient().from("inventory_items")
        .select("id, name, category, sku, barcode, quantity, selling_price, discount")
        .eq("store_id", storeId).gt("quantity", 0).order("name");
      if (!active) return;
      if (error) setMessage("تعذر تحميل المنتجات لهذا المتجر.");
      setProducts((data ?? []) as Product[]);
      setLoading(false);
    }
    void loadProducts();
    return () => { active = false; };
  }, [storeId]);

  const categories = useMemo(() => [...new Set(products.map((product) => product.category))], [products]);
  const filteredProducts = products.filter((product) =>
    (category === "all" || product.category === category)
    && `${product.name} ${product.sku} ${product.barcode ?? ""}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const subtotal = cart.reduce((sum, line) => sum + line.product.selling_price * line.quantity, 0);
  const itemDiscount = cart.reduce((sum, line) => sum + line.product.selling_price * line.quantity * line.discountPercent / 100, 0);
  const invoiceDiscountAmount = Math.min(Math.max(0, Number(invoiceDiscount) || 0), Math.max(0, subtotal - itemDiscount));
  const total = subtotal - itemDiscount - invoiceDiscountAmount;

  function addProduct(product: Product) {
    setMessage("");
    setLastSale(null);
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.quantity) {
          setMessage("الكمية المطلوبة تتجاوز المخزون المتاح.");
          return current;
        }
        return current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line);
      }
      return [...current, { product, quantity: 1, discountPercent: product.discount }];
    });
  }

  function adjustQuantity(productId: string, change: number) {
    setCart((current) => current.flatMap((line) => {
      if (line.product.id !== productId) return [line];
      const quantity = line.quantity + change;
      if (quantity <= 0) return [];
      if (quantity > line.product.quantity) {
        setMessage("لا تتوفر هذه الكمية في المخزون.");
        return [line];
      }
      return [{ ...line, quantity }];
    }));
  }

  function scanCode(value: string) {
    setSearch(value);
    const product = products.find((item) => item.barcode === value || item.sku === value);
    if (product) addProduct(product);
    else setMessage("لم يتم العثور على منتج بهذا الرمز في مخزون هذا المتجر.");
  }

  async function checkout() {
    if (cart.length === 0 || saving) return;
    setSaving(true);
    setMessage("");
    const { data, error } = await getSupabaseClient().rpc("complete_sale", {
      p_store_id: storeId,
      p_payment_method: paymentMethod,
      p_invoice_discount: invoiceDiscountAmount,
      p_items: cart.map((line) => ({
        inventory_item_id: line.product.id,
        quantity: line.quantity,
        discount: line.product.selling_price * line.quantity * line.discountPercent / 100,
      })),
    });
    if (error) {
      setMessage(error.message.includes("الكمية") ? "تعذر إتمام البيع: الكمية المطلوبة غير متاحة." : "تعذر حفظ الفاتورة. تحقق من صلاحية نقطة البيع ثم أعد المحاولة.");
    } else {
      const saleId = data as string;
      setLastSale({ id: saleId, date: new Date().toLocaleString("ar-SA"), lines: [...cart], subtotal, discount: itemDiscount + invoiceDiscountAmount, total, method: paymentMethod });
      setProducts((current) => current.map((product) => {
        const sold = cart.find((line) => line.product.id === product.id)?.quantity ?? 0;
        return { ...product, quantity: product.quantity - sold };
      }).filter((product) => product.quantity > 0));
      setCart([]);
      setInvoiceDiscount("0");
      setMessage("تم حفظ البيع وتحديث مخزون المتجر بنجاح.");
    }
    setSaving(false);
  }

  return (
    <AppShell storeId={storeId}>
      <div className="space-y-5" dir="rtl">
        <div><p className="text-sm text-cyan-300">نقطة البيع</p><h2 className="mt-2 text-2xl font-semibold text-white">شاشة الكاشير</h2></div>
        {message ? <p role="status" className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">{message}</p> : null}

        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr]">
          <Card className="no-print">
            <CardHeader><CardTitle>المنتجات المتاحة</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    const match = products.find((item) => item.barcode === search || item.sku === search);
                    if (match) addProduct(match);
                  }
                }} placeholder="ابحث أو امسح الرمز بقارئ USB" aria-label="بحث أو إدخال باركود" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500" />
                <Button type="button" variant="secondary" onClick={() => setShowScanner(true)} title="مسح بالكاميرا" aria-label="مسح بالكاميرا"><Camera size={16} /></Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <CategoryButton active={category === "all"} onClick={() => setCategory("all")}>الكل</CategoryButton>
                {categories.map((item) => <CategoryButton key={item} active={category === item} onClick={() => setCategory(item)}>{categoryNames[item] ?? "أخرى"}</CategoryButton>)}
              </div>
              {loading ? <p className="py-10 text-center text-slate-400">جارٍ تحميل المنتجات...</p> : null}
              {!loading && filteredProducts.length === 0 ? <p className="py-10 text-center text-slate-400">لا توجد منتجات متاحة بهذا البحث.</p> : null}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map((product) => <button type="button" key={product.id} onClick={() => addProduct(product)} className="min-h-28 rounded-lg border border-slate-800 bg-slate-950 p-3 text-right transition hover:border-cyan-500/50">
                  <span className="block font-medium text-white">{product.name}</span><span className="mt-1 block text-xs text-slate-400">{product.sku} · المتاح {money.format(product.quantity)}</span><span className="mt-3 block text-sm font-semibold text-emerald-300">{money.format(product.selling_price)} د.إ</span>
                </button>)}
              </div>
            </CardContent>
          </Card>

          <Card className="no-print">
            <CardHeader><CardTitle>سلة الفاتورة</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {cart.length === 0 ? <p className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">السلة فارغة. أضف منتجًا للبدء.</p> : null}
              <div className="max-h-[42vh] space-y-3 overflow-y-auto">
                {cart.map((line) => <div key={line.product.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="flex items-start justify-between gap-2"><div><p className="font-medium text-white">{line.product.name}</p><p className="mt-1 text-xs text-slate-400">{money.format(line.product.selling_price)} د.إ للقطعة</p></div><button type="button" onClick={() => setCart((current) => current.filter((item) => item.product.id !== line.product.id))} aria-label={`حذف ${line.product.name}`} className="rounded p-1 text-slate-400 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 size={16} /></button></div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2"><button type="button" onClick={() => adjustQuantity(line.product.id, -1)} aria-label="تقليل الكمية" className="rounded border border-slate-700 p-1 text-slate-200"><Minus size={14} /></button><span className="min-w-5 text-center text-white">{money.format(line.quantity)}</span><button type="button" onClick={() => adjustQuantity(line.product.id, 1)} aria-label="زيادة الكمية" className="rounded border border-slate-700 p-1 text-slate-200"><Plus size={14} /></button></div>
                    <label className="flex items-center gap-2 text-xs text-slate-400">خصم ٪<input type="number" min="0" max="100" step="0.01" value={line.discountPercent} onChange={(event) => setCart((current) => current.map((item) => item.product.id === line.product.id ? { ...item, discountPercent: Math.min(100, Math.max(0, Number(event.target.value) || 0)) } : item))} className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white" /></label>
                    <span className="font-medium text-emerald-300">{money.format(line.product.selling_price * line.quantity * (1 - line.discountPercent / 100))} د.إ</span>
                  </div>
                </div>)}
              </div>

              <div className="grid grid-cols-3 gap-2" aria-label="طريقة الدفع">
                {paymentMethods.map((method) => <button key={method.value} type="button" onClick={() => setPaymentMethod(method.value)} className={`rounded-md border px-2 py-2 text-sm ${paymentMethod === method.value ? "border-cyan-400 bg-cyan-500/15 text-white" : "border-slate-700 bg-slate-950 text-slate-300"}`}>{method.label}</button>)}
              </div>
              <label className="flex items-center justify-between gap-3 text-sm text-slate-300">خصم الفاتورة<input type="number" min="0" step="0.01" value={invoiceDiscount} onChange={(event) => setInvoiceDiscount(event.target.value)} className="w-28 rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-left text-white" /></label>
              <div className="space-y-2 border-t border-slate-800 pt-3 text-sm text-slate-300">
                <Total label="المجموع الفرعي" amount={subtotal} /><Total label="خصم المنتجات" amount={itemDiscount} negative /><Total label="خصم الفاتورة" amount={invoiceDiscountAmount} negative />
                <div className="flex justify-between border-t border-slate-800 pt-3 text-base font-bold text-white"><span>الإجمالي</span><span>{money.format(total)} د.إ</span></div>
              </div>
              <Button type="button" disabled={cart.length === 0 || saving} onClick={() => void checkout()} className="w-full">{saving ? "جارٍ حفظ الفاتورة..." : "إتمام البيع"}</Button>
              {lastSale ? <Button type="button" variant="secondary" onClick={() => window.print()} className="w-full"><Printer size={16} /> طباعة الفاتورة</Button> : null}
            </CardContent>
          </Card>
        </div>

        {lastSale ? <section className="print-only mx-auto hidden max-w-xl bg-white p-8 text-black" dir="rtl">
          <h1 className="text-center text-2xl font-bold">سبيشل موبايل</h1><h2 className="mt-2 text-center text-lg">فاتورة بيع</h2>
          <p className="mt-4">رقم الفاتورة: {lastSale.id}</p><p>التاريخ: {lastSale.date}</p><p>طريقة الدفع: {paymentMethods.find((method) => method.value === lastSale.method)?.label}</p>
          <table className="mt-5 w-full text-right"><thead><tr><th className="border-b p-2">المنتج</th><th className="border-b p-2">الكمية</th><th className="border-b p-2">الإجمالي</th></tr></thead><tbody>{lastSale.lines.map((line) => <tr key={line.product.id}><td className="border-b p-2">{line.product.name}</td><td className="border-b p-2">{money.format(line.quantity)}</td><td className="border-b p-2">{money.format(line.product.selling_price * line.quantity * (1 - line.discountPercent / 100))} د.إ</td></tr>)}</tbody></table>
          <p className="mt-2">المجموع قبل الخصم: {money.format(lastSale.subtotal)} د.إ</p><p>الخصم: {money.format(lastSale.discount)} د.إ</p><p className="mt-2 text-lg font-bold">الإجمالي: {money.format(lastSale.total)} د.إ</p><p className="mt-8 text-center">شكرًا لزيارتكم</p>
        </section> : null}
      </div>
      {showScanner ? <BarcodeScanner onClose={() => setShowScanner(false)} onDetected={scanCode} /> : null}
    </AppShell>
  );
}

function CategoryButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-md px-3 py-2 text-sm ${active ? "bg-cyan-500 text-slate-950" : "bg-slate-800 text-slate-200 hover:bg-slate-700"}`}>{children}</button>;
}

function Total({ label, amount, negative = false }: { label: string; amount: number; negative?: boolean }) {
  return <div className="flex justify-between"><span>{label}</span><span className={negative ? "text-rose-300" : ""}>{negative ? "−" : ""}{money.format(amount)} د.إ</span></div>;
}