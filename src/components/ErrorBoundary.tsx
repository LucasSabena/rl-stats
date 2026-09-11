import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
  title?: string;
  description?: string;
  retryLabel?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Route-level error boundary. Intentionally router-free so it can wrap any
 * `<Route element>` without hooks breaking the router context.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    const {
      children,
      fallback,
      title = "Algo salió mal",
      description,
      retryLabel = "Reintentar",
    } = this.props;
    const { error } = this.state;

    if (!error) return children;
    if (fallback) return fallback;

    return (
      <div className="flex min-h-[320px] w-full items-center justify-center p-6">
        <div className="w-full max-w-md rounded-lg border border-border-subtle bg-bg-surface p-6 text-center shadow-level-2">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-accent-danger/10 text-accent-danger">
            <AlertTriangle size={20} aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-[15px] font-semibold text-text-primary">
            {title}
          </h2>
          <p className="mt-2 break-words text-[13px] leading-relaxed text-text-secondary">
            {description ?? (error.message || "Ocurrió un error inesperado.")}
          </p>
          <Button className="mt-5" onClick={this.handleReset}>
            {retryLabel}
          </Button>
        </div>
      </div>
    );
  }
}
