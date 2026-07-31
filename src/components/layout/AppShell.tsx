import { useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { ToastContainer } from "@/components/ui/Toast";
import { useUIStore } from "@/stores/uiStore";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();

  useUIStore.getState().setActivePage(location.pathname);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-base relative text-text-primary selection:bg-accent-primary-subtle">
      {/* Immersive background glow effects */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden mix-blend-screen opacity-40 dark:opacity-100">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-accent-primary/10 blur-[120px]" />
        <div className="absolute top-[60%] -right-[10%] w-[40%] h-[40%] rounded-full bg-accent-secondary/10 blur-[120px]" />
      </div>

      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden relative z-10">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 relative">
          <div className="mx-auto max-w-[1400px] animate-fade-in">{children}</div>
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
