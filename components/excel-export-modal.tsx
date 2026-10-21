"use client";

import { useMemo, useState } from "react";
import {
  Boxes,
  CheckCircle2,
  ClipboardList,
  Download,
  FileSpreadsheet,
  Filter,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  exportInventoryToExcel,
  type InventoryExportItem,
} from "@/lib/excel-export";

type CategoryOption = { value: string; label: string };

type ExcelExportModalProps = {
  isOpen: boolean;
  onClose: () => void;
  items: InventoryExportItem[];
  categories: CategoryOption[];
  currentSearch?: string;
};

const money = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });

export function ExcelExportModal({
  isOpen,
  onClose,
  items,
  categories,
  currentSearch = "",
}: ExcelExportModalProps) {
  const [filterType, setFilterType] = useState<"all" | "category" | "out_of_stock" | "low_stock" | "search">("all");
  const [selectedCategory, setSelectedCategory] = useState<string>(categories[0]?.value || "accessory");
  const [lowStockThreshold, setLowStockThreshold] = useState<number>(5);
  const [format, setFormat] = useState<"analysis" | "physical_count">("analysis");
  const [exported, setExported] = useState(false);

  const categoryNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const cat of categories) {
      map[cat.value] = cat.label;
    }
    return map;
  }, [categories]);

  // Filter items based on selected criteria
  const filteredItems = useMemo(() => {
    switch (filterType) {
      case "category":
        return items.filter((item) => item.category === selectedCategory);
      case "out_of_stock":
        return items.filter((item) => (Number(item.quantity) || 0) <= 0);
      case "low_stock":
        return items.filter((item) => {
          const qty = Number(item.quantity) || 0;
          return qty > 0 && qty <= lowStockThreshold;
        });
      case "search":
        if (!currentSearch.trim()) return items;
        return items.filter((item) =>
          `${item.name} ${item.sku} ${item.barcode || ""}`
            .toLowerCase()
            .includes(currentSearch.toLowerCase())
        );
      case "all":
      default:
        return items;
    }
  }, [items, filterType, selectedCategory, lowStockThreshold, currentSearch]);

  const summary = useMemo(() => {
    let totalQty = 0;
    let totalCostVal = 0;
    let totalRetailVal = 0;

    for (const item of filteredItems) {
      const q = Number(item.quantity) || 0;
      const c = Number(item.cost_price) || 0;
      const p = Number(item.selling_price) || 0;
      totalQty += q;
      totalCostVal += q * c;
      totalRetailVal += q * p;
    }

    return {
      count: filteredItems.length,
      totalQty,
      totalCostVal,
      totalRetailVal,
      expectedProfit: totalRetailVal - totalCostVal,
    };
  }, [filteredItems]);

  if (!isOpen) return null;

  function handleExport() {
    let filterLabel = "كافة_المخزون";
    if (filterType === "category") {
      filterLabel = `جرد_قسم_${categoryNameMap[selectedCategory] || selectedCategory}`;
    } else if (filterType === "out_of_stock") {
      filterLabel = "جرد_النواقص_المنتهية";
    } else if (filterType === "low_stock") {
      filterLabel = `جرد_الأصناف_المنخفضة_أقل_من_${lowStockThreshold}`;
    } else if (filterType === "search") {
      filterLabel = `جرد_بحث_${currentSearch.slice(0, 10)}`;
    }

    exportInventoryToExcel(filteredItems, {
      format,
      filterLabel,
      categoryNameMap,
    });

    setExported(true);
    setTimeout(() => {
      setExported(false);
      onClose();
    }, 1200);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-3 md:p-6 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="excel-export-modal-title"
        className="flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 p-4 md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Download size={22} />
            </div>
            <div>
              <h3 id="excel-export-modal-title" className="text-lg md:text-xl font-bold text-white">
                تصدير تقرير وجرد المخزون
              </h3>
              <p className="text-xs text-slate-400">
                تصدير كامل المخزون أو أقسام محددة أو النواقص إلى ملف إكسل منسق جاهز للتحليل والطباعة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            aria-label="إغلاق"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5">
          {/* 1. Filter Scope */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Filter size={14} className="text-cyan-400" />
              <span>اختر نوع الجرد ونطاق الأصناف:</span>
            </label>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setFilterType("all")}
                className={`flex items-start gap-3 rounded-xl border p-3 text-right transition ${
                  filterType === "all"
                    ? "border-cyan-500 bg-cyan-500/10 text-white"
                    : "border-slate-800 bg-slate-950/60 text-slate-400 hover:bg-slate-950"
                }`}
              >
                <Boxes size={18} className="mt-0.5 shrink-0 text-cyan-400" />
                <div>
                  <div className="text-xs font-bold text-white">كامل المخزون العام</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">تصدير جميع الأصناف المسجلة في المتجر ({items.length} صنف)</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFilterType("category")}
                className={`flex items-start gap-3 rounded-xl border p-3 text-right transition ${
                  filterType === "category"
                    ? "border-cyan-500 bg-cyan-500/10 text-white"
                    : "border-slate-800 bg-slate-950/60 text-slate-400 hover:bg-slate-950"
                }`}
              >
                <ClipboardList size={18} className="mt-0.5 shrink-0 text-cyan-400" />
                <div className="w-full">
                  <div className="text-xs font-bold text-white">جرد قسم / تصنيف معين</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">تخصيص الجرد لتصنيف واحد فقط</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFilterType("out_of_stock")}
                className={`flex items-start gap-3 rounded-xl border p-3 text-right transition ${
                  filterType === "out_of_stock"
                    ? "border-cyan-500 bg-cyan-500/10 text-white"
                    : "border-slate-800 bg-slate-950/60 text-slate-400 hover:bg-slate-950"
                }`}
              >
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 font-bold text-xs">
                  0
                </div>
                <div>
                  <div className="text-xs font-bold text-white">جرد النواقص (الرصيد صفر)</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">الأصناف المنتهية تماماً لطلب شرائها</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFilterType("low_stock")}
                className={`flex items-start gap-3 rounded-xl border p-3 text-right transition ${
                  filterType === "low_stock"
                    ? "border-cyan-500 bg-cyan-500/10 text-white"
                    : "border-slate-800 bg-slate-950/60 text-slate-400 hover:bg-slate-950"
                }`}
              >
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400 font-bold text-xs">
                  !
                </div>
                <div>
                  <div className="text-xs font-bold text-white">الأصناف التي شارفت على النفاد</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">الأصناف التي رصيدها قليل</div>
                </div>
              </button>

              {currentSearch.trim() && (
                <button
                  type="button"
                  onClick={() => setFilterType("search")}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-right sm:col-span-2 transition ${
                    filterType === "search"
                      ? "border-cyan-500 bg-cyan-500/10 text-white"
                      : "border-slate-800 bg-slate-950/60 text-slate-400 hover:bg-slate-950"
                  }`}
                >
                  <Filter size={18} className="mt-0.5 shrink-0 text-cyan-400" />
                  <div>
                    <div className="text-xs font-bold text-white">
                      نتائج البحث الحالية ({currentSearch})
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">تصدير الأصناف المطابقة لكلمة البحث فقط</div>
                  </div>
                </button>
              )}
            </div>

            {/* Additional Sub-options */}
            {filterType === "category" && (
              <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 space-y-1.5">
                <label className="text-xs text-cyan-200 block font-medium">اختر التصنيف المراد جرده:</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                >
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label} ({items.filter((i) => i.category === c.value).length} صنف)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {filterType === "low_stock" && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3 space-y-1.5">
                <label className="text-xs text-amber-200 block font-medium">
                  حد التنبيه للكمية المنخفضة (أقل من أو يساوي):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={lowStockThreshold}
                    onChange={(e) => setLowStockThreshold(Math.max(1, Number(e.target.value) || 1))}
                    className="w-32 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white font-mono"
                  />
                  <span className="text-xs text-slate-400">قطع</span>
                </div>
              </div>
            )}
          </div>

          {/* 2. Format Selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <FileSpreadsheet size={14} className="text-cyan-400" />
              <span>نمط ملف الإكسل المطلوب:</span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormat("analysis")}
                className={`flex flex-col items-start rounded-xl border p-3 text-right transition ${
                  format === "analysis"
                    ? "border-cyan-500 bg-cyan-500/10 text-white"
                    : "border-slate-800 bg-slate-950/50 text-slate-400 hover:bg-slate-950"
                }`}
              >
                <span className="text-xs font-bold text-white">📊 تقرير تحليلي مالي شامل</span>
                <span className="text-[11px] text-slate-400 mt-1">
                  يشمل الكميات، وسعر التكلفة، وسعر البيع، وإجمالي رأس المال، وهوامش الأرباح.
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFormat("physical_count")}
                className={`flex flex-col items-start rounded-xl border p-3 text-right transition ${
                  format === "physical_count"
                    ? "border-cyan-500 bg-cyan-500/10 text-white"
                    : "border-slate-800 bg-slate-950/50 text-slate-400 hover:bg-slate-950"
                }`}
              >
                <span className="text-xs font-bold text-white">📝 كشف جرد فعلي ميداني</span>
                <span className="text-[11px] text-slate-400 mt-1">
                  معد للطباعة والعد اليدوي مع خانات فارغة للمطابقة وحساب الفروقات في المحل.
                </span>
              </button>
            </div>
          </div>

          {/* 3. Live Summary Box */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">الأصناف المشمولة بالتصدير:</span>
              <span className="font-bold text-white text-sm">{summary.count} صنف</span>
            </div>
            <div className="flex items-center justify-between text-xs border-t border-slate-850 pt-2">
              <span className="text-slate-400">إجمالي عدد القطع:</span>
              <span className="font-semibold text-cyan-300 font-mono">{money.format(summary.totalQty)} قطعة</span>
            </div>
            {format === "analysis" && (
              <>
                <div className="flex items-center justify-between text-xs border-t border-slate-850 pt-2">
                  <span className="text-slate-400">إجمالي رأس مال البضاعة (بالتكلفة):</span>
                  <span className="font-semibold text-white font-mono">{money.format(summary.totalCostVal)} د.إ</span>
                </div>
                <div className="flex items-center justify-between text-xs border-t border-slate-850 pt-2">
                  <span className="text-slate-400">إجمالي القيمة البيعية المتوقعة:</span>
                  <span className="font-semibold text-emerald-300 font-mono">{money.format(summary.totalRetailVal)} د.إ</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-800 p-4 md:px-6 bg-slate-950/50">
          <Button type="button" variant="secondary" onClick={onClose} disabled={exported}>
            إلغاء
          </Button>

          <Button
            type="button"
            onClick={handleExport}
            disabled={summary.count === 0 || exported}
            className="bg-cyan-600 hover:bg-cyan-500 text-white min-w-40 flex items-center gap-1.5"
          >
            {exported ? (
              <>
                <CheckCircle2 size={16} className="text-emerald-300" /> تم تنزيل الملف!
              </>
            ) : (
              <>
                <Download size={16} /> تصدير الملف ({summary.count})
              </>
            )}
          </Button>
        </div>
      </section>
    </div>
  );
}
