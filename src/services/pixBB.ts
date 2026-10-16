/**
 * Serviço de Integração Banco do Brasil Pix - Engecema Engenharia Fomento e Tecnologia Ltda
 * 
 * Chave Pix Oficial (CNPJ): 05.368.602/0001-10 (05368602000110)
 * Beneficiário: ENGECEMA ENGENHARIA FOMENTO E TECNOLOGIA LTDA
 * Praça: CAMPINAS DO PI - PI
 * Endpoints Oficiais de Produção BB:
 *   - OAuth mTLS: https://oauth.bb.com.br/oauth/token
 *   - API Cobrança Pix: https://api-pix.bb.com.br/pix/v2/cob
 *   - Webhook Pix: /api/webhook/pix
 */

export interface PixBBConfig {
  merchantName: string;
  merchantCity: string;
  pixKey: string;
  formattedCnpj: string;
  isProductionReady: boolean;
  mtlsCertName: string;
  oauthEndpoint: string;
  apiEndpoint: string;
}

export const PIX_BB_CONFIG: PixBBConfig = {
  merchantName: "ENGECEMA ENGENHARIA",
  merchantCity: "CAMPINAS DO PI",
  pixKey: "05368602000110",
  formattedCnpj: "05.368.602/0001-10",
  isProductionReady: true,
  mtlsCertName: "star_mtls_api_bb_com_br.crt",
  oauthEndpoint: "https://oauth.bb.com.br/oauth/token",
  apiEndpoint: "https://api-pix.bb.com.br/pix/v2/cob",
};

export interface WebhookEventRecord {
  id: string;
  endToEndId: string;
  txid: string;
  amount: number;
  paidAt: string;
  payerName: string;
  payerDoc: string;
  receivedAt: string;
  status: string;
}

export interface PixDiagnostics {
  status: string;
  environment: string;
  pixKey: string;
  beneficiary: string;
  cnpj: string;
  credentials: {
    hasClientId: boolean;
    hasClientSecret: boolean;
    hasGwAppKey: boolean;
    isConfigured: boolean;
  };
  certificates: {
    mtlsCertFound: boolean;
    rootCaFound: boolean;
    certPath: string;
  };
  webhook: {
    suggestedUrl: string;
    totalEventsReceived: number;
  };
  activeCharges: number;
}

/**
 * Cálculo de CRC16 CCITT (0xFFFF) padrão Bacen EMV QRCPS-MPM
 */
function calculateCRC16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function formatEmvField(id: string, value: string): string {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
}

/**
 * Gera string oficial PIX Copia e Cola (EMV QR Code padrão Banco Central do Brasil)
 */
export function generatePixCopiaECola(amount: number, txidSuffix?: string): string {
  const cleanAmount = amount.toFixed(2);
  const txid = (txidSuffix || Math.random().toString(36).substring(2, 10)).toUpperCase().slice(0, 25);

  // 26: Merchant Account Information
  const gui = formatEmvField("00", "br.gov.bcb.pix");
  const key = formatEmvField("01", PIX_BB_CONFIG.pixKey);
  const merchantAccountInfo = formatEmvField("26", `${gui}${key}`);

  // 52: Category Code
  const mcc = formatEmvField("52", "0000");

  // 53: Moeda 986 (BRL)
  const currency = formatEmvField("53", "986");

  // 54: Valor
  const valueField = formatEmvField("54", cleanAmount);

  // 58: País BR
  const country = formatEmvField("58", "BR");

  // 59: Nome do recebedor (Engecema)
  const name = formatEmvField("59", PIX_BB_CONFIG.merchantName);

  // 60: Cidade do recebedor
  const city = formatEmvField("60", PIX_BB_CONFIG.merchantCity);

  // 62: Additional Data Field (Reference/TXID)
  const referenceLabel = formatEmvField("05", txid);
  const additionalData = formatEmvField("62", referenceLabel);

  // 00: Payload Format Indicator
  const payloadFormat = formatEmvField("00", "01");

  const rawPayload = `${payloadFormat}${merchantAccountInfo}${mcc}${currency}${valueField}${country}${name}${city}${additionalData}6304`;
  const checksum = calculateCRC16(rawPayload);

  return `${rawPayload}${checksum}`;
}

/**
 * API: Registra intenção de cobrança no backend
 */
export async function createPixChargeAPI(data: {
  amount: number;
  clientEmail: string;
  clientName?: string;
  document?: string;
}): Promise<{
  success: boolean;
  txid: string;
  amount: number;
  pixCopiaECola?: string;
  isDirectBbApi?: boolean;
  message?: string;
}> {
  try {
    const res = await fetch('/api/pix/create-charge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('API local offline ou inacessível, gerando payload EMV no cliente:', err);
  }

  // Fallback seguro em caso de deploy puramente estático
  const txid = `GX${Date.now().toString(36).toUpperCase()}`;
  return {
    success: true,
    txid,
    amount: data.amount,
    pixCopiaECola: generatePixCopiaECola(data.amount, txid),
    isDirectBbApi: false,
    message: 'Gerado via Padrão EMV Oficial Banco Central do Brasil.',
  };
}

/**
 * API: Consulta status de liquidação do Pix em tempo real
 */
export async function checkPixStatusAPI(txid: string): Promise<{
  txid: string;
  status: 'PENDENTE' | 'CONCLUIDA' | 'CANCELADA';
  paidAmount?: number;
  paidAt?: string;
  endToEndId?: string;
} | null> {
  try {
    const res = await fetch(`/api/pix/status/${encodeURIComponent(txid)}`);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Falha ao verificar status do Pix na API:', err);
  }
  return null;
}

/**
 * API: Diagnóstico do Gateway Banco do Brasil
 */
export async function fetchPixDiagnosticsAPI(): Promise<PixDiagnostics | null> {
  try {
    const res = await fetch('/api/pix/diagnostics');
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Falha ao obter diagnósticos do Pix:', err);
  }
  return null;
}

/**
 * API: Testar autenticação mTLS e OAuth no Banco do Brasil
 */
export async function testBBConnectionAPI(): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/pix/test-connection', { method: 'POST' });
    return await res.json();
  } catch (err: any) {
    return { success: false, message: 'Serviço de API inacessível: ' + err.message };
  }
}

/**
 * API: Cadastra URL do Webhook no Banco do Brasil
 */
export async function registerBBWebhookAPI(webhookUrl?: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/pix/register-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl }),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, message: 'Falha na requisição de registro de webhook: ' + err.message };
  }
}

/**
 * API: Simula recebimento de notificação do Webhook BB (para homologação e testes)
 */
export async function simulatePixWebhookAPI(data: {
  txid?: string;
  amount: number;
  clientEmail: string;
  payerName?: string;
}): Promise<{ success: boolean; message: string; event?: WebhookEventRecord }> {
  try {
    const res = await fetch('/api/pix/simulate-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await res.json();
  } catch (err: any) {
    return { success: false, message: 'Falha ao disparar simulação: ' + err.message };
  }
}

/**
 * API: Obtém os últimos eventos recebidos pelo Webhook
 */
export async function fetchWebhookEventsAPI(): Promise<WebhookEventRecord[]> {
  try {
    const res = await fetch('/api/pix/webhook-events');
    if (res.ok) {
      const data = await res.json();
      return data.events || [];
    }
  } catch (err) {
    console.warn('Falha ao listar eventos do webhook:', err);
  }
  return [];
}
