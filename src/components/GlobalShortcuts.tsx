import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Modal } from "@/components/ui/Modal";
import { Keyboard } from "lucide-react";

const ROUTE_BY_NUMBER: Record<string, string> = {
  "1": "/",
  "2": "/history",
  "3": "/analytics",
  "4": "/players",
  "5": "/settings",
};

/**
 * Global keyboard shortcuts plus the `?` cheat sheet.
 *
 * Shortcuts are ignored while the user is typing in a form control so they
 * never steal keystrokes from a search box.
 */
export function GlobalShortcuts() {
  const navigate = useNavigate();
  const { t } = useTranslation(["common"]);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (event.ctrlKey || event.metaKey) {
        if (event.key === ",") {
          event.preventDefault();
          navigate("/settings");
          return;
        }
        const route = ROUTE_BY_NUMBER[event.key];
        if (route) {
          event.preventDefault();
          navigate(route);
        }
        return;
      }

      if (isTyping) return;

      if (event.key === "?") {
        event.preventDefault();
        setHelpOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  const rows: { keys: string; label: string }[] = [
    { keys: "Ctrl + K", label: t("common:shortcuts.commandPalette") },
    { keys: "Ctrl + 1", label: t("common:shortcuts.live") },
    { keys: "Ctrl + 2", label: t("common:shortcuts.history") },
    { keys: "Ctrl + 3", label: t("common:shortcuts.analytics") },
    { keys: "Ctrl + 4", label: t("common:shortcuts.players") },
    { keys: "Ctrl + 5", label: t("common:shortcuts.settings") },
    { keys: "Ctrl + ,", label: t("common:shortcuts.settings") },
    { keys: "J / K", label: t("common:shortcuts.historyNavigate") },
    { keys: "?", label: t("common:shortcuts.help") },
    { keys: "Esc", label: t("common:shortcuts.close") },
  ];

  return (
    <Modal
      isOpen={helpOpen}
      onClose={() => setHelpOpen(false)}
      title={t("common:shortcuts.title")}
      description={t("common:shortcuts.description")}
      size="sm"
    >
      <ul className="divide-y divide-border-subtle/60">
        {rows.map((row) => (
          <li key={`${row.keys}-${row.label}`} className="flex items-center justify-between gap-4 py-2">
            <span className="flex items-center gap-2 text-xs text-text-secondary">
              <Keyboard size={13} className="text-text-muted" aria-hidden="true" />
              {row.label}
            </span>
            <kbd className="rounded border border-border-subtle bg-bg-base px-2 py-0.5 font-mono text-[10px] text-text-secondary">
              {row.keys}
            </kbd>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
