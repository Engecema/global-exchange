const fs = require("fs");
const https = require("https");
const path = require("path");
const axios = require("axios");

require("dotenv").config({ path: path.join(__dirname, ".env") });
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const certCandidate =
  process.env.BB_MTLS_CERT ||
  path.resolve(__dirname, "../../src/certs/api_bb_com_br_ee73789a30_03042027/bb.com.br.pem");

const keyCandidate =
  process.env.BB_MTLS_KEY ||
  path.resolve(__dirname, "../../src/certs/api_bb_com_br_ee73789a30_03042027/bb.com.br.key");

const certRoot = fs.existsSync(path.join(__dirname, "certs", "Ate 25.10", "1 - DigiCert Global Root G2.cer"))
  ? fs.readFileSync(path.join(__dirname, "certs", "Ate 25.10", "1 - DigiCert Global Root G2.cer"))
  : undefined;

let certMtls = null;
if (certCandidate && certCandidate.includes("-----BEGIN")) {
  certMtls = certCandidate;
} else if (certCandidate && fs.existsSync(certCandidate)) {
  certMtls = fs.readFileSync(certCandidate, "utf8");
}

let keyMtls = null;
if (keyCandidate && keyCandidate.includes("-----BEGIN")) {
  keyMtls = keyCandidate;
} else if (keyCandidate && fs.existsSync(keyCandidate)) {
  keyMtls = fs.readFileSync(keyCandidate, "utf8");
}

const agentOpts = {
  ca: certRoot,
  rejectUnauthorized: false,
};

if (certMtls && keyMtls) {
  agentOpts.cert = certMtls;
  agentOpts.key = keyMtls;
}

const httpsAgent = new https.Agent(agentOpts);

const rawKey = process.env.BB_GW_APP_KEY || "f8ed08c19fc744aaad98fff4cfa44ae0";
const safeGwAppKey =
  !rawKey || rawKey.toLowerCase().includes("765c") || rawKey.length !== 32
    ? "f8ed08c19fc744aaad98fff4cfa44ae0"
    : rawKey;

async function run() {
  console.log("1. Requisitando token em https://oauth.bb.com.br/oauth/token ...");
  const credentials = Buffer.from(
    `${process.env.BB_CLIENT_ID || ""}:${process.env.BB_CLIENT_SECRET || ""}`
  ).toString("base64");
  const scope = process.env.BB_OAUTH_SCOPE || "pagamentos-lote.requisicao";

  try {
    const tokenRes = await axios.post(
      "https://oauth.bb.com.br/oauth/token",
      `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
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
    console.log("2. Token obtido! Enviando payload para o gateway oficial...");
    const payload = JSON.stringify({
      calendario: { expiracao: 3600 },
      valor: { original: "1.00" },
      chave: "05368602000110",
      solicitacaoPagador: "Teste Global Exchange",
    });
    const cobRes = await axios.post("https://api.bb.com.br/pix/v2/cob", payload, {
      httpsAgent,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "gw-dev-app-key": safeGwAppKey,
      },
    });
    console.log("Sucesso! Resposta da API BB:");
    console.log(JSON.stringify(cobRes.data, null, 2));
  } catch (err) {
    console.log("Erro na operação:", err.response ? err.response.data : err.message);
  }
}

run();
