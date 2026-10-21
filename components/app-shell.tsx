"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import {
  Boxes,
  ClipboardCheck,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogOut,
  Route,
  ShieldCheck,
  ShoppingCart,
  Store as StoreIcon,
  UserCog,
  Wrench,
} from "lucide-react";

import { getSupabaseClient } from "@/lib/supabase";

type AppRole = "owner" | "admin" | "employee";
type StoreChoice = { id: string; name: string; city: string };
type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; module?: string };

const storeNavigation: NavItem[] = [
  { href: "", label: "لوحة المتجر", icon: LayoutDashboard },
  { href: "/pos", label: "نقطة البيع", icon: ShoppingCart, module: "pos" },
  { href: "/inventory", label: "المخزون", icon: Boxes, module: "inventory" },
  { href: "/repairs", label: "الصيانة", icon: Wrench, module: "repairs" },
  { href: "/purchases", label: "المشتريات والموردون", icon: CreditCard, module: "purchases" },
  { href: "/employees", label: "الموظفون", icon: UserCog, module: "employees" },
  { href: "/ledger", label: "التقارير المالية", icon: FileText, module: "ledger" },
  { href: "/tasks", label: "المهام", icon: ClipboardCheck, module: "tasks" },
  { href: "/roadmap", label: "خطة التطوير", icon: Route, module: "roadmap" },
];

export function AppShell({ children, storeId }: { children: ReactNode; storeId?: string }) {
  const pathname = usePathname();
  const currentPath = pathname ?? "";
  const router = useRouter();
  const [role, setRole] = useState<AppRole | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [stores, setStores] = useState<StoreChoice[]>([]);
  const [currentStore, setCurrentStore] = useState<StoreChoice | null>(null);

  useEffect(() => {
    let active = true;

    async function loadAccess() {
      try {
        const supabase = getSupabaseClient();
        const { data: authData } = await supabase.auth.getUser();
        const user = authData?.user;
        if (!user) return;

        const [{ data: profile }, { data: memberships }, { data: storeRows }] = await Promise.all([
          supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
          supabase.from("store_members").select("store_id, permissions").eq("user_id", user.id),
          storeId
            ? supabase.from("stores").select("id, name, city").eq("id", storeId).maybeSingle()
            : supabase.from("stores").select("id, name, city").order("name"),
        ]);

        if (!active) return;
        const userRole = profile?.role;
        if (userRole === "owner" || userRole === "admin" || userRole === "employee") {
          setRole(userRole);
        }

        const memberList = (memberships as Array<{ store_id: string; permissions: string[] }> | null) ?? [];
        const member = memberList.find((item: { store_id: string }) => item.store_id === storeId) ?? memberList[0];
        setPermissions(Array.isArray(member?.permissions) ? member.permissions : []);
        const allowedStoreIds = new Set(memberList.map((item: { store_id: string }) => item.store_id));

        let allStores: StoreChoice[] = [];
        if (Array.isArray(storeRows)) {
          allStores = storeRows.map((store) => ({
            id: store.id,
            name: store.name,
            city: store.city,
          }));
        } else if (storeRows && typeof storeRows === "object" && "id" in storeRows) {
          allStores = [{
            id: (storeRows as StoreChoice).id,
            name: (storeRows as StoreChoice).name,
            city: (storeRows as StoreChoice).city,
          }];
        }

        const isAdminUser = userRole === "owner" || userRole === "admin";
        const visibleStores = isAdminUser
          ? allStores
          : allStores.filter((store) => allowedStoreIds.has(store.id)).slice(0, 1);

        if (!isAdminUser && visibleStores.length > 0 && (!storeId || storeId !== visibleStores[0].id)) {
          router.replace(`/s/${visibleStores[0].id}`);
          return;
        }

        setStores(visibleStores);
        const resolvedCurrent = (storeId ? visibleStores.find((store) => store.id === storeId) : null) ?? visibleStores[0] ?? null;
        setCurrentStore(resolvedCurrent);
      } catch {
        // حماية التطبيق من أي انهيار غير متوقع أثناء معالجة الجلسة
      }
    }

    void loadAccess();
    return () => {
      active = false;
    };
  }, [router, storeId]);

  const isManager = role === "owner" || role === "admin";
  const navigation = storeId
    ? storeNavigation.filter((item) => !item.module || isManager || permissions.includes(item.module))
    : [{ href: "/stores", label: "المحلات", icon: StoreIcon }];

  async function signOut() {
    try {
      await getSupabaseClient().auth.signOut();
    } finally {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    }
  }

  function switchStore(nextStoreId: string) {
    const suffix = storeId && currentPath ? currentPath.replace(`/s/${storeId}`, "") : "";
    router.push(`/s/${nextStoreId}${suffix}`);
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 font-sans text-slate-50">
      <div className="mx-auto flex max-w-[1600px] flex-col lg:flex-row">
        <aside className="border-b border-slate-800 bg-slate-950/90 p-4 backdrop-blur lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-l">
          <div className="mb-7 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30">
              <ShieldCheck size={20} />
            </div>
            <div>
              <p className="text-xs text-slate-400">سبيشل موبايل</p>
              <h2 className="text-base font-semibold text-white">نظام إدارة المتاجر</h2>
            </div>
          </div>

          {storeId && currentStore ? (
            <div className="mb-5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3">
              <label htmlFor="store-switcher" className="mb-2 block text-xs text-cyan-100">المتجر النشط</label>
              {isManager && stores.length > 1 ? (
                <select
                  id="store-switcher"
                  value={currentStore.id}
                  onChange={(event) => switchStore(event.target.value)}
                  className="w-full rounded-md border border-cyan-500/30 bg-slate-950 px-2 py-2 text-sm text-white"
                >
                  {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                </select>
              ) : (
                <p className="font-semibold text-white">{currentStore.name}</p>
              )}
              <p className="mt-1 text-xs text-cyan-100/80">{currentStore.city}</p>
            </div>
          ) : null}

          <nav aria-label="التنقل الرئيسي" className="flex flex-wrap gap-2 lg:flex-col">
            {navigation.map(({ href, label, icon: Icon }) => {
              const resolvedHref = storeId ? `/s/${storeId}${href}` : href;
              const isActive = currentPath === resolvedHref || (resolvedHref !== `/s/${storeId}` && currentPath.startsWith(`${resolvedHref}/`));
              return (
                <Link
                  key={resolvedHref}
                  href={resolvedHref}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    isActive ? "border-cyan-500/50 bg-cyan-500/10 text-white" : "border-transparent text-slate-300 hover:border-slate-700 hover:bg-slate-900 hover:text-white"
                  }`}
                >
                  <Icon size={16} className="text-cyan-300" />
                  {label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <header className="mb-8 flex flex-col gap-4 border-b border-slate-800 pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs text-cyan-300">إدارة العمليات اليومية</p>
              <h1 className="mt-2 text-xl font-bold text-white sm:text-2xl">
                {currentStore ? `متجر ${currentStore.name}` : "إدارة المحلات"}
              </h1>
            </div>
            <div className="flex items-center justify-between gap-3">
              {isManager && storeId ? <Link href="/stores" className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"><StoreIcon size={15} /> كل المحلات</Link> : null}
              <span className="text-sm text-slate-300">
                {role === "owner" ? "مالك النظام" : role === "admin" ? "مدير النظام" : role === "employee" ? "موظف" : ""}
              </span>
              <button
                type="button"
                onClick={signOut}
                title="تسجيل الخروج"
                aria-label="تسجيل الخروج"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                <LogOut size={16} />
              </button>
            </div>
          </header>
          {children}
        </main>
      </div>
    </div>
  );
}
