/**
 * Serviço de Integração Banco do Brasil Pix - Engecema Engenharia Fomento e Tecnologia Ltda
 * 
 * Chave Pix Oficial (CNPJ): 05.368.602/0001-10 (05368602000110)
 * Beneficiário: ENGECEMA ENGENHARIA FOMENTO E TECNOLOGIA LTDA
 * Praça: FORTALEZA - CE
 * Endpoints Oficiais de Produção BB:
 *   - OAuth mTLS: https://oauth.bb.com.br/oauth/token
 *   - API Cobrança Pix: https://api-pix.bb.com.br/pix/v2/cob
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
