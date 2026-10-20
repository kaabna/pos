"use client";

import { use, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabase";

type Sale = { id: string; total: number; payment_method: "cash" | "card" | "transfer" | "wallet"; created_at: string };
type SaleItem = { sale_id: string; quantity: number; unit_cost: number };
type Expense = { amount: number; expense_date: string };
type Repair = { final_price: number; parts_cost: number };
type Purchase = { total: number };
type ShiftReport = {
  id: string; cashier_name: string; opening_cash: number; expenses_total: number;
  expected_cash: number; expected_card: number; expected_transfer: number; expected_wallet: number;
  actual_cash: number | null; actual_card: number | null; actual_transfer: number | null; actual_wallet: number | null;
  difference: number | null; is_matched: boolean | null; notes: string; opened_at: string; closed_at: string | null;
};

const money = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });
const paymentNames = { cash: "كاش (نقدي)", card: "فيزا", transfer: "البنوك (تحويل)", wallet: "المحافظ" };

export default function LedgerPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = use(params);
  const [sales, setSales] = useState<Sale[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState(0);
  const [shiftReports, setShiftReports] = useState<ShiftReport[]>([]);
  const [expenseForm, setExpenseForm] = useState({ category: "operational", amount: "", note: "", date: new Date().toISOString().slice(0, 10) });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadLedger() {
      const supabase = getSupabaseClient();
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const monthDate = monthStart.toISOString().slice(0, 10);
      const [salesResult, purchasesResult, expensesResult, repairsResult, storeResult] = await Promise.all([
        supabase.from("sales").select("id, total, payment_method, created_at").eq("store_id", storeId).gte("created_at", monthStart.toISOString()).order("created_at", { ascending: false }),
        supabase.from("purchases").select("total").eq("store_id", storeId).gte("purchase_date", monthDate),
        supabase.from("expenses").select("amount, expense_date").eq("store_id", storeId).gte("expense_date", monthDate),
        supabase.from("repair_tickets").select("final_price, parts_cost").eq("store_id", storeId).gte("created_at", monthStart.toISOString()).in("status", ["repaired", "delivered"]),
        supabase.from("stores").select("fixed_expenses").eq("id", storeId).maybeSingle(),
      ]);
      if (!active) return;
      const saleIds = (salesResult.data ?? []).map((sale) => sale.id);
      const { data: saleItemRows, error: saleItemsError } = saleIds.length
        ? await supabase.from("sale_items").select("sale_id, quantity, unit_cost").eq("store_id", storeId).in("sale_id", saleIds)
        : { data: [], error: null };
      const anyError = [salesResult, purchasesResult, expensesResult, repairsResult, storeResult].some((result) => result.error) || Boolean(saleItemsError);
      if (anyError) setMessage("تعذر تحميل بعض بيانات التقرير. راجع صلاحيات الوحدات وإعداد قاعدة البيانات.");
      setSales((salesResult.data ?? []) as Sale[]);
      setSaleItems((saleItemRows ?? []) as SaleItem[]);
      setPurchases((purchasesResult.data ?? []) as Purchase[]);
      setExpenses((expensesResult.data ?? []) as Expense[]);
      setRepairs((repairsResult.data ?? []) as Repair[]);
      setFixedExpenses(Number(storeResult.data?.fixed_expenses ?? 0));
      const shiftsResponse = await fetch(`/api/stores/${storeId}/shifts`).then((res) => (res.ok ? res.json() : null)).catch(() => null);
      if (!active) return;
      setShiftReports(((shiftsResponse as { closedShifts?: ShiftReport[] } | null)?.closedShifts ?? []) as ShiftReport[]);
      setLoading(false);
    }
    void loadLedger();
    return () => { active = false; };
  }, [storeId]);

  const totals = useMemo(() => {
    const salesTotal = sales.reduce((sum, sale) => sum + sale.total, 0);
    const costOfGoods = saleItems.reduce((sum, item) => sum + item.quantity * item.unit_cost, 0);
    const expensesTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const purchasesTotal = purchases.reduce((sum, purchase) => sum + purchase.total, 0);
    const repairProfit = repairs.reduce((sum, repair) => sum + repair.final_price - repair.parts_cost, 0);
    const grossProfit = salesTotal - costOfGoods;
    const paymentTotals = { cash: 0, card: 0, transfer: 0, wallet: 0 };
    sales.forEach((sale) => { paymentTotals[sale.payment_method] = (paymentTotals[sale.payment_method] ?? 0) + sale.total; });
    return { salesTotal, expensesTotal, purchasesTotal, repairProfit, netProfit: grossProfit + repairProfit - expensesTotal - fixedExpenses, paymentTotals };
  }, [expenses, fixedExpenses, purchases, repairs, saleItems, sales]);

  const dailySales = useMemo(() => {
    const daily = new Map<string, number>();
    sales.forEach((sale) => {
      const date = new Date(sale.created_at).toLocaleDateString("ar-SA", { day: "numeric", month: "short" });
      daily.set(date, (daily.get(date) ?? 0) + sale.total);
    });
    return [...daily.entries()].slice(0, 10).reverse();
  }, [sales]);

  async function addExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const record = { store_id: storeId, category: expenseForm.category, amount: Number(expenseForm.amount), note: expenseForm.note.trim(), expense_date: expenseForm.date };
    const { error } = await getSupabaseClient().from("expenses").insert(record);
    if (error) setMessage("تعذر تسجيل المصروف. تحقق من صلاحية التقارير المالية.");
    else {
      setExpenses((current) => [...current, { amount: record.amount, expense_date: record.expense_date }]);
      setExpenseForm({ category: "operational", amount: "", note: "", date: new Date().toISOString().slice(0, 10) });
      setMessage("تم تسجيل المصروف.");
    }
    setSaving(false);
  }

  const maxDailySales = Math.max(...dailySales.map(([, amount]) => amount), 1);

  return (
    <AppShell storeId={storeId}>
      <div className="space-y-5" dir="rtl">
        <div><p className="text-sm text-cyan-300">الحسابات</p><h2 className="mt-2 text-2xl font-semibold text-white">التقارير المالية</h2></div>
        {message ? <p role="status" className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">{message}</p> : null}
        {loading ? <p className="py-8 text-center text-slate-400">جارٍ إعداد التقرير...</p> : <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="مبيعات الشهر" value={totals.salesTotal} />
            <Metric label="المصروفات" value={totals.expensesTotal} />
            <Metric label="المصروفات الثابتة للشهر" value={fixedExpenses} />
            <Metric label="المشتريات" value={totals.purchasesTotal} />
            <Metric label="أرباح الصيانة" value={totals.repairProfit} />
            <Metric label="صافي الربح" value={totals.netProfit} emphasis />
          </section>
          <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <Card><CardHeader><CardTitle>حركة المبيعات اليومية</CardTitle></CardHeader><CardContent>
              {dailySales.length ? <div className="flex min-h-52 items-end gap-2 overflow-x-auto border-b border-slate-800 pb-2">{dailySales.map(([day, amount]) => <div key={day} className="flex h-48 min-w-12 flex-1 flex-col items-center justify-end gap-2"><div title={`${money.format(amount)} د.إ`} className="w-full min-h-1 rounded-t bg-cyan-400/80" style={{ height: `${Math.max(4, amount / maxDailySales * 100)}%` }} /><span className="whitespace-nowrap text-xs text-slate-400">{day}</span></div>)}</div> : <p className="py-10 text-center text-slate-400">لا توجد مبيعات مسجلة.</p>}
            </CardContent></Card>
            <Card><CardHeader><CardTitle>الأرصدة حسب طريقة الدفع</CardTitle></CardHeader><CardContent className="space-y-4">{Object.entries(totals.paymentTotals).map(([method, amount]) => <div key={method} className="flex justify-between border-b border-slate-800 pb-3 text-sm"><span className="text-slate-300">{paymentNames[method as keyof typeof paymentNames]}</span><span className="font-medium text-white">{money.format(amount)} د.إ</span></div>)}</CardContent></Card>
          </div>
          <Card><CardHeader><CardTitle>تسجيل مصروف</CardTitle></CardHeader><CardContent><form onSubmit={addExpense} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-2 text-sm text-slate-300"><span>التصنيف</span><select value={expenseForm.category} onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"><option value="operational">تشغيل</option><option value="rent">إيجار</option><option value="salaries">رواتب</option><option value="utilities">خدمات</option><option value="marketing">تسويق</option><option value="other">أخرى</option></select></label>
            <Field label="المبلغ" type="number" min="0.01" step="0.01" required value={expenseForm.amount} onChange={(amount) => setExpenseForm({ ...expenseForm, amount })} /><Field label="التاريخ" type="date" required value={expenseForm.date} onChange={(date) => setExpenseForm({ ...expenseForm, date })} /><Field label="ملاحظة" value={expenseForm.note} onChange={(note) => setExpenseForm({ ...expenseForm, note })} />
            <Button type="submit" disabled={saving} className="sm:col-span-2 xl:col-span-4">{saving ? "جارٍ التسجيل..." : "حفظ المصروف"}</Button>
          </form></CardContent></Card>
          <Card><CardHeader><CardTitle>تقارير تسليم الشفتات (المطابقة الليلية)</CardTitle></CardHeader><CardContent>
            {shiftReports.length === 0 ? <p className="py-6 text-center text-slate-400">لا توجد شفتات مسلّمة بعد.</p> : <div className="overflow-x-auto"><table className="min-w-full text-right text-sm text-slate-300">
              <thead><tr className="border-b border-slate-800 text-xs text-slate-400"><th className="p-2">الموظف</th><th className="p-2">وقت التسليم</th><th className="p-2">الكاش (متوقع / فعلي)</th><th className="p-2">فيزا</th><th className="p-2">البنوك</th><th className="p-2">المحافظ</th><th className="p-2">المصاريف</th><th className="p-2">النتيجة</th></tr></thead>
              <tbody>{shiftReports.map((shift) => <tr key={shift.id} className="border-b border-slate-800 last:border-0">
                <td className="p-2 text-white">{shift.cashier_name}</td>
                <td className="p-2">{shift.closed_at ? new Date(shift.closed_at).toLocaleString("ar-SA") : "—"}</td>
                <td className="p-2">{money.format(Number(shift.expected_cash))} / {money.format(Number(shift.actual_cash ?? 0))}</td>
                <td className="p-2">{money.format(Number(shift.expected_card))} / {money.format(Number(shift.actual_card ?? 0))}</td>
                <td className="p-2">{money.format(Number(shift.expected_transfer))} / {money.format(Number(shift.actual_transfer ?? 0))}</td>
                <td className="p-2">{money.format(Number(shift.expected_wallet))} / {money.format(Number(shift.actual_wallet ?? 0))}</td>
                <td className="p-2 text-rose-300">{money.format(Number(shift.expenses_total))}</td>
                <td className={`p-2 font-medium ${shift.is_matched ? "text-emerald-300" : "text-rose-300"}`}>{shift.is_matched ? "مطابق ✓" : `فرق ${money.format(Number(shift.difference ?? 0))} د.إ`}</td>
              </tr>)}</tbody>
            </table></div>}
          </CardContent></Card>
        </>}
      </div>
    </AppShell>
  );
}

function Metric({ label, value, emphasis = false }: { label: string; value: number; emphasis?: boolean }) { return <Card className={emphasis ? "border-cyan-500/40" : ""}><CardContent className="p-4"><p className="text-sm text-slate-400">{label}</p><p className={`mt-3 text-xl font-semibold ${emphasis ? "text-emerald-300" : "text-white"}`}>{money.format(value)} د.إ</p></CardContent></Card>; }
function Field({ label, value, onChange, type = "text", min, step, required }: { label: string; value: string; onChange: (value: string) => void; type?: string; min?: string; step?: string; required?: boolean }) { return <label className="space-y-2 text-sm text-slate-300"><span>{label}</span><input type={type} min={min} step={step} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>; }