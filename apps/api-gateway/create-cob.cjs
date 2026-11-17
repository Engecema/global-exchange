const fs = require("fs");
const https = require("https");
const tls = require("tls");
const crypto = require("crypto");
const path = require("path");
const axios = require("axios");

require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

function loadPemOrFile(candidate) {
  if (!candidate) return null;
  const raw = String(candidate).trim().replace(/^["']|["']$/g, "");
  if (!raw) return null;
  if (raw.includes("-----BEGIN")) {
    return raw.includes("\\n") ? raw.replace(/\\r/g, "").replace(/\\n/g, "\n") : raw;
  }
  if (fs.existsSync(raw) && fs.statSync(raw).isFile()) {
    const txt = fs.readFileSync(raw, "utf8");
    return txt.includes("\\n") ? txt.replace(/\\r/g, "").replace(/\\n/g, "\n") : txt;
  }
  return null;
}

function isServerCert(pem) {
  try {
    const obj = new crypto.X509Certificate(pem);
    const subj = String(obj.subject || "").toLowerCase();
    return subj.includes("cn=api.bb.com.br") || subj.includes("cn=api-pix.bb.com.br") || subj.includes("cn=*.bb.com.br");
  } catch {
    return String(pem || "").includes("CN=api.bb.com.br");
  }
}

function isMatchingKeypair(certPem, keyPem) {
  try {
    const certObj = new crypto.X509Certificate(certPem);
    const pubFromCert = certObj.publicKey.export({ type: "spki", format: "pem" });
    const privObj = crypto.createPrivateKey(keyPem);
    const pubFromPriv = crypto.createPublicKey(privObj).export({ type: "spki", format: "pem" });
    return pubFromCert === pubFromPriv;
  } catch {
    return false;
  }
}

const caFiles = [
  path.join(__dirname, "certs", "A partir de 26.10", "1 - DigiCert Global Root G2.crt"),
  path.join(__dirname, "certs", "A partir de 26.10", "2 - GeoTrust EV RSA CA G2.crt"),
  path.join(__dirname, "certs", "A partir de 26.10", "api.bb.com.br.crt"),
  path.resolve(__dirname, "../../src/certs/api_bb_com_br_ee73789a30_03042027/bb.com.br.pem"),
  path.join(__dirname, "certs", "1 - DigiCert Global Root G2.cer"),
  path.join(__dirname, "certs", "2 - GeoTrust TLS RSA CA G1.crt"),
];

const caBundle = Array.isArray(tls.rootCertificates) ? [...tls.rootCertificates] : [];
for (const file of caFiles) {
  try {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) {
      const content = fs.readFileSync(file, "utf8");
      if (content.includes("-----BEGIN CERTIFICATE-----") && !caBundle.includes(content)) {
        caBundle.push(content);
      }
    }
  } catch {}
}

const certMtls = loadPemOrFile(process.env.BB_MTLS_CERT || process.env.BB_CERT || "");
const keyMtls = loadPemOrFile(process.env.BB_MTLS_KEY || process.env.BB_KEY || "");

const agentOpts = {
  ca: caBundle.length > 0 ? caBundle : undefined,
  rejectUnauthorized: true,
};

if (certMtls && keyMtls && !isServerCert(certMtls) && isMatchingKeypair(certMtls, keyMtls)) {
  agentOpts.cert = certMtls;
  agentOpts.key = keyMtls;
} else if (certMtls || keyMtls) {
  console.warn("Aviso mTLS: BB_MTLS_CERT/BB_MTLS_KEY ausente, incompatível ou apontando para certificado público de servidor; par não acoplado.");
}

const httpsAgent = new https.Agent(agentOpts);

const rawKey = process.env.BB_GW_APP_KEY || "";
const safeGwAppKey = String(rawKey)
  .trim()
  .replace(/^["']|["']$/g, "")
  .replace(/[\r\n\t\s]/g, "")
  .toLowerCase();

const contractNumber = String(process.env.BB_CONTRACT_ID || process.env.BB_NUMERO_CONTRATO || process.env.BB_CONTRATO || "29076").trim() || "29076";
const applicationId = String(process.env.BB_APPLICATION_ID || process.env.GX_APPLICATION_ID || "300132").trim() || "300132";

async function run() {
  console.log("1. Requisitando token em https://oauth.bb.com.br/oauth/token ...");
  let clientId = String(process.env.BB_CLIENT_ID || "").trim().replace(/^["']|["']$/g, "").replace(/[\r\n\t\s]/g, "");
  let clientSecret = String(process.env.BB_CLIENT_SECRET || "").trim().replace(/^["']|["']$/g, "").replace(/[\r\n\t\s]/g, "");

  if (!clientId || !clientSecret || !safeGwAppKey) {
    throw new Error("Defina BB_CLIENT_ID, BB_CLIENT_SECRET e BB_GW_APP_KEY nas variáveis de ambiente antes de executar.");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const rawScope = process.env.BB_OAUTH_SCOPE || "pagamentos-lote.requisicao";
  const cleanScope = String(rawScope)
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/[\r\n\t,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "pagamentos-lote.requisicao";

  try {
    const tokenRes = await axios.post(
      "https://oauth.bb.com.br/oauth/token",
      `grant_type=client_credentials&scope=${encodeURIComponent(cleanScope)}`,
      {
        httpsAgent,
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "gw-dev-app-key": safeGwAppKey,
        },
      }
    );
    const token = tokenRes.data.access_token;
    console.log("2. Token obtido! Enviando payload para o gateway oficial Pagamentos em Lote (V1)...");
    const payload = JSON.stringify({
      numeroContrato: Number(contractNumber) || 29076,
      numeroContratoPagamento: Number(contractNumber) || 29076,
      contrato: contractNumber,
      applicationId,
      solicitacao: "Teste Pagamentos em Lote V1",
    });
    const loteRes = await axios.post("https://api.bb.com.br/pagamentos-lote/v1/requisicao?gw-dev-app-key=" + encodeURIComponent(safeGwAppKey), payload, {
      httpsAgent,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "gw-dev-app-key": safeGwAppKey,
        "X-Numero-Contrato": contractNumber,
      },
    });
    console.log("Sucesso! Resposta da API BB Pagamentos em Lote (V1):");
    console.log(JSON.stringify(loteRes.data, null, 2));
  } catch (err) {
    console.log("Erro na operação:", err.response ? err.response.data : err.message);
  }
}

run();
