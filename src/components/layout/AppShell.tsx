import { useEffect } from "react";
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
  const setActivePage = useUIStore((state) => state.setActivePage);

  // Was called inline during render, which mutated the store mid-render.
  useEffect(() => {
    setActivePage(location.pathname);
  }, [location.pathname, setActivePage]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-bg-base text-text-primary">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1360px] px-6 py-6">{children}</div>
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}
