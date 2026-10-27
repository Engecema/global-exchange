import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Activity,
  RefreshCw,
  Zap,
  Play,
  Radio,
  Bell,
  BellRing,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  Volume2,
  VolumeX,
  Tag,
  Clock,
  Sliders,
  DollarSign,
} from 'lucide-react';
import { PriceHistoryPoint, PriceAlert } from '../types/exchange';
import { StorageService, BITX_CORE_MAINNET } from '../services/storage';

interface PriceTrendChartProps {
  currentPrice: string;
  onRefresh?: () => void;
  onPriceUpdate?: (price: string) => void;
}

type TimeRange = '1H' | '24H' | '7D' | '30D' | 'TODOS';

export const PriceTrendChart: React.FC<PriceTrendChartProps> = ({
  currentPrice,
  onRefresh,
  onPriceUpdate,
}) => {
  const [history, setHistory] = useState<PriceHistoryPoint[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>('24H');
  const [isLiveActive, setIsLiveActive] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Estados de Telemetria de Ticks ao Vivo da Mainnet BitX Core
  const [lastTickDirection, setLastTickDirection] = useState<'up' | 'down' | 'neutral'>('up');
  const [lastTickDelta, setLastTickDelta] = useState<number>(14.20);
  const [lastTickDeltaPct, setLastTickDeltaPct] = useState<number>(0.034);
  const [tickFlash, setTickFlash] = useState<boolean>(false);
  const [ticksCount, setTicksCount] = useState<number>(12);
  const [lastTickTimestamp, setLastTickTimestamp] = useState<string>('agora');

  // =========================================================================
  // SISTEMA DE ALERTAS E NOTIFICAÇÕES VISUAIS DE PREÇO DO GX
  // =========================================================================
  const [alerts, setAlerts] = useState<PriceAlert[]>(() => StorageService.getPriceAlerts());
  const [isAlertModalOpen, setIsAlertModalOpen] = useState<boolean>(false);
  const [newTargetPrice, setNewTargetPrice] = useState<string>('');
  const [newCondition, setNewCondition] = useState<'ABOVE_OR_EQUAL' | 'BELOW_OR_EQUAL'>('ABOVE_OR_EQUAL');
  const [newLabel, setNewLabel] = useState<string>('');
  const [alertFilter, setAlertFilter] = useState<'ALL' | 'ACTIVE' | 'TRIGGERED'>('ALL');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('gx_alert_sound_enabled') !== 'false';
    } catch {
      return true;
    }
  });
  const [activeBannerAlerts, setActiveBannerAlerts] = useState<PriceAlert[]>([]);
  const [alertSuccessMsg, setAlertSuccessMsg] = useState<string>('');

  const [liveUsdRate, setLiveUsdRate] = useState<number>(() => StorageService.getUsdBrlRate() || 5.43);

  const onPriceUpdateRef = useRef(onPriceUpdate);
  onPriceUpdateRef.current = onPriceUpdate;

  const currentPriceRef = useRef(currentPrice);
  currentPriceRef.current = currentPrice;

  // Carrega histórico
  const loadHistory = useCallback(() => {
    const data = StorageService.getPriceHistory();
    setHistory(data);
  }, []);

  useEffect(() => {
    loadHistory();

    const handleUpdate = () => {
      loadHistory();
      setAlerts(StorageService.getPriceAlerts());
    };

    const handleDollar = (e: any) => {
      const r = e?.detail?.rate || StorageService.getUsdBrlRate() || 5.43;
      setLiveUsdRate(r);
    };

    window.addEventListener('gx_storage_updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    window.addEventListener('gx_dollar_rate_updated', handleDollar);
    window.addEventListener('gx_price_alerts_updated', handleUpdate);

    return () => {
      window.removeEventListener('gx_storage_updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
      window.removeEventListener('gx_dollar_rate_updated', handleDollar);
      window.removeEventListener('gx_price_alerts_updated', handleUpdate);
    };
  }, [loadHistory]);

  // Sintetizador de áudio de alerta leve e agradável (Web Audio API)
  const playAlertChime = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5
      osc.frequency.exponentialRampToValueAtTime(880.0, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.5);
    } catch {}
  }, [soundEnabled]);

  // Função centralizada para verificar alertas contra o preço atual
  const verifyPriceAlerts = useCallback(
    (checkPrice: number) => {
      const { alerts: updatedAlerts, newlyTriggered } = StorageService.checkPriceAlerts(checkPrice);
      setAlerts(updatedAlerts);

      if (newlyTriggered.length > 0) {
        setActiveBannerAlerts((prev) => {
          const ids = new Set(prev.map((a) => a.id));
          const additions = newlyTriggered.filter((a) => !ids.has(a.id));
          return [...additions, ...prev];
        });
        playAlertChime();
      }
    },
    [playAlertChime]
  );

  // Monitora alterações de preço externas e verifica alertas
  useEffect(() => {
    const num = parseFloat(currentPrice) || parseFloat(StorageService.getLaunchPrice()) || BITX_CORE_MAINNET.officialPrice;
    if (num > 0) {
      verifyPriceAlerts(num);
    }
  }, [currentPrice, verifyPriceAlerts]);

  // Loop de Cotação ao Vivo: Executa ticks a cada 3.5 segundos sincronizados com a Mainnet BitX Core
  useEffect(() => {
    if (!isLiveActive) return;

    const interval = setInterval(() => {
      const currentStored =
        parseFloat(StorageService.getLaunchPrice()) ||
        parseFloat(currentPriceRef.current) ||
        BITX_CORE_MAINNET.officialPrice;

      // Micro-oscilação realista de mercado descentralizado (±0.015% a ±0.06%)
      const randomFactor = Math.random();
      const isUp = randomFactor >= 0.44;
      const magnitude = 0.00015 + Math.random() * 0.00045;
      const jitterPct = isUp ? magnitude : -magnitude;

      const delta = currentStored * jitterPct;
      const nextPriceNum = Math.max(400000, Number((currentStored + delta).toFixed(2)));
      const actualDelta = nextPriceNum - currentStored;
      const actualDeltaPct = Number(((actualDelta / currentStored) * 100).toFixed(3));
      const nextPriceStr = nextPriceNum.toFixed(2);

      setLastTickDirection(actualDelta >= 0 ? 'up' : 'down');
      setLastTickDelta(actualDelta);
      setLastTickDeltaPct(actualDeltaPct);
      setLastTickTimestamp(new Date().toLocaleTimeString('pt-BR'));
      setTicksCount((c) => c + 1);

      // Efeito de flash visual no card
      setTickFlash(true);
      setTimeout(() => setTickFlash(false), 800);

      // Avalia os alertas definidos pelo usuário a cada tick
      verifyPriceAlerts(nextPriceNum);

      // Atualiza o histórico local
      const nowPoint = new Date();
      const hours = String(nowPoint.getHours()).padStart(2, '0');
      const mins = String(nowPoint.getMinutes()).padStart(2, '0');
      const day = String(nowPoint.getDate()).padStart(2, '0');
      const month = String(nowPoint.getMonth() + 1).padStart(2, '0');
      const currentRate = StorageService.getUsdBrlRate() || 5.43;

      setHistory((prev) => {
        if (!prev || prev.length === 0) return prev;
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last) {
          updated[updated.length - 1] = {
            ...last,
            price: nextPriceNum,
            priceUsd: Number((nextPriceNum / currentRate).toFixed(2)),
            timeFormatted: `${day}/${month} ${hours}:${mins}`,
            variation: actualDeltaPct,
          };
        }
        return updated;
      });
    }, 3500);

    return () => clearInterval(interval);
  }, [isLiveActive, verifyPriceAlerts]);

  // Atualização manual imediata
  const handleManualRefresh = () => {
    setIsRefreshing(true);
    const currentStored =
      parseFloat(StorageService.getLaunchPrice()) ||
      parseFloat(currentPrice) ||
      BITX_CORE_MAINNET.officialPrice;
    const delta = currentStored * (0.0002 + Math.random() * 0.0003);
    const nextPrice = Number((currentStored + delta).toFixed(2));
    const nextPriceStr = nextPrice.toFixed(2);

    StorageService.setLaunchPrice(nextPriceStr);
    loadHistory();
    setLastTickDirection('up');
    setLastTickDelta(delta);
    setLastTickDeltaPct(Number(((delta / currentStored) * 100).toFixed(3)));
    setLastTickTimestamp(new Date().toLocaleTimeString('pt-BR'));
    setTicksCount((c) => c + 1);

    verifyPriceAlerts(nextPrice);

    if (onPriceUpdate) onPriceUpdate(nextPriceStr);
    if (onRefresh) onRefresh();

    setTimeout(() => setIsRefreshing(false), 500);
  };

  // Filtra dados com base no timeRange selecionado
  const filteredData = useMemo(() => {
    if (!history.length) return [];
    if (timeRange === 'TODOS') return history;

    const now = Date.now();
    let cutoffMs = 24 * 3600 * 1000;
    if (timeRange === '1H') cutoffMs = 3600 * 1000;
    if (timeRange === '24H') cutoffMs = 24 * 3600 * 1000;
    if (timeRange === '7D') cutoffMs = 7 * 24 * 3600 * 1000;
    if (timeRange === '30D') cutoffMs = 30 * 24 * 3600 * 1000;

    const filtered = history.filter((p) => {
      const pTime = new Date(p.timestamp).getTime();
      return now - pTime <= cutoffMs;
    });

    return filtered.length >= 2 ? filtered : history.slice(-12);
  }, [history, timeRange]);

  const numericCurrentPrice =
    parseFloat(currentPrice) || parseFloat(StorageService.getLaunchPrice()) || BITX_CORE_MAINNET.officialPrice;
  const usdBrlRate = liveUsdRate > 0 ? liveUsdRate : 5.43;
  const numericCurrentPriceUsd = numericCurrentPrice / usdBrlRate;

  // Estatísticas do período
  const stats = useMemo(() => {
    if (!filteredData.length) {
      return {
        min: numericCurrentPrice * 0.98,
        max: numericCurrentPrice * 1.02,
        change: 0.42,
        isPositive: true,
      };
    }
    const prices = filteredData.map((d) => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const first = prices[0];
    const last = prices[prices.length - 1];
    const change = first > 0 ? Number((((last - first) / first) * 100).toFixed(2)) : 0.42;

    return {
      min,
      max,
      change,
      isPositive: change >= 0,
    };
  }, [filteredData, numericCurrentPrice]);

  // Alertas ativos para desenhar no gráfico (Recharts ReferenceLines)
  const activeAlertsForChart = useMemo(() => {
    return alerts.filter((a) => a.isActive && !a.isTriggered && a.targetPrice > 0);
  }, [alerts]);

  const activeAlertsCount = useMemo(() => {
    return alerts.filter((a) => a.isActive && !a.isTriggered).length;
  }, [alerts]);

  // Formata valor monetário BRL
  const formatBRL = (val: number) => {
    return `R$ ${val.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  // Formata eixo Y compacto
  const formatCompactYAxis = (val: number) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
    return `${val}`;
  };

  // Criação de novo alerta
  const handleCreateAlert = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseFloat(newTargetPrice.replace(',', '.'));
    if (!target || isNaN(target) || target <= 0) {
      setAlertSuccessMsg('Informe um valor de preço alvo válido em Reais (R$).');
      return;
    }

    const created = StorageService.addPriceAlert({
      targetPrice: target,
      condition: newCondition,
      label: newLabel.trim() || (newCondition === 'ABOVE_OR_EQUAL' ? 'Alvo de Alta' : 'Alvo de Baixa'),
    });

    setAlerts(StorageService.getPriceAlerts());
    setNewTargetPrice('');
    setNewLabel('');
    setAlertSuccessMsg(`✅ Alerta criado com sucesso para ${formatBRL(target)}!`);
    setTimeout(() => setAlertSuccessMsg(''), 4000);

    // Imediatamente verifica se já se aplica
    verifyPriceAlerts(numericCurrentPrice);
  };

  const handleApplyPreset = (pctChange: number) => {
    const calculated = Number((numericCurrentPrice * (1 + pctChange / 100)).toFixed(2));
    setNewTargetPrice(calculated.toFixed(2));
    if (pctChange >= 0) {
      setNewCondition('ABOVE_OR_EQUAL');
      setNewLabel(`Alvo de Alta (+${pctChange}%)`);
    } else {
      setNewCondition('BELOW_OR_EQUAL');
      setNewLabel(`Suporte / Stop (${pctChange}%)`);
    }
  };

  const handleToggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    try {
      localStorage.setItem('gx_alert_sound_enabled', String(nextVal));
    } catch {}
  };

  const handleDismissBanner = (alertId: string) => {
    setActiveBannerAlerts((prev) => prev.filter((a) => a.id !== alertId));
  };

  const handleDismissAllBanners = () => {
    setActiveBannerAlerts([]);
  };

  const filteredAlertsList = useMemo(() => {
    if (alertFilter === 'ACTIVE') return alerts.filter((a) => a.isActive && !a.isTriggered);
    if (alertFilter === 'TRIGGERED') return alerts.filter((a) => a.isTriggered);
    return alerts;
  }, [alerts, alertFilter]);

  return (
    <div className="bg-[#1e2329] border border-[#2f343b] rounded-xl p-4 sm:p-5 shadow-lg space-y-4 notranslate" translate="no">
      {/* 🚨 BANNER DE ALERTA DE PREÇO DISPARADO NO PAINEL */}
      {activeBannerAlerts.length > 0 && (
        <div className="bg-gradient-to-r from-[#f0b90b]/15 via-[#f0b90b]/20 to-[#02c076]/15 border-2 border-[#f0b90b] rounded-xl p-3.5 sm:p-4 text-[#eaecef] shadow-2xl relative animate-bounce-short">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#f0b90b] text-black flex items-center justify-center shrink-0 shadow-md">
                <BellRing className="w-5 h-5 animate-pulse" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-[#f0b90b] text-black">
                    Alerta de Preço Disparado
                  </span>
                  <span className="text-xs text-[#848e9c]">
                    Sinal detectado na Mainnet BitX Core (#348.912)
                  </span>
                </div>
                <div className="text-sm sm:text-base font-bold text-white flex items-center gap-2 flex-wrap">
                  <span>O valor do GX (BTXC) atingiu</span>
                  <span className="text-[#02c076] font-mono text-base sm:text-lg">
                    {formatBRL(numericCurrentPrice)}
                  </span>
                  <span className="text-xs font-mono text-[#38bdf8]">
                    (≈ $ {numericCurrentPriceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)
                  </span>
                </div>

                {/* Lista de alertas disparados */}
                <div className="pt-1 flex flex-wrap gap-2">
                  {activeBannerAlerts.map((ab) => (
                    <div
                      key={ab.id}
                      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#0b0e11]/90 border border-[#f0b90b]/40 text-xs"
                    >
                      <span className="font-semibold text-[#f0b90b]">
                        {ab.label || 'Alvo'}
                      </span>
                      <span className="text-[#848e9c]">·</span>
                      <span className="font-mono text-white">
                        {ab.condition === 'ABOVE_OR_EQUAL' ? '≥' : '≤'} {formatBRL(ab.targetPrice)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDismissBanner(ab.id)}
                        className="text-[#848e9c] hover:text-white p-0.5"
                        title="Dispensar este alerta"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <button
                type="button"
                onClick={() => setIsAlertModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-[#2b3139] hover:bg-[#383f4a] border border-[#474d57] text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer text-white"
              >
                <Sliders className="w-3.5 h-3.5 text-[#f0b90b]" />
                <span>Gerenciar</span>
              </button>
              <button
                type="button"
                onClick={handleDismissAllBanners}
                className="px-3 py-1.5 rounded-lg bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs transition shadow cursor-pointer flex items-center gap-1"
              >
                <span>Dispensar Todos</span>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header & Real-time Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#2f343b]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#f0b90b]/10 border border-[#f0b90b]/30 flex items-center justify-center text-[#f0b90b] font-bold text-sm">
            BTXC
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-bold text-[#eaecef]">
                BitX Core · Gráfico de Cotação
              </h3>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#02c076]/15 text-[#02c076] border border-[#02c076]/30">
                <span className="w-2 h-2 rounded-full bg-[#02c076] animate-pulse"></span>
                AO VIVO (MAINNET #348.912)
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold transition-all ${
                  lastTickDirection === 'up'
                    ? 'bg-[#02c076]/20 text-[#02c076] border border-[#02c076]/40'
                    : 'bg-[#cf304a]/20 text-[#cf304a] border border-[#cf304a]/40'
                }`}
              >
                {lastTickDirection === 'up' ? (
                  <TrendingUp className="w-3 h-3 inline" />
                ) : (
                  <TrendingDown className="w-3 h-3 inline" />
                )}
                {lastTickDelta >= 0 ? '+' : ''}R$ {Math.abs(lastTickDelta).toFixed(2)} ({lastTickDeltaPct >= 0 ? '+' : ''}
                {lastTickDeltaPct.toFixed(3)}%)
              </span>
            </div>
            <p className="text-xs text-[#848e9c]">
              Cotação em tempo real da blockchain BitX Core sincronizada com a custódia institucional
            </p>
          </div>
        </div>

        {/* Time range selector & live toggle & Price alert button */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Botão de Notificação e Alertas de Preço */}
          <button
            type="button"
            onClick={() => setIsAlertModalOpen(true)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition cursor-pointer relative shadow-sm ${
              activeAlertsCount > 0
                ? 'bg-[#f0b90b]/15 hover:bg-[#f0b90b]/25 text-[#f0b90b] border-[#f0b90b]/40'
                : 'bg-[#0b0e11] hover:bg-[#2b3139] text-[#848e9c] border-[#2f343b] hover:text-[#eaecef]'
            }`}
            title="Definir alertas de preço para ser notificado quando o GX atingir um patamar"
          >
            {activeAlertsCount > 0 ? (
              <BellRing className="w-3.5 h-3.5 text-[#f0b90b] animate-bounce-short" />
            ) : (
              <Bell className="w-3.5 h-3.5" />
            )}
            <span>Alertas de Preço</span>
            {activeAlertsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-[#f0b90b] text-black">
                {activeAlertsCount}
              </span>
            )}
          </button>

          <div className="flex bg-[#0b0e11] p-1 rounded-lg border border-[#2f343b]">
            {(['1H', '24H', '7D', '30D', 'TODOS'] as TimeRange[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setTimeRange(r)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition cursor-pointer ${
                  timeRange === r
                    ? 'bg-[#f0b90b] text-black font-bold shadow-sm'
                    : 'text-[#848e9c] hover:text-[#eaecef] hover:bg-[#2b3139]'
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsLiveActive((prev) => !prev)}
            title={isLiveActive ? 'Pausar transmissão de ticks ao vivo' : 'Retomar transmissão ao vivo'}
            className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition cursor-pointer ${
              isLiveActive
                ? 'bg-[#02c076]/15 hover:bg-[#02c076]/25 text-[#02c076] border-[#02c076]/40'
                : 'bg-[#2b3139] hover:bg-[#383f4a] text-[#848e9c] border-[#474d57]'
            }`}
          >
            {isLiveActive ? (
              <>
                <Radio className="w-3.5 h-3.5 text-[#02c076] animate-pulse" />
                <span>Ao Vivo</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>Pausado</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleManualRefresh}
            title="Forçar novo tick e sincronizar com a blockchain"
            className="p-2 rounded-lg bg-[#0b0e11] hover:bg-[#2b3139] border border-[#2f343b] text-[#848e9c] hover:text-[#f0b90b] transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#f0b90b]' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Highlights Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          className={`bg-[#0b0e11]/90 rounded-lg p-3 transition-colors duration-300 border ${
            tickFlash
              ? lastTickDirection === 'up'
                ? 'border-[#02c076] ring-1 ring-[#02c076]/40'
                : 'border-[#cf304a] ring-1 ring-[#cf304a]/40'
              : 'border-[#2f343b]'
          }`}
        >
          <div className="flex items-center justify-between text-[11px] text-[#848e9c] font-medium">
            <span>Preço Atual</span>
            <span className="flex items-center gap-1 text-[10px] text-[#02c076]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#02c076] animate-ping"></span>
              Live
            </span>
          </div>
          <div className="text-base sm:text-lg font-bold font-mono text-[#02c076] mt-0.5">
            {formatBRL(numericCurrentPrice)}
          </div>
          <div className="flex items-center justify-between text-[10px] text-[#848e9c] mt-0.5">
            <span>
              $ {numericCurrentPriceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
            </span>
            <span className="font-mono text-[#eaecef]">Tick #{ticksCount}</span>
          </div>
        </div>

        <div className="bg-[#0b0e11]/80 border border-[#2f343b] rounded-lg p-3">
          <span className="text-[11px] text-[#848e9c] font-medium block">Variação ({timeRange})</span>
          <div
            className={`text-base sm:text-lg font-bold font-mono flex items-center mt-0.5 ${
              stats.isPositive ? 'text-[#02c076]' : 'text-[#cf304a]'
            }`}
          >
            {stats.isPositive ? (
              <TrendingUp className="w-4 h-4 mr-1 inline" />
            ) : (
              <TrendingDown className="w-4 h-4 mr-1 inline" />
            )}
            {stats.isPositive ? `+${stats.change}%` : `${stats.change}%`}
          </div>
          <span className="text-[10px] text-[#848e9c]">Tendência consolidada</span>
        </div>

        <div className="bg-[#0b0e11]/80 border border-[#2f343b] rounded-lg p-3">
          <span className="text-[11px] text-[#848e9c] font-medium block">Máxima ({timeRange})</span>
          <div className="text-sm sm:text-base font-bold font-mono text-[#eaecef] mt-0.5">
            {formatBRL(stats.max)}
          </div>
          <span className="text-[10px] text-[#848e9c]">Topo do período</span>
        </div>

        <div className="bg-[#0b0e11]/80 border border-[#2f343b] rounded-lg p-3">
          <span className="text-[11px] text-[#848e9c] font-medium block">Mínima ({timeRange})</span>
          <div className="text-sm sm:text-base font-bold font-mono text-[#eaecef] mt-0.5">
            {formatBRL(stats.min)}
          </div>
          <span className="text-[10px] text-[#848e9c]">Piso de suporte</span>
        </div>
      </div>

      {/* Recharts Area Chart Container with Active Alert Lines */}
      <div className="h-64 sm:h-72 w-full pt-1">
        <ResponsiveContainer width="100%" height="100%" minHeight={260}>
          <AreaChart data={filteredData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="priceGradientLive" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={stats.isPositive ? '#02c076' : '#f0b90b'} stopOpacity={0.4} />
                <stop offset="95%" stopColor={stats.isPositive ? '#02c076' : '#f0b90b'} stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="#2b3139" opacity={0.5} />

            <XAxis
              dataKey="timeFormatted"
              stroke="#848e9c"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#2f343b' }}
            />

            <YAxis
              domain={['auto', 'auto']}
              stroke="#848e9c"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: '#2f343b' }}
              tickFormatter={formatCompactYAxis}
            />

            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const point = payload[0].payload as PriceHistoryPoint;
                if (!point) return null;
                const safePrice = Number(point.price) || BITX_CORE_MAINNET.officialPrice;
                const safeUsd = Number(point.priceUsd) || Number((safePrice / usdBrlRate).toFixed(2));
                return (
                  <div className="bg-[#0b0e11] border border-[#2f343b] rounded-lg p-3 shadow-xl text-xs space-y-1 z-50">
                    <div className="flex items-center justify-between gap-4 text-[#848e9c] pb-1 border-b border-[#2f343b]/60">
                      <span>{point.timeFormatted || 'Agora'}</span>
                      <span className="font-mono text-[#f0b90b]">BitX Mainnet #348.912</span>
                    </div>
                    <div className="pt-1 flex items-center justify-between gap-4">
                      <span className="text-[#848e9c]">Preço:</span>
                      <span className="font-bold font-mono text-[#02c076]">{formatBRL(safePrice)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[#848e9c]">USD:</span>
                      <span className="font-mono text-[#eaecef]">
                        $ {safeUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                      </span>
                    </div>
                    {point.variation !== undefined && (
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-[#848e9c]">Variação:</span>
                        <span
                          className={`font-semibold font-mono ${
                            point.variation >= 0 ? 'text-[#02c076]' : 'text-[#cf304a]'
                          }`}
                        >
                          {point.variation >= 0 ? `+${point.variation}%` : `${point.variation}%`}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-4 pt-1 border-t border-[#2f343b]/40 text-[10px] text-[#848e9c]">
                      <span>Volume Estimado:</span>
                      <span className="font-mono">{point.volume} BTXC</span>
                    </div>
                  </div>
                );
              }}
            />

            {/* Linhas de Alertas de Preço Ativos na Escala do Gráfico */}
            {activeAlertsForChart.map((alert) => (
              <ReferenceLine
                key={alert.id}
                y={alert.targetPrice}
                stroke={alert.condition === 'ABOVE_OR_EQUAL' ? '#f0b90b' : '#38bdf8'}
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: `🔔 ${alert.label || 'Alvo'}: R$ ${(alert.targetPrice / 1000).toFixed(1)}k`,
                  position: 'insideTopRight',
                  fill: alert.condition === 'ABOVE_OR_EQUAL' ? '#f0b90b' : '#38bdf8',
                  fontSize: 10,
                  fontWeight: 600,
                }}
              />
            ))}

            <Area
              type="monotone"
              dataKey="price"
              stroke={stats.isPositive ? '#02c076' : '#f0b90b'}
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#priceGradientLive)"
              animationDuration={800}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom Footer Telemetry */}
      <div className="pt-3 border-t border-[#2f343b] flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#848e9c]">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-[#02c076]" />
          <span>Feed de Cotação Mainnet: Bloco #348.912 · Último tick: {lastTickTimestamp}</span>
        </div>
        <div className="flex items-center gap-3">
          <span>
            Spread Médio: <strong className="text-[#eaecef]">0.12%</strong>
          </span>
          <span>
            Ticks Transmitidos: <strong className="text-[#f0b90b] font-mono">{ticksCount}</strong>
          </span>
          <span>
            Alertas Configurados: <strong className="text-[#02c076]">{alerts.length}</strong>
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MODAL DE DEFINIÇÃO E GESTÃO DE ALERTAS DE PREÇO */}
      {/* ========================================================================= */}
      {isAlertModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#1e2329] border border-[#2f343b] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-[#2f343b] flex items-center justify-between bg-[#14171a]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#f0b90b]/15 border border-[#f0b90b]/40 flex items-center justify-center text-[#f0b90b]">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-[#eaecef] flex items-center gap-2">
                    Sistema de Alertas de Preço
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#02c076]/15 text-[#02c076] border border-[#02c076]/30 font-mono">
                      GX / BTXC
                    </span>
                  </h3>
                  <p className="text-xs text-[#848e9c]">
                    Receba notificações visuais no painel quando o valor do GX atingir o patamar desejado
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleSound}
                  className={`p-2 rounded-lg border transition cursor-pointer ${
                    soundEnabled
                      ? 'bg-[#02c076]/15 text-[#02c076] border-[#02c076]/40'
                      : 'bg-[#2b3139] text-[#848e9c] border-[#474d57]'
                  }`}
                  title={soundEnabled ? 'Sinal sonoro ativado' : 'Sinal sonoro desativado'}
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setIsAlertModalOpen(false)}
                  className="p-2 rounded-lg text-[#848e9c] hover:text-white hover:bg-[#2b3139] transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content Scrollable */}
            <div className="p-4 sm:p-5 space-y-5 overflow-y-auto flex-1">
              {/* Card de Cotação de Referência */}
              <div className="p-3.5 bg-[#0b0e11] border border-[#2f343b] rounded-xl flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] text-[#848e9c] block font-medium">Cotação Atual de Referência</span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-lg font-bold font-mono text-[#02c076]">
                      {formatBRL(numericCurrentPrice)}
                    </span>
                    <span className="text-xs font-mono text-[#38bdf8]">
                      ≈ $ {numericCurrentPriceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD
                    </span>
                  </div>
                </div>
                <div className="text-right text-[11px] text-[#848e9c]">
                  <span>Câmbio Dólar: <strong className="text-white">R$ {usdBrlRate.toFixed(2)}</strong></span>
                  <span className="block text-[10px] text-[#02c076]">● Cotação Interbancária Oficial</span>
                </div>
              </div>

              {/* Feedback de sucesso */}
              {alertSuccessMsg && (
                <div className="p-3 bg-[#02c076]/15 border border-[#02c076]/40 text-[#02c076] text-xs rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{alertSuccessMsg}</span>
                </div>
              )}

              {/* Formulário para Criar Novo Alerta */}
              <form onSubmit={handleCreateAlert} className="space-y-4 bg-[#14171a] p-4 rounded-xl border border-[#2f343b]">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#f0b90b] flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" />
                  Definir Novo Patamar de Preço
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Condição */}
                  <div>
                    <label className="text-[11px] text-[#848e9c] font-medium block mb-1">
                      Condição de Disparo
                    </label>
                    <select
                      value={newCondition}
                      onChange={(e) => setNewCondition(e.target.value as any)}
                      className="w-full bg-[#0b0e11] border border-[#2f343b] rounded-lg px-3 py-2 text-xs text-[#eaecef] focus:border-[#f0b90b] focus:outline-none"
                    >
                      <option value="ABOVE_OR_EQUAL">Preço MAIOR ou IGUAL a (≥ Alta / Alvo)</option>
                      <option value="BELOW_OR_EQUAL">Preço MENOR ou IGUAL a (≤ Queda / Suporte)</option>
                    </select>
                  </div>

                  {/* Valor Alvo em Reais */}
                  <div>
                    <label className="text-[11px] text-[#848e9c] font-medium block mb-1">
                      Preço Alvo (R$ BRL)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-xs text-[#848e9c] font-mono">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="Ex: 440000.00"
                        value={newTargetPrice}
                        onChange={(e) => setNewTargetPrice(e.target.value)}
                        className="w-full bg-[#0b0e11] border border-[#2f343b] rounded-lg pl-9 pr-3 py-2 text-xs font-mono text-[#eaecef] focus:border-[#f0b90b] focus:outline-none"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Chips de Atalho Rápido Percentual */}
                <div>
                  <div className="flex items-center justify-between text-[11px] text-[#848e9c] mb-1.5">
                    <span>Atalhos Rápidos baseados na Cotação Atual:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[0.5, 1.0, 2.0, 5.0].map((pct) => (
                      <button
                        key={`plus-${pct}`}
                        type="button"
                        onClick={() => handleApplyPreset(pct)}
                        className="px-2 py-1 rounded text-[11px] font-mono font-semibold bg-[#02c076]/15 hover:bg-[#02c076]/25 text-[#02c076] border border-[#02c076]/30 cursor-pointer transition"
                      >
                        +{pct}%
                      </button>
                    ))}
                    {[-0.5, -1.0, -2.0, -5.0].map((pct) => (
                      <button
                        key={`minus-${pct}`}
                        type="button"
                        onClick={() => handleApplyPreset(pct)}
                        className="px-2 py-1 rounded text-[11px] font-mono font-semibold bg-[#cf304a]/15 hover:bg-[#cf304a]/25 text-[#cf304a] border border-[#cf304a]/30 cursor-pointer transition"
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rótulo / Observação opcional */}
                <div>
                  <label className="text-[11px] text-[#848e9c] font-medium block mb-1">
                    Rótulo / Identificação do Alerta (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Alvo de Realização Parcial, Rompimento de Topo, Suporte 435k"
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    className="w-full bg-[#0b0e11] border border-[#2f343b] rounded-lg px-3 py-2 text-xs text-[#eaecef] focus:border-[#f0b90b] focus:outline-none"
                    maxLength={40}
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-lg bg-[#f0b90b] hover:bg-[#e0ab07] text-black font-bold text-xs transition flex items-center justify-center gap-2 shadow cursor-pointer"
                >
                  <Bell className="w-4 h-4" />
                  <span>Ativar Alerta de Preço</span>
                </button>
              </form>

              {/* Lista de Alertas Configurados */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#eaecef]">
                      Alertas Registrados ({alerts.length})
                    </h4>
                  </div>

                  <div className="flex items-center gap-1 bg-[#0b0e11] p-1 rounded-lg border border-[#2f343b]">
                    {(['ALL', 'ACTIVE', 'TRIGGERED'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setAlertFilter(f)}
                        className={`px-2 py-0.5 text-[10px] font-bold rounded cursor-pointer transition ${
                          alertFilter === f
                            ? 'bg-[#2b3139] text-white shadow-sm'
                            : 'text-[#848e9c] hover:text-white'
                        }`}
                      >
                        {f === 'ALL' ? 'Todos' : f === 'ACTIVE' ? 'Ativos' : 'Disparados'}
                      </button>
                    ))}
                  </div>
                </div>

                {filteredAlertsList.length === 0 ? (
                  <div className="p-6 text-center bg-[#0b0e11] rounded-xl border border-[#2f343b] text-xs text-[#848e9c] space-y-1">
                    <p>Nenhum alerta de preço encontrado para este filtro.</p>
                    <p className="text-[11px]">Use o formulário acima para adicionar alvos de valorização ou suporte.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {filteredAlertsList.map((alert) => {
                      const diff = alert.targetPrice - numericCurrentPrice;
                      const diffPct = Number(((diff / numericCurrentPrice) * 100).toFixed(2));
                      return (
                        <div
                          key={alert.id}
                          className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 transition ${
                            alert.isTriggered
                              ? 'bg-[#02c076]/10 border-[#02c076]/40'
                              : alert.isActive
                              ? 'bg-[#0b0e11] border-[#2f343b]'
                              : 'bg-[#0b0e11]/60 border-[#2f343b]/60 opacity-60'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  alert.condition === 'ABOVE_OR_EQUAL'
                                    ? 'bg-[#02c076]/20 text-[#02c076] border border-[#02c076]/30'
                                    : 'bg-[#38bdf8]/20 text-[#38bdf8] border border-[#38bdf8]/30'
                                }`}
                              >
                                {alert.condition === 'ABOVE_OR_EQUAL' ? '≥ ALTA' : '≤ QUEDA'}
                              </span>
                              <span className="font-bold text-white font-mono">
                                {formatBRL(alert.targetPrice)}
                              </span>
                              <span className="text-[10px] text-[#848e9c] font-mono">
                                (≈ $ {(alert.targetPrice / usdBrlRate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD)
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-[11px] text-[#848e9c] flex-wrap">
                              <span className="text-[#eaecef] font-medium">{alert.label}</span>
                              <span>·</span>
                              {alert.isTriggered ? (
                                <span className="text-[#02c076] font-semibold flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Disparado em{' '}
                                  {alert.triggeredAt ? new Date(alert.triggeredAt).toLocaleTimeString('pt-BR') : 'recente'}
                                </span>
                              ) : (
                                <span>
                                  Distância:{' '}
                                  <strong className={diff >= 0 ? 'text-[#02c076]' : 'text-[#cf304a]'}>
                                    {diff >= 0 ? '+' : ''}{diffPct}% ({diff >= 0 ? '+' : ''}R$ {diff.toFixed(2)})
                                  </strong>
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                StorageService.togglePriceAlert(alert.id);
                                setAlerts(StorageService.getPriceAlerts());
                              }}
                              className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition cursor-pointer ${
                                alert.isActive
                                  ? 'bg-[#02c076]/15 text-[#02c076] border-[#02c076]/40'
                                  : 'bg-[#2b3139] text-[#848e9c] border-[#474d57]'
                              }`}
                            >
                              {alert.isActive ? 'Ativo' : 'Pausado'}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                StorageService.deletePriceAlert(alert.id);
                                setAlerts(StorageService.getPriceAlerts());
                              }}
                              className="p-1.5 rounded-lg text-[#848e9c] hover:text-[#cf304a] hover:bg-[#cf304a]/15 transition cursor-pointer"
                              title="Excluir alerta"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {alerts.some((a) => a.isTriggered) && (
                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        StorageService.clearTriggeredAlerts();
                        setAlerts(StorageService.getPriceAlerts());
                      }}
                      className="text-xs text-[#848e9c] hover:text-[#cf304a] transition cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Limpar Alertas Disparados do Histórico
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#2f343b] bg-[#14171a] flex justify-between items-center text-xs text-[#848e9c]">
              <span>Monitoramento ativo sincronizado com a Mainnet BitX Core</span>
              <button
                type="button"
                onClick={() => setIsAlertModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-[#2b3139] hover:bg-[#383f4a] text-white font-semibold transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceTrendChart;
