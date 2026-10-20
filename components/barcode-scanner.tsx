"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Camera, X } from "lucide-react";

type DetectedCode = { rawValue: string };
type Detector = { detect: (source: HTMLVideoElement) => Promise<DetectedCode[]> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

declare global {
  interface Window {
    BarcodeDetector?: DetectorConstructor;
  }
}

export function BarcodeScanner({ onDetected, onClose }: { onDetected: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState("جارٍ تهيئة الكاميرا...");
  const handleDetected = useEffectEvent(onDetected);
  const handleClose = useEffectEvent(onClose);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;

    async function startScanner() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage("الكاميرا غير مدعومة في هذا المتصفح. أدخل الرمز يدويًا.");
        return;
      }
      if (!window.BarcodeDetector) {
        setMessage("ماسح الكاميرا غير مدعوم في هذا المتصفح. أدخل الرمز يدويًا.");
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setMessage("وجّه الكاميرا نحو الرمز.");
        const detector = new window.BarcodeDetector({ formats: ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e"] });

        const scan = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes[0]?.rawValue;
            if (value) {
              handleDetected(value);
              handleClose();
              return;
            }
          } catch {
            setMessage("تعذر قراءة الرمز. قرّب الكاميرا أو أدخله يدويًا.");
          }
          frame = window.requestAnimationFrame(() => { void scan(); });
        };
        frame = window.requestAnimationFrame(() => { void scan(); });
      } catch {
        setMessage("تعذر الوصول إلى الكاميرا. اسمح باستخدامها أو أدخل الرمز يدويًا.");
      }
    }

    void startScanner();
    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 p-4" role="presentation">
      <section role="dialog" aria-modal="true" aria-labelledby="scanner-title" className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-900 p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="scanner-title" className="flex items-center gap-2 font-semibold text-white"><Camera size={18} /> مسح الرمز</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق الماسح" className="rounded p-2 text-slate-300 hover:bg-slate-800"><X size={18} /></button>
        </div>
        <video ref={videoRef} className="aspect-video w-full rounded-lg bg-black object-cover" muted playsInline />
        <p aria-live="polite" className="mt-3 text-sm text-slate-300">{message}</p>
      </section>
    </div>
  );
}