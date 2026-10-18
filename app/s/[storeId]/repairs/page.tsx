"use client";

import { use, useEffect, useState } from "react";
import { Plus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabase";

type RepairStatus = "pending" | "diagnosing" | "waiting_parts" | "repaired" | "delivered";
type Ticket = {
  id: string; store_id: string; customer_name: string; phone: string; device_type: string; device_model: string;
  serial_number: string | null; issue: string; status: RepairStatus; used_parts: { name: string; cost: number }[];
  parts_cost: number; final_price: number; deposit: number; technician_notes: string; created_at: string;
};

const statuses: { value: RepairStatus; label: string; variant: "default" | "success" | "warning" | "info" }[] = [
  { value: "pending", label: "قيد الانتظار", variant: "warning" },
  { value: "diagnosing", label: "قيد الفحص", variant: "info" },
  { value: "waiting_parts", label: "بانتظار القطع", variant: "default" },
  { value: "repaired", label: "تم الإصلاح", variant: "success" },
  { value: "delivered", label: "تم التسليم", variant: "success" },
];
const emptyForm = { customer: "", phone: "", deviceType: "هاتف", model: "", serial: "", issue: "", status: "pending" as RepairStatus, usedParts: [{ name: "", cost: "0" }], finalPrice: "", deposit: "0", notes: "" };
const money = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 2 });

export default function RepairsPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId } = use(params);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadTickets() {
      const { data, error } = await getSupabaseClient().from("repair_tickets").select("*").eq("store_id", storeId).order("created_at", { ascending: false });
      if (!active) return;
      if (error) setMessage("تعذر تحميل تذاكر الصيانة لهذا المتجر.");
      setTickets((data ?? []) as Ticket[]);
      setLoading(false);
    }
    void loadTickets();
    return () => { active = false; };
  }, [storeId]);

  const selectedTicket = tickets.find((ticket) => ticket.id === selectedId) ?? tickets[0] ?? null;

  async function createTicket(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const usedParts = form.usedParts.filter((part) => part.name.trim()).map((part) => ({ name: part.name.trim(), cost: Number(part.cost) || 0 }));
    const partCost = usedParts.reduce((sum, part) => sum + part.cost, 0);
    const { data, error } = await getSupabaseClient().from("repair_tickets").insert({
      store_id: storeId,
      customer_name: form.customer.trim(),
      phone: form.phone.trim(),
      device_type: form.deviceType.trim(),
      device_model: form.model.trim(),
      serial_number: form.serial.trim() || null,
      issue: form.issue.trim(),
      status: form.status,
      used_parts: usedParts,
      parts_cost: partCost,
      final_price: Number(form.finalPrice),
      deposit: Number(form.deposit) || 0,
      technician_notes: form.notes.trim(),
    }).select("*").single();
    if (error) setMessage("تعذر حفظ تذكرة الصيانة. تحقق من الحقول وصلاحية الحساب.");
    else if (data) {
      setTickets((current) => [data as Ticket, ...current]);
      setSelectedId(data.id);
      setForm(emptyForm);
      setShowForm(false);
      setMessage("تم إنشاء تذكرة الصيانة بنجاح.");
    }
    setSaving(false);
  }

  async function updateStatus(ticketId: string, status: RepairStatus) {
    const { error } = await getSupabaseClient().from("repair_tickets").update({ status }).eq("id", ticketId).eq("store_id", storeId);
    if (error) setMessage("تعذر تحديث حالة التذكرة.");
    else setTickets((current) => current.map((ticket) => ticket.id === ticketId ? { ...ticket, status } : ticket));
  }

  return (
    <AppShell storeId={storeId}>
      <div className="space-y-5" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-cyan-300">الصيانة</p><h2 className="mt-2 text-2xl font-semibold text-white">تذاكر الصيانة</h2></div><Button type="button" onClick={() => { setMessage(""); setShowForm(true); }}><Plus size={16} /> تذكرة صيانة جديدة</Button></div>
        {message ? <p role="status" className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-slate-200">{message}</p> : null}
        {loading ? <p className="py-10 text-center text-slate-400">جارٍ تحميل التذاكر...</p> : null}
        {!loading && tickets.length === 0 ? <p className="rounded-lg border border-slate-800 p-8 text-center text-slate-400">لا توجد تذاكر صيانة لهذا المتجر.</p> : null}
        {tickets.length ? <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-3">{tickets.map((ticket) => <button type="button" key={ticket.id} onClick={() => setSelectedId(ticket.id)} className={`w-full rounded-lg border p-4 text-right ${selectedTicket?.id === ticket.id ? "border-cyan-500/60 bg-cyan-500/10" : "border-slate-800 bg-slate-900 hover:border-slate-700"}`}>
            <div className="flex items-start justify-between gap-2"><span className="font-medium text-white">{ticket.customer_name}</span><Badge variant={statuses.find((status) => status.value === ticket.status)?.variant ?? "default"}>{statuses.find((status) => status.value === ticket.status)?.label}</Badge></div><p className="mt-2 text-sm text-slate-300">{ticket.device_type} · {ticket.device_model}</p><p className="mt-1 text-xs text-slate-400">{ticket.issue}</p>
          </button>)}</div>
          {selectedTicket ? <Card><CardHeader><CardTitle>تفاصيل التذكرة</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
            <Detail label="العميل" value={selectedTicket.customer_name} /><Detail label="رقم الهاتف" value={selectedTicket.phone} /><Detail label="الجهاز" value={`${selectedTicket.device_type} · ${selectedTicket.device_model}`} /><Detail label="IMEI أو الرقم التسلسلي" value={selectedTicket.serial_number || "غير مسجل"} /><Detail label="وصف المشكلة" value={selectedTicket.issue} />
            <label className="flex items-center justify-between gap-3 text-slate-300"><span>الحالة</span><select value={selectedTicket.status} onChange={(event) => void updateStatus(selectedTicket.id, event.target.value as RepairStatus)} className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white">{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
            <Detail label="تكلفة القطع" value={`${money.format(selectedTicket.parts_cost)} د.إ`} /><Detail label="سعر الإصلاح" value={`${money.format(selectedTicket.final_price)} د.إ`} /><Detail label="الربح المتوقع" value={`${money.format(selectedTicket.final_price - selectedTicket.parts_cost)} د.إ`} /><Detail label="العربون" value={`${money.format(selectedTicket.deposit)} د.إ`} /><Detail label="ملاحظات الفني" value={selectedTicket.technician_notes || "لا توجد ملاحظات"} />
            {selectedTicket.used_parts.length ? <div className="border-t border-slate-800 pt-3"><p className="mb-2 text-slate-400">القطع المستخدمة</p>{selectedTicket.used_parts.map((part, index) => <p key={`${part.name}-${index}`} className="text-white">{part.name} · {money.format(part.cost)} د.إ</p>)}</div> : null}
          </CardContent></Card> : null}
        </div> : null}
      </div>

      {showForm ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"><section role="dialog" aria-modal="true" aria-labelledby="repair-title" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5">
        <h3 id="repair-title" className="mb-4 text-xl font-semibold text-white">تذكرة صيانة جديدة</h3>
        <form onSubmit={createTicket} className="space-y-4"><div className="grid gap-3 sm:grid-cols-2">
          <Input label="اسم العميل" required value={form.customer} onChange={(customer) => setForm({ ...form, customer })} /><Input label="رقم الهاتف" required value={form.phone} onChange={(phone) => setForm({ ...form, phone })} /><Input label="نوع الجهاز" required value={form.deviceType} onChange={(deviceType) => setForm({ ...form, deviceType })} /><Input label="طراز الجهاز" required value={form.model} onChange={(model) => setForm({ ...form, model })} /><Input label="IMEI أو الرقم التسلسلي" value={form.serial} onChange={(serial) => setForm({ ...form, serial })} /><label className="space-y-2 text-sm text-slate-300"><span>حالة التذكرة</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as RepairStatus })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
          <label className="space-y-2 text-sm text-slate-300 sm:col-span-2"><span>وصف المشكلة</span><textarea required value={form.issue} onChange={(event) => setForm({ ...form, issue: event.target.value })} className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
          <div className="space-y-2 sm:col-span-2"><div className="flex items-center justify-between"><span className="text-sm text-slate-300">القطع المستخدمة وتكلفتها</span><Button type="button" variant="secondary" onClick={() => setForm({ ...form, usedParts: [...form.usedParts, { name: "", cost: "0" }] })}>إضافة قطعة</Button></div>{form.usedParts.map((part, index) => <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Input label={`اسم القطعة ${index + 1}`} value={part.name} onChange={(name) => setForm({ ...form, usedParts: form.usedParts.map((item, itemIndex) => itemIndex === index ? { ...item, name } : item) })} /><Input label="التكلفة" type="number" min="0" step="0.01" value={part.cost} onChange={(cost) => setForm({ ...form, usedParts: form.usedParts.map((item, itemIndex) => itemIndex === index ? { ...item, cost } : item) })} /><button type="button" disabled={form.usedParts.length === 1} onClick={() => setForm({ ...form, usedParts: form.usedParts.filter((_, itemIndex) => itemIndex !== index) })} className="self-end rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-300 disabled:opacity-40">حذف</button></div>)}</div>
          <Input label="سعر الإصلاح النهائي" required type="number" min="0" step="0.01" value={form.finalPrice} onChange={(finalPrice) => setForm({ ...form, finalPrice })} /><Input label="العربون" type="number" min="0" step="0.01" value={form.deposit} onChange={(deposit) => setForm({ ...form, deposit })} />
          <label className="space-y-2 text-sm text-slate-300 sm:col-span-2"><span>ملاحظات الفني</span><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>
        </div><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setShowForm(false)}>إلغاء</Button><Button type="submit" disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ التذكرة"}</Button></div></form>
      </section></div> : null}
    </AppShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4 border-b border-slate-800 pb-2 text-slate-300"><span>{label}</span><span className="text-left font-medium text-white">{value}</span></div>; }
function Input({ label, value, onChange, required, type = "text", min, step }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; min?: string; step?: string }) { return <label className="space-y-2 text-sm text-slate-300"><span>{label}</span><input type={type} min={min} step={step} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white" /></label>; }