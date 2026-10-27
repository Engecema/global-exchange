import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[GlobalExchange ErrorBoundary] Erro capturado no componente:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.hash = '#cliente';
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[300px] w-full flex items-center justify-center p-6 bg-[#0b0e11] text-[#eaecef]">
          <div className="bg-[#1e2329] border border-[#2f343b] rounded-xl p-6 sm:p-8 max-w-lg w-full text-center shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-xl bg-[#cf304a]/15 border border-[#cf304a]/30 text-[#cf304a] flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#f0b90b]">
                {this.props.fallbackTitle || 'Estabilidade Restaurada · Global Exchange'}
              </h3>
              <p className="text-xs text-[#848e9c] mt-1.5 leading-relaxed">
                Um ajuste na renderização foi contido preventivamente para assegurar a sustentabilidade e segurança da sessão da carteira.
              </p>
              {this.state.error?.message && (
                <div className="mt-3 p-2 bg-[#0b0e11] rounded border border-[#2f343b] text-[11px] font-mono text-[#848e9c] text-left overflow-x-auto">
                  {this.state.error.message}
                </div>
              )}
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded-lg transition flex items-center gap-1.5 shadow"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Atualizar Página
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="px-4 py-2 bg-[#2b3139] hover:bg-[#383f4a] text-[#eaecef] font-semibold text-xs rounded-lg border border-[#474d57] transition flex items-center gap-1.5"
              >
                <Home className="w-3.5 h-3.5" />
                Ir para Início
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
export default ErrorBoundary;
