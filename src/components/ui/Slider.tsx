import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "@/lib/utils";

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

/** Single-thumb slider built on Radix. */
export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  className,
  ...rest
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      className={cn(
        "relative flex h-5 w-full touch-none select-none items-center",
        disabled && "opacity-50",
        className
      )}
      value={[value]}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onValueChange={(next) => onChange(next[0] ?? value)}
      aria-label={rest["aria-label"]}
    >
      <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-bg-elevated">
        <SliderPrimitive.Range className="absolute h-full bg-accent-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className="block h-3.5 w-3.5 rounded-full border-2 border-accent-primary bg-bg-base shadow-level-1 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/60"
        aria-label={rest["aria-label"]}
      />
    </SliderPrimitive.Root>
  );
}
