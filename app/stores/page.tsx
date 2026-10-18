"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabase";

type StoreRow = {
  id: string;
  name: string;
  city: string;
  manager: string;
  status: "active" | "setup" | "paused";
  sales_target: number;
  fixed_expenses: number;
};

const emptyForm = { name: "", city: "", manager: "", status: "active", salesTarget: "", fixedExpenses: "" };
const money = new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 0 });

export default function StoresPage() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadStores() {
      const { data, error: queryError } = await getSupabaseClient()
        .from("stores")
        .select("id, name, city, manager, status, sales_target, fixed_expenses")
        .order("created_at", { ascending: false });
      if (!active) return;
      if (queryError) setError("تعذر تحميل المحلات. تحقق من إعداد قاعدة البيانات والصلاحيات.");
      setStores((data ?? []) as StoreRow[]);
      setLoading(false);
    }
    void loadStores();
    return () => { active = false; };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    const { data, error: saveError } = await getSupabaseClient()
      .from("stores")
      .insert({
        name: form.name.trim(),
        city: form.city.trim(),
        manager: form.manager.trim(),
        status: form.status,
        sales_target: Number(form.salesTarget) || 0,
        fixed_expenses: Number(form.fixedExpenses) || 0,
      })
      .select("id, name, city, manager, status, sales_target, fixed_expenses")
      .single();

    if (saveError) {
      setError("تعذر حفظ المحل. تأكد من صلاحية الحساب ومن عدم تكرار البيانات.");
    } else if (data) {
      setStores((current) => [data as StoreRow, ...current]);
      setForm(emptyForm);
      setIsOpen(false);
    }
    setSaving(false);
  }

  return (
    <AppShell>
      <div className="space-y-6" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-cyan-300">شبكة المحلات</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">إدارة المحلات والفروع</h2>
          </div>
          <Button type="button" onClick={() => { setError(""); setIsOpen(true); }}>إضافة محل جديد</Button>
        </div>

        {error && !isOpen ? <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
        {loading ? <p className="py-12 text-center text-slate-400">جارٍ تحميل المحلات...</p> : null}
        {!loading && stores.length === 0 ? <p className="rounded-lg border border-slate-800 p-8 text-center text-slate-400">لا توجد محلات مسجلة حتى الآن.</p> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {stores.map((store) => (
            <Link key={store.id} href={`/s/${store.id}`} className="block h-full">
              <Card className="h-full p-5 transition-colors hover:border-cyan-500/40">
                <CardHeader className="mb-4 flex-row items-start justify-between gap-3">
                  <CardTitle className="text-white">{store.name}</CardTitle>
                  <Badge variant={store.status === "active" ? "success" : store.status === "setup" ? "info" : "warning"}>
                    {store.status === "active" ? "نشط" : store.status === "setup" ? "قيد الإعداد" : "متوقف"}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-300">
                  <Info label="المدينة" value={store.city} />
                  <Info label="المسؤول" value={store.manager} />
                  <Info label="المستهدف" value={`${money.format(store.sales_target)} د.إ`} />
                  <Info label="المصروفات الثابتة" value={`${money.format(store.fixed_expenses)} د.إ`} />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4" role="presentation">
          <section role="dialog" aria-modal="true" aria-labelledby="new-store-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h3 id="new-store-title" className="text-xl font-semibold text-white">إضافة محل جديد</h3>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="إغلاق" className="text-lg text-slate-400 hover:text-white">×</button>
            </div>
            {error ? <p role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{error}</p> : null}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="اسم المحل" required value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
                <Field label="المدينة" required value={form.city} onChange={(value) => setForm({ ...form, city: value })} />
                <Field label="المسؤول" required value={form.manager} onChange={(value) => setForm({ ...form, manager: value })} />
                <label className="space-y-2 text-sm text-slate-300">
                  <span>حالة المحل</span>
                  <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white">
                    <option value="active">نشط</option><option value="setup">قيد الإعداد</option><option value="paused">متوقف</option>
                  </select>
                </label>
                <Field label="المستهدف البيعي" type="number" min="0" value={form.salesTarget} onChange={(value) => setForm({ ...form, salesTarget: value })} />
                <Field label="المصروفات الثابتة" type="number" min="0" value={form.fixedExpenses} onChange={(value) => setForm({ ...form, fixedExpenses: value })} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setIsOpen(false)}>إلغاء</Button>
                <Button type="submit" disabled={saving}>{saving ? "جارٍ الحفظ..." : "حفظ المحل"}</Button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><span>{label}</span><span className="font-medium text-white">{value}</span></div>;
}

function Field({ label, value, onChange, type = "text", min, required }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-2 text-sm text-slate-300">
      <span>{label}</span>
      <input type={type} min={min} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-cyan-500" />
    </label>
  );
}