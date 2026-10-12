import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        {
          "bg-surface-3 text-ink-2": variant === "default",
          "bg-mint-dim text-mint": variant === "success",
          "bg-amber-dim text-amber": variant === "warning",
          "bg-rose-dim text-rose": variant === "danger",
          "bg-sky-dim text-sky": variant === "info",
        },
        className
      )}
    >
      {children}
    </span>
  );
}
