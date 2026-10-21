"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Calendar,
  CheckCircle2,
  DollarSign,
  FileSpreadsheet,
  Printer,
  RefreshCw,
  TrendingUp,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exportFinancialReportToExcel } from "@/lib/excel-export";
import { getSupabaseClient } from "@/lib/supabase";

type Sale = {
  id: string;
  total: number;
  payment_method: "cash" | "card" | "transfer" | "wallet";
  created_at: string;
};

type SaleItem = {
  sale_id: string;
  quantity: number;
  unit_cost: number;
};

type Expense = {
  id?: string;
  amount: number;
  expense_date: string;
  category?: string;
  note?: string;
};

type Repair = {
  final_price: number;
  parts_cost: number;
  created_at?: string;
};

type Purchase = {
  total: number;
  purchase_date?: string;
};

type ShiftReport = {
  id: string;
  cashier_name: string;
  opening_cash: number;
  expenses_total: number;
  expected_cash: number;
  expected_card: number;
  expected_transfer: number;
  expected_wallet: number;
  actual_cash: number | null;
  actual_card: number | null;
  actual_transfer: number | null;
  actual_wallet: number | null;
  difference: number | null;
  is_matched: boolean | null;
  notes: string;
  opened_at: string;
  closed_at: string | null;
};

type PeriodType = "today" | "yesterday" | "week" | "month" | "last_month" | "custom";

const money = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });
const paymentNames = {
  cash: "كاش (نقدي)",
  card: "فيزا / شبكة",
  transfer: "بنك الاتحاد (تحويل)",
  wallet: "المحافظ الإلكترونية",
};

const expenseCategories: Record<string, string> = {
  operational: "تشغيلي",
  rent: "إيجار",
  salaries: "رواتب",
  utilities: "خدمات وكهرباء",
  marketing: "تسويق",
  other: "أخرى",
};

function calculateDateRange(
  period: PeriodType,
  customStart: string,
  customEnd: string
): { start: Date; end: Date; label: string; text: string } {
  const now = new Date();
  let start = new Date();
  let end = new Date();
  let label = "الشهر الحالي";

  if (period === "today") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    label = `اليوم (${start.toISOString().slice(0, 10)})`;
  } else if (period === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    start = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 0, 0, 0, 0);
    end = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 23, 59, 59, 999);
    label = `أمس (${start.toISOString().slice(0, 10)})`;
  } else if (period === "week") {
    const w = new Date(now);
    w.setDate(w.getDate() - 6);
    start = new Date(w.getFullYear(), w.getMonth(), w.getDate(), 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    label = "آخر 7 أيام";
  } else if (period === "last_month") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    label = `شهر ${start.getMonth() + 1}-${start.getFullYear()}`;
  } else if (period === "custom" && customStart && customEnd) {
    const [sy, sm, sd] = customStart.split("-").map(Number);
    const [ey, em, ed] = customEnd.split("-").map(Number);
    start = new Date(sy, (sm || 1) - 1, sd || 1, 0, 0, 0, 0);
    end = new Date(ey, (em || 1) - 1, ed || 1, 23, 59, 59, 999);
    label = `فترة مخصصة (${customStart} إلى ${customEnd})`;
  } else {
    // "month"
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    label = `شهر ${now.getMonth() + 1}-${now.getFullYear()}`;
  }

  const sStr = start.toISOString().slice(0, 10);
  const eStr = end.toISOString().slice(0, 10);
  const text = sStr === eStr ? sStr : `${sStr} إلى ${eStr}`;

  return { start, end, label, text };
}

export default function LedgerPage() {
  const routeParams = useParams();
  const storeId = (routeParams?.storeId as string) || "";

  // Date Filtering State
  const [period, setPeriod] = useState<PeriodType>("month");
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [customStartDate, setCustomStartDate] = useState(todayStr);
  const [customEndDate, setCustomEndDate] = useState(todayStr);

  // Data State
  const [sales, setSales] = useState<Sale[]>([]);
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [monthlyFixedExpenses, setMonthlyFixedExpenses] = useState(0);
  const [shiftReports, setShiftReports] = useState<ShiftReport[]>([]);

  // Expense form state
  const [expenseForm, setExpenseForm] = useState({
    category: "operational",
    amount: "",
    note: "",
    date: todayStr,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [exportNotice, setExportNotice] = useState(false);

  const rangeInfo = useMemo(
    () => calculateDateRange(period, customStartDate, customEndDate),
    [period, customStartDate, customEndDate]
  );

  useEffect(() => {
    if (!storeId) return;
    let active = true;

    async function loadData() {
      setLoading(true);
      setMessage("");

      const { start, end } = rangeInfo;
      const startIso = start.toISOString();
      const endIso = end.toISOString();
      const startDateStr = startIso.slice(0, 10);
      const endDateStr = endIso.slice(0, 10);

      try {
        const supabase = getSupabaseClient();
        const [salesRes, purchasesRes, expensesRes, repairsRes, storeRes, shiftsRes] = await Promise.all([
          supabase
            .from("sales")
            .select("id, total, payment_method, created_at")
            .eq("store_id", storeId)
            .gte("created_at", startIso)
            .lte("created_at", endIso)
            .order("created_at", { ascending: false }),
          supabase
            .from("purchases")
            .select("total, purchase_date")
            .eq("store_id", storeId)
            .gte("purchase_date", startDateStr)
            .lte("purchase_date", endDateStr),
          supabase
            .from("expenses")
            .select("id, amount, expense_date, category, note")
            .eq("store_id", storeId)
            .gte("expense_date", startDateStr)
            .lte("expense_date", endDateStr)
            .order("expense_date", { ascending: false }),
          supabase
            .from("repair_tickets")
            .select("final_price, parts_cost, created_at")
            .eq("store_id", storeId)
            .gte("created_at", startIso)
            .lte("created_at", endIso)
            .in("status", ["repaired", "delivered"]),
          supabase.from("stores").select("fixed_expenses").eq("id", storeId).maybeSingle(),
          fetch(`/api/stores/${storeId}/shifts`).then((res) => (res.ok ? res.json() : null)).catch(() => null),
        ]);

        if (!active) return;

        const saleList = (salesRes.data as Array<{ id: string }> | null) ?? [];
        const saleIds = saleList.map((s) => s.id);

        const { data: saleItemRows } = saleIds.length
          ? await supabase
              .from("sale_items")
              .select("sale_id, quantity, unit_cost")
              .eq("store_id", storeId)
              .in("sale_id", saleIds)
          : { data: [] };

        setSales((salesRes.data ?? []) as Sale[]);
        setSaleItems((saleItemRows ?? []) as SaleItem[]);
        setPurchases((purchasesRes.data ?? []) as Purchase[]);
        setExpenses((expensesRes.data ?? []) as Expense[]);
        setRepairs((repairsRes.data ?? []) as Repair[]);
        setMonthlyFixedExpenses(Number(storeRes.data?.fixed_expenses ?? 0));

        // Filter shifts that fall within the range
        const allClosed = (
          (shiftsRes as { closedShifts?: ShiftReport[] } | null)?.closedShifts ?? []
        ) as ShiftReport[];

        const periodShifts = allClosed.filter((s) => {
          if (!s.closed_at) return false;
          return s.closed_at >= startIso && s.closed_at <= endIso;
        });

        setShiftReports(periodShifts);
        setLoading(false);
      } catch {
        if (active) {
          setMessage("تعذر تحميل بعض بيانات التقرير. راجع إعداد قاعدة البيانات والصلاحيات.");
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      active = false;
    };
  }, [storeId, rangeInfo]);

  // Financial Computations
  const totals = useMemo(() => {
    const salesTotal = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
    const costOfGoods = saleItems.reduce(
      (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0),
      0
    );
    const expensesTotal = expenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
    const purchasesTotal = purchases.reduce((sum, p) => sum + Number(p.total || 0), 0);
    const repairProfit = repairs.reduce(
      (sum, r) => sum + (Number(r.final_price) || 0) - (Number(r.parts_cost) || 0),
      0
    );
    const grossProfit = salesTotal - costOfGoods;

    // Prorate fixed expenses if viewing daily or weekly
    let applicableFixedExpenses = monthlyFixedExpenses;
    if (period === "today" || period === "yesterday") {
      applicableFixedExpenses = Number((monthlyFixedExpenses / 30).toFixed(2));
    } else if (period === "week") {
      applicableFixedExpenses = Number(((monthlyFixedExpenses / 30) * 7).toFixed(2));
    }

    const netProfit = grossProfit + repairProfit - expensesTotal - applicableFixedExpenses;

    const paymentTotals = { cash: 0, card: 0, transfer: 0, wallet: 0 };
    sales.forEach((s) => {
      const m = s.payment_method as keyof typeof paymentTotals;
      if (paymentTotals[m] !== undefined) {
        paymentTotals[m] += Number(s.total || 0);
      }
    });

    return {
      salesTotal,
      costOfGoods,
      grossProfit,
      expensesTotal,
      purchasesTotal,
      repairProfit,
      fixedExpenses: applicableFixedExpenses,
      netProfit,
      paymentTotals,
    };
  }, [sales, saleItems, expenses, purchases, repairs, monthlyFixedExpenses, period]);

  // Daily breakdown chart
  const dailySales = useMemo(() => {
    const daily = new Map<string, number>();
    sales.forEach((sale) => {
      const date = new Date(sale.created_at).toLocaleDateString("ar-SA", {
        day: "numeric",
        month: "short",
      });
      daily.set(date, (daily.get(date) ?? 0) + Number(sale.total || 0));
    });
    return [...daily.entries()].slice(0, 14).reverse();
  }, [sales]);

  const maxDailySales = Math.max(...dailySales.map(([, amount]) => amount), 1);

  // Add Expense Handler
  async function addExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const record = {
      store_id: storeId,
      category: expenseForm.category,
      amount: Number(expenseForm.amount),
      note: expenseForm.note.trim(),
      expense_date: expenseForm.date,
    };

    const { error } = await getSupabaseClient().from("expenses").insert(record);
    if (error) {
      setMessage("تعذر تسجيل المصروف. تحقق من صلاحيات الحساب.");
    } else {
      setExpenses((current) => [record, ...current]);
      setExpenseForm({
        category: "operational",
        amount: "",
        note: "",
        date: todayStr,
      });
      setMessage("تم تسجيل المصروف بنجاح.");
    }
    setSaving(false);
  }

  // Export to Excel Handler
  function handleExportExcel() {
    exportFinancialReportToExcel({
      periodLabel: rangeInfo.label,
      dateRangeText: rangeInfo.text,
      totals,
      sales,
      expenses,
      repairs,
      shifts: shiftReports,
    });
    setExportNotice(true);
    setTimeout(() => setExportNotice(false), 2500);
  }

  // Print Handler
  function handlePrint() {
    window.print();
  }

  return (
    <AppShell storeId={storeId}>
      <div className="space-y-6" dir="rtl">
        {/* Page Top Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4 print:hidden">
          <div>
            <p className="text-sm text-cyan-300 flex items-center gap-1.5">
              <TrendingUp size={16} /> الحسابات والمالية
            </p>
            <h2 className="mt-1 text-2xl font-bold text-white">التقارير المالية</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              متابعة الإيرادات، الأرباح، المصروفات، وأرصدة الدفع وحسابات البنوك
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={handlePrint}
              className="text-xs text-slate-300 hover:text-white"
            >
              <Printer size={15} /> طباعة التقرير (A4 / PDF)
            </Button>
            <Button
              type="button"
              onClick={handleExportExcel}
              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs flex items-center gap-1.5"
            >
              <FileSpreadsheet size={15} /> تصدير التقرير المالي (Excel)
            </Button>
          </div>
        </div>

        {/* Printable Only Header */}
        <div className="hidden print:block border-b border-slate-300 pb-4 mb-4 text-slate-900">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-xl font-bold">كشف التقرير المالي الدوري</h1>
              <p className="text-sm">الفترة: {rangeInfo.label} ({rangeInfo.text})</p>
            </div>
            <p className="text-xs text-slate-500">طُبع بتاريخ: {new Date().toLocaleString("ar-SA")}</p>
          </div>
        </div>

        {/* Export Notification */}
        {exportNotice && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3 text-xs text-emerald-200">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>تم بنجاح تصدير وتنزيل مصنف الإكسل المالي متعدد الصفحات!</span>
          </div>
        )}

        {message && (
          <p role="status" className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">
            {message}
          </p>
        )}

        {/* Period Selector Bar (Daily / Weekly / Monthly / Custom) */}
        <Card className="print:hidden">
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <Calendar size={16} className="text-cyan-400" />
                <span>الفترة الزمنية للتقرير:</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: "today", label: "اليوم" },
                  { key: "yesterday", label: "أمس" },
                  { key: "week", label: "آخر 7 أيام (أسبوعي)" },
                  { key: "month", label: "الشهر الحالي" },
                  { key: "last_month", label: "الشهر الماضي" },
                  { key: "custom", label: "فترة مخصصة..." },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setPeriod(item.key as PeriodType)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      period === item.key
                        ? "bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/20"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Date Pickers */}
            {period === "custom" && (
              <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 pt-3 text-xs">
                <span className="text-slate-400 font-medium">تحديد النطاق:</span>
                <label className="flex items-center gap-2 text-slate-300">
                  <span>من:</span>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-white"
                  />
                </label>
                <label className="flex items-center gap-2 text-slate-300">
                  <span>إلى:</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-white"
                  />
                </label>
                <Badge variant="info">{rangeInfo.text}</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {loading ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            <RefreshCw className="animate-spin mx-auto mb-3 text-cyan-400" size={28} />
            جارٍ حساب واستخراج التقرير المالي للفترة المحددة...
          </div>
        ) : (
          <>
            {/* Active Period Badge */}
            <div className="flex items-center justify-between text-xs text-slate-400 px-1 print:hidden">
              <span>
                عرض مؤشرات: <strong className="text-cyan-300 font-semibold">{rangeInfo.label}</strong> ({rangeInfo.text})
              </span>
              <span>{sales.length} فاتورة مبيعات</span>
            </div>

            {/* Metrics Grid */}
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <Metric label="إجمالي المبيعات" value={totals.salesTotal} />
              <Metric label="تكلفة البضاعة (COGS)" value={totals.costOfGoods} sublabel="تكلفة الأصناف المباعة" />
              <Metric label="مجمل ربح البضاعة" value={totals.grossProfit} />
              <Metric label="أرباح الصيانة" value={totals.repairProfit} />
              <Metric label="المصروفات التشغيلية" value={totals.expensesTotal} negative />
              <Metric
                label="صافي الربح النهائي"
                value={totals.netProfit}
                emphasis
                sublabel={`بعد حسم ${money.format(totals.fixedExpenses)} د.إ مصاريف ثابتة`}
              />
            </section>

            {/* Middle Section: Daily Trend + Liquidity Breakdown */}
            <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
              {/* Daily Sales Chart */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center justify-between">
                    <span>حركة المبيعات اليومية خلال الفترة</span>
                    <span className="text-xs text-slate-400 font-normal">
                      الإجمالي: {money.format(totals.salesTotal)} د.إ
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {dailySales.length ? (
                    <div className="flex min-h-52 items-end gap-2 overflow-x-auto border-b border-slate-800 pb-3 pt-6">
                      {dailySales.map(([day, amount]) => (
                        <div
                          key={day}
                          className="flex h-44 min-w-12 flex-1 flex-col items-center justify-end gap-2 group"
                        >
                          <div
                            title={`${day}: ${money.format(amount)} د.إ`}
                            className="w-full min-h-2 rounded-t bg-cyan-500/80 group-hover:bg-cyan-400 transition"
                            style={{
                              height: `${Math.max(6, (amount / maxDailySales) * 100)}%`,
                            }}
                          />
                          <span className="whitespace-nowrap text-[11px] text-slate-400 group-hover:text-white">
                            {day}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="py-12 text-center text-slate-400 text-xs">
                      لا توجد مبيعات مسجلة في هذا النطاق الزمني.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Payment Methods Liquidity Breakdown */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                    <DollarSign size={16} className="text-cyan-400" />
                    <span>توزيع السيولة حسب طريقة الدفع</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Object.entries(totals.paymentTotals).map(([method, amount]) => (
                    <div
                      key={method}
                      className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs"
                    >
                      <span className="text-slate-300 font-medium">
                        {paymentNames[method as keyof typeof paymentNames]}
                      </span>
                      <span className="font-bold text-white font-mono text-sm">
                        {money.format(amount)} د.إ
                      </span>
                    </div>
                  ))}

                  <div className="flex items-center justify-between border-t border-slate-800 pt-3 text-xs font-semibold">
                    <span className="text-slate-400">إجمالي المبالغ المحصلة:</span>
                    <span className="text-emerald-300 font-bold text-sm font-mono">
                      {money.format(totals.salesTotal)} د.إ
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Record Expense Form (Hidden during print) */}
            <Card className="print:hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">تسجيل مصروف جديد</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={addExpense} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <label className="space-y-1.5 text-xs text-slate-300">
                    <span>التصنيف</span>
                    <select
                      value={expenseForm.category}
                      onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                    >
                      <option value="operational">تشغيلي</option>
                      <option value="rent">إيجار</option>
                      <option value="salaries">رواتب</option>
                      <option value="utilities">خدمات وكهرباء</option>
                      <option value="marketing">تسويق</option>
                      <option value="other">أخرى</option>
                    </select>
                  </label>
                  <Field
                    label="المبلغ (د.إ)"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={expenseForm.amount}
                    onChange={(amount) => setExpenseForm({ ...expenseForm, amount })}
                  />
                  <Field
                    label="التاريخ"
                    type="date"
                    required
                    value={expenseForm.date}
                    onChange={(date) => setExpenseForm({ ...expenseForm, date })}
                  />
                  <Field
                    label="البيان / ملاحظات"
                    value={expenseForm.note}
                    onChange={(note) => setExpenseForm({ ...expenseForm, note })}
                  />
                  <Button
                    type="submit"
                    disabled={saving}
                    className="sm:col-span-2 xl:col-span-4 bg-cyan-600 hover:bg-cyan-500 text-white"
                  >
                    {saving ? "جارٍ الحفظ..." : "حفظ المصروف"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Expenses History Table for the Period */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  <span>المصروفات المسجلة خلال الفترة ({expenses.length})</span>
                  <span className="text-xs text-rose-300 font-mono">
                    الإجمالي: {money.format(totals.expensesTotal)} د.إ
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {expenses.length === 0 ? (
                  <p className="py-6 text-center text-slate-400 text-xs">لا توجد مصروفات مسجلة في هذه الفترة.</p>
                ) : (
                  <div className="max-h-60 overflow-y-auto">
                    <table className="min-w-full text-right text-xs text-slate-300">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="p-2">التاريخ</th>
                          <th className="p-2">النوع</th>
                          <th className="p-2">المبلغ</th>
                          <th className="p-2">البيان</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses.map((exp, i) => (
                          <tr key={i} className="border-b border-slate-800 last:border-0 hover:bg-slate-900/40">
                            <td className="p-2">{exp.expense_date}</td>
                            <td className="p-2">
                              <Badge variant="warning">
                                {expenseCategories[exp.category || ""] || exp.category || "تشغيلي"}
                              </Badge>
                            </td>
                            <td className="p-2 font-bold text-rose-300 font-mono">
                              {money.format(exp.amount)} د.إ
                            </td>
                            <td className="p-2 text-slate-400">{exp.note || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Shift Audit Reports Table for the Period */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center justify-between">
                  <span>تقارير تسليم الشفتات والمطابقة خلال الفترة ({shiftReports.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {shiftReports.length === 0 ? (
                  <p className="py-6 text-center text-slate-400 text-xs">لا توجد شفتات مغلقة في هذه الفترة.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-right text-xs text-slate-300">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="p-2">الموظف</th>
                          <th className="p-2">وقت الإغلاق</th>
                          <th className="p-2">الكاش (متوقع / فعلي)</th>
                          <th className="p-2">فيزا</th>
                          <th className="p-2">البنوك</th>
                          <th className="p-2">المحافظ</th>
                          <th className="p-2">المصاريف</th>
                          <th className="p-2">النتيجة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shiftReports.map((shift) => (
                          <tr key={shift.id} className="border-b border-slate-800 last:border-0 hover:bg-slate-900/40">
                            <td className="p-2 font-medium text-white">{shift.cashier_name}</td>
                            <td className="p-2 text-slate-400">
                              {shift.closed_at ? new Date(shift.closed_at).toLocaleString("ar-SA") : "—"}
                            </td>
                            <td className="p-2 font-mono">
                              {money.format(Number(shift.expected_cash))} /{" "}
                              <strong className="text-white">{money.format(Number(shift.actual_cash ?? 0))}</strong>
                            </td>
                            <td className="p-2 font-mono">
                              {money.format(Number(shift.actual_card ?? shift.expected_card))}
                            </td>
                            <td className="p-2 font-mono">
                              {money.format(Number(shift.actual_transfer ?? shift.expected_transfer))}
                            </td>
                            <td className="p-2 font-mono">
                              {money.format(Number(shift.actual_wallet ?? shift.expected_wallet))}
                            </td>
                            <td className="p-2 text-rose-300 font-mono">{money.format(Number(shift.expenses_total))}</td>
                            <td className="p-2">
                              {shift.is_matched ? (
                                <Badge variant="success">مطابق ✓</Badge>
                              ) : (
                                <Badge variant="danger">
                                  فرق {money.format(Number(shift.difference ?? 0))} د.إ
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Metric({
  label,
  value,
  sublabel,
  emphasis = false,
  negative = false,
}: {
  label: string;
  value: number;
  sublabel?: string;
  emphasis?: boolean;
  negative?: boolean;
}) {
  return (
    <Card className={emphasis ? "border-cyan-500/40 bg-gradient-to-br from-slate-900 to-cyan-950/20" : ""}>
      <CardContent className="p-4">
        <p className="text-xs text-slate-400">{label}</p>
        <p
          className={`mt-2 text-xl font-bold font-mono ${
            emphasis
              ? "text-emerald-300"
              : negative
              ? "text-rose-300"
              : "text-white"
          }`}
        >
          {negative ? "-" : ""}
          {money.format(Math.abs(value))} د.إ
        </p>
        {sublabel && <p className="mt-1 text-[11px] text-slate-500">{sublabel}</p>}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  min,
  step,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  step?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-1.5 text-xs text-slate-300">
      <span>{label}</span>
      <input
        type={type}
        min={min}
        step={step}
        required={required}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-cyan-500"
      />
    </label>
  );
}
