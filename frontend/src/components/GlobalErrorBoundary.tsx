import React from "react";

import { reportClientError } from "../shared/services/clientTelemetry";

type GlobalErrorBoundaryProps = {
  children: React.ReactNode;
};

type GlobalErrorBoundaryState = {
  hasError: boolean;
};

export class GlobalErrorBoundary extends React.Component<
  GlobalErrorBoundaryProps,
  GlobalErrorBoundaryState
> {
  declare props: Readonly<GlobalErrorBoundaryProps>;

  state: GlobalErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): GlobalErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    reportClientError({
      kind: "react.error_boundary",
      message: error.message || "React render failure",
      stack: error.stack,
      componentStack: info.componentStack,
      metadata: {
        name: error.name,
      },
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
          <div className="w-full max-w-lg rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/60">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">
              Monitoramento ativo
            </p>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white">
              O app encontrou um erro inesperado.
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-300">
              O erro foi registrado para analise. Recarregue a pagina para tentar novamente.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-6 inline-flex items-center justify-center rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
            >
              Recarregar agora
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
