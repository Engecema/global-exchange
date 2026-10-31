import fs from "fs";
import https from "https";
import path from "path";
import axios from "axios";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

console.log("Banco do Brasil - Requisitando Token no Endpoint de Produção...");

try {
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

  const credentials = Buffer.from(
    `${process.env.BB_CLIENT_ID || ""}:${process.env.BB_CLIENT_SECRET || ""}`
  ).toString("base64");

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

  const scope = process.env.BB_OAUTH_SCOPE || "pagamentos-lote.requisicao";

  axios
    .post("https://oauth.bb.com.br/oauth/token", `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`, {
      httpsAgent,
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "gw-dev-app-key": safeGwAppKey,
      },
    })
    .then((res) => {
      console.log("Conexão efetuada com sucesso!");
      console.log("Resultado:", res.data);
    })
    .catch((err) => {
      console.log("Resposta do Banco do Brasil:", err.response ? err.response.data : err.message);
    });
} catch (err) {
  console.log("Erro na leitura dos arquivos ou conexão:", err.message);
}
