"use client";

import { use, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabase";

type Employee = { id: string; full_name: string; role: "owner" | "admin" | "employee"; permissions: string[] };
const permissionOptions = [
  { key: "pos", label: "نقطة البيع" }, { key: "inventory", label: "المخزون" }, { key: "repairs", label: "الصيانة" },
  { key: "purchases", label: "المشتريات" }, { key: "employees", label: "الموظفون" }, { key: "tasks", label: "المهام" },
  { key: "roadmap", label: "خطة التطوير" }, { key: "ledger", label: "التقارير المالية" },
];

export default function EmployeesPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = use(params);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [permissions, setPermissions] = useState<string[]>(["pos", "inventory", "repairs", "tasks"]);
  const [permissionDrafts, setPermissionDrafts] = useState<Record<string, string[]>>({});
  const [isManager, setIsManager] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadEmployees() {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberships, error } = await supabase.from("store_members").select("user_id, permissions").eq("store_id", storeId);
      const memberIds = (memberships ?? []).map((membership) => membership.user_id);
      const { data: profiles } = memberIds.length ? await supabase.from("profiles").select("id, full_name, role").in("id", memberIds) : { data: [] };
      if (!active) return;
      if (error) setMessage("تعذر تحميل أعضاء المتجر.");
      const { data: profile } = user ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle() : { data: null };
      setIsManager(profile?.role === "owner" || profile?.role === "admin");
      setEmployees((memberships ?? []).map((membership) => {
        const profile = (profiles ?? []).find((item) => item.id === membership.user_id);
        return { id: membership.user_id, full_name: profile?.full_name ?? "", role: profile?.role ?? "employee", permissions: Array.isArray(membership.permissions) ? membership.permissions : [] } as Employee;
      }));
      setLoading(false);
    }
    void loadEmployees();
    return () => { active = false; };
  }, [storeId]);

  async function inviteEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/stores/${storeId}/employees`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, fullName, permissions }),
    });
    const result = await response.json() as { message?: string };
    setMessage(result.message ?? (response.ok ? "تمت إضافة الموظف." : "تعذر إضافة الموظف."));
    if (response.ok) {
      setEmail("");
      setFullName("");
      const { data: memberships } = await getSupabaseClient().from("store_members").select("user_id, permissions").eq("store_id", storeId);
      const memberIds = (memberships ?? []).map((membership) => membership.user_id);
      const { data: profiles } = memberIds.length ? await getSupabaseClient().from("profiles").select("id, full_name, role").in("id", memberIds) : { data: [] };
      setEmployees((memberships ?? []).map((membership) => {
        const profile = (profiles ?? []).find((item) => item.id === membership.user_id);
        return { id: membership.user_id, full_name: profile?.full_name ?? "", role: profile?.role ?? "employee", permissions: Array.isArray(membership.permissions) ? membership.permissions : [] } as Employee;
      }));
    }
    setSaving(false);
  }

  async function savePermissions(employeeId: string) {
    const response = await fetch(`/api/stores/${storeId}/employees`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: employeeId, permissions: permissionDrafts[employeeId] ?? [] }),
    });
    const result = await response.json() as { message?: string };
    setMessage(result.message ?? (response.ok ? "تم تحديث الصلاحيات." : "تعذر تحديث الصلاحيات."));
    if (response.ok) setEmployees((current) => current.map((employee) => employee.id === employeeId ? { ...employee, permissions: permissionDrafts[employeeId] ?? [] } : employee));
  }

  return (
    <AppShell storeId={storeId}>
      <div className="space-y-5" dir="rtl">
        <div><p className="text-sm text-cyan-300">الفريق</p><h2 className="mt-2 text-2xl font-semibold text-white">موظفو المتجر</h2></div>
        {message ? <p role="status" className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">{message}</p> : null}
        <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
          {isManager ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserPlus size={18} /> دعوة موظف</CardTitle></CardHeader><CardContent>
            <form onSubmit={inviteEmployee} className="space-y-4">
              <Field label="اسم الموظف" value={fullName} onChange={setFullName} required />
              <Field label="البريد الإلكتروني" type="email" value={email} onChange={setEmail} required />
              <fieldset><legend className="mb-2 text-sm text-slate-300">الوحدات المسموح بها</legend><div className="grid grid-cols-2 gap-2">{permissionOptions.map((option) => <label key={option.key} className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950 p-2 text-sm text-slate-300"><input type="checkbox" checked={permissions.includes(option.key)} onChange={(event) => setPermissions((current) => event.target.checked ? [...current, option.key] : current.filter((item) => item !== option.key))} />{option.label}</label>)}</div></fieldset>
              <p className="text-xs text-slate-500">سيُرسل رابط إعداد الحساب إلى البريد الإلكتروني. لا تُخزّن كلمات المرور في النظام.</p>
              <Button type="submit" disabled={saving || permissions.length === 0} className="w-full">{saving ? "جارٍ إرسال الدعوة..." : "إرسال دعوة الموظف"}</Button>
            </form>
          </CardContent></Card> : null}

          <Card><CardHeader><CardTitle>الأعضاء والصلاحيات</CardTitle></CardHeader><CardContent>
            {loading ? <p className="py-8 text-center text-slate-400">جارٍ تحميل الأعضاء...</p> : null}
            {!loading && !employees.length ? <p className="py-8 text-center text-slate-400">لا يوجد أعضاء مسجلون لهذا المتجر.</p> : null}
            <div className="space-y-3">{employees.map((employee) => {
              const assignedPermissions = permissionDrafts[employee.id] ?? employee.permissions;
              return <article key={employee.id} className="rounded-lg border border-slate-800 bg-slate-950 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium text-white">{employee.full_name || "اسم غير مسجل"}</p></div><Badge variant={employee.role === "owner" || employee.role === "admin" ? "info" : "default"}>{employee.role === "owner" ? "مالك" : employee.role === "admin" ? "مدير" : "موظف"}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{permissionOptions.map((option) => <label key={option.key} className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" disabled={!isManager || employee.role !== "employee"} checked={assignedPermissions.includes(option.key)} onChange={(event) => setPermissionDrafts((current) => ({ ...current, [employee.id]: event.target.checked ? [...assignedPermissions, option.key] : assignedPermissions.filter((item) => item !== option.key) }))} />{option.label}</label>)}</div>{isManager && employee.role === "employee" && permissionDrafts[employee.id] ? <Button type="button" variant="secondary" className="mt-3" onClick={() => void savePermissions(employee.id)}>حفظ الصلاحيات</Button> : null}</article>;
            })}</div>
          </CardContent></Card>
        </div>
      </div>
    </AppShell>
  );
}

function Field({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <label className="block space-y-2 text-sm text-slate-300"><span>{label}</span><input type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>; }