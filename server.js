"use strict";

const express = require("express");
const cors = require("cors");
const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";
const DATA_FILE = process.env.GX_DATA_FILE || path.join(__dirname, "data", "gx-data.json");
const SUPABASE_URL = (process.env.GX_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY = process.env.GX_SUPABASE_PUBLISHABLE_KEY || "";
const SUPABASE_SECRET_KEY = process.env.GX_SUPABASE_SECRET_KEY || process.env.GX_SUPABASE_SERVICE_ROLE_KEY || "";
const ADMIN_EMAILS = new Set(
	(process.env.GX_ADMIN_EMAILS || "geoni@globalexchange.com")
		.split(",")
		.map((email) => email.trim().toLowerCase())
		.filter(Boolean)
);
const USE_SUPABASE_DATABASE = Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY);

const clients = new Map();
const movements = [];
const financialTransactions = [];
let launchPrice = "1.50";
let walletBalance = 1000.0;
let writeQueue = Promise.resolve();

function seedInitialData() {
	if (clients.size === 0) {
		const defaultClient = {
			id: "engecema@globalexchange.com",
			email: "engecema@globalexchange.com",
			name: "Engecema Engenharia Fomento e Tecnologia Ltda",
			document: "05.368.602/0001-10",
			createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
			updatedAt: new Date().toISOString()
		};
		clients.set(defaultClient.id, defaultClient);

		const pilotClient = {
			id: "cliente@globalexchange.com",
			email: "cliente@globalexchange.com",
			name: "Cliente Piloto Institucional",
			document: "12.345.678/0001-90",
			createdAt: new Date(Date.now() - 86400000).toISOString(),
			updatedAt: new Date().toISOString()
		};
		clients.set(pilotClient.id, pilotClient);

		movements.push(
			{
				id: crypto.randomUUID(),
				clientId: defaultClient.id,
				type: "DEPÓSITO PIX",
				description: "Depósito via Banco do Brasil",
				value: 50000.0,
				createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
			},
			{
				id: crypto.randomUUID(),
				clientId: defaultClient.id,
				type: "COMPRA",
				description: "COMPRA: 5000 GX a 1.50 USDT",
				value: 7500.0,
				createdAt: new Date(Date.now() - 86400000).toISOString()
			},
			{
				id: crypto.randomUUID(),
				clientId: pilotClient.id,
				type: "DEPÓSITO PIX",
				description: "Depósito inicial de custódia Engecema PJ",
				value: 1000.0,
				createdAt: new Date().toISOString()
			}
		);

		financialTransactions.push(
			{
				id: crypto.randomUUID(),
				type: "CREDIT",
				description: "Aporte inicial de liquidez institucional GX",
				value: 150000.0,
				date: new Date().toISOString().slice(0, 10),
				createdAt: new Date().toISOString()
			},
			{
				id: crypto.randomUUID(),
				type: "DEBIT",
				description: "Custos operacionais de infraestrutura e gateways",
				value: 3200.0,
				date: new Date().toISOString().slice(0, 10),
				createdAt: new Date().toISOString()
			}
		);
	}
}

async function loadData() {
	if (USE_SUPABASE_DATABASE) return;

	try {
		const raw = await fs.readFile(DATA_FILE, "utf8");
		const saved = JSON.parse(raw);
		for (const client of saved.clients || []) clients.set(client.id, client);
		if (Array.isArray(saved.movements)) movements.push(...saved.movements);
		if (Array.isArray(saved.financialTransactions)) financialTransactions.push(...saved.financialTransactions);
		if (saved.launchPrice) launchPrice = saved.launchPrice;
		if (saved.walletBalance !== undefined) walletBalance = saved.walletBalance;
	} catch (error) {
		if (error.code !== "ENOENT") console.warn("Aviso ao carregar dados locais:", error.message);
	}

	seedInitialData();
}

function persistData() {
	const snapshot = JSON.stringify({
		clients: [...clients.values()],
		movements,
		financialTransactions,
		launchPrice,
		walletBalance
	}, null, 2);

	writeQueue = writeQueue.then(async () => {
		try {
			await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
			const temporaryFile = `${DATA_FILE}.tmp`;
			await fs.writeFile(temporaryFile, snapshot, "utf8");
			await fs.rename(temporaryFile, DATA_FILE);
		} catch (error) {
			console.warn("Aviso ao persistir dados locais:", error.message);
		}
	});
	return writeQueue;
}

function cleanText(value, limit = 180) {
	return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function normalizeEmail(value) {
	return cleanText(value, 254).toLowerCase();
}

function upsertClient(input) {
	const email = normalizeEmail(input.clientEmail || input.email) || "cliente@globalexchange.com";
	const current = clients.get(email) || {
		id: email,
		email,
		name: "",
		document: "",
		createdAt: new Date().toISOString()
	};
	current.name = cleanText(input.clientName || input.name) || current.name || email;
	current.document = cleanText(input.document, 40) || current.document;
	current.updatedAt = new Date().toISOString();
	clients.set(email, current);
	return current;
}

function recordMovement(client, input) {
	const movement = {
		id: crypto.randomUUID(),
		clientId: client.id,
		type: cleanText(input.type, 40),
		description: cleanText(input.description, 240),
		value: Number(input.value) || 0,
		createdAt: new Date().toISOString()
	};
	movements.unshift(movement);
	return movement;
}

function summarizeClient(client) {
	const history = movements.filter((m) => m.clientId === client.id);
	const latestMovement = history[0] || null;
	return { ...client, movementCount: history.length, latestMovement };
}

function getAuthUser(req) {
	const auth = req.headers.authorization || "";
	const token = auth.replace(/^Bearer\s+/i, "").trim();
	const emailHeader = (req.headers["x-user-email"] || "").toString().toLowerCase().trim();

	let email = emailHeader || "cliente@globalexchange.com";
	let role = "client";

	if (token === "mock-admin-token" || ADMIN_EMAILS.has(email)) {
		role = "admin";
		email = "geoni@globalexchange.com";
	} else if (token) {
		try {
			const parts = token.split(".");
			if (parts.length === 3) {
				const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
				if (payload.email) email = normalizeEmail(payload.email);
				if (ADMIN_EMAILS.has(email)) role = "admin";
			}
		} catch {
			// ignora token invalido
		}
	}

	return {
		user: { id: email, email },
		email,
		role
	};
}

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/health", (_req, res) => {
	res.json({ status: "connected", timestamp: new Date().toISOString() });
});

// Auth endpoints
app.get("/api/auth/session", (req, res) => {
	const auth = getAuthUser(req);
	res.json({
		user: auth.user,
		role: auth.role
	});
});

app.post("/api/login", (req, res) => {
	const { email, username, password } = req.body || {};
	const userEmail = normalizeEmail(email || username);

	if (ADMIN_EMAILS.has(userEmail) || userEmail === "geoni@globalexchange.com") {
		return res.json({
			status: "SUCCESS",
			token: "mock-admin-token",
			user: { id: "admin-1", email: "geoni@globalexchange.com", role: "admin" },
			role: "admin",
			message: "Autenticado com sucesso como Administrador!"
		});
	}

	res.json({
		status: "SUCCESS",
		token: `mock-client-token-${Date.now()}`,
		user: { id: userEmail || "cliente-1", email: userEmail || "cliente@globalexchange.com", role: "client" },
		role: "client",
		message: "Autenticado com sucesso!"
	});
});

app.post("/api/register", async (req, res) => {
	const input = req.body || {};
	const email = normalizeEmail(
		input.email ||
		input.clientEmail ||
		(input.username ? (input.username.includes("@") ? input.username : `${input.username}@globalexchange.com`) : "")
	);
	if (!email) {
		return res.status(400).json({ error: "E-mail ou nome de usuário obrigatório" });
	}
	const client = upsertClient({
		...input,
		email,
		clientName: input.name || input.clientName || input.username || email
	});
	await persistData();
	res.status(201).json({ status: "SUCCESS", client, message: "Cadastro realizado com sucesso!" });
});

// Financial transactions (Admin)
app.get("/api/financial-transactions", (_req, res) => {
	const sorted = financialTransactions.slice().sort((a, b) => {
		const dateCmp = (b.date || "").localeCompare(a.date || "");
		if (dateCmp !== 0) return dateCmp;
		return (b.createdAt || "").localeCompare(a.createdAt || "");
	});
	res.json({ transactions: sorted });
});

app.post("/api/financial-transactions", async (req, res) => {
	const input = req.body || {};
	const type = input.type === "DEBIT" ? "DEBIT" : "CREDIT";
	const description = cleanText(input.description, 240);
	const value = Number(input.value);
	const date = input.date || new Date().toISOString().slice(0, 10);

	if (!description || !Number.isFinite(value) || value <= 0) {
		return res.status(400).json({ error: "Dados inválidos para o lançamento" });
	}

	const transaction = {
		id: crypto.randomUUID(),
		type,
		description,
		value,
		date,
		createdAt: new Date().toISOString()
	};

	financialTransactions.unshift(transaction);
	await persistData();
	res.status(201).json({ status: "SUCCESS", transaction });
});

// Clients management
app.get("/api/clients", (req, res) => {
	const page = Math.max(1, Number.parseInt(req.query.page || "1", 10) || 1);
	const pageSize = Math.max(1, Number.parseInt(req.query.pageSize || "20", 10) || 20);

	const allClients = [...clients.values()].map(summarizeClient).sort((a, b) => {
		const aDate = a.latestMovement?.createdAt || a.createdAt || "";
		const bDate = b.latestMovement?.createdAt || b.createdAt || "";
		return bDate.localeCompare(aDate);
	});

	const start = (page - 1) * pageSize;
	res.json({
		items: allClients.slice(start, start + pageSize),
		page,
		pageSize,
		total: allClients.length,
		hasMore: start + pageSize < allClients.length
	});
});

app.get("/api/clients/:id/movements", (req, res) => {
	const clientId = normalizeEmail(decodeURIComponent(req.params.id));
	const client = clients.get(clientId);
	if (!client) {
		return res.status(404).json({ error: "Cliente não encontrado" });
	}

	const history = movements.filter((m) => m.clientId === clientId);
	res.json({ client, movements: history });
});

// Orders & Deposits (aceita tanto /api/orders quanto /api/order)
app.post(["/api/orders", "/api/order"], async (req, res) => {
	const input = req.body || {};
	const price = Number(input.price);
	const amount = Number(input.amount);

	if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(amount) || amount <= 0) {
		return res.status(400).json({ error: "Preço e quantidade devem ser maiores que zero" });
	}

	const auth = getAuthUser(req);
	const email = normalizeEmail(input.clientEmail || input.email || auth.email) || "cliente@globalexchange.com";
	const client = upsertClient({ ...input, email });

	const isSell = input.type === "VENDA" || String(input.side || "").toUpperCase() === "SELL";
	const type = isSell ? "VENDA" : "COMPRA";
	const orderId = input.id || crypto.randomUUID();

	const movement = recordMovement(client, {
		id: orderId,
		type,
		description: `${type}: ${amount.toFixed(4)} GX a ${price.toFixed(2)} USDT`,
		value: price * amount
	});

	await persistData();
	res.status(201).json({ status: "SUCCESS", id: orderId, movement });
});

app.post("/api/deposit", async (req, res) => {
	const input = req.body || {};
	const amount = Number(input.amount);

	if (!Number.isFinite(amount) || amount <= 0) {
		return res.status(400).json({ error: "O valor do depósito deve ser maior que zero" });
	}

	const auth = getAuthUser(req);
	const email = normalizeEmail(input.clientEmail || input.email || auth.email) || "cliente@globalexchange.com";
	const client = upsertClient({ ...input, email });

	const movement = recordMovement(client, {
		type: "DEPÓSITO PIX",
		description: `Depósito via ${cleanText(input.bank, 40) || "Pix BB (Engecema PJ)"}`,
		value: amount
	});

	walletBalance += amount;
	await persistData();
	res.status(201).json({ status: "SUCCESS", id: movement.id, movement });
});

// Launch price & Market tickers
app.get("/api/admin/launch-price", (_req, res) => {
	res.json({ launch_price: launchPrice });
});

app.post("/api/admin/launch-price", async (req, res) => {
	const { price } = req.body || {};
	if (price) launchPrice = String(price);
	await persistData();
	res.json({ success: true, launch_price: launchPrice });
});

app.get(["/api/ticker/btxc", "/api/ticker/gx"], (_req, res) => {
	res.json({
		symbol: "GX/USDT",
		price: launchPrice === "Pendente" ? "Aguardando..." : `R$ ${launchPrice}`,
		variation: "+0.0%"
	});
});

app.get("/api/wallet/history", (_req, res) => {
	res.json(movements);
});

app.post("/api/wallet/transfer", async (req, res) => {
	const { to, amount } = req.body || {};
	const numAmount = Number(amount);
	if (!to || !Number.isFinite(numAmount) || numAmount <= 0) {
		return res.status(400).json({ error: "Dados inválidos" });
	}
	if (numAmount > walletBalance) {
		return res.status(400).json({ error: "Saldo insuficiente" });
	}
	walletBalance -= numAmount;
	await persistData();
	res.json({ balance: walletBalance });
});

app.post("/api/wallet/deposit", async (req, res) => {
	const { amount } = req.body || {};
	const numAmount = Number(amount);
	if (!Number.isFinite(numAmount) || numAmount <= 0) {
		return res.status(400).json({ error: "Valor inválido" });
	}
	walletBalance += numAmount;
	const txid = "txid" + Math.random().toString(36).substring(2, 10).toUpperCase();
	const pixQrCode = `00020101021126360014br.gov.bcb.pix0114engecemabb${numAmount.toFixed(2)}5204000053039865405${numAmount.toFixed(2)}5802BR5908ENGECEMA6009FORTALEZA62070503***6304`;
	await persistData();
	res.json({ balance: walletBalance, pix_qrcode: pixQrCode, txid });
});

app.get("/api/wallet/balance", (_req, res) => {
	res.json({ balance: walletBalance });
});

// Front-end stubs & configurations
app.get("/auth-config.js", (_req, res) => {
	res.set("Content-Type", "application/javascript");
	res.send(`window.GX_AUTH_CONFIG = {
		url: "${SUPABASE_URL}",
		publishableKey: "${SUPABASE_PUBLISHABLE_KEY}",
		panel: "cliente"
	};`);
});

app.get("/supabase.js", (_req, res) => {
	res.set("Content-Type", "application/javascript");
	res.send(`// Supabase client stub
window.supabase = {
	createClient: function() {
		return {
			auth: {
				getSession: async () => ({ data: { session: null }, error: null }),
				signInWithPassword: async () => ({ error: null }),
				signUp: async () => ({ error: null }),
				signOut: async () => ({ error: null }),
				mfa: {
					getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: "aal2" }, error: null }),
					listFactors: async () => ({ data: { totp: [] }, error: null })
				}
			}
		};
	}
};`);
});

// Serve frontend views
const frontendDir = path.join(__dirname, "apps", "frontend-web");

app.get("/cliente", (_req, res) => {
	res.sendFile(path.join(frontendDir, "cliente", "index.html"));
});

app.get("/controle", (_req, res) => {
	res.sendFile(path.join(frontendDir, "controle", "index.html"));
});

app.get("/admin-table.js", (_req, res) => {
	res.sendFile(path.join(frontendDir, "controle", "admin-table.js"));
});

app.get("/controle/admin-table.js", (_req, res) => {
	res.sendFile(path.join(frontendDir, "controle", "admin-table.js"));
});

app.use(express.static(frontendDir));

// Fallback to main index.html
app.get("*", (_req, res) => {
	res.sendFile(path.join(frontendDir, "index.html"));
});

loadData().then(() => {
	app.listen(PORT, HOST, () => {
		console.log(`🚀 Global Exchange online em http://${HOST}:${PORT}`);
	});
}).catch((error) => {
	console.error("Erro fatal ao inicializar servidor:", error);
	process.exit(1);
});
