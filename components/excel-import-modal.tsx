"use client";

import { useId, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  PlusCircle,
  RefreshCw,
  Upload,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  downloadSampleExcelTemplate,
  parseExcelOrCsvFile,
  processRawRows,
  type ParsedInventoryItem,
} from "@/lib/excel-utils";

type ExistingInventoryItem = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  quantity: number;
  cost_price: number;
  selling_price: number;
  category: string;
};

type ExcelImportModalProps = {
  storeId: string;
  existingItems: ExistingInventoryItem[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const money = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });

export function ExcelImportModal({
  storeId,
  existingItems,
  isOpen,
  onClose,
  onSuccess,
}: ExcelImportModalProps) {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<"add" | "replace">("add");
  const [updatePrices, setUpdatePrices] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterView, setFilterView] = useState<"all" | "match" | "new" | "error">("all");
  const [successReport, setSuccessReport] = useState<{
    updatedCount: number;
    insertedCount: number;
    message: string;
  } | null>(null);

  // Reprocess rows whenever mode or rawRows change
  const processedItems = useMemo<ParsedInventoryItem[]>(() => {
    if (rawRows.length === 0) return [];
    return processRawRows(rawRows, existingItems, mode);
  }, [rawRows, existingItems, mode]);

  const stats = useMemo(() => {
    let matchCount = 0;
    let newCount = 0;
    let errorCount = 0;

    for (const item of processedItems) {
      if (item.status === "match") matchCount++;
      else if (item.status === "new") newCount++;
      else if (item.status === "error") errorCount++;
    }

    return {
      total: processedItems.length,
      matchCount,
      newCount,
      errorCount,
      validCount: matchCount + newCount,
    };
  }, [processedItems]);

  const visibleItems = useMemo(() => {
    if (filterView === "all") return processedItems;
    return processedItems.filter((item) => item.status === filterView);
  }, [processedItems, filterView]);

  if (!isOpen) return null;

  async function handleFileSelected(selectedFile: File) {
    setError(null);
    setSuccessReport(null);
    setParsing(true);
    setFile(selectedFile);

    try {
      const rows = await parseExcelOrCsvFile(selectedFile);
      if (rows.length === 0) {
        setError("الملف المرفوع لا يحتوي على بيانات أو صفوف مقروءة.");
        setRawRows([]);
      } else {
        setRawRows(rows);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "تعذر قراءة ملف الإكسل. يرجى التأكد من صيغة الملف.";
      setError(msg);
      setRawRows([]);
    } finally {
      setParsing(false);
    }
  }

  function handleReset() {
    setFile(null);
    setRawRows([]);
    setError(null);
    setSuccessReport(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleConfirmImport() {
    if (stats.validCount === 0) {
      setError("لا توجد أصناف صالحة للاستيراد في الملف.");
      return;
    }

    setImporting(true);
    setError(null);

    const validItems = processedItems.filter((i) => i.status !== "error");

    try {
      const response = await fetch(`/api/stores/${storeId}/inventory/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          updatePrices,
          items: validItems.map((item) => ({
            barcode: item.barcode,
            sku: item.sku,
            name: item.name,
            category: item.category,
            quantity: item.quantity,
            cost_price: item.cost_price,
            selling_price: item.selling_price,
            discount: item.discount,
            matchedItemId: item.matchedItemId,
          })),
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "حدث خطأ أثناء استيراد البيانات إلى المخزون.");
      }

      setSuccessReport({
        updatedCount: result.updatedCount ?? 0,
        insertedCount: result.insertedCount ?? 0,
        message: result.message || "تم استيراد المخزون وتحديث الأرصدة بنجاح.",
      });

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "فشل الاستيراد.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-3 md:p-6 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="excel-import-modal-title"
        className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 p-4 md:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <FileSpreadsheet size={22} />
            </div>
            <div>
              <h3 id="excel-import-modal-title" className="text-lg md:text-xl font-bold text-white">
                استيراد المخزون من ملف إكسل / CSV
              </h3>
              <p className="text-xs text-slate-400">
                إضافة كميات للمخزون الحالي، أو عمل جرد فعلي واستبدال الأرصدة دفعة واحدة
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
          {/* Success Banner */}
          {successReport ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-5 text-emerald-200 space-y-3">
              <div className="flex items-center gap-2 text-base font-semibold text-emerald-300">
                <CheckCircle2 size={22} />
                <span>تم إكمال عملية الاستيراد بنجاح!</span>
              </div>
              <p className="text-sm text-emerald-100/90">{successReport.message}</p>
              <div className="flex flex-wrap gap-4 pt-2 text-xs">
                <span className="rounded-md bg-emerald-900/60 px-3 py-1.5 border border-emerald-700/50">
                  الأصناف المحدّثة: <strong>{successReport.updatedCount}</strong>
                </span>
                <span className="rounded-md bg-emerald-900/60 px-3 py-1.5 border border-emerald-700/50">
                  الأصناف الجديدة: <strong>{successReport.insertedCount}</strong>
                </span>
              </div>
              <div className="flex justify-end pt-2">
                <Button type="button" onClick={onClose} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  تم، إغلاق النافذة
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Step 1: Template Download Banner */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-cyan-200">ليس لديك ملف جاهز؟ حمل القالب المعتمد</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    يحتوي النموذج على أعمدة الباركود، اسم الصنف، الكمية، سعر التكلفة، وسعر البيع.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={downloadSampleExcelTemplate}
                  className="whitespace-nowrap border-cyan-500/30 text-cyan-300 hover:bg-cyan-500/10 text-xs shrink-0"
                >
                  <Download size={14} className="ml-1" /> تحميل النموذج المعتمد (.xlsx)
                </Button>
              </div>

              {/* Step 2: Upload Dropzone */}
              {!file ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files?.[0]) {
                      void handleFileSelected(e.dataTransfer.files[0]);
                    }
                  }}
                  className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-700 bg-slate-950/60 p-8 text-center cursor-pointer hover:border-cyan-500 hover:bg-slate-950/90 transition group"
                >
                  <input
                    ref={fileInputRef}
                    id={fileInputId}
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        void handleFileSelected(e.target.files[0]);
                      }
                    }}
                  />
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-800 text-slate-400 group-hover:bg-cyan-500/10 group-hover:text-cyan-400 transition">
                    <Upload size={28} />
                  </div>
                  <p className="text-sm font-medium text-white group-hover:text-cyan-300 transition">
                    انقر هنا لاختيار ملف الإكسل أو اسحبه وأفلته هنا
                  </p>
                  <p className="mt-1 text-xs text-slate-500">يدعم صيغ Excel (.xlsx, .xls) وملفات CSV</p>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="text-emerald-400" size={24} />
                    <div>
                      <p className="text-sm font-medium text-white">{file.name}</p>
                      <p className="text-xs text-slate-400">
                        الحجم: {(file.size / 1024).toFixed(1)} ك.ب · المقروء: {stats.total} صنف
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleReset}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    اختيار ملف آخر
                  </Button>
                </div>
              )}

              {/* Step 3: Options (Mode & Price Updates) */}
              <div className="grid gap-3 sm:grid-cols-2 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                {/* Mode: Add vs Replace */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300 block">طريقة تطبيق الكميات المستوردة:</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setMode("add")}
                      className={`flex flex-col items-center justify-center rounded-lg border p-3 text-center transition ${
                        mode === "add"
                          ? "border-cyan-500 bg-cyan-500/10 text-cyan-300"
                          : "border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-850"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-bold">
                        <PlusCircle size={14} /> إضافة للرصيد (+)
                      </span>
                      <span className="mt-1 text-[11px] opacity-75">
                        زيادة الكميات الحالية
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setMode("replace")}
                      className={`flex flex-col items-center justify-center rounded-lg border p-3 text-center transition ${
                        mode === "replace"
                          ? "border-cyan-500 bg-cyan-500/10 text-cyan-300"
                          : "border-slate-800 bg-slate-900 text-slate-400 hover:bg-slate-850"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 text-xs font-bold">
                        <RefreshCw size={14} /> جرد واستبدال (=)
                      </span>
                      <span className="mt-1 text-[11px] opacity-75">
                        تصفير واعتماد رصيد الملف
                      </span>
                    </button>
                  </div>
                </div>

                {/* Update Prices Option */}
                <div className="flex flex-col justify-center space-y-2">
                  <label className="text-xs font-semibold text-slate-300 block">خيارات إضافية:</label>
                  <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs text-slate-300 cursor-pointer hover:bg-slate-850 transition">
                    <input
                      type="checkbox"
                      checked={updatePrices}
                      onChange={(e) => setUpdatePrices(e.target.checked)}
                      className="rounded border-slate-700 text-cyan-500 focus:ring-cyan-500"
                    />
                    <span>تحديث أسعار البيع والتكلفة للأصناف الموجودة تلقائياً</span>
                  </label>
                </div>
              </div>

              {/* Error Alert */}
              {error ? (
                <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-950/40 p-3 text-xs text-rose-300">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              {/* Step 4: Preview Table */}
              {parsing ? (
                <div className="py-12 text-center text-slate-400 text-sm">
                  <RefreshCw className="animate-spin mx-auto mb-2 text-cyan-400" size={24} />
                  جارٍ قراءة الملف ومطابقة الأصناف مع المخزون...
                </div>
              ) : null}

              {!parsing && processedItems.length > 0 ? (
                <div className="space-y-3">
                  {/* Stats & Filters Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-400">معاينة النتائج:</span>
                      <button
                        type="button"
                        onClick={() => setFilterView("all")}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                          filterView === "all" ? "bg-slate-700 text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                        }`}
                      >
                        الكل ({stats.total})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterView("match")}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                          filterView === "match" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40" : "bg-slate-800 text-slate-400 hover:text-cyan-300"
                        }`}
                      >
                        أصناف مطابقة لتحديثها ({stats.matchCount})
                      </button>
                      <button
                        type="button"
                        onClick={() => setFilterView("new")}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                          filterView === "new" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" : "bg-slate-800 text-slate-400 hover:text-emerald-300"
                        }`}
                      >
                        أصناف جديدة للإضافة ({stats.newCount})
                      </button>
                      {stats.errorCount > 0 ? (
                        <button
                          type="button"
                          onClick={() => setFilterView("error")}
                          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                            filterView === "error" ? "bg-rose-500/20 text-rose-300 border border-rose-500/40" : "bg-slate-800 text-slate-400 hover:text-rose-300"
                          }`}
                        >
                          أخطاء ({stats.errorCount})
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Table */}
                  <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/70">
                    <table className="min-w-full text-right text-xs text-slate-300">
                      <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 z-10">
                        <tr>
                          <th className="py-2.5 pr-3">الصنف</th>
                          <th className="py-2.5 pr-3">الباركود / SKU</th>
                          <th className="py-2.5 pr-3">الكمية بالملف</th>
                          <th className="py-2.5 pr-3">النتيجة بعد الاستيراد</th>
                          <th className="py-2.5 pr-3">سعر البيع</th>
                          <th className="py-2.5 pr-3 text-center">الحالة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleItems.map((item, index) => (
                          <tr
                            key={index}
                            className={`border-b border-slate-800/60 last:border-0 hover:bg-slate-900/40 ${
                              item.status === "error" ? "bg-rose-950/20" : ""
                            }`}
                          >
                            <td className="py-2.5 pr-3 font-medium text-white max-w-52 truncate">
                              {item.name}
                            </td>
                            <td className="py-2.5 pr-3 text-slate-400 font-mono">
                              {item.barcode || item.sku || "—"}
                            </td>
                            <td className="py-2.5 pr-3 font-semibold text-white">
                              {item.quantity}
                            </td>
                            <td className="py-2.5 pr-3">
                              {item.status === "match" ? (
                                <span className="text-cyan-300">
                                  {mode === "add" ? (
                                    <>
                                      {item.currentQuantity} + {item.quantity} ={" "}
                                      <strong className="text-white">{item.calculatedQuantity}</strong>
                                    </>
                                  ) : (
                                    <>
                                      {item.currentQuantity} →{" "}
                                      <strong className="text-white">{item.calculatedQuantity}</strong>
                                    </>
                                  )}
                                </span>
                              ) : item.status === "new" ? (
                                <span className="text-emerald-400 font-medium">
                                  رصيد جديد: {item.calculatedQuantity}
                                </span>
                              ) : (
                                <span className="text-rose-400">{item.errorMessage}</span>
                              )}
                            </td>
                            <td className="py-2.5 pr-3 text-slate-300">
                              {item.selling_price > 0 ? `${money.format(item.selling_price)} د.إ` : "—"}
                            </td>
                            <td className="py-2.5 pr-3 text-center">
                              {item.status === "match" ? (
                                <Badge variant="info">تحديث</Badge>
                              ) : item.status === "new" ? (
                                <Badge variant="success">جديد</Badge>
                              ) : (
                                <Badge variant="warning">غير صالح</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 p-4 md:px-6 bg-slate-950/50">
          <p className="text-xs text-slate-400">
            {!successReport && processedItems.length > 0 ? (
              <span>
                سيتم استيراد <strong className="text-white">{stats.validCount}</strong> صنف إلى المتجر.
              </span>
            ) : null}
          </p>

          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={importing}>
              {successReport ? "إغلاق" : "إلغاء"}
            </Button>
            {!successReport && (
              <Button
                type="button"
                onClick={handleConfirmImport}
                disabled={importing || stats.validCount === 0}
                className="bg-cyan-600 hover:bg-cyan-500 text-white min-w-32"
              >
                {importing ? "جارٍ الاستيراد..." : `تأكيد واستيراد (${stats.validCount})`}
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
