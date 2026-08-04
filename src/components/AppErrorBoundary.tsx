import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportFrontendError } from "@/lib/api";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void reportFrontendError(error.message, `${error.stack ?? ""}\n${info.componentStack}`).catch(
      () => undefined,
    );
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="flex min-h-screen items-center justify-center bg-bg-base p-8 text-text-primary">
        <section className="w-full max-w-lg rounded-2xl border border-accent-danger/30 bg-bg-panel p-8 shadow-2xl">
          <p className="mb-2 text-xs font-bold tracking-[0.22em] text-accent-danger">
            Recuperación segura
          </p>
          <h1 className="font-display text-2xl font-bold">La interfaz tuvo un problema</h1>
          <p className="mt-3 text-sm leading-6 text-text-secondary">
            Tus partidas guardadas no fueron borradas. Registramos el error para poder
            diagnosticarlo y podés recargar la interfaz sin cerrar el proceso de seguimiento.
          </p>
          <details className="mt-5 rounded-lg border border-border-subtle bg-bg-base p-3 text-xs text-text-muted">
            <summary className="cursor-pointer font-semibold text-text-secondary">
              Detalle técnico
            </summary>
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap">
              {this.state.error.message}
            </pre>
          </details>
          <button
            type="button"
            className="mt-6 w-full rounded-xl bg-accent-primary px-4 py-3 text-sm font-bold text-white transition hover:brightness-110"
            onClick={() => window.location.reload()}
          >
            Recargar interfaz
          </button>
        </section>
      </main>
    );
  }
}
