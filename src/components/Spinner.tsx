import React from "react";
import { cn } from "@/lib/utils";

type SpinnerSize = "sm" | "md" | "lg";
type SpinnerVariant = "default" | "muted" | "inverted";

interface SpinnerProps {
  size?: SpinnerSize;
  variant?: SpinnerVariant;
  className?: string;
  label?: string;
}

const sizeToClasses: Record<SpinnerSize, string> = {
  sm: "h-5 w-5 border-2",
  md: "h-8 w-8 border-2",
  lg: "h-12 w-12 border-2",
};

const variantToClasses: Record<SpinnerVariant, string> = {
  default: "border-primary/20 border-t-primary",
  muted: "border-foreground/20 border-t-foreground/60",
  inverted: "border-white/30 border-t-white",
};

export function Spinner({ size = "md", variant = "default", className, label }: SpinnerProps) {
  return (
    <div className={cn("inline-flex items-center gap-3", className)} role="status" aria-live="polite">
      <span
        className={cn(
          "animate-spin rounded-full",
          sizeToClasses[size],
          variantToClasses[variant]
        )}
      />
      {label ? <span className="text-sm text-muted-foreground">{label}</span> : null}
    </div>
  );
}

export default Spinner;


