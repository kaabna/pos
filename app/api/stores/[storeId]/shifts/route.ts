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

export type ShiftExpenseItem = {
  id: string;
  category: string;
  amount: number;
  note: string;
  source_account?: string; // الحساب المسحوب منه (افتراضياً: "كاش الدرج")
  created_at: string;
};

export type ShiftMovement = {
  id: string;
  type: "expense" | "cash_out" | "cash_in";
  account_name: string; // اسم البنك أو المحفظة المرتبطة
  amount: number;
  note: string;
  created_at: string;
};

export type ShiftAccountConfig = {
  id: string;
  type: "bank" | "wallet";
  name: string;
  opening_balance: number; // الرصيد الافتتاحي في هذا الحساب عند فتح الشفت
};

const defaultAccountsConfig: ShiftAccountConfig[] = [
  { id: "b1", type: "bank", name: "بنك الاتحاد", opening_balance: 0 },
  { id: "w1", type: "wallet", name: "زين كاش", opening_balance: 0 },
  { id: "w2", type: "wallet", name: "كليك (CliQ)", opening_balance: 0 },
];

async function getAuthContext(storeId: string) {
  const sessionClient = await createServerSupabaseClient();
  const { data: { user } } = await sessionClient.auth.getUser();
  if (!user) return null;

  const db = getAdminClient() ?? sessionClient;
  const [{ data: profile }, { data: membership }] = await Promise.all([
    db.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle(),
    db.from("store_members").select("store_id, permissions").eq("user_id", user.id).eq("store_id", storeId).maybeSingle(),
  ]);

  const isAdmin = profile?.role === "owner" || profile?.role === "admin";
  const permissions = Array.isArray(membership?.permissions) ? (membership.permissions as string[]) : [];
  const canPos = isAdmin || Boolean(membership && permissions.includes("pos"));
  const canLedger = isAdmin || Boolean(membership && permissions.includes("ledger"));

  if (!canPos && !canLedger) return null;

  return {
    user,
    db,
    isAdmin,
    canPos,
    canLedger,
    cashierName: profile?.full_name || user.email || "موظف",
  };
}

export async function GET(_request: NextRequest, context: RouteContext<"/api/stores/[storeId]/shifts">) {
  const { storeId } = await context.params;
  const auth = await getAuthContext(storeId);
  if (!auth) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });

  const { db, user, isAdmin, canLedger } = auth;

  // جلب الشفت المفتوح للموظف الحالي
  const { data: openShift, error: openError } = await db
    .from("shifts")
    .select("*")
    .eq("store_id", storeId)
    .eq("user_id", user.id)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // جلب آخر شفت لمعرفة الحسابات المخصصة المسبقة للمتجر
  let savedAccounts = defaultAccountsConfig;
  const { data: latestShift } = await db
    .from("shifts")
    .select("accounts_config")
    .eq("store_id", storeId)
    .not("accounts_config", "is", null)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestShift && Array.isArray(latestShift.accounts_config) && latestShift.accounts_config.length > 0) {
    savedAccounts = (latestShift.accounts_config as { id: string; type: "bank" | "wallet"; name: string; opening_balance?: number }[]).map((a) => ({
      ...a,
      opening_balance: Number(a.opening_balance ?? 0),
    }));
  }

  // جلب سجل الشفتات المغلقة
  let closedQuery = db
    .from("shifts")
    .select("*")
    .eq("store_id", storeId)
    .eq("status", "closed")
    .order("closed_at", { ascending: false })
    .limit(isAdmin || canLedger ? 30 : 5);

  if (!isAdmin && !canLedger) {
    closedQuery = closedQuery.eq("user_id", user.id);
  }

  const { data: closedShifts } = await closedQuery;

  // أثناء فتح الشفت، تظل مبالغ المبيعات مخفية
  const sanitizedOpenShift = openShift
    ? {
        id: openShift.id,
        store_id: openShift.store_id,
        user_id: openShift.user_id,
        cashier_name: openShift.cashier_name,
        status: openShift.status,
        opening_cash: Number(openShift.opening_cash ?? 0),
        expenses_total: Number(openShift.expenses_total ?? 0),
        shift_expenses: Array.isArray(openShift.shift_expenses) ? openShift.shift_expenses : [],
        accounts_config: Array.isArray(openShift.accounts_config) && openShift.accounts_config.length > 0
          ? (openShift.accounts_config as ShiftAccountConfig[])
          : savedAccounts,
        opened_at: openShift.opened_at,
      }
    : null;

  return NextResponse.json({
    tableReady: !openError,
    openShift: sanitizedOpenShift,
    savedAccounts,
    closedShifts: closedShifts ?? [],
  });
}

export async function POST(request: NextRequest, context: RouteContext<"/api/stores/[storeId]/shifts">) {
  const { storeId } = await context.params;
  const auth = await getAuthContext(storeId);
  if (!auth) return NextResponse.json({ message: "غير مصرح." }, { status: 403 });

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "بيانات الطلب غير صالحة." }, { status: 400 });
  }

  const payload = body as {
    action?: string;
    openingCash?: number;
    accountsConfig?: ShiftAccountConfig[];
    shiftId?: string;
    openedAt?: string;
    movementType?: "expense" | "cash_out" | "cash_in";
    expenseAmount?: number;
    expenseNote?: string;
    expenseCategory?: string;
    sourceAccount?: string;
    targetAccount?: string;
    actualCash?: number;
    actualCard?: number;
    actualAccounts?: Record<string, number>;
    notes?: string;
    localExpenses?: ShiftExpenseItem[];
  };

  const { db, user, cashierName } = auth;

  // 1. فتح الشفت وحفظ الأرصدة الافتتاحية لكل حساب
  if (payload.action === "open") {
    const openingCash = Math.max(0, Number(payload.openingCash) || 0);
    const accountsConfig = (Array.isArray(payload.accountsConfig) && payload.accountsConfig.length > 0
      ? payload.accountsConfig
      : defaultAccountsConfig).map((acc) => ({
      ...acc,
      opening_balance: Math.max(0, Number(acc.opening_balance) || 0),
    }));

    const { data: existing } = await db
      .from("shifts")
      .select("*")
      .eq("store_id", storeId)
      .eq("user_id", user.id)
      .eq("status", "open")
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        shift: {
          id: existing.id,
          store_id: existing.store_id,
          user_id: existing.user_id,
          cashier_name: existing.cashier_name,
          status: existing.status,
          opening_cash: Number(existing.opening_cash ?? 0),
          expenses_total: Number(existing.expenses_total ?? 0),
          shift_expenses: Array.isArray(existing.shift_expenses) ? existing.shift_expenses : [],
          accounts_config: Array.isArray(existing.accounts_config) ? existing.accounts_config : accountsConfig,
          opened_at: existing.opened_at,
        },
        message: "الشفت مفتوح بالفعل.",
      });
    }

    const nowIso = new Date().toISOString();
    const { data: created, error } = await db
      .from("shifts")
      .insert({
        store_id: storeId,
        user_id: user.id,
        cashier_name: cashierName,
        status: "open",
        opening_cash: openingCash,
        expenses_total: 0,
        shift_expenses: [],
        accounts_config: accountsConfig,
        opened_at: nowIso,
      })
      .select("*")
      .single();

    if (error || !created) {
      return NextResponse.json({
        shift: {
          id: `temp-${Date.now()}`,
          store_id: storeId,
          user_id: user.id,
          cashier_name: cashierName,
          status: "open",
          opening_cash: openingCash,
          expenses_total: 0,
          shift_expenses: [],
          accounts_config: accountsConfig,
          opened_at: nowIso,
        },
        message: "تم فتح الشفت والدرج وتثبيت الأرصدة الافتتاحية بنجاح.",
      });
    }

    return NextResponse.json({
      shift: {
        id: created.id,
        store_id: created.store_id,
        user_id: created.user_id,
        cashier_name: created.cashier_name,
        status: created.status,
        opening_cash: Number(created.opening_cash ?? 0),
        expenses_total: 0,
        shift_expenses: [],
        accounts_config: accountsConfig,
        opened_at: created.opened_at,
      },
      message: "تم فتح الشفت والدرج وتثبيت الأرصدة الافتتاحية بنجاح.",
    });
  }

  // 2. تسجيل حركة مالية أثناء الشفت (مصروف أو سحب كاش للزبون مقابل تحويل)
  if (payload.action === "expense" || payload.action === "movement") {
    const amount = Number(payload.expenseAmount) || 0;
    const note = (payload.expenseNote ?? "").trim();
    const movementType = payload.movementType ?? "expense";
    const sourceAccount = payload.sourceAccount ?? (movementType === "cash_out" ? "كاش الدرج" : "كاش الدرج");
    const targetAccount = payload.targetAccount ?? "";

    if (amount <= 0) {
      return NextResponse.json({ message: "أدخل مبلغاً صالحاً أكبر من صفر." }, { status: 400 });
    }

    let noteText = note;
    if (movementType === "cash_out") {
      noteText = note ? `سحب كاش للزبون [استلمنا في ${targetAccount}]: ${note}` : `سحب كاش للزبون [استلمنا في ${targetAccount}]`;
    }

    const expenseItem: ShiftExpenseItem = {
      id: `${Date.now()}`,
      category: movementType === "cash_out" ? "cash_out" : (payload.expenseCategory ?? "operational"),
      amount,
      note: noteText || "مصروف شفت",
      source_account: sourceAccount,
      created_at: new Date().toISOString(),
    };

    // تسجيل في جدول المصاريف العام للمحل إذا كان مصروفاً عادياً
    if (movementType === "expense") {
      await db.from("expenses").insert({
        store_id: storeId,
        category: payload.expenseCategory ?? "operational",
        amount,
        note: note ? `[شفت ${cashierName} - ${sourceAccount}] ${note}` : `[شفت ${cashierName} - ${sourceAccount}] مصروف شفت`,
        expense_date: new Date().toISOString().slice(0, 10),
        created_by: user.id,
      });
    }

    if (payload.shiftId && !payload.shiftId.startsWith("temp-")) {
      const { data: currentShift } = await db
        .from("shifts")
        .select("expenses_total, shift_expenses")
        .eq("id", payload.shiftId)
        .eq("store_id", storeId)
        .maybeSingle();

      if (currentShift) {
        const updatedList = [
          ...(Array.isArray(currentShift.shift_expenses) ? (currentShift.shift_expenses as ShiftExpenseItem[]) : []),
          expenseItem,
        ];
        // حساب مجموع المصاريف التي خرجت من الكاش
        const cashDeductions = updatedList
          .filter((item) => !item.source_account || item.source_account === "كاش الدرج")
          .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

        await db
          .from("shifts")
          .update({
            expenses_total: cashDeductions,
            shift_expenses: updatedList,
          })
          .eq("id", payload.shiftId)
          .eq("store_id", storeId);
      }
    }

    return NextResponse.json({
      expense: expenseItem,
      message: movementType === "cash_out"
        ? `تم تسجيل تحويل ${amount} د.إ إلى ${targetAccount} وتسليمها كاش للزبون.`
        : "تم تسجيل المصروف بنجاح.",
    });
  }

  // 3. إنهاء الشفت وتسليم الحساب والمطابقة
  if (payload.action === "close") {
    const actualCash = Math.max(0, Number(payload.actualCash) || 0);
    const actualCard = Math.max(0, Number(payload.actualCard) || 0);
    const actualAccounts = payload.actualAccounts && typeof payload.actualAccounts === "object" ? payload.actualAccounts : {};
    const notes = (payload.notes ?? "").trim();

    let shiftStartIso = payload.openedAt;
    let openingCash = Math.max(0, Number(payload.openingCash) || 0);
    let shiftExpenses: ShiftExpenseItem[] = Array.isArray(payload.localExpenses) ? payload.localExpenses : [];
    let accountsConfig: ShiftAccountConfig[] = Array.isArray(payload.accountsConfig) ? payload.accountsConfig : defaultAccountsConfig;

    if (payload.shiftId && !payload.shiftId.startsWith("temp-")) {
      const { data: existingShift } = await db
        .from("shifts")
        .select("*")
        .eq("id", payload.shiftId)
        .eq("store_id", storeId)
        .maybeSingle();
      if (existingShift) {
        shiftStartIso = existingShift.opened_at;
        openingCash = Number(existingShift.opening_cash ?? 0);
        if (Array.isArray(existingShift.shift_expenses) && existingShift.shift_expenses.length > 0) {
          shiftExpenses = existingShift.shift_expenses as ShiftExpenseItem[];
        }
        if (Array.isArray(existingShift.accounts_config) && existingShift.accounts_config.length > 0) {
          accountsConfig = (existingShift.accounts_config as ShiftAccountConfig[]).map((a) => ({
            ...a,
            opening_balance: Number(a.opening_balance ?? 0),
          }));
        }
      }
    }

    if (!shiftStartIso) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      shiftStartIso = startOfDay.toISOString();
    }

    const closedAtIso = new Date().toISOString();

    // جلب مبيعات الشفت
    const { data: shiftSales } = await db
      .from("sales")
      .select("total, payment_method, payment_account")
      .eq("store_id", storeId)
      .eq("created_by", user.id)
      .gte("created_at", shiftStartIso)
      .lte("created_at", closedAtIso);

    let cashSales = 0;
    let cardSales = 0;
    const accountSales: Record<string, number> = {};

    accountsConfig.forEach((acc) => {
      accountSales[acc.name] = 0;
    });

    for (const sale of shiftSales ?? []) {
      const amount = Number(sale.total) || 0;
      const method = sale.payment_method;
      const accountName = typeof (sale as { payment_account?: string }).payment_account === "string"
        ? (sale as { payment_account: string }).payment_account.trim()
        : "";

      if (method === "cash") {
        cashSales += amount;
      } else if (method === "card") {
        cardSales += amount;
      } else if (accountName && accountSales[accountName] !== undefined) {
        accountSales[accountName] += amount;
      } else {
        const fallbackAcc = accountsConfig.find((a) => (method === "transfer" ? a.type === "bank" : a.type === "wallet"));
        const key = fallbackAcc ? fallbackAcc.name : method === "transfer" ? "البنوك (تحويل)" : "المحافظ";
        accountSales[key] = (accountSales[key] ?? 0) + amount;
      }
    }

    // حساب حركات الشفت (سحب كاش للزبون أو مصاريف)
    let cashPaidOut = 0;
    const accountTransfersIn: Record<string, number> = {};
    accountsConfig.forEach((acc) => {
      accountTransfersIn[acc.name] = 0;
    });

    shiftExpenses.forEach((exp) => {
      const amt = Number(exp.amount) || 0;
      if (exp.category === "cash_out") {
        // سحب كاش للزبون: نقص كاش من الدرج، وزاد تحويل في البنك/المحفظة المستلمة
        cashPaidOut += amt;
        const target = accountsConfig.find((a) => exp.note.includes(a.name));
        if (target) {
          accountTransfersIn[target.name] = (accountTransfersIn[target.name] ?? 0) + amt;
        }
      } else if (!exp.source_account || exp.source_account === "كاش الدرج") {
        cashPaidOut += amt;
      }
    });

    // المعادلة للكاش: الافتتاحي + المبيعات النقدية - كل ما خرج من الدرج (مصاريف وسحوبات كاش)
    const expectedCash = Number((openingCash + cashSales - cashPaidOut).toFixed(2));
    const expectedCard = Number(cardSales.toFixed(2));

    // المعادلة لكل حساب بنك ومحفظة:
    // المتوقع = الرصيد الافتتاحي في هذا الحساب + المبيعات المحولة عليه + أي مبالغ استلمت فيه كاش-آوت
    const accountsBreakdown: {
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
    }[] = [];

    let totalExpectedTransfer = 0;
    let totalExpectedWallet = 0;
    let totalActualTransfer = 0;
    let totalActualWallet = 0;
    let accountsDifferencesSum = 0;
    let allAccountsMatched = true;

    accountsConfig.forEach((acc) => {
      const openBal = Number(acc.opening_balance ?? 0);
      const sales = Number((accountSales[acc.name] ?? 0).toFixed(2));
      const transfersIn = Number((accountTransfersIn[acc.name] ?? 0).toFixed(2));
      const exp = Number((openBal + sales + transfersIn).toFixed(2));
      const act = Math.max(0, Number(actualAccounts[acc.name]) || 0);
      const diff = Number((act - exp).toFixed(2));
      const matched = Math.abs(diff) < 0.01;

      if (!matched) allAccountsMatched = false;
      accountsDifferencesSum += diff;

      if (acc.type === "bank") {
        totalExpectedTransfer += exp;
        totalActualTransfer += act;
      } else {
        totalExpectedWallet += exp;
        totalActualWallet += act;
      }

      accountsBreakdown.push({
        id: acc.id,
        name: acc.name,
        type: acc.type,
        opening: openBal,
        sales,
        transfers_in: transfersIn,
        expected: exp,
        actual: act,
        difference: diff,
        is_matched: matched,
      });
    });

    const cashDiff = Number((actualCash - expectedCash).toFixed(2));
    const cardDiff = Number((actualCard - expectedCard).toFixed(2));
    const totalDifference = Number((cashDiff + cardDiff + accountsDifferencesSum).toFixed(2));

    const isMatched =
      Math.abs(cashDiff) < 0.01 &&
      Math.abs(cardDiff) < 0.01 &&
      allAccountsMatched;

    const closedSummary = {
      id: payload.shiftId ?? `closed-${Date.now()}`,
      store_id: storeId,
      user_id: user.id,
      cashier_name: cashierName,
      status: "closed" as const,
      opening_cash: openingCash,
      cash_sales: cashSales,
      expected_cash: expectedCash,
      expected_card: expectedCard,
      expected_transfer: totalExpectedTransfer,
      expected_wallet: totalExpectedWallet,
      expenses_total: cashPaidOut,
      shift_expenses: shiftExpenses,
      accounts_config: accountsConfig,
      accounts_breakdown: accountsBreakdown,
      actual_cash: actualCash,
      actual_card: actualCard,
      actual_transfer: totalActualTransfer,
      actual_wallet: totalActualWallet,
      difference: totalDifference,
      is_matched: isMatched,
      notes,
      opened_at: shiftStartIso,
      closed_at: closedAtIso,
    };

    if (payload.shiftId && !payload.shiftId.startsWith("temp-")) {
      await db
        .from("shifts")
        .update({
          status: "closed",
          expected_cash: expectedCash,
          expected_card: expectedCard,
          expected_transfer: totalExpectedTransfer,
          expected_wallet: totalExpectedWallet,
          expenses_total: cashPaidOut,
          shift_expenses: shiftExpenses,
          accounts_config: accountsConfig,
          expected_breakdown: accountSales,
          actual_breakdown: actualAccounts,
          actual_cash: actualCash,
          actual_card: actualCard,
          actual_transfer: totalActualTransfer,
          actual_wallet: totalActualWallet,
          difference: totalDifference,
          is_matched: isMatched,
          notes,
          closed_at: closedAtIso,
        })
        .eq("id", payload.shiftId)
        .eq("store_id", storeId);
    }

    return NextResponse.json({
      closedShift: closedSummary,
      message: isMatched
        ? "تم إنهاء الشفت وتسليم الحساب بنجاح — الحساب مطابق تماماً ✓"
        : "تم إنهاء الشفت وتسليم الحساب — تنبيه: الحساب غير مطابق (يوجد فرق).",
    });
  }

  return NextResponse.json({ message: "إجراء غير معروف." }, { status: 400 });
}
