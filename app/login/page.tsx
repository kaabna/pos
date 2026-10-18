"use client";

import { AlertCircle, ArrowRight, Lock, ShieldCheck, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseClient } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const supabase = getSupabaseClient();
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) throw authError;

      const user = authData.user;
      if (!user) {
        throw new Error("لم يتم العثور على حساب مستخدم صالح.");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile) {
        throw new Error("لا يوجد ملف شخصي مرتبط بهذا الحساب. الرجاء إكمال إعداد الحساب.");
      }

      if (profile.role === "owner" || profile.role === "admin") {
        router.push("/stores");
        return;
      }

      if (profile.role !== "employee") {
        throw new Error("صلاحية الحساب غير معروفة.");
      }

      const { data: memberData, error: memberError } = await supabase
        .from("store_members")
        .select("store_id, permissions")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (memberError) throw memberError;
      if (!memberData) {
        throw new Error("هذا الحساب غير مرتبط بأي متجر.");
      }

      const permittedModules = Array.isArray(memberData.permissions) ? memberData.permissions : [];
      const firstModule = ["pos", "inventory", "repairs", "tasks", "roadmap"].find((module) =>
        permittedModules.includes(module),
      );
      router.push(firstModule ? `/s/${memberData.store_id}/${firstModule}` : `/s/${memberData.store_id}`);
    } catch (caught) {
      const errorMessage = caught instanceof Error ? caught.message : "";
      const message = ["صلاحية", "هذا الحساب", "لا يوجد"].some((prefix) => errorMessage.startsWith(prefix))
        ? errorMessage
        : "تعذر تسجيل الدخول. تحقق من البريد الإلكتروني وكلمة المرور ثم حاول مجددًا.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 font-sans" dir="rtl">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-300 shadow-lg ring-1 ring-cyan-500/30">
            <ShieldCheck size={32} />
          </div>
          <h1 className="text-2xl font-bold tracking-wider text-white">سبيشل موبايل - نظام الإدارة</h1>
          <p className="mt-1 text-xs text-slate-400">نظام نقاط البيع وإدارة الصيانة</p>
        </div>

        <Card className="border-slate-800 bg-slate-900 text-slate-100 shadow-2xl">
          <CardHeader>
            <CardTitle className="text-center text-xl font-bold text-white">تسجيل الدخول</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error ? (
                <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{error}</span>
                </div>
              ) : null}

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300">البريد الإلكتروني</label>
                <div className="relative">
                  <User className="absolute right-3 top-3 h-4 w-4 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="أدخل بريدك الإلكتروني"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 pr-10 pl-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-slate-300">كلمة المرور</label>
                <div className="relative">
                  <Lock className="absolute right-3 top-3 h-4 w-4 text-slate-500" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 pr-10 pl-3 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 font-bold text-slate-950 transition-all hover:bg-cyan-400"
                >
                  {isLoading ? "جاري التحقق..." : "دخول آمن"}
                  <ArrowRight size={16} />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
