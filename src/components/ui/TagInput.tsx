import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
  maxTags?: number;
  "aria-label"?: string;
}

/**
 * Free-form tag editor: Enter or comma commits, Backspace on an empty input
 * removes the last tag, click selects nothing (tags are removed explicitly).
 */
export function TagInput({
  value,
  onChange,
  placeholder,
  className,
  maxTags = 20,
  ...rest
}: TagInputProps) {
  const { t } = useTranslation("common");
  const [draft, setDraft] = useState("");

  const commit = (raw: string) => {
    const tag = raw.trim().replace(/,$/, "").trim();
    if (!tag) return;
    if (value.some((v) => v.toLowerCase() === tag.toLowerCase())) {
      setDraft("");
      return;
    }
    if (value.length >= maxTags) return;
    onChange([...value, tag]);
    setDraft("");
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 focus-within:border-accent-primary",
        className
      )}
    >
      {value.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded-full bg-bg-elevated px-2 py-0.5 text-xs text-text-secondary"
        >
          {tag}
          <button
            type="button"
            onClick={() => onChange(value.filter((v) => v !== tag))}
            aria-label={t("tagInput.remove", { tag })}
            className="rounded-full p-0.5 text-text-tertiary transition-colors hover:text-accent-danger"
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        aria-label={rest["aria-label"] ?? t("tagInput.label")}
        placeholder={value.length === 0 ? placeholder : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => commit(draft)}
        className="min-w-[80px] flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
      />
    </div>
  );
}
