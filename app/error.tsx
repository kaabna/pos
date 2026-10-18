"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-50">
      <div className="max-w-md rounded-2xl border border-rose-500/30 bg-slate-900 p-8 text-center">
        <p className="mb-3 text-xs text-rose-300">تنبيه النظام</p>
        <h1 className="text-2xl font-semibold text-white">حدث خطأ غير متوقع</h1>
        <p className="mt-3 text-sm text-slate-300">
          تعذر إكمال الطلب. يرجى المحاولة مرة أخرى.
        </p>
        <button
          onClick={() => reset()}
          className="mt-6 rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-400"
        >
          إعادة المحاولة
        </button>
      </div>
    </div>
  );
}
