"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { KeyRound, Trash2, UserPlus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabase";

type Employee = { id: string; full_name: string; role: "owner" | "admin" | "employee"; permissions: string[] };
const permissionOptions = [
  { key: "pos", label: "نقطة البيع" },
  { key: "inventory", label: "المخزون" },
  { key: "repairs", label: "الصيانة" },
  { key: "purchases", label: "المشتريات" },
  { key: "employees", label: "الموظفون" },
  { key: "tasks", label: "المهام" },
  { key: "roadmap", label: "خطة التطوير" },
  { key: "ledger", label: "التقارير المالية" },
];

export default function EmployeesPage() {
  const routeParams = useParams();
  const storeId = (routeParams?.storeId as string) || "";
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<string[]>(["pos", "inventory", "repairs", "tasks"]);
  const [permissionDrafts, setPermissionDrafts] = useState<Record<string, string[]>>({});
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [isManager, setIsManager] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function refreshMembers() {
    const supabase = getSupabaseClient();
    const { data: memberships, error } = await supabase
      .from("store_members")
      .select("user_id, permissions")
      .eq("store_id", storeId);
    if (error) {
      setMessage("تعذر تحميل أعضاء المتجر.");
      return;
    }
    const memberList = (memberships as Array<{ user_id: string; permissions: string[] }> | null) ?? [];
    const memberIds = memberList.map((membership: { user_id: string }) => membership.user_id);
    const { data: profiles } = memberIds.length
      ? await supabase.from("profiles").select("id, full_name, role").in("id", memberIds)
      : { data: [] };
    const profileList = (profiles as Array<{ id: string; full_name?: string; role?: "owner" | "admin" | "employee" }> | null) ?? [];
    setEmployees(
      memberList.map((membership: { user_id: string; permissions: string[] }) => {
        const profile = profileList.find((item: { id: string }) => item.id === membership.user_id);
        return {
          id: membership.user_id,
          full_name: profile?.full_name ?? "",
          role: profile?.role ?? "employee",
          permissions: Array.isArray(membership.permissions) ? membership.permissions : [],
        } as Employee;
      }),
    );
  }

  useEffect(() => {
    let active = true;
    async function loadEmployees() {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data: memberships, error } = await supabase
        .from("store_members")
        .select("user_id, permissions")
        .eq("store_id", storeId);
      const memberList = (memberships as Array<{ user_id: string; permissions: string[] }> | null) ?? [];
      const memberIds = memberList.map((membership: { user_id: string }) => membership.user_id);
      const { data: profiles } = memberIds.length
        ? await supabase.from("profiles").select("id, full_name, role").in("id", memberIds)
        : { data: [] };
      const profileList = (profiles as Array<{ id: string; full_name?: string; role?: "owner" | "admin" | "employee" }> | null) ?? [];
      if (!active) return;
      if (error) setMessage("تعذر تحميل أعضاء المتجر.");
      const { data: profile } = user
        ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
        : { data: null };
      setCurrentUserId(user?.id ?? "");
      setIsManager(profile?.role === "owner" || profile?.role === "admin");
      setEmployees(
        memberList.map((membership: { user_id: string; permissions: string[] }) => {
          const memberProfile = profileList.find((item: { id: string }) => item.id === membership.user_id);
          return {
            id: membership.user_id,
            full_name: memberProfile?.full_name ?? "",
            role: memberProfile?.role ?? "employee",
            permissions: Array.isArray(membership.permissions) ? membership.permissions : [],
          } as Employee;
        }),
      );
      setLoading(false);
    }
    void loadEmployees();
    return () => {
      active = false;
    };
  }, [storeId]);

  async function addOrLinkEmployee(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/stores/${storeId}/employees`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, fullName, password, permissions }),
    });
    const result = (await response.json()) as { message?: string };
    setMessage(result.message ?? (response.ok ? "تمت إضافة الموظف وربطه بهذا المتجر." : "تعذر إضافة الموظف."));
    if (response.ok) {
      setEmail("");
      setFullName("");
      setPassword("");
      await refreshMembers();
    }
    setSaving(false);
  }

  async function saveEmployeeChanges(employeeId: string) {
    const targetEmployee = employees.find((item) => item.id === employeeId);
    if (!targetEmployee) return;
    const nextPermissions = permissionDrafts[employeeId] ?? targetEmployee.permissions;
    const nextPassword = (passwordDrafts[employeeId] ?? "").trim();

    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/stores/${storeId}/employees`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: employeeId,
        permissions: nextPermissions,
        password: nextPassword || undefined,
      }),
    });
    const result = (await response.json()) as { message?: string };
    setMessage(result.message ?? (response.ok ? "تم تحديث بيانات الموظف." : "تعذر تحديث بيانات الموظف."));
    if (response.ok) {
      setPermissionDrafts((current) => {
        const copy = { ...current };
        delete copy[employeeId];
        return copy;
      });
      setPasswordDrafts((current) => {
        const copy = { ...current };
        delete copy[employeeId];
        return copy;
      });
      await refreshMembers();
    }
    setSaving(false);
  }

  async function removeEmployee(employeeId: string) {
    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/stores/${storeId}/employees?userId=${encodeURIComponent(employeeId)}`, {
      method: "DELETE",
    });
    const result = (await response.json()) as { message?: string };
    setMessage(result.message ?? (response.ok ? "تمت إزالة الموظف من المتجر." : "تعذر إزالة الموظف."));
    if (response.ok) {
      await refreshMembers();
    }
    setSaving(false);
  }

  return (
    <AppShell storeId={storeId}>
      <div className="space-y-5" dir="rtl">
        <div>
          <p className="text-sm text-cyan-300">الفريق</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">موظفو المتجر</h2>
        </div>
        {message ? (
          <p role="status" className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">
            {message}
          </p>
        ) : null}
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          {isManager ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus size={18} /> إضافة أو ربط موظف بهذا المحل فقط
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={addOrLinkEmployee} className="space-y-4">
                  <Field label="اسم الموظف" value={fullName} onChange={setFullName} required />
                  <Field label="البريد الإلكتروني" type="email" value={email} onChange={setEmail} required />
                  <Field
                    label="كلمة المرور للدخول المباشر (6 أحرف فأكثر)"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    placeholder="أدخل كلمة مرور لتفعيل الحساب فوراً بدون إيميل"
                  />
                  <fieldset>
                    <legend className="mb-2 text-sm text-slate-300">الوحدات المسموح بها في هذا المحل</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {permissionOptions.map((option) => (
                        <label
                          key={option.key}
                          className="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950 p-2 text-sm text-slate-300"
                        >
                          <input
                            type="checkbox"
                            checked={permissions.includes(option.key)}
                            onChange={(event) =>
                              setPermissions((current) =>
                                event.target.checked
                                  ? [...current, option.key]
                                  : current.filter((item) => item !== option.key),
                              )
                            }
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs leading-relaxed text-slate-300">
                    • إذا كان الموظف جديداً: أدخل كلمة المرور ليتم إنشاء الحساب وتفعيله فوراً بدون انتظار رسالة الإيميل.
                    <br />• إذا قمت بإضافة الموظف يدوياً من قبل في Supabase: أدخل بريده الإلكتروني هنا ليتم ربطه{" "}
                    <strong className="text-cyan-300">بهذا المحل فقط</strong> بصفة موظف وتفعيل دخوله.
                  </div>
                  <Button type="submit" disabled={saving || permissions.length === 0} className="w-full">
                    {saving ? "جارٍ الحفظ والربط..." : "حفظ الموظف وربطه بهذا المحل"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>الأعضاء والصلاحيات (مرتبطون بهذا المحل فقط)</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? <p className="py-8 text-center text-slate-400">جارٍ تحميل الأعضاء...</p> : null}
              {!loading && !employees.length ? (
                <p className="py-8 text-center text-slate-400">لا يوجد أعضاء مسجلون لهذا المتجر.</p>
              ) : null}
              <div className="space-y-3">
                {employees.map((employee) => {
                  const assignedPermissions = permissionDrafts[employee.id] ?? employee.permissions;
                  const canEditMember = isManager && employee.id !== currentUserId;
                  const hasChanges =
                    Boolean(permissionDrafts[employee.id]) ||
                    Boolean((passwordDrafts[employee.id] ?? "").trim()) ||
                    (canEditMember && employee.role !== "employee");

                  return (
                    <article key={employee.id} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-white">{employee.full_name || "اسم غير مسجل"}</p>
                          {employee.role !== "employee" && canEditMember ? (
                            <p className="mt-1 text-xs text-amber-300">
                              تنبيه: هذا الحساب مضبوط كمدير (يظهر له كل المحلات). اضغط &quot;حفظ التعديلات&quot; لتحويله إلى موظف مرتبط بهذا المحل فقط.
                            </p>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={employee.role === "owner" || employee.role === "admin" ? "info" : "default"}>
                            {employee.role === "owner" ? "مالك" : employee.role === "admin" ? "مدير" : "موظف"}
                          </Badge>
                          {canEditMember ? (
                            <button
                              type="button"
                              onClick={() => void removeEmployee(employee.id)}
                              title="إزالة الموظف من هذا المتجر"
                              aria-label="إزالة الموظف من هذا المتجر"
                              className="rounded p-1.5 text-slate-400 hover:bg-rose-500/10 hover:text-rose-300"
                            >
                              <Trash2 size={15} />
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {permissionOptions.map((option) => (
                          <label key={option.key} className="flex items-center gap-2 text-xs text-slate-300">
                            <input
                              type="checkbox"
                              disabled={!canEditMember}
                              checked={assignedPermissions.includes(option.key)}
                              onChange={(event) =>
                                setPermissionDrafts((current) => ({
                                  ...current,
                                  [employee.id]: event.target.checked
                                    ? [...assignedPermissions, option.key]
                                    : assignedPermissions.filter((item) => item !== option.key),
                                }))
                              }
                            />
                            {option.label}
                          </label>
                        ))}
                      </div>

                      {canEditMember ? (
                        <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-slate-800/80 pt-3">
                          <label className="flex-1 space-y-1 text-xs text-slate-400">
                            <span className="flex items-center gap-1">
                              <KeyRound size={13} /> تعيين كلمة مرور جديدة (اختياري)
                            </span>
                            <input
                              type="password"
                              value={passwordDrafts[employee.id] ?? ""}
                              onChange={(event) =>
                                setPasswordDrafts((current) => ({ ...current, [employee.id]: event.target.value }))
                              }
                              placeholder="أدخل 6 أحرف فأكثر لتغيير كلمة المرور"
                              className="w-full rounded-md border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                            />
                          </label>
                          {hasChanges ? (
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={saving}
                              onClick={() => void saveEmployeeChanges(employee.id)}
                            >
                              {employee.role !== "employee"
                                ? "تحويل لموظف وحفظ الصلاحيات"
                                : "حفظ التعديلات"}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block space-y-2 text-sm text-slate-300">
      <span>{label}</span>
      <input
        type={type}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white placeholder:text-slate-500"
      />
    </label>
  );
}