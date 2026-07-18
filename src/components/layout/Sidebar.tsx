import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUIStore } from "@/stores/uiStore";
import { useLiveStore } from "@/stores/liveStore";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Radio, List, BarChart3, Settings, User, Gamepad2, Users, Dumbbell } from "lucide-react";

const navItems = [
  { path: "/", labelKey: "sidebar.live", icon: Radio },
  { path: "/history", labelKey: "sidebar.history", icon: List },
  { path: "/analytics", labelKey: "sidebar.analytics", icon: BarChart3 },
  { path: "/players", labelKey: "sidebar.players", icon: Users },
  { path: "/pro-configs", labelKey: "sidebar.proConfigs", icon: Gamepad2 },
  { path: "/training-packs", labelKey: "sidebar.trainingPacks", icon: Dumbbell },
  { path: "/profile", labelKey: "sidebar.profile", icon: User },
  { path: "/settings", labelKey: "sidebar.settings", icon: Settings },
];

export function Sidebar() {
  const { t } = useTranslation("common");
  const expanded = useUIStore((state) => state.sidebarExpanded);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const connectionStatus = useLiveStore((state) => state.connectionStatus);
  const currentMatch = useLiveStore((state) => state.currentMatch);

  const isLive = connectionStatus === "connected" && currentMatch !== null;

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-border-highlight/40 bg-bg-surface/80 backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] relative z-30 shadow-[var(--shadow-card-inner)]",
        expanded ? "w-64" : "w-[72px]"
      )}
    >
      {/* Edge highlight line */}
      <div className="absolute top-0 bottom-0 right-0 w-[1px] bg-gradient-to-b from-border-highlight/0 via-border-highlight/40 to-border-highlight/0" />

      {/* Logo / Brand */}
      <div className="flex h-16 items-center border-b border-border-highlight/30 px-3">
        <button
          onClick={toggleSidebar}
          className={cn(
            "group flex items-center gap-3 rounded-lg px-2 py-2 transition-all duration-300",
            "hover:bg-bg-panel shadow-sm",
            !expanded && "w-full justify-center"
          )}
          aria-label={expanded ? t("sidebar.collapse") : t("sidebar.expand")}
        >
          {/* App Icon */}
          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border-highlight shadow-[var(--shadow-card-inner)]">
            <div className="absolute inset-0 bg-gradient-to-br from-accent-primary to-accent-secondary opacity-20 group-hover:opacity-40 transition-opacity duration-300" />
            <img
              src="/src-tauri/icons/128x128.png"
              alt={t("brand.name")}
              className="h-full w-full object-cover relative z-10"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
                const parent = target.parentElement;
                if (parent) {
                  parent.classList.add(
                    "bg-gradient-to-br",
                    "from-accent-primary",
                    "to-accent-secondary"
                  );
                  parent.innerHTML = `<span class="text-sm font-display font-bold text-white tracking-tight z-10 relative">${t("brand.short")}</span>`;
                }
              }}
            />
          </div>
          {expanded && (
            <span className="text-base font-display font-bold text-text-primary tracking-tight whitespace-nowrap">
              {t("brand.name")}
            </span>
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
        {navItems.map((item) => {
          const isLiveItem = item.path === "/";
          return (
            <NavLink
              key={item.path}
              to={item.path}
              data-tour={`nav-${item.path === "/" ? "live" : item.path.slice(1)}`}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-3 rounded-xl px-3 py-3 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  isActive
                    ? "bg-accent-primary-subtle text-accent-primary shadow-[var(--shadow-card-inner)] border border-accent-primary/20"
                    : "text-text-secondary hover:bg-bg-panel hover:text-text-primary border border-transparent",
                  !expanded && "justify-center px-2"
                )
              }
              aria-label={t(item.labelKey)}
            >
              {({ isActive }) => (
                <>
                  <div className="relative flex h-5 w-5 items-center justify-center shrink-0">
                    <item.icon
                      size={20}
                      className={cn(
                        "transition-transform duration-300",
                        isActive && "scale-110 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                      )}
                    />
                    {isLiveItem && isLive && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-success opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-success shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                      </span>
                    )}
                  </div>
                  {expanded && (
                    <span
                      className={cn(
                        "text-sm font-semibold transition-colors tracking-wide whitespace-nowrap",
                        isActive ? "text-accent-primary" : ""
                      )}
                    >
                      {t(item.labelKey)}
                    </span>
                  )}
                  {/* Active indicator pill */}
                  {!expanded && isActive && (
                    <span className="absolute -left-3 top-1/2 h-6 w-[4px] -translate-y-1/2 rounded-r-full bg-accent-primary shadow-[0_0_12px_rgba(59,130,246,0.8)]" />
                  )}
                  {expanded && isActive && (
                    <span className="absolute -left-3 top-1/2 h-6 w-[4px] -translate-y-1/2 rounded-r-full bg-accent-primary shadow-[0_0_12px_rgba(59,130,246,0.8)]" />
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-border-highlight/30 px-3 py-4">
        <ThemeToggle collapsed={!expanded} />
      </div>
    </aside>
  );
}
