"use client";

import { use, useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabase";

type RoadmapStatus = "planned" | "in_progress" | "review" | "done";
type RoadmapItem = { id: string; store_id: string; title: string; description: string; owner_id: string | null; priority: "low" | "medium" | "high"; status: RoadmapStatus; due_date: string | null; linked_task_id: string | null };
type Person = { id: string; full_name: string };
type TaskOption = { id: string; title: string };

const statuses: { value: RoadmapStatus; label: string }[] = [
  { value: "planned", label: "مخطط" }, { value: "in_progress", label: "قيد التنفيذ" }, { value: "review", label: "قيد المراجعة" }, { value: "done", label: "مكتمل" },
];
const priorities = [{ value: "high", label: "عالية" }, { value: "medium", label: "متوسطة" }, { value: "low", label: "منخفضة" }] as const;
const emptyForm = { title: "", description: "", ownerId: "", priority: "medium" as "low" | "medium" | "high", status: "planned" as RoadmapStatus, dueDate: "", linkedTaskId: "" };

export default function RoadmapPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = use(params);
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [tasks, setTasks] = useState<TaskOption[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [selected, setSelected] = useState<RoadmapItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadRoadmap() {
      const supabase = getSupabaseClient();
      const [{ data: rows, error }, { data: memberships }, { data: taskRows }] = await Promise.all([
        supabase.from("roadmap_items").select("id, store_id, title, description, owner_id, priority, status, due_date, linked_task_id").eq("store_id", storeId).order("due_date"),
        supabase.from("store_members").select("user_id").eq("store_id", storeId),
        supabase.from("tasks").select("id, title").eq("store_id", storeId).order("title"),
      ]);
      const memberIds = (memberships ?? []).map((member) => member.user_id);
      const { data: profiles } = memberIds.length ? await supabase.from("profiles").select("id, full_name").in("id", memberIds).order("full_name") : { data: [] };
      if (!active) return;
      if (error) setMessage("تعذر تحميل مبادرات هذا المتجر.");
      setItems((rows ?? []) as RoadmapItem[]);
      setPeople((profiles ?? []) as Person[]);
      setTasks((taskRows ?? []) as TaskOption[]);
      setForm((current) => ({ ...current, ownerId: (profiles ?? [])[0]?.id ?? "" }));
      setLoading(false);
    }
    void loadRoadmap();
    return () => { active = false; };
  }, [storeId]);

  async function saveNew(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const { data, error } = await getSupabaseClient().from("roadmap_items").insert({
      store_id: storeId, title: form.title.trim(), description: form.description.trim(), owner_id: form.ownerId || null,
      priority: form.priority, status: form.status, due_date: form.dueDate || null, linked_task_id: form.linkedTaskId || null,
    }).select("id, store_id, title, description, owner_id, priority, status, due_date, linked_task_id").single();
    if (error) setMessage("تعذر حفظ المبادرة. تحقق من صلاحيات خطة التطوير.");
    else if (data) {
      setItems((current) => [data as RoadmapItem, ...current]);
      setForm(emptyForm);
      setMessage("تمت إضافة المبادرة إلى خطة المتجر.");
    }
    setSaving(false);
  }

  async function saveDetails(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSaving(true);
    const { data, error } = await getSupabaseClient().from("roadmap_items").update({
      title: form.title.trim(), description: form.description.trim(), owner_id: form.ownerId || null,
      priority: form.priority, status: form.status, due_date: form.dueDate || null, linked_task_id: form.linkedTaskId || null,
    }).eq("id", selected.id).eq("store_id", storeId).select("id, store_id, title, description, owner_id, priority, status, due_date, linked_task_id").single();
    if (error) setMessage("تعذر تحديث تفاصيل المبادرة.");
    else if (data) {
      setItems((current) => current.map((item) => item.id === selected.id ? data as RoadmapItem : item));
      setSelected(null);
      setMessage("تم تحديث المبادرة.");
    }
    setSaving(false);
  }

  function openDetails(item: RoadmapItem) {
    setSelected(item);
    setForm({ title: item.title, description: item.description, ownerId: item.owner_id ?? "", priority: item.priority, status: item.status, dueDate: item.due_date ?? "", linkedTaskId: item.linked_task_id ?? "" });
  }

  return (
    <AppShell storeId={storeId}>
      <div className="space-y-5" dir="rtl">
        <div><p className="text-sm text-cyan-300">خطة التطوير</p><h2 className="mt-2 text-2xl font-semibold text-white">مبادرات المتجر</h2></div>
        {message ? <p role="status" className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">{message}</p> : null}
        <Card><CardHeader><CardTitle>مبادرة جديدة</CardTitle></CardHeader><CardContent><form onSubmit={saveNew} className="grid gap-3 md:grid-cols-2">
          <Field label="عنوان المبادرة" value={form.title} onChange={(title) => setForm({ ...form, title })} required />
          <label className="space-y-2 text-sm text-slate-300"><span>المسؤول</span><select value={form.ownerId} onChange={(event) => setForm({ ...form, ownerId: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"><option value="">بدون مسؤول</option>{people.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.id}</option>)}</select></label>
          <label className="space-y-2 text-sm text-slate-300 md:col-span-2"><span>الوصف</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <Select label="الأولوية" value={form.priority} onChange={(priority) => setForm({ ...form, priority: priority as typeof form.priority })} options={priorities} />
          <Select label="الحالة" value={form.status} onChange={(status) => setForm({ ...form, status: status as RoadmapStatus })} options={statuses} />
          <Field label="تاريخ الاستحقاق" type="date" value={form.dueDate} onChange={(dueDate) => setForm({ ...form, dueDate })} />
          <label className="space-y-2 text-sm text-slate-300"><span>مهمة مرتبطة</span><select value={form.linkedTaskId} onChange={(event) => setForm({ ...form, linkedTaskId: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"><option value="">بدون مهمة</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
          <Button type="submit" disabled={saving} className="md:col-span-2"><Plus size={16} /> {saving ? "جارٍ الحفظ..." : "إضافة المبادرة"}</Button>
        </form></CardContent></Card>

        <section><h3 className="mb-3 text-lg font-semibold text-white">المبادرات الحالية</h3>{loading ? <p className="py-8 text-center text-slate-400">جارٍ تحميل المبادرات...</p> : null}{!loading && !items.length ? <p className="rounded-lg border border-slate-800 p-8 text-center text-slate-400">لا توجد مبادرات مسجلة لهذا المتجر.</p> : null}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <button type="button" key={item.id} onClick={() => openDetails(item)} className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-right transition hover:border-cyan-500/40">
            <div className="flex justify-between gap-2"><span className="font-medium text-white">{item.title}</span><Badge variant={item.priority === "high" ? "danger" : item.priority === "medium" ? "warning" : "success"}>{priorities.find((priority) => priority.value === item.priority)?.label}</Badge></div><p className="mt-2 line-clamp-2 text-sm text-slate-400">{item.description || "لا يوجد وصف"}</p><div className="mt-3 flex justify-between gap-2 text-xs text-slate-400"><span>{statuses.find((status) => status.value === item.status)?.label}</span><span>{item.due_date ? new Date(item.due_date).toLocaleDateString("ar-SA") : "دون موعد"}</span></div>
          </button>)}</div>
        </section>
      </div>

      {selected ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"><section role="dialog" aria-modal="true" aria-labelledby="initiative-details" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5"><h3 id="initiative-details" className="mb-4 text-xl font-semibold text-white">تفاصيل المبادرة</h3><form onSubmit={saveDetails} className="space-y-3">
        <Field label="عنوان المبادرة" value={form.title} onChange={(title) => setForm({ ...form, title })} required /><label className="block space-y-2 text-sm text-slate-300"><span>الوصف</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label><label className="block space-y-2 text-sm text-slate-300"><span>المسؤول</span><select value={form.ownerId} onChange={(event) => setForm({ ...form, ownerId: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"><option value="">بدون مسؤول</option>{people.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.id}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2"><Select label="الأولوية" value={form.priority} onChange={(priority) => setForm({ ...form, priority: priority as typeof form.priority })} options={priorities} /><Select label="الحالة" value={form.status} onChange={(status) => setForm({ ...form, status: status as RoadmapStatus })} options={statuses} /><Field label="تاريخ الاستحقاق" type="date" value={form.dueDate} onChange={(dueDate) => setForm({ ...form, dueDate })} /><label className="space-y-2 text-sm text-slate-300"><span>مهمة مرتبطة</span><select value={form.linkedTaskId} onChange={(event) => setForm({ ...form, linkedTaskId: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"><option value="">بدون مهمة</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label></div>
        <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="secondary" onClick={() => setSelected(null)}>إغلاق</Button><Button type="submit" disabled={saving}>حفظ التعديلات</Button></div>
      </form></section></div> : null}
    </AppShell>
  );
}

function Field({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <label className="space-y-2 text-sm text-slate-300"><span>{label}</span><input type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly { value: string; label: string }[] }) { return <label className="space-y-2 text-sm text-slate-300"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }