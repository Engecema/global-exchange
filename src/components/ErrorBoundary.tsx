import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, Home, ShieldCheck } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  autoRecoverAttempts: number;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    autoRecoverAttempts: 0,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[GlobalExchange ErrorBoundary] Erro capturado no componente:', error, errorInfo);

    // Auto-recuperação transparente para erros comuns de extensões de tradução do navegador (insertBefore / removeChild)
    const msg = error?.message || '';
    if (
      (msg.includes('insertBefore') || msg.includes('removeChild') || msg.includes('Node')) &&
      this.state.autoRecoverAttempts < 2
    ) {
      setTimeout(() => {
        this.setState((prev) => ({
          hasError: false,
          error: null,
          autoRecoverAttempts: prev.autoRecoverAttempts + 1,
        }));
      }, 100);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, autoRecoverAttempts: 0 });
    if (this.props.onReset) {
      this.props.onReset();
    } else {
      window.location.reload();
    }
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null, autoRecoverAttempts: 0 });
    try {
      sessionStorage.setItem('gx_tab_view', 'client');
      window.location.hash = '#cliente';
    } catch {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[280px] w-full flex items-center justify-center p-4 bg-[#0b0e11] text-[#eaecef] notranslate" translate="no">
          <div className="bg-[#1e2329] border border-[#2f343b] rounded-xl p-6 sm:p-8 max-w-lg w-full text-center shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-xl bg-[#02c076]/15 border border-[#02c076]/30 text-[#02c076] flex items-center justify-center mx-auto">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-[#f0b90b]">
                {this.props.fallbackTitle || 'Global Exchange · Sessão Segura'}
              </h3>
              <p className="text-xs text-[#848e9c] mt-1.5 leading-relaxed">
                A sessão da sua carteira foi preservada com segurança. Clique abaixo para restabelecer os dados da tela instantaneamente.
              </p>
              {this.state.error?.message && (
                <div className="mt-3 p-2.5 bg-[#0b0e11] rounded border border-[#2f343b] text-[11px] font-mono text-[#848e9c] text-left overflow-x-auto">
                  {this.state.error.message}
                </div>
              )}
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="px-4 py-2 bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs rounded-lg transition flex items-center gap-1.5 shadow cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Atualizar Painel
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="px-4 py-2 bg-[#2b3139] hover:bg-[#383f4a] text-[#eaecef] font-semibold text-xs rounded-lg border border-[#474d57] transition flex items-center gap-1.5 cursor-pointer"
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
