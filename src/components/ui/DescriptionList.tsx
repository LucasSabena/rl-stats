import { cn } from "@/lib/utils";

export interface DescriptionListItem {
  label: React.ReactNode;
  value: React.ReactNode;
}

interface DescriptionListProps {
  items: DescriptionListItem[];
  dense?: boolean;
  className?: string;
}

export function DescriptionList({
  items,
  dense = false,
  className,
}: DescriptionListProps) {
  return (
    <dl className={cn("grid", dense ? "gap-y-1.5" : "gap-y-3", className)}>
      {items.map((item, index) => (
        <div
          key={index}
          className="grid grid-cols-[minmax(6rem,9rem)_1fr] items-baseline gap-x-4"
        >
          <dt
            className={cn(
              "font-medium text-text-muted",
              dense ? "text-[11px]" : "text-xs",
            )}
          >
            {item.label}
          </dt>
          <dd
            className={cn(
              "text-text-primary",
              dense ? "text-[13px]" : "text-sm",
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
