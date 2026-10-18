import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-50">
      <div className="max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
        <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">404</p>
        <h1 className="mt-4 text-2xl font-semibold text-white">الصفحة غير موجودة</h1>
        <p className="mt-3 text-sm text-slate-300">
          المسار المطلوب غير موجود في مساحة المتجر الحالية.
        </p>
        <Link href="/" className="mt-6 inline-flex rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-cyan-400">
          العودة إلى البداية
        </Link>
      </div>
    </div>
  );
}
