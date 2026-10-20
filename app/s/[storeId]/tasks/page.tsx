"use client";

import { use, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabase";

type TaskStatus = "open" | "in_progress" | "completed" | "blocked";
type Employee = { id: string; full_name: string; role: "owner" | "admin" | "employee" };
type TaskRow = { id: string; title: string; description: string; assignee_id: string; due_date: string | null; priority: "low" | "normal" | "high"; proof_required: boolean; proof_link: string | null; proof_note: string | null; status: TaskStatus; created_at: string };

const statusNames: Record<TaskStatus, string> = { open: "مفتوحة", in_progress: "قيد التنفيذ", completed: "مكتملة", blocked: "متعذرة" };
const priorityNames = { low: "منخفضة", normal: "متوسطة", high: "عالية" };
const priorityVariants = { low: "success", normal: "warning", high: "danger" } as const;

export default function TasksPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = use(params);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [isManager, setIsManager] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", assigneeId: "", dueDate: "", priority: "normal" as "low" | "normal" | "high", proofRequired: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadTasks() {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: profile }, { data: taskRows }, { data: memberships }] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
        supabase.from("tasks").select("id, title, description, assignee_id, due_date, priority, proof_required, proof_link, proof_note, status, created_at").eq("store_id", storeId).order("created_at", { ascending: false }),
        supabase.from("store_members").select("user_id").eq("store_id", storeId),
      ]);
      const memberIds = (memberships ?? []).map((member) => member.user_id);
      const { data: people } = memberIds.length
        ? await supabase.from("profiles").select("id, full_name, role").in("id", memberIds).eq("role", "employee").order("full_name")
        : { data: [] };
      if (!active) return;
      setCurrentUserId(user.id);
      setIsManager(profile?.role === "owner" || profile?.role === "admin");
      setTasks((taskRows ?? []) as TaskRow[]);
      setEmployees((people ?? []) as Employee[]);
      setForm((current) => ({ ...current, assigneeId: (people ?? [])[0]?.id ?? "" }));
      setLoading(false);
    }
    void loadTasks();
    return () => { active = false; };
  }, [storeId]);

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const { data, error } = await getSupabaseClient().from("tasks").insert({
      store_id: storeId, title: form.title.trim(), description: form.description.trim(), assignee_id: form.assigneeId,
      due_date: form.dueDate || null, priority: form.priority, proof_required: form.proofRequired, status: "open",
    }).select("id, title, description, assignee_id, due_date, priority, proof_required, proof_link, proof_note, status, created_at").single();
    if (error) setMessage("تعذر إنشاء المهمة. تأكد من أن الموظف تابع لهذا المتجر.");
    else if (data) {
      setTasks((current) => [data as TaskRow, ...current]);
      setForm((current) => ({ ...current, title: "", description: "", dueDate: "", proofRequired: false }));
      setMessage("تم إنشاء المهمة وتعيينها.");
    }
    setSaving(false);
  }

  async function updateTask(task: TaskRow, updates: Partial<TaskRow>) {
    if (updates.status === "completed" && task.proof_required && !(task.proof_link || task.proof_note)) {
      setMessage("أضف رابط الإثبات أو ملاحظته قبل إكمال المهمة.");
      return;
    }
    const nextStatus = updates.status ?? task.status;
    const nextProofLink = updates.proof_link === undefined ? task.proof_link : updates.proof_link;
    const nextProofNote = updates.proof_note === undefined ? task.proof_note : updates.proof_note;
    const { error } = await getSupabaseClient().rpc("update_task_status", {
      p_store_id: storeId,
      p_task_id: task.id,
      p_status: nextStatus,
      p_proof_link: nextProofLink,
      p_proof_note: nextProofNote,
    });
    if (error) setMessage("تعذر تحديث المهمة. تحقق من صلاحيتك.");
    else {
      setTasks((current) => current.map((item) => item.id === task.id ? { ...item, ...updates } : item));
      setMessage("تم تحديث المهمة.");
    }
  }

  return (
    <AppShell storeId={storeId}>
      <div className="space-y-5" dir="rtl">
        <div><p className="text-sm text-cyan-300">المهام</p><h2 className="mt-2 text-2xl font-semibold text-white">مهام المتجر</h2></div>
        {message ? <p role="status" className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">{message}</p> : null}

        {isManager ? <Card><CardHeader><CardTitle>إنشاء مهمة</CardTitle></CardHeader><CardContent>
          <form onSubmit={createTask} className="grid gap-3 md:grid-cols-2">
            <Field label="عنوان المهمة" value={form.title} onChange={(title) => setForm({ ...form, title })} required />
            <label className="space-y-2 text-sm text-slate-300"><span>الموظف المسؤول</span><select required value={form.assigneeId} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"><option value="">اختر موظفًا من هذا المتجر</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.full_name || employee.id}</option>)}</select></label>
            <label className="space-y-2 text-sm text-slate-300 md:col-span-2"><span>الوصف</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
            <Field label="تاريخ الاستحقاق" type="date" value={form.dueDate} onChange={(dueDate) => setForm({ ...form, dueDate })} />
            <label className="space-y-2 text-sm text-slate-300"><span>الأولوية</span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as typeof form.priority })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"><option value="high">عالية</option><option value="normal">متوسطة</option><option value="low">منخفضة</option></select></label>
            <label className="flex items-center gap-2 text-sm text-slate-300 md:col-span-2"><input type="checkbox" checked={form.proofRequired} onChange={(event) => setForm({ ...form, proofRequired: event.target.checked })} />يتطلب إثباتًا عند الإكمال</label>
            <Button type="submit" disabled={saving || !employees.length} className="md:col-span-2">{saving ? "جارٍ الحفظ..." : "إضافة المهمة"}</Button>
            {!employees.length ? <p className="text-sm text-amber-200 md:col-span-2">أضف أعضاء إلى المتجر قبل إسناد المهام.</p> : null}
          </form>
        </CardContent></Card> : null}

        <Card><CardHeader><CardTitle>قائمة المهام</CardTitle></CardHeader><CardContent>
          {loading ? <p className="py-8 text-center text-slate-400">جارٍ تحميل المهام...</p> : null}
          {!loading && !tasks.length ? <p className="py-8 text-center text-slate-400">لا توجد مهام مسندة إليك في هذا المتجر.</p> : null}
          <div className="space-y-3">{tasks.map((task) => <TaskCard key={task.id} task={task} assignee={employees.find((employee) => employee.id === task.assignee_id)?.full_name ?? "موظف"} currentUserId={currentUserId} canManage={isManager} onUpdate={(updates) => void updateTask(task, updates)} />)}</div>
        </CardContent></Card>
      </div>
    </AppShell>
  );
}

function TaskCard({ task, assignee, currentUserId, canManage, onUpdate }: { task: TaskRow; assignee: string; currentUserId: string; canManage: boolean; onUpdate: (updates: Partial<TaskRow>) => void }) {
  const canUpdate = canManage || task.assignee_id === currentUserId;
  return <article className="rounded-lg border border-slate-800 bg-slate-950 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-medium text-white">{task.title}</h3><p className="mt-1 text-sm text-slate-400">{task.description || "لا يوجد وصف"}</p></div><div className="flex gap-2"><Badge variant={task.status === "completed" ? "success" : task.status === "blocked" ? "danger" : task.status === "in_progress" ? "info" : "default"}>{statusNames[task.status]}</Badge><Badge variant={priorityVariants[task.priority]}>{priorityNames[task.priority]}</Badge></div></div>
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-400"><span>المسؤول: {assignee}</span><span>الاستحقاق: {task.due_date ? new Date(task.due_date).toLocaleDateString("ar-SA") : "غير محدد"}</span><span>{task.proof_required ? "يتطلب إثباتًا" : "الإثبات اختياري"}</span></div>
    {canUpdate ? <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <input type="url" defaultValue={task.proof_link ?? ""} onBlur={(event) => { if (event.target.value !== (task.proof_link ?? "")) onUpdate({ proof_link: event.target.value || null }); }} placeholder="رابط الإثبات" aria-label="رابط الإثبات" className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500" />
      <input defaultValue={task.proof_note ?? ""} onBlur={(event) => { if (event.target.value !== (task.proof_note ?? "")) onUpdate({ proof_note: event.target.value || null }); }} placeholder="ملاحظة الإثبات" aria-label="ملاحظة الإثبات" className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500" />
      <select value={task.status} onChange={(event) => onUpdate({ status: event.target.value as TaskStatus })} aria-label="حالة المهمة" className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"><option value="open">مفتوحة</option><option value="in_progress">قيد التنفيذ</option><option value="completed">مكتملة</option><option value="blocked">متعذرة</option></select>
    </div> : null}
  </article>;
}

function Field({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <label className="space-y-2 text-sm text-slate-300"><span>{label}</span><input type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>; }