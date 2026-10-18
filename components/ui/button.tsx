import * as React from "react";

import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}

const variantClasses = {
  default:
    "bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-sm shadow-cyan-500/20",
  secondary:
    "bg-slate-800 text-slate-50 hover:bg-slate-700 border border-slate-700",
  outline:
    "border border-slate-700 bg-transparent text-slate-100 hover:bg-slate-800",
  ghost: "text-slate-100 hover:bg-slate-800/80",
};

const sizeClasses = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

export function Button({
  className,
  variant = "default",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400/60 disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
