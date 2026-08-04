import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  collapsed?: boolean;
}

export function ThemeToggle({ collapsed }: ThemeToggleProps) {
  const { t } = useTranslation("common");
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);

  const label = theme === "dark" ? t("theme.light") : t("theme.dark");

  return (
    <button
      onClick={toggleTheme}
      aria-label={
        theme === "dark" ? t("theme.switchToLight") : t("theme.switchToDark")
      }
      title={label}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-md text-[13px] font-medium",
        "text-text-secondary transition-colors duration-150",
        "hover:bg-surface-hover hover:text-text-primary",
        collapsed ? "justify-center px-0" : "px-2.5",
      )}
    >
      {theme === "dark" ? (
        <Sun size={17} aria-hidden="true" />
      ) : (
        <Moon size={17} aria-hidden="true" />
      )}
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  );
}
