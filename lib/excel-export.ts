import * as XLSX from "xlsx";

export type InventoryExportItem = {
  id: string;
  name: string;
  category: string;
  sku: string;
  barcode: string | null;
  quantity: number;
  cost_price: number;
  selling_price: number;
  discount?: number;
  imei_tracking?: boolean;
};

export type InventoryExportOptions = {
  format: "analysis" | "physical_count";
  filterLabel: string;
  categoryNameMap?: Record<string, string>;
};

/**
 * Export customized inventory report to Excel (.xlsx)
 */
export function exportInventoryToExcel(
  items: InventoryExportItem[],
  options: InventoryExportOptions
) {
  const getCategoryLabel = (cat: string) => options.categoryNameMap?.[cat] || cat;
  const wb = XLSX.utils.book_new();

  if (options.format === "analysis") {
    // 1. Detailed Financial & Valuation Analysis
    let totalQty = 0;
    let totalCostVal = 0;
    let totalRetailVal = 0;

    const dataRows = items.map((item, index) => {
      const qty = Number(item.quantity) || 0;
      const cost = Number(item.cost_price) || 0;
      const price = Number(item.selling_price) || 0;
      const totalCost = qty * cost;
      const totalRetail = qty * price;
      const expectedProfit = totalRetail - totalCost;

      totalQty += qty;
      totalCostVal += totalCost;
      totalRetailVal += totalRetail;

      return {
        "م": index + 1,
        "الباركود": item.barcode || "—",
        "رمز الصنف (SKU)": item.sku || "—",
        "اسم الصنف": item.name,
        "التصنيف": getCategoryLabel(item.category),
        "الكمية بالمتجر": qty,
        "سعر التكلفة (د.إ)": cost,
        "سعر البيع (د.إ)": price,
        "إجمالي رأس المال (د.إ)": Number(totalCost.toFixed(2)),
        "إجمالي القيمة البيعية (د.إ)": Number(totalRetail.toFixed(2)),
        "الربح المتوقع (د.إ)": Number(expectedProfit.toFixed(2)),
        "تتبع IMEI": item.imei_tracking ? "نعم" : "لا",
      };
    });

    // Add a summary row at the bottom
    const summaryRow = {
      "م": "المجموع الإجمالي",
      "الباركود": `عدد الأصناف: ${items.length}`,
      "رمز الصنف (SKU)": "",
      "اسم الصنف": "",
      "التصنيف": "",
      "الكمية بالمتجر": totalQty,
      "سعر التكلفة (د.إ)": "",
      "سعر البيع (د.إ)": "",
      "إجمالي رأس المال (د.إ)": Number(totalCostVal.toFixed(2)),
      "إجمالي القيمة البيعية (د.إ)": Number(totalRetailVal.toFixed(2)),
      "الربح المتوقع (د.إ)": Number((totalRetailVal - totalCostVal).toFixed(2)),
      "تتبع IMEI": "",
    };

    const ws = XLSX.utils.json_to_sheet([...dataRows, summaryRow]);

    ws["!cols"] = [
      { wch: 8 },  // م
      { wch: 20 }, // الباركود
      { wch: 18 }, // SKU
      { wch: 32 }, // اسم الصنف
      { wch: 16 }, // التصنيف
      { wch: 15 }, // الكمية
      { wch: 16 }, // التكلفة
      { wch: 16 }, // البيع
      { wch: 22 }, // إجمالي التكلفة
      { wch: 22 }, // إجمالي البيع
      { wch: 20 }, // الربح المتوقع
      { wch: 12 }, // IMEI
    ];

    XLSX.utils.book_append_sheet(wb, ws, "تقرير_المخزون_المالي");
  } else {
    // 2. Physical Count Sheet (ورقة جرد فعلي للمطابقة والعد الميداني)
    const dataRows = items.map((item, index) => ({
      "م": index + 1,
      "الباركود": item.barcode || "—",
      "رمز الصنف (SKU)": item.sku || "—",
      "اسم الصنف": item.name,
      "التصنيف": getCategoryLabel(item.category),
      "الرصيد بالنظام": Number(item.quantity) || 0,
      "العدد الفعلي بالمحل [يدوي]": "",
      "الفارق (+ / -) [يدوي]": "",
      "حالة الصنف / ملاحظات": "",
    }));

    const ws = XLSX.utils.json_to_sheet(dataRows);

    ws["!cols"] = [
      { wch: 8 },  // م
      { wch: 20 }, // الباركود
      { wch: 18 }, // SKU
      { wch: 32 }, // اسم الصنف
      { wch: 16 }, // التصنيف
      { wch: 16 }, // الرصيد بالنظام
      { wch: 25 }, // العدد الفعلي
      { wch: 20 }, // الفارق
      { wch: 30 }, // ملاحظات
    ];

    XLSX.utils.book_append_sheet(wb, ws, "كشف_جرد_فعلي");
  }

  const cleanLabel = options.filterLabel.replace(/[\s/\\?%*:|"<>]/g, "_");
  const fileName = `تقرير_${cleanLabel}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// -------------------------------------------------------------
// Financial Reports Export (التقارير المالية اليومية والأسبوعية والشهرية)
// -------------------------------------------------------------

export type FinancialReportPayload = {
  periodLabel: string;
  dateRangeText: string;
  totals: {
    salesTotal: number;
    costOfGoods: number;
    grossProfit: number;
    expensesTotal: number;
    fixedExpenses: number;
    purchasesTotal: number;
    repairProfit: number;
    netProfit: number;
    paymentTotals: {
      cash: number;
      card: number;
      transfer: number;
      wallet: number;
    };
  };
  sales: Array<{
    id: string;
    total: number;
    payment_method: string;
    created_at: string;
  }>;
  expenses: Array<{
    amount: number;
    expense_date: string;
    category?: string;
    note?: string;
  }>;
  repairs: Array<{
    final_price: number;
    parts_cost: number;
    device_model?: string;
    problem_description?: string;
    created_at?: string;
  }>;
  shifts: Array<{
    id: string;
    cashier_name: string;
    opening_cash: number;
    expected_cash: number;
    actual_cash: number | null;
    expected_card: number;
    actual_card: number | null;
    expected_transfer: number;
    actual_transfer: number | null;
    expected_wallet: number;
    actual_wallet: number | null;
    difference: number | null;
    is_matched: boolean | null;
    expenses_total: number;
    closed_at: string | null;
  }>;
};

const paymentMethodArabic: Record<string, string> = {
  cash: "كاش (نقدي)",
  card: "فيزا / شبكة",
  transfer: "تحويل بنكي",
  wallet: "محافظ إلكترونية",
};

const expenseCategoryArabic: Record<string, string> = {
  operational: "تشغيلي",
  rent: "إيجار",
  salaries: "رواتب",
  utilities: "خدمات وكهرباء",
  marketing: "تسويق",
  other: "أخرى",
};

/**
 * Export Comprehensive Multi-Sheet Financial Report to Excel (.xlsx)
 */
export function exportFinancialReportToExcel(report: FinancialReportPayload) {
  const wb = XLSX.utils.book_new();

  // Sheet 1: الملخص المالي العام (Summary)
  const summaryRows = [
    { "البند المالي": "الفترة الزمنية", "القيمة / التفاصيل": report.periodLabel },
    { "البند المالي": "النطاق الزمني", "القيمة / التفاصيل": report.dateRangeText },
    { "البند المالي": "تاريخ إنشاء التقرير", "القيمة / التفاصيل": new Date().toLocaleString("ar-SA") },
    { "البند المالي": "--------------------", "القيمة / التفاصيل": "--------------------" },
    { "البند المالي": "إجمالي المبيعات", "القيمة / التفاصيل": `${report.totals.salesTotal.toFixed(2)} د.إ` },
    { "البند المالي": "تكلفة البضاعة المباعة (COGS)", "القيمة / التفاصيل": `${report.totals.costOfGoods.toFixed(2)} د.إ` },
    { "البند المالي": "مجمل ربح البضاعة", "القيمة / التفاصيل": `${report.totals.grossProfit.toFixed(2)} د.إ` },
    { "البند المالي": "أرباح قسم الصيانة وقطع الغيار", "القيمة / التفاصيل": `${report.totals.repairProfit.toFixed(2)} د.إ` },
    { "البند المالي": "إجمالي المصروفات التشغيلية", "القيمة / التفاصيل": `${report.totals.expensesTotal.toFixed(2)} د.إ` },
    { "البند المالي": "المصروفات الثابتة", "القيمة / التفاصيل": `${report.totals.fixedExpenses.toFixed(2)} د.إ` },
    { "البند المالي": "إجمالي المشتريات", "القيمة / التفاصيل": `${report.totals.purchasesTotal.toFixed(2)} د.إ` },
    { "البند المالي": ">>> صافي الربح النهائي <<<", "القيمة / التفاصيل": `${report.totals.netProfit.toFixed(2)} د.إ` },
    { "البند المالي": "--------------------", "القيمة / التفاصيل": "--------------------" },
    { "البند المالي": "السيولة: نقد كاش بالصندوق", "القيمة / التفاصيل": `${report.totals.paymentTotals.cash.toFixed(2)} د.إ` },
    { "البند المالي": "السيولة: شبكة وفيزا", "القيمة / التفاصيل": `${report.totals.paymentTotals.card.toFixed(2)} د.إ` },
    { "البند المالي": "السيولة: بنوك وتحويل", "القيمة / التفاصيل": `${report.totals.paymentTotals.transfer.toFixed(2)} د.إ` },
    { "البند المالي": "السيولة: محافظ إلكترونية", "القيمة / التفاصيل": `${report.totals.paymentTotals.wallet.toFixed(2)} د.إ` },
  ];

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  wsSummary["!cols"] = [{ wch: 32 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "الملخص_المالي");

  // Sheet 2: المبيعات المفصلة (Sales)
  if (report.sales.length > 0) {
    const salesRows = report.sales.map((sale, i) => ({
      "م": i + 1,
      "رقم العملية": sale.id.slice(0, 8),
      "التاريخ والوقت": new Date(sale.created_at).toLocaleString("ar-SA"),
      "طريقة الدفع": paymentMethodArabic[sale.payment_method] || sale.payment_method,
      "المبلغ الإجمالي (د.إ)": Number(sale.total.toFixed(2)),
    }));
    const wsSales = XLSX.utils.json_to_sheet(salesRows);
    wsSales["!cols"] = [{ wch: 6 }, { wch: 14 }, { wch: 24 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsSales, "حركة_المبيعات");
  }

  // Sheet 3: المصروفات (Expenses)
  if (report.expenses.length > 0) {
    const expRows = report.expenses.map((exp, i) => ({
      "م": i + 1,
      "التاريخ": exp.expense_date,
      "نوع المصروف": expenseCategoryArabic[exp.category || ""] || exp.category || "تشغيلي",
      "المبلغ (د.إ)": Number(exp.amount.toFixed(2)),
      "البيان / ملاحظات": exp.note || "—",
    }));
    const wsExp = XLSX.utils.json_to_sheet(expRows);
    wsExp["!cols"] = [{ wch: 6 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 35 }];
    XLSX.utils.book_append_sheet(wb, wsExp, "المصروفات");
  }

  // Sheet 4: الصيانة (Repairs)
  if (report.repairs.length > 0) {
    const repairRows = report.repairs.map((rep, i) => {
      const price = Number(rep.final_price) || 0;
      const parts = Number(rep.parts_cost) || 0;
      return {
        "م": i + 1,
        "سعر الصيانة النهائي (د.إ)": price,
        "تكلفة القطع (د.إ)": parts,
        "صافي ربح الصيانة (د.إ)": Number((price - parts).toFixed(2)),
      };
    });
    const wsRep = XLSX.utils.json_to_sheet(repairRows);
    wsRep["!cols"] = [{ wch: 6 }, { wch: 22 }, { wch: 20 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, wsRep, "أرباح_الصيانة");
  }

  // Sheet 5: سجل إغلاق الشفتات (Shift Audits)
  if (report.shifts.length > 0) {
    const shiftRows = report.shifts.map((s, i) => ({
      "م": i + 1,
      "الموظف": s.cashier_name,
      "وقت الإغلاق": s.closed_at ? new Date(s.closed_at).toLocaleString("ar-SA") : "—",
      "كاش متوقع": Number(s.expected_cash) || 0,
      "كاش فعلي": Number(s.actual_cash) || 0,
      "فيزا متوقع/فعلي": `${Number(s.expected_card) || 0} / ${Number(s.actual_card) || 0}`,
      "بنوك متوقع/فعلي": `${Number(s.expected_transfer) || 0} / ${Number(s.actual_transfer) || 0}`,
      "محافظ متوقع/فعلي": `${Number(s.expected_wallet) || 0} / ${Number(s.actual_wallet) || 0}`,
      "مصاريف الشفت": Number(s.expenses_total) || 0,
      "فارق الصندوق": Number(s.difference) || 0,
      "الحالة": s.is_matched ? "مطابق" : "يوجد فرق",
    }));
    const wsShifts = XLSX.utils.json_to_sheet(shiftRows);
    wsShifts["!cols"] = [
      { wch: 6 },
      { wch: 18 },
      { wch: 22 },
      { wch: 14 },
      { wch: 14 },
      { wch: 20 },
      { wch: 20 },
      { wch: 20 },
      { wch: 14 },
      { wch: 14 },
      { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, wsShifts, "تسليم_الشفتات");
  }

  const cleanPeriod = report.periodLabel.replace(/[\s/\\?%*:|"<>]/g, "_");
  const fileName = `التقرير_المالي_${cleanPeriod}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}
