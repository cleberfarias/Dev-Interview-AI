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
        <div className="min-h-screen fd-app-shell flex items-center justify-center px-6 text-fd-text-primary">
          <div className="fd-card-shell w-full max-w-lg p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-fd-accent">
              Monitoramento ativo
            </p>
            <h1 className="mt-4 font-display text-3xl font-black tracking-tight text-fd-text-primary">
              O app encontrou um erro inesperado.
            </h1>
            <p className="mt-3 text-sm leading-6 text-fd-text-secondary">
              O erro foi registrado para analise. Recarregue a pagina para tentar novamente.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="fd-btn-primary mt-6 inline-flex text-sm"
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
