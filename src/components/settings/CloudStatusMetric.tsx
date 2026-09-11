import { cn } from "@/lib/utils";

interface CloudStatusMetricProps {
  label: string;
  value: string | number;
  danger?: boolean;
}

export function CloudStatusMetric({
  label,
  value,
  danger = false,
}: CloudStatusMetricProps) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-base/70 px-3 py-2">
      <p className="text-[10px] tracking-wide text-text-muted">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 font-semibold text-text-primary",
          danger && "text-accent-danger",
        )}
      >
        {value}
      </p>
    </div>
  );
}
