"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { Boxes, ClipboardCheck, CreditCard, FileText, LayoutDashboard, Route, ShoppingCart, UserCog, Wrench } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabase";

type StoreRecord = { id: string; name: string; city: string; manager: string; status: string; sales_target: number; fixed_expenses: number };
type Module = { slug: string; title: string; description: string; icon: typeof LayoutDashboard; permission?: string };
const modules: Module[] = [
  { slug: "pos", title: "نقطة البيع", description: "المبيعات والفواتير اليومية", icon: ShoppingCart, permission: "pos" },
  { slug: "inventory", title: "المخزون", description: "المنتجات والكميات والأسعار", icon: Boxes, permission: "inventory" },
  { slug: "repairs", title: "الصيانة", description: "تذاكر الأجهزة ومتابعة الإصلاح", icon: Wrench, permission: "repairs" },
  { slug: "purchases", title: "المشتريات والموردون", description: "فواتير التوريد وتحديث المخزون", icon: CreditCard, permission: "purchases" },
  { slug: "employees", title: "الموظفون", description: "أعضاء المتجر وصلاحيات الوحدات", icon: UserCog, permission: "employees" },
  { slug: "ledger", title: "التقارير المالية", description: "المبيعات والمصروفات والأرباح", icon: FileText, permission: "ledger" },
  { slug: "tasks", title: "المهام", description: "التكليفات والاستحقاقات والإثباتات", icon: ClipboardCheck, permission: "tasks" },
  { slug: "roadmap", title: "خطة التطوير", description: "المبادرات ومتابعة التنفيذ", icon: Route, permission: "roadmap" },
];

export default function StoreHomePage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = use(params);
  const [store, setStore] = useState<StoreRecord | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isManager, setIsManager] = useState(false);
  const [salesToday, setSalesToday] = useState<number | null>(null);
  const [openRepairs, setOpenRepairs] = useState<number | null>(null);
  const [inventoryCount, setInventoryCount] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      const [{ data: storeRow }, { data: profile }, { data: membership }] = await Promise.all([
        supabase.from("stores").select("id, name, city, manager, status, sales_target, fixed_expenses").eq("id", storeId).maybeSingle(),
        user ? supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
        user ? supabase.from("store_members").select("permissions").eq("user_id", user.id).eq("store_id", storeId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const [salesResult, repairsResult, inventoryResult] = await Promise.all([
        supabase.from("sales").select("total").eq("store_id", storeId).gte("created_at", start.toISOString()),
        supabase.from("repair_tickets").select("id", { count: "exact", head: true }).eq("store_id", storeId).not("status", "eq", "delivered"),
        supabase.from("inventory_items").select("id", { count: "exact", head: true }).eq("store_id", storeId),
      ]);
      if (!active) return;
      if (!storeRow) setMessage("تعذر العثور على المتجر أو ليس لديك صلاحية الوصول إليه.");
      setStore((storeRow ?? null) as StoreRecord | null);
      setIsManager(profile?.role === "owner" || profile?.role === "admin");
      setPermissions(Array.isArray(membership?.permissions) ? membership.permissions : []);
      setSalesToday((salesResult.data ?? []).reduce((sum, sale) => sum + sale.total, 0));
      setOpenRepairs(repairsResult.count ?? 0);
      setInventoryCount(inventoryResult.count ?? 0);
    }
    void loadDashboard();
    return () => { active = false; };
  }, [storeId]);

  const visibleModules = modules.filter((module) => isManager || (module.permission && permissions.includes(module.permission)));

  return (
    <AppShell storeId={storeId}>
      <div className="space-y-6" dir="rtl">
        {store ? <section className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/70 p-5"><div><p className="text-sm text-cyan-300">مساحة المتجر</p><h2 className="mt-2 text-2xl font-semibold text-white">{store.name}</h2><p className="mt-2 text-sm text-slate-300">{store.city} · المسؤول: {store.manager}</p></div><Badge variant={store.status === "active" ? "success" : store.status === "setup" ? "info" : "warning"}>{store.status === "active" ? "نشط" : store.status === "setup" ? "قيد الإعداد" : "متوقف"}</Badge></section> : <p role="status" className="text-slate-300">{message || "جارٍ تحميل المتجر..."}</p>}
        {message ? <p role="alert" className="text-sm text-rose-200">{message}</p> : null}
        <section className="grid gap-3 sm:grid-cols-3"><Metric icon={ShoppingCart} label="مبيعات اليوم" value={salesToday === null ? "—" : `${new Intl.NumberFormat("ar-SA").format(salesToday)} د.إ`} /><Metric icon={Wrench} label="تذاكر صيانة مفتوحة" value={openRepairs === null ? "—" : new Intl.NumberFormat("ar-SA").format(openRepairs)} /><Metric icon={Boxes} label="أصناف المخزون" value={inventoryCount === null ? "—" : new Intl.NumberFormat("ar-SA").format(inventoryCount)} /></section>
        <section><div className="mb-3 flex items-center gap-2"><LayoutDashboard size={18} className="text-cyan-300" /><h3 className="text-lg font-semibold text-white">وحدات المتجر</h3></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleModules.map(({ slug, title, description, icon: Icon }) => <Link key={slug} href={`/s/${storeId}/${slug}`} className="block h-full"><Card className="h-full transition-colors hover:border-cyan-500/40"><CardContent className="flex h-full items-start gap-4 p-4"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-300"><Icon size={19} /></span><span><span className="block font-semibold text-white">{title}</span><span className="mt-1 block text-sm text-slate-400">{description}</span></span></CardContent></Card></Link>)}
        </div></section>
      </div>
    </AppShell>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof LayoutDashboard; label: string; value: string }) { return <Card><CardContent className="flex items-center gap-3 p-4"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-300"><Icon size={17} /></span><span><span className="block text-xs text-slate-400">{label}</span><span className="mt-1 block font-semibold text-white">{value}</span></span></CardContent></Card>; }