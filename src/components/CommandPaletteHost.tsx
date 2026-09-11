import { useEffect, useState } from "react";
import { CommandPalette } from "@/components/CommandPalette";

/**
 * Owns the palette open state and the global Ctrl/Cmd+K shortcut so the
 * palette itself stays a controlled, testable component.
 */
export function CommandPaletteHost() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return <CommandPalette isOpen={isOpen} onClose={() => setIsOpen(false)} />;
}
