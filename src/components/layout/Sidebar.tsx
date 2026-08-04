import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Dumbbell,
  Gamepad2,
  List,
  PanelLeftClose,
  PanelLeftOpen,
  Radio,
  Settings,
  User,
  Users,
} from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import { useLiveStore } from "@/stores/liveStore";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Logo } from "@/components/ui/Logo";

interface NavItem {
  path: string;
  labelKey: string;
  icon: typeof Radio;
}

/**
 * Destinations are grouped by intent rather than listed flat: what's
 * happening now, what already happened, and what helps you improve.
 */
const NAV_GROUPS: { labelKey: string | null; items: NavItem[] }[] = [
  {
    labelKey: null,
    items: [{ path: "/", labelKey: "sidebar.live", icon: Radio }],
  },
  {
    labelKey: "sidebar.groups.data",
    items: [
      { path: "/history", labelKey: "sidebar.history", icon: List },
      { path: "/analytics", labelKey: "sidebar.analytics", icon: BarChart3 },
      { path: "/players", labelKey: "sidebar.players", icon: Users },
    ],
  },
  {
    labelKey: "sidebar.groups.improve",
    items: [
      {
        path: "/training-packs",
        labelKey: "sidebar.trainingPacks",
        icon: Dumbbell,
      },
      { path: "/pro-configs", labelKey: "sidebar.proConfigs", icon: Gamepad2 },
    ],
  },
];

const FOOTER_ITEMS: NavItem[] = [
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

  const renderItem = (item: NavItem) => {
    const showLiveDot = item.path === "/" && isLive;

    return (
      <NavLink
        key={item.path}
        to={item.path}
        title={!expanded ? t(item.labelKey) : undefined}
        data-tour={`nav-${item.path === "/" ? "live" : item.path.slice(1)}`}
        className={({ isActive }) =>
          cn(
            "relative flex h-9 items-center gap-2.5 rounded-md text-[13px] font-medium",
            "transition-colors duration-150",
            expanded ? "px-2.5" : "justify-center px-0",
            isActive
              ? "bg-accent-primary-subtle text-accent-primary"
              : "text-text-secondary hover:bg-surface-hover hover:text-text-primary",
          )
        }
      >
        <span className="relative flex shrink-0 items-center justify-center">
          <item.icon size={17} aria-hidden="true" />
          {showLiveDot && (
            <span
              aria-hidden="true"
              className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-accent-success"
            />
          )}
        </span>
        {expanded && <span className="truncate">{t(item.labelKey)}</span>}
      </NavLink>
    );
  };

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-border-subtle bg-bg-surface",
        "transition-[width] duration-200 ease-[var(--ease-out-quint)]",
        expanded ? "w-[228px]" : "w-[60px]",
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "flex h-14 items-center gap-2.5 border-b border-border-subtle",
          expanded ? "px-3" : "justify-center px-0",
        )}
      >
        <Logo size={26} className="rounded-md" />
        {expanded && (
          <span className="truncate text-[15px] font-semibold tracking-tight text-text-primary">
            {t("brand.name")}
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((group, index) => (
          <div key={group.labelKey ?? "primary"} className={cn(index > 0 && "mt-5")}>
            {expanded && group.labelKey && (
              <p className="mb-1 px-2.5 text-[11px] font-medium text-text-tertiary">
                {t(group.labelKey)}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {group.items.map(renderItem)}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="flex flex-col gap-0.5 border-t border-border-subtle px-2 py-2">
        {FOOTER_ITEMS.map(renderItem)}
        <ThemeToggle collapsed={!expanded} />
        <button
          onClick={toggleSidebar}
          aria-label={expanded ? t("sidebar.collapse") : t("sidebar.expand")}
          title={expanded ? t("sidebar.collapse") : t("sidebar.expand")}
          className={cn(
            "flex h-9 items-center gap-2.5 rounded-md text-[13px] font-medium",
            "text-text-tertiary transition-colors duration-150",
            "hover:bg-surface-hover hover:text-text-primary",
            expanded ? "px-2.5" : "justify-center px-0",
          )}
        >
          {expanded ? (
            <PanelLeftClose size={17} aria-hidden="true" />
          ) : (
            <PanelLeftOpen size={17} aria-hidden="true" />
          )}
          {expanded && <span>{t("sidebar.collapse")}</span>}
        </button>
      </div>
    </aside>
  );
}
