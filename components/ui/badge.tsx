import * as React from "react";

import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-slate-800 text-slate-200 ring-1 ring-slate-700",
  success: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30",
  warning: "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30",
  danger: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/30",
  info: "bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/30",
};

export function Badge({ variant = "default", className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
