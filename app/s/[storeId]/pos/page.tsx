"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  Camera,
  CheckCircle2,
  CreditCard,
  EyeOff,
  Lock,
  Minus,
  Plus,
  Printer,
  Receipt,
  Trash2,
  Unlock,
  Wallet,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabase";

type Product = {
  id: string;
  name: string;
  category: string;
  sku: string;
  barcode: string | null;
  quantity: number;
  selling_price: number;
  discount: number;
};
type CartLine = { product: Product; quantity: number; discountPercent: number };
type PaymentMethod = "cash" | "card" | "transfer" | "wallet";

type ShiftAccountConfig = {
  id: string;
  type: "bank" | "wallet";
  name: string;
  opening_balance?: number;
};

type ShiftExpenseItem = {
  id: string;
  category: string;
  amount: number;
  note: string;
  source_account?: string;
  created_at: string;
};

type OpenShift = {
  id: string;
  store_id: string;
  user_id: string;
  cashier_name: string;
  status: "open";
  opening_cash: number;
  expenses_total: number;
  shift_expenses: ShiftExpenseItem[];
  accounts_config: ShiftAccountConfig[];
  opened_at: string;
};

type AccountBreakdown = {
  id: string;
  name: string;
  type: "bank" | "wallet";
  opening: number;
  sales: number;
  transfers_in: number;
  expected: number;
  actual: number;
  difference: number;
  is_matched: boolean;
};

type ClosedShiftReport = {
  id: string;
  cashier_name: string;
  opening_cash: number;
  cash_sales?: number;
  expected_cash: number;
  expected_card: number;
  expected_transfer: number;
  expected_wallet: number;
  expenses_total: number;
  shift_expenses: ShiftExpenseItem[];
  accounts_config?: ShiftAccountConfig[];
  accounts_breakdown?: AccountBreakdown[];
  actual_cash: number;
  actual_card: number;
  actual_transfer: number;
  actual_wallet: number;
  difference: number;
  is_matched: boolean;
  notes: string;
  opened_at: string;
  closed_at: string;
};

const defaultCategoryNames: Record<string, string> = {
  accessory: "إكسسوارات",
  repair_part: "قطع صيانة",
  phone: "هواتف",
  service: "خدمات",
};

const paymentMethods: { value: PaymentMethod; label: string; icon: typeof CreditCard }[] = [
  { value: "cash", label: "كاش (نقدي)", icon: Receipt },
  { value: "card", label: "فيزا", icon: CreditCard },
  { value: "transfer", label: "البنوك (تحويل)", icon: Building2 },
  { value: "wallet", label: "المحافظ", icon: Wallet },
];

const initialAccountsConfig: ShiftAccountConfig[] = [
  { id: "b1", type: "bank", name: "بنك الاتحاد", opening_balance: 0 },
  { id: "w1", type: "wallet", name: "زين كاش", opening_balance: 0 },
  { id: "w2", type: "wallet", name: "كليك (CliQ)", opening_balance: 0 },
];

const money = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });

export default function StorePOSPage() {
  const routeParams = useParams();
  const storeId = (routeParams?.storeId as string) || "";
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [selectedSubAccount, setSelectedSubAccount] = useState("");
  const [invoiceDiscount, setInvoiceDiscount] = useState("0");
  const [showScanner, setShowScanner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [lastSale, setLastSale] = useState<{
    id: string;
    date: string;
    lines: CartLine[];
    subtotal: number;
    discount: number;
    total: number;
    method: PaymentMethod;
    accountName?: string;
  } | null>(null);

  // إدارة الشفت والحسابات
  const [openShift, setOpenShift] = useState<OpenShift | null>(null);
  const [openingCashInput, setOpeningCashInput] = useState("0");
  const [shiftAccounts, setShiftAccounts] = useState<ShiftAccountConfig[]>(initialAccountsConfig);
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [movementType, setMovementType] = useState<"expense" | "cash_out">("expense");
  const [targetAccount, setTargetAccount] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseNote, setExpenseNote] = useState("");
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);
  const [actualCashInput, setActualCashInput] = useState("");
  const [actualCardInput, setActualCardInput] = useState("");
  const [actualAccountInputs, setActualAccountInputs] = useState<Record<string, string>>({});
  const [closeNotes, setCloseNotes] = useState("");
  const [shiftSaving, setShiftSaving] = useState(false);
  const [closedReport, setClosedReport] = useState<ClosedShiftReport | null>(null);

  useEffect(() => {
    if (!storeId) return;
    let active = true;
    async function loadPOS() {
      try {
        const supabase = getSupabaseClient();
        const [{ data, error }, shiftRes] = await Promise.all([
          supabase
            .from("inventory_items")
            .select("id, name, category, sku, barcode, quantity, selling_price, discount")
            .eq("store_id", storeId)
            .gt("quantity", 0)
            .order("name"),
          fetch(`/api/stores/${storeId}/shifts`).then((res) => (res.ok ? res.json() : null)).catch(() => null),
        ]);
        if (!active) return;
        if (error) setMessage("تعذر تحميل المنتجات لهذا المتجر.");
        setProducts((data ?? []) as Product[]);

        const shiftData = shiftRes as {
          openShift?: OpenShift | null;
          savedAccounts?: ShiftAccountConfig[];
        } | null;

        if (shiftData?.savedAccounts && Array.isArray(shiftData.savedAccounts) && shiftData.savedAccounts.length > 0) {
          setShiftAccounts(shiftData.savedAccounts);
        }

        if (shiftData?.openShift) {
          setOpenShift(shiftData.openShift);
          if (Array.isArray(shiftData.openShift.accounts_config) && shiftData.openShift.accounts_config.length > 0) {
            setShiftAccounts(shiftData.openShift.accounts_config);
          }
          try {
            localStorage.setItem(`pos_open_shift_${storeId}`, JSON.stringify(shiftData.openShift));
          } catch {}
        } else {
          try {
            const cached = localStorage.getItem(`pos_open_shift_${storeId}`);
            if (cached) {
              const parsed = JSON.parse(cached) as OpenShift;
              setOpenShift(parsed);
              if (Array.isArray(parsed?.accounts_config) && parsed.accounts_config.length > 0) {
                setShiftAccounts(parsed.accounts_config);
              }
            }
          } catch {}
        }

        setLoading(false);
      } catch {
        if (active) setLoading(false);
      }
    }
    void loadPOS();
    return () => {
      active = false;
    };
  }, [storeId]);

  const configuredBanks = useMemo(
    () => (Array.isArray(shiftAccounts) ? shiftAccounts : []).filter((acc) => acc?.type === "bank"),
    [shiftAccounts],
  );
  const configuredWallets = useMemo(
    () => (Array.isArray(shiftAccounts) ? shiftAccounts : []).filter((acc) => acc?.type === "wallet"),
    [shiftAccounts],
  );

  function handleSelectPaymentMethod(method: PaymentMethod) {
    setPaymentMethod(method);
    if (method === "transfer") {
      setSelectedSubAccount(configuredBanks[0]?.name ?? "تحويل بنكي");
    } else if (method === "wallet") {
      setSelectedSubAccount(configuredWallets[0]?.name ?? "محفظة");
    } else if (method === "card") {
      setSelectedSubAccount("فيزا");
    } else {
      setSelectedSubAccount("كاش");
    }
  }

  const categories = useMemo(
    () => [...new Set((products ?? []).map((product) => product?.category).filter(Boolean))],
    [products],
  );
  const filteredProducts = (products ?? []).filter(
    (product) =>
      product &&
      (category === "all" || product.category === category) &&
      `${product.name ?? ""} ${product.sku ?? ""} ${product.barcode ?? ""}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  const subtotal = cart.reduce((sum, line) => sum + line.product.selling_price * line.quantity, 0);
  const itemDiscount = cart.reduce(
    (sum, line) => sum + (line.product.selling_price * line.quantity * line.discountPercent) / 100,
    0,
  );
  const invoiceDiscountAmount = Math.min(Math.max(0, Number(invoiceDiscount) || 0), Math.max(0, subtotal - itemDiscount));
  const total = subtotal - itemDiscount - invoiceDiscountAmount;

  function getCategoryLabel(cat: string) {
    return defaultCategoryNames[cat] ?? cat;
  }

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
        return current.map((line) =>
          line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...current, { product, quantity: 1, discountPercent: product.discount }];
    });
  }

  function adjustQuantity(productId: string, change: number) {
    setCart((current) =>
      current.flatMap((line) => {
        if (line.product.id !== productId) return [line];
        const quantity = line.quantity + change;
        if (quantity <= 0) return [];
        if (quantity > line.product.quantity) {
          setMessage("لا تتوفر هذه الكمية في المخزون.");
          return [line];
        }
        return [{ ...line, quantity }];
      }),
    );
  }

  function scanCode(value: string) {
    setSearch(value);
    const product = products.find((item) => item.barcode === value || item.sku === value);
    if (product) addProduct(product);
    else setMessage("لم يتم العثور على منتج بهذا الرمز في مخزون هذا المتجر.");
  }

  // إدارة الحسابات في نافذة فتح الشفت
  function addBankField() {
    const nextNum = configuredBanks.length + 1;
    setShiftAccounts((prev) => [
      ...prev,
      { id: `bank_${Date.now()}`, type: "bank", name: `بنك ${nextNum}`, opening_balance: 0 },
    ]);
  }

  function addWalletField() {
    const nextNum = configuredWallets.length + 1;
    setShiftAccounts((prev) => [
      ...prev,
      { id: `wallet_${Date.now()}`, type: "wallet", name: `محفظة ${nextNum}`, opening_balance: 0 },
    ]);
  }

  function updateAccountName(id: string, newName: string) {
    setShiftAccounts((prev) => prev.map((acc) => (acc.id === id ? { ...acc, name: newName } : acc)));
  }

  function updateAccountOpeningBalance(id: string, balance: number) {
    setShiftAccounts((prev) =>
      prev.map((acc) => (acc.id === id ? { ...acc, opening_balance: balance } : acc)),
    );
  }

  function removeAccountField(id: string) {
    setShiftAccounts((prev) => prev.filter((acc) => acc.id !== id));
  }

  async function handleStartShift(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShiftSaving(true);
    setMessage("");

    const cleanedAccounts = shiftAccounts
      .map((acc) => ({
        ...acc,
        name: acc.name.trim(),
        opening_balance: Math.max(0, Number(acc.opening_balance) || 0),
      }))
      .filter((acc) => acc.name.length > 0);

    const response = await fetch(`/api/stores/${storeId}/shifts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "open",
        openingCash: Number(openingCashInput) || 0,
        accountsConfig: cleanedAccounts,
      }),
    });
    const result = (await response.json()) as { shift?: OpenShift; message?: string };
    if (response.ok && result.shift) {
      setOpenShift(result.shift);
      setShiftAccounts(result.shift.accounts_config ?? cleanedAccounts);
      setClosedReport(null);
      try {
        localStorage.setItem(`pos_open_shift_${storeId}`, JSON.stringify(result.shift));
      } catch {}
      setShowOpenShiftModal(false);
      setMessage(result.message ?? "تم فتح الشفت والدرج وتثبيت الأرصدة الافتتاحية بنجاح.");
    } else {
      setMessage(result.message ?? "تعذر فتح الشفت.");
    }
    setShiftSaving(false);
  }

  async function handleAddShiftExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!openShift) return;
    setShiftSaving(true);
    setMessage("");

    const chosenTarget = targetAccount || configuredBanks[0]?.name || configuredWallets[0]?.name || "تحويل بنكي";

    const response = await fetch(`/api/stores/${storeId}/shifts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "expense",
        shiftId: openShift.id,
        movementType,
        expenseAmount: Number(expenseAmount) || 0,
        expenseNote: expenseNote.trim(),
        expenseCategory: movementType === "cash_out" ? "cash_out" : "operational",
        targetAccount: movementType === "cash_out" ? chosenTarget : undefined,
      }),
    });
    const result = (await response.json()) as { expense?: ShiftExpenseItem; message?: string };
    if (response.ok && result.expense) {
      const updatedExpenses = [...(openShift.shift_expenses ?? []), result.expense];
      const updatedTotal = updatedExpenses
        .filter((item) => !item.source_account || item.source_account === "كاش الدرج")
        .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
      const updatedShift: OpenShift = {
        ...openShift,
        shift_expenses: updatedExpenses,
        expenses_total: updatedTotal,
      };
      setOpenShift(updatedShift);
      try {
        localStorage.setItem(`pos_open_shift_${storeId}`, JSON.stringify(updatedShift));
      } catch {}
      setExpenseAmount("");
      setExpenseNote("");
      setShowExpenseModal(false);
      setMessage(result.message ?? "تم تسجيل الحركة بنجاح.");
    } else {
      setMessage(result.message ?? "تعذر تسجيل الحركة.");
    }
    setShiftSaving(false);
  }

  async function handleCloseShift(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!openShift) return;
    setShiftSaving(true);
    setMessage("");

    const actualAccountsMap: Record<string, number> = {};
    shiftAccounts.forEach((acc) => {
      actualAccountsMap[acc.name] = Number(actualAccountInputs[acc.name]) || 0;
    });

    const response = await fetch(`/api/stores/${storeId}/shifts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "close",
        shiftId: openShift.id,
        openedAt: openShift.opened_at,
        openingCash: openShift.opening_cash,
        localExpenses: openShift.shift_expenses,
        accountsConfig: shiftAccounts,
        actualCash: Number(actualCashInput) || 0,
        actualCard: Number(actualCardInput) || 0,
        actualAccounts: actualAccountsMap,
        notes: closeNotes.trim(),
      }),
    });
    const result = (await response.json()) as { closedShift?: ClosedShiftReport; message?: string };
    if (response.ok && result.closedShift) {
      setClosedReport(result.closedShift);
      setOpenShift(null);
      try {
        localStorage.removeItem(`pos_open_shift_${storeId}`);
      } catch {}
      setShowCloseShiftModal(false);
      setActualCashInput("");
      setActualCardInput("");
      setActualAccountInputs({});
      setCloseNotes("");
      setMessage(result.message ?? "تم إنهاء الشفت وتسليم الحساب.");
    } else {
      setMessage(result.message ?? "تعذر إنهاء الشفت.");
    }
    setShiftSaving(false);
  }

  async function checkout() {
    if (cart.length === 0 || saving) return;
    if (!openShift) {
      setMessage("يرجى فتح الشفت أولاً وتحديد رصيد الدرج قبل البدء بالبيع.");
      setShowOpenShiftModal(true);
      return;
    }
    setSaving(true);
    setMessage("");

    const chosenAccountName =
      paymentMethod === "transfer" || paymentMethod === "wallet"
        ? selectedSubAccount
        : paymentMethod === "card"
          ? "فيزا"
          : "كاش";

    // محاولة استدعاء دالة complete_sale مع اسم الحساب المخصص
    let saleResponse = await getSupabaseClient().rpc("complete_sale", {
      p_store_id: storeId,
      p_payment_method: paymentMethod,
      p_invoice_discount: invoiceDiscountAmount,
      p_items: cart.map((line) => ({
        inventory_item_id: line.product.id,
        quantity: line.quantity,
        discount: (line.product.selling_price * line.quantity * line.discountPercent) / 100,
      })),
      p_payment_account: chosenAccountName,
    });

    if (saleResponse.error && saleResponse.error.message.includes("p_payment_account")) {
      // احتياطي في حال استدعاء الدالة السابقة
      saleResponse = await getSupabaseClient().rpc("complete_sale", {
        p_store_id: storeId,
        p_payment_method: paymentMethod,
        p_invoice_discount: invoiceDiscountAmount,
        p_items: cart.map((line) => ({
          inventory_item_id: line.product.id,
          quantity: line.quantity,
          discount: (line.product.selling_price * line.quantity * line.discountPercent) / 100,
        })),
      });
    }

    if (saleResponse.error) {
      setMessage(
        saleResponse.error.message.includes("الكمية")
          ? "تعذر إتمام البيع: الكمية المطلوبة غير متاحة في المخزون."
          : "تعذر حفظ الفاتورة. تأكد من إعداد قاعدة البيانات ثم حاول مجدداً.",
      );
    } else {
      const saleId = saleResponse.data as string;
      setLastSale({
        id: saleId,
        date: new Date().toLocaleString("ar-SA"),
        lines: [...cart],
        subtotal,
        discount: itemDiscount + invoiceDiscountAmount,
        total,
        method: paymentMethod,
        accountName: chosenAccountName,
      });
      setProducts((current) =>
        current
          .map((product) => {
            const sold = cart.find((line) => line.product.id === product.id)?.quantity ?? 0;
            return { ...product, quantity: product.quantity - sold };
          })
          .filter((product) => product.quantity > 0),
      );
      setCart([]);
      setInvoiceDiscount("0");
      setMessage("تم حفظ البيع وتحديث مخزون المتجر بنجاح.");
    }
    setSaving(false);
  }

  return (
    <AppShell storeId={storeId}>
      <div className="space-y-5" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3 no-print">
          <div>
            <p className="text-sm text-cyan-300">نقطة البيع</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">شاشة الكاشير وإدارة الشفت</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {openShift ? (
              <>
                <Badge variant="success">
                  شفت مفتوح منذ {new Date(openShift.opened_at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                </Badge>
                <Button type="button" variant="secondary" onClick={() => setShowExpenseModal(true)}>
                  <Receipt size={16} /> مصاريف الشفت ({money.format(openShift.expenses_total)} د.إ)
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setLastSale(null);
                    setShowCloseShiftModal(true);
                  }}
                  className="bg-amber-500 text-slate-950 hover:bg-amber-400 font-semibold"
                >
                  <Lock size={16} /> إنهاء الشفت وتسليم الحساب
                </Button>
              </>
            ) : (
              <Button type="button" onClick={() => setShowOpenShiftModal(true)}>
                <Unlock size={16} /> فتح شفت وحسابات الدرج
              </Button>
            )}
          </div>
        </div>

        {/* وضع الشفت الأعمى: إخفاء الأرصدة أثناء الشفت */}
        {openShift ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-4 py-3 text-xs text-slate-300 no-print">
            <div className="flex items-center gap-2">
              <EyeOff size={16} className="text-cyan-300 shrink-0" />
              <span>
                <strong>وضع الشفت المغلق (الأعمى):</strong> أرصدة الكاش، فيزا، البنوك، والمحافظ مخفية أثناء العمل وتظهر للمطابقة عند تسليم الحساب ليلاً.
              </span>
            </div>
            <span className="text-slate-400">
              المصاريف المسجلة: <strong className="text-rose-300">{money.format(openShift.expenses_total)} د.إ</strong>
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 no-print">
            <span>لم يتم فتح شفت عمل حالياً. اضغط لفتح الدرج وتحديد حسابات البنوك والمحافظ وبدء العمل.</span>
            <Button type="button" onClick={() => setShowOpenShiftModal(true)}>
              <Unlock size={16} /> فتح الشفت الآن
            </Button>
          </div>
        )}

        {message ? (
          <p role="status" className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200 no-print">
            {message}
          </p>
        ) : null}

        {/* تقرير تسليم الشفت والمطابقة الليلية */}
        {closedReport ? (
          <Card className={`border-2 ${closedReport.is_matched ? "border-emerald-500/60" : "border-rose-500/60"} no-print`}>
            <CardHeader className="flex flex-wrap flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {closedReport.is_matched ? (
                  <CheckCircle2 className="text-emerald-400" size={22} />
                ) : (
                  <AlertTriangle className="text-rose-400" size={22} />
                )}
                <CardTitle>تقرير تسليم الشفت والمطابقة الليلية</CardTitle>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={closedReport.is_matched ? "success" : "danger"}>
                  {closedReport.is_matched ? "الحساب مطابق تماماً ✓" : `غير مطابق (الفرق: ${money.format(closedReport.difference)} د.إ)`}
                </Badge>
                <Button type="button" variant="secondary" onClick={() => window.print()}>
                  <Printer size={15} /> طباعة تقرير الشفت
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ReconcileBox
                  title="الكاش (الدرج)"
                  subtitle={`الافتتاحي (${money.format(closedReport.opening_cash)}) + المبيعات − المصاريف (${money.format(closedReport.expenses_total)})`}
                  expected={closedReport.expected_cash}
                  actual={closedReport.actual_cash}
                />
                <ReconcileBox
                  title="فيزا"
                  subtitle="مبيعات بطاقات فيزا"
                  expected={closedReport.expected_card}
                  actual={closedReport.actual_card}
                />
                <ReconcileBox
                  title="إجمالي البنوك"
                  subtitle="مجموع كل حسابات البنوك"
                  expected={closedReport.expected_transfer}
                  actual={closedReport.actual_transfer}
                />
                <ReconcileBox
                  title="إجمالي المحافظ"
                  subtitle="مجموع كل المحافظ الإلكترونية"
                  expected={closedReport.expected_wallet}
                  actual={closedReport.actual_wallet}
                />
              </div>

              {/* تفصيل كل بنك وكل محفظة بالاسم */}
              {closedReport.accounts_breakdown && closedReport.accounts_breakdown.length > 0 ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                  <h4 className="mb-3 font-semibold text-white">تفصيل مطابقة حسابات البنوك والمحافظ:</h4>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {closedReport.accounts_breakdown.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-md border p-2.5 text-xs ${
                          item.is_matched ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/40 bg-rose-500/10"
                        }`}
                      >
                        <div className="flex justify-between font-semibold text-white">
                          <span>{item.name}</span>
                          <span className={item.type === "bank" ? "text-cyan-300" : "text-amber-300"}>
                            {item.type === "bank" ? "بنك" : "محفظة"}
                          </span>
                        </div>
                        <div className="mt-2 space-y-0.5 text-slate-300">
                          <div className="flex justify-between text-slate-400">
                            <span>الرصيد الافتتاحي:</span>
                            <span>{money.format(item.opening)} د.إ</span>
                          </div>
                          {item.sales > 0 ? (
                            <div className="flex justify-between text-slate-400">
                              <span>المبيعات المحولة:</span>
                              <span>+{money.format(item.sales)} د.إ</span>
                            </div>
                          ) : null}
                          {item.transfers_in > 0 ? (
                            <div className="flex justify-between text-slate-400">
                              <span>استلام سحب كاش:</span>
                              <span className="text-amber-300">+{money.format(item.transfers_in)} د.إ</span>
                            </div>
                          ) : null}
                          <div className="flex justify-between border-t border-slate-800/80 pt-1 font-medium text-white">
                            <span>المتوقع بالنظام:</span>
                            <span>{money.format(item.expected)} د.إ</span>
                          </div>
                          <div className="flex justify-between">
                            <span>المُسلّم فعلياً:</span>
                            <span className="font-semibold text-white">{money.format(item.actual)} د.إ</span>
                          </div>
                          <div className="flex justify-between border-t border-slate-800 pt-1 font-semibold">
                            <span>النتيجة:</span>
                            <span className={item.is_matched ? "text-emerald-300" : "text-rose-300"}>
                              {item.is_matched ? "مطابق ✓" : `${item.difference > 0 ? "+" : ""}${money.format(item.difference)} د.إ`}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                <div className="flex justify-between font-medium text-white">
                  <span>المصاريف المسجلة في الشفت</span>
                  <span className="text-rose-300">{money.format(closedReport.expenses_total)} د.إ</span>
                </div>
                {closedReport.shift_expenses.length > 0 ? (
                  <ul className="mt-2 space-y-1 border-t border-slate-800 pt-2 text-xs text-slate-400">
                    {closedReport.shift_expenses.map((exp) => (
                      <li key={exp.id} className="flex justify-between">
                        <span>{exp.note}</span>
                        <span>{money.format(exp.amount)} د.إ</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">لا توجد مصاريف مسجلة في هذا الشفت.</p>
                )}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* شاشة الكاشير والسلة */}
        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.85fr] no-print">
          <Card>
            <CardHeader>
              <CardTitle>المنتجات المتاحة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      const match = products.find((item) => item.barcode === search || item.sku === search);
                      if (match) addProduct(match);
                    }
                  }}
                  placeholder="ابحث أو امسح الرمز بقارئ USB"
                  aria-label="بحث أو إدخال باركود"
                  className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowScanner(true)}
                  title="مسح بالكاميرا"
                  aria-label="مسح بالكاميرا"
                >
                  <Camera size={16} />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <CategoryButton active={category === "all"} onClick={() => setCategory("all")}>
                  الكل
                </CategoryButton>
                {categories.map((item) => (
                  <CategoryButton key={item} active={category === item} onClick={() => setCategory(item)}>
                    {getCategoryLabel(item)}
                  </CategoryButton>
                ))}
              </div>
              {loading ? <p className="py-10 text-center text-slate-400">جارٍ تحميل المنتجات...</p> : null}
              {!loading && filteredProducts.length === 0 ? (
                <p className="py-10 text-center text-slate-400">لا توجد منتجات متاحة بهذا البحث.</p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map((product) => (
                  <button
                    type="button"
                    key={product.id}
                    onClick={() => addProduct(product)}
                    className="min-h-28 rounded-lg border border-slate-800 bg-slate-950 p-3 text-right transition hover:border-cyan-500/50"
                  >
                    <span className="block font-medium text-white">{product.name}</span>
                    <span className="mt-1 block text-xs text-slate-400">
                      {getCategoryLabel(product.category)} · {product.sku} · المتاح {money.format(product.quantity)}
                    </span>
                    <span className="mt-3 block text-sm font-semibold text-emerald-300">
                      {money.format(product.selling_price)} د.إ
                    </span>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>سلة الفاتورة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cart.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-400">
                  السلة فارغة. أضف منتجًا للبدء.
                </p>
              ) : null}
              <div className="max-h-[42vh] space-y-3 overflow-y-auto">
                {cart.map((line) => (
                  <div key={line.product.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-white">{line.product.name}</p>
                        <p className="mt-1 text-xs text-slate-400">
                          {money.format(line.product.selling_price)} د.إ للقطعة
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCart((current) => current.filter((item) => item.product.id !== line.product.id))}
                        aria-label={`حذف ${line.product.name}`}
                        className="rounded p-1 text-slate-400 hover:bg-rose-500/10 hover:text-rose-300"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => adjustQuantity(line.product.id, -1)}
                          aria-label="تقليل الكمية"
                          className="rounded border border-slate-700 p-1 text-slate-200"
                        >
                          <Minus size={14} />
                        </button>
                        <span className="min-w-5 text-center text-white">{money.format(line.quantity)}</span>
                        <button
                          type="button"
                          onClick={() => adjustQuantity(line.product.id, 1)}
                          aria-label="زيادة الكمية"
                          className="rounded border border-slate-700 p-1 text-slate-200"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-slate-400">
                        خصم ٪
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={line.discountPercent}
                          onChange={(event) =>
                            setCart((current) =>
                              current.map((item) =>
                                item.product.id === line.product.id
                                  ? { ...item, discountPercent: Math.min(100, Math.max(0, Number(event.target.value) || 0)) }
                                  : item,
                              ),
                            )
                          }
                          className="w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
                        />
                      </label>
                      <span className="font-medium text-emerald-300">
                        {money.format(line.product.selling_price * line.quantity * (1 - line.discountPercent / 100))} د.إ
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* أزرار طرق الدفع الأربعة */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-400">طريقة الدفع:</p>
                <div className="grid grid-cols-2 gap-2" aria-label="طريقة الدفع">
                  {paymentMethods.map((method) => {
                    const Icon = method.icon;
                    return (
                      <button
                        key={method.value}
                        type="button"
                        onClick={() => handleSelectPaymentMethod(method.value)}
                        className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                          paymentMethod === method.value
                            ? "border-cyan-400 bg-cyan-500/20 text-white shadow-sm ring-1 ring-cyan-400/50"
                            : "border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700 hover:text-white"
                        }`}
                      >
                        <Icon size={16} className={paymentMethod === method.value ? "text-cyan-300" : "text-slate-400"} />
                        <span>{method.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* اختيار البنك المحدد إذا كانت طريقة الدفع بنك */}
                {paymentMethod === "transfer" && configuredBanks.length > 0 ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
                    <p className="mb-2 text-xs text-cyan-200">اختر الحساب البنكي المُستلم:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {configuredBanks.map((bank) => (
                        <button
                          key={bank.id}
                          type="button"
                          onClick={() => setSelectedSubAccount(bank.name)}
                          className={`rounded px-2.5 py-1 text-xs transition-colors ${
                            selectedSubAccount === bank.name
                              ? "bg-cyan-500 text-slate-950 font-semibold"
                              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                          }`}
                        >
                          {bank.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* اختيار المحفظة المحددة إذا كانت طريقة الدفع محفظة */}
                {paymentMethod === "wallet" && configuredWallets.length > 0 ? (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-2.5">
                    <p className="mb-2 text-xs text-amber-200">اختر المحفظة الإلكترونية المُستلمة:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {configuredWallets.map((wallet) => (
                        <button
                          key={wallet.id}
                          type="button"
                          onClick={() => setSelectedSubAccount(wallet.name)}
                          className={`rounded px-2.5 py-1 text-xs transition-colors ${
                            selectedSubAccount === wallet.name
                              ? "bg-amber-400 text-slate-950 font-semibold"
                              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                          }`}
                        >
                          {wallet.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
                خصم الفاتورة
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={invoiceDiscount}
                  onChange={(event) => setInvoiceDiscount(event.target.value)}
                  className="w-28 rounded-md border border-slate-700 bg-slate-950 px-2 py-2 text-left text-white"
                />
              </label>
              <div className="space-y-2 border-t border-slate-800 pt-3 text-sm text-slate-300">
                <Total label="المجموع الفرعي" amount={subtotal} />
                <Total label="خصم المنتجات" amount={itemDiscount} negative />
                <Total label="خصم الفاتورة" amount={invoiceDiscountAmount} negative />
                <div className="flex justify-between border-t border-slate-800 pt-3 text-base font-bold text-white">
                  <span>الإجمالي</span>
                  <span>{money.format(total)} د.إ</span>
                </div>
              </div>
              <Button
                type="button"
                disabled={cart.length === 0 || saving}
                onClick={() => void checkout()}
                className="w-full h-11 text-base font-semibold"
              >
                {saving ? "جارٍ إتمام البيع..." : "إتمام البيع"}
              </Button>
              {lastSale ? (
                <Button type="button" variant="secondary" onClick={() => window.print()} className="w-full">
                  <Printer size={16} /> طباعة الفاتورة
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {/* طباعة الفاتورة أو تقرير تسليم الشفت */}
        {lastSale ? (
          <section className="print-only mx-auto hidden max-w-xl bg-white p-8 text-black" dir="rtl">
            <h1 className="text-center text-2xl font-bold">سبيشل موبايل</h1>
            <h2 className="mt-2 text-center text-lg">فاتورة بيع</h2>
            <p className="mt-4">رقم الفاتورة: {lastSale.id}</p>
            <p>التاريخ: {lastSale.date}</p>
            <p>
              طريقة الدفع: {paymentMethods.find((m) => m.value === lastSale.method)?.label}{" "}
              {lastSale.accountName && lastSale.accountName !== "كاش" ? `(${lastSale.accountName})` : ""}
            </p>
            <table className="mt-5 w-full text-right">
              <thead>
                <tr>
                  <th className="border-b p-2">المنتج</th>
                  <th className="border-b p-2">الكمية</th>
                  <th className="border-b p-2">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {lastSale.lines.map((line) => (
                  <tr key={line.product.id}>
                    <td className="border-b p-2">{line.product.name}</td>
                    <td className="border-b p-2">{money.format(line.quantity)}</td>
                    <td className="border-b p-2">
                      {money.format(line.product.selling_price * line.quantity * (1 - line.discountPercent / 100))} د.إ
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2">المجموع قبل الخصم: {money.format(lastSale.subtotal)} د.إ</p>
            <p>الخصم: {money.format(lastSale.discount)} د.إ</p>
            <p className="mt-2 text-lg font-bold">الإجمالي: {money.format(lastSale.total)} د.إ</p>
            <p className="mt-8 text-center">شكرًا لزيارتكم</p>
          </section>
        ) : closedReport ? (
          <section className="print-only mx-auto hidden max-w-xl bg-white p-8 text-black" dir="rtl">
            <h1 className="text-center text-2xl font-bold">سبيشل موبايل</h1>
            <h2 className="mt-2 text-center text-lg">تقرير تسليم الشفت والمطابقة الليلية</h2>
            <p className="mt-4">الموظف المسؤول: {closedReport.cashier_name}</p>
            <p>وقت الفتح: {new Date(closedReport.opened_at).toLocaleString("ar-SA")}</p>
            <p>وقت التسليم: {new Date(closedReport.closed_at).toLocaleString("ar-SA")}</p>
            <p className="mt-2 font-bold">
              حالة المطابقة:{" "}
              {closedReport.is_matched ? "الحساب مطابق تماماً ✓" : `غير مطابق (فرق: ${money.format(closedReport.difference)} د.إ)`}
            </p>
            <table className="mt-4 w-full text-right">
              <thead>
                <tr>
                  <th className="border-b p-2">الحساب</th>
                  <th className="border-b p-2">المتوقع بالنظام</th>
                  <th className="border-b p-2">المسلم فعلياً</th>
                  <th className="border-b p-2">الفرق</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border-b p-2">الكاش (صافي بعد المصاريف)</td>
                  <td className="border-b p-2">{money.format(closedReport.expected_cash)} د.إ</td>
                  <td className="border-b p-2">{money.format(closedReport.actual_cash)} د.إ</td>
                  <td className="border-b p-2">{money.format(closedReport.actual_cash - closedReport.expected_cash)} د.إ</td>
                </tr>
                <tr>
                  <td className="border-b p-2">فيزا</td>
                  <td className="border-b p-2">{money.format(closedReport.expected_card)} د.إ</td>
                  <td className="border-b p-2">{money.format(closedReport.actual_card)} د.إ</td>
                  <td className="border-b p-2">{money.format(closedReport.actual_card - closedReport.expected_card)} د.إ</td>
                </tr>
                {closedReport.accounts_breakdown?.map((acc) => (
                  <tr key={acc.id}>
                    <td className="border-b p-2">
                      <div className="font-medium">{acc.name} ({acc.type === "bank" ? "بنك" : "محفظة"})</div>
                      <div className="text-xs text-gray-600">
                        الافتتاحي: {money.format(acc.opening)} | مبيعات: {money.format(acc.sales)} | سحب كاش: {money.format(acc.transfers_in)}
                      </div>
                    </td>
                    <td className="border-b p-2">{money.format(acc.expected)} د.إ</td>
                    <td className="border-b p-2">{money.format(acc.actual)} د.إ</td>
                    <td className="border-b p-2">{money.format(acc.difference)} د.إ</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-4 font-semibold">إجمالي مصاريف الشفت: {money.format(closedReport.expenses_total)} د.إ</p>
            {closedReport.notes ? <p className="mt-2">ملاحظات: {closedReport.notes}</p> : null}
          </section>
        ) : null}
      </div>

      {/* نافذة فتح شفت وتهيئة الحسابات (الكاش والبنوك والمحافظ كما يريد المستخدم) */}
      {showOpenShiftModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="open-shift-title"
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            dir="rtl"
          >
            <h3 id="open-shift-title" className="mb-2 text-xl font-semibold text-white">
              فتح شفت جديد وتهيئة حسابات الدرج
            </h3>
            <p className="mb-4 text-xs leading-relaxed text-slate-400">
              حدد رصيد الكاش الافتتاحي، وقم بتسمية أو إضافة حسابات البنوك والمحافظ التي ترغب باستخدامها وجردها عند تسليم الحساب ليلاً.
            </p>
            <form onSubmit={handleStartShift} className="space-y-5">
              {/* رصيد الكاش */}
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-3.5">
                <label className="block space-y-2 text-sm text-slate-300">
                  <span className="font-semibold text-white">رصيد الكاش الافتتاحي في الدرج (الفكة)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={openingCashInput}
                    onChange={(event) => setOpeningCashInput(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
                  />
                </label>
              </div>

              {/* حسابات البنوك المخصصة */}
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 size={16} className="text-cyan-300" />
                    <span className="font-semibold text-white text-sm">حسابات البنوك المتاحة</span>
                  </div>
                  <Button type="button" variant="secondary" onClick={addBankField} className="text-xs h-7 px-2">
                    <Plus size={13} /> إضافة بنك آخر
                  </Button>
                </div>
                <div className="space-y-2">
                  {configuredBanks.map((bank, index) => (
                    <div key={bank.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-900/60 p-2">
                      <span className="text-xs text-slate-400 w-12 shrink-0">بنك {index + 1}:</span>
                      <input
                        required
                        value={bank.name}
                        onChange={(e) => updateAccountName(bank.id, e.target.value)}
                        placeholder="اسم البنك (مثال: بنك الاتحاد)"
                        className="min-w-32 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                      />
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-400 shrink-0">الرصيد الافتتاحي:</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={bank.opening_balance ?? ""}
                          onChange={(e) => updateAccountOpeningBalance(bank.id, Number(e.target.value) || 0)}
                          placeholder="0.00"
                          className="w-24 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white text-center font-medium"
                        />
                        <span className="text-xs text-slate-500">د.إ</span>
                      </div>
                      {configuredBanks.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeAccountField(bank.id)}
                          className="rounded p-1 text-slate-500 hover:text-rose-400"
                          title="حذف هذا البنك"
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              {/* حسابات المحافظ المخصصة */}
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet size={16} className="text-amber-300" />
                    <span className="font-semibold text-white text-sm">حسابات المحافظ المتاحة</span>
                  </div>
                  <Button type="button" variant="secondary" onClick={addWalletField} className="text-xs h-7 px-2">
                    <Plus size={13} /> إضافة محفظة أخرى
                  </Button>
                </div>
                <div className="space-y-2">
                  {configuredWallets.map((wallet, index) => (
                    <div key={wallet.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-900/60 p-2">
                      <span className="text-xs text-slate-400 w-14 shrink-0">محفظة {index + 1}:</span>
                      <input
                        required
                        value={wallet.name}
                        onChange={(e) => updateAccountName(wallet.id, e.target.value)}
                        placeholder="مثال: زين كاش، كليك CliQ..."
                        className="min-w-32 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                      />
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-400 shrink-0">الرصيد الافتتاحي:</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={wallet.opening_balance ?? ""}
                          onChange={(e) => updateAccountOpeningBalance(wallet.id, Number(e.target.value) || 0)}
                          placeholder="0.00"
                          className="w-24 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white text-center font-medium"
                        />
                        <span className="text-xs text-slate-500">د.إ</span>
                      </div>
                      {configuredWallets.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeAccountField(wallet.id)}
                          className="rounded p-1 text-slate-500 hover:text-rose-400"
                          title="حذف هذه المحفظة"
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setShowOpenShiftModal(false)}>
                  إلغاء
                </Button>
                <Button type="submit" disabled={shiftSaving}>
                  {shiftSaving ? "جارٍ الفتح..." : "بدء وفتح الشفت والدرج"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {/* نافذة تسجيل مصاريف وحركات الشفت */}
      {showExpenseModal && openShift ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="shift-expense-title"
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            dir="rtl"
          >
            <h3 id="shift-expense-title" className="mb-2 text-xl font-semibold text-white">
              حركات ومصاريف الشفت
            </h3>
            <p className="mb-4 text-xs text-slate-400">
              سجّل المصاريف الخارجة من الكاش، أو عمليات تسليم كاش للزبائن مقابل استلام تحويل بنكي أو محفظة.
            </p>

            {/* تبويب نوع الحركة */}
            <div className="mb-4 flex rounded-lg border border-slate-800 bg-slate-950 p-1">
              <button
                type="button"
                onClick={() => setMovementType("expense")}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                  movementType === "expense"
                    ? "bg-slate-800 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                مصروف عادي (خروج كاش)
              </button>
              <button
                type="button"
                onClick={() => {
                  setMovementType("cash_out");
                  if (!targetAccount) {
                    setTargetAccount(configuredBanks[0]?.name || configuredWallets[0]?.name || "");
                  }
                }}
                className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                  movementType === "cash_out"
                    ? "border border-amber-500/40 bg-amber-500/20 text-amber-200"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                سحب كاش للزبون (مقابل تحويل)
              </button>
            </div>

            {movementType === "cash_out" ? (
              <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <p className="font-semibold">خدمة سحب الكاش (Cash-out):</p>
                <p className="mt-1 text-slate-300">
                  الزبون حوّل للمحل في البنك أو المحفظة وسلّمته كاش من الدرج. سيتم خصم الكاش من الدرج وإضافة المبلغ إلى رصيد الحساب المختار لمطابقته ليلاً.
                </p>
              </div>
            ) : null}

            <form onSubmit={handleAddShiftExpense} className="space-y-4">
              {movementType === "cash_out" ? (
                <label className="block space-y-1.5 text-sm text-slate-300">
                  <span className="font-medium text-white">الحساب المستلم عليه التحويل من الزبون</span>
                  <select
                    value={targetAccount || (configuredBanks[0]?.name ?? configuredWallets[0]?.name ?? "")}
                    onChange={(e) => setTargetAccount(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                  >
                    {configuredBanks.length > 0 ? (
                      <optgroup label="حسابات البنوك">
                        {configuredBanks.map((b) => (
                          <option key={b.id} value={b.name}>
                            {b.name} (بنك)
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {configuredWallets.length > 0 ? (
                      <optgroup label="حسابات المحافظ">
                        {configuredWallets.map((w) => (
                          <option key={w.id} value={w.name}>
                            {w.name} (محفظة)
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                </label>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-2 text-sm text-slate-300">
                  <span className="font-medium text-white">
                    {movementType === "cash_out" ? "المبلغ المسلّم للزبون من الدرج" : "مبلغ المصروف (من الكاش)"}
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={expenseAmount}
                    onChange={(event) => setExpenseAmount(event.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  />
                </label>
                <label className="block space-y-2 text-sm text-slate-300">
                  <span className="font-medium text-white">
                    {movementType === "cash_out" ? "ملاحظة / اسم الزبون (اختياري)" : "بيان / سبب المصروف"}
                  </span>
                  <input
                    required={movementType === "expense"}
                    value={expenseNote}
                    onChange={(event) => setExpenseNote(event.target.value)}
                    placeholder={movementType === "cash_out" ? "مثال: اسم الزبون أو رقم الحوالة" : "مثال: ضيافة، قرطاسية، توصيل..."}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setShowExpenseModal(false)}>
                  إغلاق
                </Button>
                <Button type="submit" disabled={shiftSaving}>
                  {shiftSaving ? "جارٍ الحفظ..." : movementType === "cash_out" ? "تأكيد تسجيل السحب" : "تسجيل المصروف"}
                </Button>
              </div>
            </form>

            <div className="mt-5 border-t border-slate-800 pt-4">
              <div className="mb-2 flex justify-between text-sm font-medium text-white">
                <span>إجمالي الخارج من كاش الدرج</span>
                <span className="text-rose-300">{money.format(openShift.expenses_total)} د.إ</span>
              </div>
              {openShift.shift_expenses.length > 0 ? (
                <ul className="max-h-48 space-y-2 overflow-y-auto text-xs text-slate-300">
                  {openShift.shift_expenses.map((item) => (
                    <li key={item.id} className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 p-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            item.category === "cash_out"
                              ? "bg-amber-500/20 text-amber-300"
                              : "bg-rose-500/20 text-rose-300"
                          }`}
                        >
                          {item.category === "cash_out" ? "سحب كاش" : "مصروف"}
                        </span>
                        <span>{item.note}</span>
                      </div>
                      <span className="font-semibold text-rose-300 shrink-0">−{money.format(item.amount)} د.إ</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">لا توجد حركات أو مصاريف مسجلة في هذا الشفت حتى الآن.</p>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {/* نافذة إنهاء الشفت وتسليم الحساب الليلي (مع كل بنك ومحفظة مخصصة) */}
      {showCloseShiftModal && openShift ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="close-shift-title"
            className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
            dir="rtl"
          >
            <h3 id="close-shift-title" className="mb-2 text-xl font-semibold text-white">
              إنهاء الشفت وتسليم الحساب الليلي
            </h3>
            <p className="mb-4 text-xs leading-relaxed text-slate-400">
              أدخل المبالغ الفعلية المسلّمة لكل حساب ليتولى النظام إجراء المطابقة التفصيلية وتحديد أي عجز أو زيادة بدقة.
            </p>
            <form onSubmit={handleCloseShift} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block space-y-1.5 text-sm text-slate-300">
                  <span className="font-medium text-white">الكاش الفعلي في الدرج (نقدي)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={actualCashInput}
                    onChange={(event) => setActualCashInput(event.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  />
                </label>
                <label className="block space-y-1.5 text-sm text-slate-300">
                  <span className="font-medium text-white">المسلم في فيزا</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={actualCardInput}
                    onChange={(event) => setActualCardInput(event.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                  />
                </label>
              </div>

              {/* حقول البنوك المخصصة */}
              {configuredBanks.length > 0 ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-2.5">
                  <p className="text-xs font-semibold text-cyan-300">المسلم فعلياً في حسابات البنوك:</p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {configuredBanks.map((bank) => (
                      <label key={bank.id} className="block space-y-1 text-xs text-slate-300">
                        <div className="flex justify-between">
                          <span className="font-medium text-white">{bank.name}</span>
                          <span className="text-[11px] text-cyan-300/80">
                            (الافتتاحي: {money.format(bank.opening_balance ?? 0)} د.إ)
                          </span>
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={actualAccountInputs[bank.name] ?? ""}
                          onChange={(e) =>
                            setActualAccountInputs((prev) => ({ ...prev, [bank.name]: e.target.value }))
                          }
                          placeholder="0.00"
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* حقول المحافظ المخصصة */}
              {configuredWallets.length > 0 ? (
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 space-y-2.5">
                  <p className="text-xs font-semibold text-amber-300">المسلم فعلياً في المحافظ الإلكترونية:</p>
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {configuredWallets.map((wallet) => (
                      <label key={wallet.id} className="block space-y-1 text-xs text-slate-300">
                        <div className="flex justify-between">
                          <span className="font-medium text-white">{wallet.name}</span>
                          <span className="text-[11px] text-amber-300/80">
                            (الافتتاحي: {money.format(wallet.opening_balance ?? 0)} د.إ)
                          </span>
                        </div>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={actualAccountInputs[wallet.name] ?? ""}
                          onChange={(e) =>
                            setActualAccountInputs((prev) => ({ ...prev, [wallet.name]: e.target.value }))
                          }
                          placeholder="0.00"
                          className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-300">
                <div className="flex justify-between">
                  <span>الرصيد الافتتاحي للكاش بداية الشفت:</span>
                  <strong className="text-white">{money.format(openShift.opening_cash)} د.إ</strong>
                </div>
                <div className="mt-1 flex justify-between">
                  <span>إجمالي المصاريف المسجلة في هذا الشفت:</span>
                  <strong className="text-rose-300">{money.format(openShift.expenses_total)} د.إ</strong>
                </div>
              </div>

              <label className="block space-y-2 text-sm text-slate-300">
                <span>ملاحظات تسليم الشفت (اختياري)</span>
                <textarea
                  value={closeNotes}
                  onChange={(event) => setCloseNotes(event.target.value)}
                  placeholder="أي ملاحظات حول الكاش أو الحسابات أو المصاريف..."
                  className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
                />
              </label>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setShowCloseShiftModal(false)}>
                  إلغاء
                </Button>
                <Button type="submit" disabled={shiftSaving}>
                  {shiftSaving ? "جارٍ المطابقة والإغلاق..." : "تأكيد تسليم الحساب وإنهاء الشفت"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {showScanner ? <BarcodeScanner onClose={() => setShowScanner(false)} onDetected={scanCode} /> : null}
    </AppShell>
  );
}

function ReconcileBox({
  title,
  subtitle,
  expected,
  actual,
}: {
  title: string;
  subtitle: string;
  expected: number;
  actual: number;
}) {
  const diff = Number((actual - expected).toFixed(2));
  const matched = Math.abs(diff) < 0.01;
  return (
    <div
      className={`rounded-lg border p-3 ${
        matched ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/40 bg-rose-500/10"
      }`}
    >
      <p className="font-semibold text-white">{title}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{subtitle}</p>
      <div className="mt-3 space-y-1 text-xs">
        <div className="flex justify-between text-slate-300">
          <span>المتوقع بالنظام:</span>
          <span className="font-medium text-white">{money.format(expected)} د.إ</span>
        </div>
        <div className="flex justify-between text-slate-300">
          <span>المُسلّم فعلياً:</span>
          <span className="font-medium text-white">{money.format(actual)} د.إ</span>
        </div>
        <div className="flex justify-between border-t border-slate-800 pt-1 font-semibold">
          <span>المطابقة:</span>
          <span className={matched ? "text-emerald-300" : "text-rose-300"}>
            {matched ? "مطابق ✓" : `${diff > 0 ? "+" : ""}${money.format(diff)} د.إ`}
          </span>
        </div>
      </div>
    </div>
  );
}

function CategoryButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-2 text-sm ${
        active ? "bg-cyan-500 text-slate-950 font-medium" : "bg-slate-800 text-slate-200 hover:bg-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function Total({ label, amount, negative = false }: { label: string; amount: number; negative?: boolean }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className={negative ? "text-rose-300" : ""}>
        {negative ? "−" : ""}
        {money.format(amount)} د.إ
      </span>
    </div>
  );
}