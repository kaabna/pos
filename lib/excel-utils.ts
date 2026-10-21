import * as XLSX from "xlsx";

export type ParsedInventoryItem = {
  barcode: string | null;
  sku: string;
  name: string;
  category: string;
  quantity: number;
  cost_price: number;
  selling_price: number;
  discount: number;
  // Match state
  status: "match" | "new" | "error";
  matchedItemId?: string;
  currentQuantity?: number;
  calculatedQuantity?: number;
  errorMessage?: string;
  rawRow: Record<string, unknown>;
};

// Standard template rows for download
export const SAMPLE_TEMPLATE_ROWS = [
  {
    "الباركود (Barcode)": "628100000001",
    "اسم الصنف (Name)": "شاحن سريع 20W تايب سي",
    "الكمية (Quantity)": 20,
    "سعر التكلفة (Cost)": 3.5,
    "سعر البيع (Price)": 7.0,
    "التصنيف (Category)": "إكسسوارات",
    "رمز الصنف (SKU)": "CHG-20W-TYPEC",
    "الخصم %": 0,
  },
  {
    "الباركود (Barcode)": "628100000002",
    "اسم الصنف (Name)": "كفر حماية سيليكون آيفون 15",
    "الكمية (Quantity)": 15,
    "سعر التكلفة (Cost)": 2.0,
    "سعر البيع (Price)": 5.0,
    "التصنيف (Category)": "إكسسوارات",
    "رمز الصنف (SKU)": "CASE-IP15-SIL",
    "الخصم %": 5,
  },
  {
    "الباركود (Barcode)": "628100000003",
    "اسم الصنف (Name)": "شاشة حماية زجاجية ريلمي",
    "الكمية (Quantity)": 30,
    "سعر التكلفة (Cost)": 0.8,
    "سعر البيع (Price)": 2.5,
    "التصنيف (Category)": "إكسسوارات",
    "رمز الصنف (SKU)": "SCR-REALME-01",
    "الخصم %": 0,
  },
];

/**
 * Download a sample Excel spreadsheet
 */
export function downloadSampleExcelTemplate() {
  const ws = XLSX.utils.json_to_sheet(SAMPLE_TEMPLATE_ROWS);

  // Set column widths
  ws["!cols"] = [
    { wch: 22 }, // Barcode
    { wch: 32 }, // Name
    { wch: 16 }, // Quantity
    { wch: 18 }, // Cost
    { wch: 18 }, // Price
    { wch: 20 }, // Category
    { wch: 20 }, // SKU
    { wch: 12 }, // Discount
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "قالب_المخزون");
  XLSX.writeFile(wb, "نموذج_استيراد_المخزون.xlsx");
}

/**
 * Normalize header key to identify columns
 */
function findValue(row: Record<string, unknown>, keys: string[]): unknown {
  const rowKeys = Object.keys(row);
  for (const k of keys) {
    const target = k.toLowerCase().replace(/[\s_()-]/g, "");
    for (const rk of rowKeys) {
      const cleanRk = rk.toLowerCase().replace(/[\s_()-]/g, "");
      if (cleanRk === target || cleanRk.includes(target)) {
        return row[rk];
      }
    }
  }
  return undefined;
}

/**
 * Parse uploaded file (xlsx, xls, csv) into raw objects
 */
export async function parseExcelOrCsvFile(file: File): Promise<Record<string, unknown>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const workbook = XLSX.read(buffer, { type: "array" });
        if (!workbook.SheetNames.length) {
          throw new Error("الملف فارغ أو لا يحتوي على صفحات بيانات.");
        }
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
        resolve(json);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("فشلت قراءة الملف"));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Map raw rows into ParsedInventoryItem matching against existing items
 */
export function processRawRows(
  rows: Record<string, unknown>[],
  existingItems: Array<{
    id: string;
    name: string;
    sku: string;
    barcode: string | null;
    quantity: number;
    cost_price: number;
    selling_price: number;
    category: string;
  }>,
  mode: "add" | "replace"
): ParsedInventoryItem[] {
  // Index existing items
  const barcodeMap = new Map<string, (typeof existingItems)[0]>();
  const skuMap = new Map<string, (typeof existingItems)[0]>();
  const nameMap = new Map<string, (typeof existingItems)[0]>();

  for (const item of existingItems) {
    if (item.barcode && item.barcode.trim()) {
      barcodeMap.set(item.barcode.trim().toLowerCase(), item);
    }
    if (item.sku && item.sku.trim()) {
      skuMap.set(item.sku.trim().toLowerCase(), item);
    }
    if (item.name && item.name.trim()) {
      nameMap.set(item.name.trim().toLowerCase(), item);
    }
  }

  const result: ParsedInventoryItem[] = [];

  for (const raw of rows) {
    // Extract barcode
    const rawBarcode = findValue(raw, ["barcode", "الباركود", "باركود", "كود", "code", "upc", "ean"]);
    const barcodeStr = rawBarcode !== undefined && rawBarcode !== null ? String(rawBarcode).trim() : "";
    const barcode = barcodeStr.length > 0 ? barcodeStr : null;

    // Extract name
    const rawName = findValue(raw, ["name", "اسم الصنف", "اسم المنتج", "الاسم", "الصنف", "المنتج", "item", "product", "title"]);
    const name = rawName !== undefined && rawName !== null ? String(rawName).trim() : "";

    // Extract SKU
    const rawSku = findValue(raw, ["sku", "رمز الصنف", "رمز", "كود الصنف"]);
    const sku = rawSku !== undefined && rawSku !== null ? String(rawSku).trim() : "";

    // Extract Quantity
    const rawQty = findValue(raw, ["quantity", "qty", "الكمية", "كمية", "العدد", "عدد", "الرصيد", "stock", "count"]);
    const quantityNum = rawQty !== undefined && rawQty !== null && String(rawQty).trim() !== "" ? Number(rawQty) : 0;
    const quantity = isNaN(quantityNum) ? 0 : Math.max(0, Math.round(quantityNum));

    // Extract Cost
    const rawCost = findValue(raw, ["cost", "cost_price", "سعر التكلفة", "التكلفة", "سعر الشراء", "شراء", "buy_price"]);
    const costNum = rawCost !== undefined && rawCost !== null && String(rawCost).trim() !== "" ? Number(rawCost) : 0;
    const cost_price = isNaN(costNum) ? 0 : Math.max(0, Number(costNum.toFixed(2)));

    // Extract Price
    const rawPrice = findValue(raw, ["price", "selling_price", "سعر البيع", "سعر", "البيع", "sale_price"]);
    const priceNum = rawPrice !== undefined && rawPrice !== null && String(rawPrice).trim() !== "" ? Number(rawPrice) : 0;
    const selling_price = isNaN(priceNum) ? 0 : Math.max(0, Number(priceNum.toFixed(2)));

    // Extract Category
    const rawCategory = findValue(raw, ["category", "التصنيف", "الفئة", "القسم", "نوع"]);
    const category = rawCategory !== undefined && rawCategory !== null && String(rawCategory).trim() !== "" ? String(rawCategory).trim() : "accessory";

    // Extract Discount
    const rawDiscount = findValue(raw, ["discount", "الخصم", "نسبة الخصم"]);
    const discountNum = rawDiscount !== undefined && rawDiscount !== null && String(rawDiscount).trim() !== "" ? Number(rawDiscount) : 0;
    const discount = isNaN(discountNum) ? 0 : Math.min(100, Math.max(0, Number(discountNum.toFixed(2))));

    // Validate
    if (!name && !barcode && !sku) {
      // Empty row or header residue, skip
      continue;
    }

    if (!name) {
      result.push({
        barcode,
        sku,
        name: "(بدون اسم)",
        category,
        quantity,
        cost_price,
        selling_price,
        discount,
        status: "error",
        errorMessage: "اسم الصنف مطلوب",
        rawRow: raw,
      });
      continue;
    }

    // Attempt matching
    let matched: (typeof existingItems)[0] | undefined;
    if (barcode && barcodeMap.has(barcode.toLowerCase())) {
      matched = barcodeMap.get(barcode.toLowerCase());
    } else if (sku && skuMap.has(sku.toLowerCase())) {
      matched = skuMap.get(sku.toLowerCase());
    } else if (name && nameMap.has(name.toLowerCase())) {
      matched = nameMap.get(name.toLowerCase());
    }

    if (matched) {
      const currentQty = matched.quantity || 0;
      const calculatedQty = mode === "add" ? currentQty + quantity : quantity;
      result.push({
        barcode: barcode || matched.barcode,
        sku: sku || matched.sku,
        name: name || matched.name,
        category: category || matched.category,
        quantity,
        cost_price: cost_price > 0 ? cost_price : matched.cost_price,
        selling_price: selling_price > 0 ? selling_price : matched.selling_price,
        discount,
        status: "match",
        matchedItemId: matched.id,
        currentQuantity: currentQty,
        calculatedQuantity: calculatedQty,
        rawRow: raw,
      });
    } else {
      result.push({
        barcode,
        sku: sku || (barcode ? `SKU-${barcode}` : `SKU-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`),
        name,
        category,
        quantity,
        cost_price,
        selling_price,
        discount,
        status: "new",
        calculatedQuantity: quantity,
        rawRow: raw,
      });
    }
  }

  return result;
}
