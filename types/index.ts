export type Role = "owner" | "admin" | "employee";
export type InventoryCategory = string;
export type PaymentMethod = "cash" | "card" | "transfer" | "wallet";
export type RepairStatus = "pending" | "diagnosing" | "waiting_parts" | "repaired" | "delivered";
export type TaskStatus = "open" | "in_progress" | "blocked" | "completed";
export type TaskPriority = "low" | "normal" | "high";
export type RoadmapStatus = "planned" | "in_progress" | "review" | "done";
export type RoadmapPriority = "low" | "medium" | "high";

export interface Store {
  id: string;
  name: string;
  city: string;
  manager: string;
  status: "active" | "setup" | "paused";
  salesTarget: number;
  fixedExpenses: number;
}

export interface Employee {
  id: string;
  fullName: string;
  role: Role;
  storeId: string;
  permissions: string[];
}

export interface Task {
  id: string;
  storeId: string;
  title: string;
  description: string;
  assigneeId: string;
  dueDate: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  proofRequired: boolean;
  proofLink: string | null;
  proofNote: string | null;
}

export interface InventoryItem {
  id: string;
  storeId: string;
  name: string;
  category: InventoryCategory;
  sku: string;
  barcode: string | null;
  quantity: number;
  costPrice: number;
  sellingPrice: number;
  discount: number;
  imeiTracking: boolean;
  supplierId: string | null;
}

export interface Expense {
  id: string;
  storeId: string;
  category: string;
  amount: number;
  date: string;
  note: string;
}

export interface RepairTicket {
  id: string;
  storeId: string;
  customerName: string;
  phone: string;
  deviceType: string;
  deviceModel: string;
  serialNumber: string | null;
  issue: string;
  status: RepairStatus;
  usedParts: { name: string; cost: number }[];
  partsCost: number;
  finalPrice: number;
  deposit: number;
  technicianNotes: string;
}

export interface RoadmapItem {
  id: string;
  storeId: string;
  title: string;
  description: string;
  ownerId: string | null;
  priority: RoadmapPriority;
  status: RoadmapStatus;
  dueDate: string | null;
  linkedTaskId: string | null;
}

export interface POSCartItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
}