"use strict";

const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
require("dotenv").config();
try { require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env") }); } catch {}
try { require("dotenv").config({ path: path.join(__dirname, ".env") }); } catch {}

const PORT = Number(process.env.PORT || 3000);
const DATA_FILE = process.env.GX_DATA_FILE || path.join(__dirname, "data", "gx-data.json");
const SUPABASE_URL = (process.env.GX_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY = process.env.GX_SUPABASE_PUBLISHABLE_KEY || "";
const SUPABASE_SECRET_KEY = process.env.GX_SUPABASE_SECRET_KEY || process.env.GX_SUPABASE_SERVICE_ROLE_KEY || "";
const ADMIN_EMAILS = new Set(
	(process.env.GX_ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean)
);
const USE_SUPABASE_DATABASE = Boolean(SUPABASE_SECRET_KEY);
const clients = new Map();
const movements = [];
const financialTransactions = [];
let writeQueue = Promise.resolve();

async function loadData() {
	if (USE_SUPABASE_DATABASE) return;

	try {
		const saved = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
		for (const client of saved.clients || []) clients.set(client.id, client);
		movements.push(...(saved.movements || []));
		financialTransactions.push(...(saved.financialTransactions || []));
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
	}
}

function databaseUnavailable(error) {
	console.error("Falha ao acessar o banco Supabase:", error.message);
	return Object.assign(new Error("Banco de dados indisponível"), { status: 503 });
}

async function supabaseRows(table, filters = {}) {
	if (!USE_SUPABASE_DATABASE) {
		throw Object.assign(new Error("Banco Supabase não configurado"), { status: 503 });
	}

	const pageSize = 1000;
	const rows = [];
	for (let offset = 0; ; offset += pageSize) {
		const params = new URLSearchParams({ select: "*", ...filters, limit: String(pageSize), offset: String(offset) });
		const headers = {
			apikey: SUPABASE_SECRET_KEY,
			Accept: "application/json"
		};
		if (SUPABASE_SECRET_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${SUPABASE_SECRET_KEY}`;
		let response;
		try {
			response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
				headers,
				signal: AbortSignal.timeout(10000)
			});
		} catch (error) {
			throw databaseUnavailable(error);
		}
		if (!response.ok) {
			throw databaseUnavailable(new Error(`Consulta ${table} retornou HTTP ${response.status}: ${await response.text()}`));
		}
		const page = await response.json();
		if (!Array.isArray(page)) throw databaseUnavailable(new Error(`Resposta inválida da tabela ${table}`));
		rows.push(...page);
		if (page.length < pageSize) return rows;
	}
}

async function supabaseUpsert(table, row) {
	if (!USE_SUPABASE_DATABASE) {
		throw Object.assign(new Error("Banco Supabase não configurado"), { status: 503 });
	}

	const headers = {
		apikey: SUPABASE_SECRET_KEY,
		"Content-Type": "application/json",
		Prefer: "resolution=merge-duplicates,return=minimal"
	};
	if (SUPABASE_SECRET_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${SUPABASE_SECRET_KEY}`;
	let response;
	try {
		response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=id`, {
			method: "POST",
			headers,
			body: JSON.stringify(row),
			signal: AbortSignal.timeout(10000)
		});
	} catch (error) {
		throw databaseUnavailable(error);
	}
	if (!response.ok) {
		throw databaseUnavailable(new Error(`Gravação em ${table} retornou HTTP ${response.status}: ${await response.text()}`));
	}
}

async function saveClient(client) {
	if (!USE_SUPABASE_DATABASE) return persistData();
	await supabaseUpsert("clients", {
		id: client.id,
		email: client.email,
		name: client.name,
		document: client.document,
		created_at: client.createdAt,
		updated_at: client.updatedAt
	});
}

async function saveMovement(movement) {
	if (!USE_SUPABASE_DATABASE) return persistData();
	await supabaseUpsert("movements", {
		id: movement.id,
		client_id: movement.clientId,
		type: movement.type,
		description: movement.description,
		value: movement.value,
		created_at: movement.createdAt
	});
}

async function saveFinancialTransaction(transaction) {
	if (!USE_SUPABASE_DATABASE) return persistData();
	await supabaseUpsert("financial_transactions", {
		id: transaction.id,
		type: transaction.type,
		description: transaction.description,
		value: transaction.value,
		transaction_date: transaction.date,
		created_at: transaction.createdAt
	});
}

function persistData() {
	const snapshot = JSON.stringify({ clients: [...clients.values()], movements, financialTransactions });
	writeQueue = writeQueue.then(async () => {
		await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
		const temporaryFile = `${DATA_FILE}.tmp`;
		await fs.writeFile(temporaryFile, snapshot, "utf8");
		await fs.rename(temporaryFile, DATA_FILE);
	});
	return writeQueue;
}

function sendJson(response, status, value) {
	response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
	response.end(JSON.stringify(value));
}

async function readJson(request) {
	let raw = "";
	for await (const chunk of request) {
		raw += chunk;
		if (raw.length > 1024 * 1024) throw Object.assign(new Error("Corpo muito grande"), { status: 413 });
	}
	return raw ? JSON.parse(raw) : {};
}

function cleanText(value, limit = 180) {
	return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function normalizeEmail(value) {
	return cleanText(value, 254).toLowerCase();
}

async function authenticateRequest(request) {
	const authorization = request.headers.authorization || "";
	const tokenMatch = authorization.match(/^Bearer\s+(\S+)$/i);
	if (!tokenMatch) {
		throw Object.assign(new Error("Autenticação necessária"), { status: 401 });
	}
	if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
		throw Object.assign(new Error("Autenticação indisponível: configure o Supabase na API"), { status: 503 });
	}

	let response;
	try {
		response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
			headers: {
				apikey: SUPABASE_PUBLISHABLE_KEY,
				Authorization: `Bearer ${tokenMatch[1]}`
			},
			signal: AbortSignal.timeout(5000)
		});
	} catch (error) {
		throw Object.assign(new Error("Não foi possível validar a sessão com Supabase"), { status: 503, cause: error });
	}
	if (!response.ok) {
		throw Object.assign(new Error("Sessão inválida ou expirada"), { status: 401 });
	}

	const user = await response.json();
	let claims;
	try {
		claims = JSON.parse(Buffer.from(tokenMatch[1].split(".")[1], "base64url").toString("utf8"));
	} catch {
		throw Object.assign(new Error("Token de sessão inválido"), { status: 401 });
	}
	if (!user.id || user.id !== claims.sub || !user.email || normalizeEmail(user.email) !== normalizeEmail(claims.email)) {
		throw Object.assign(new Error("Identidade da sessão inválida"), { status: 401 });
	}
	if (claims.aal !== "aal2") {
		throw Object.assign(new Error("Confirme sua identidade com o aplicativo autenticador"), { status: 403 });
	}

	return {
		user,
		email: normalizeEmail(user.email),
		role: ADMIN_EMAILS.has(normalizeEmail(user.email)) ? "admin" : "client"
	};
}

function requireAdmin(authUser) {
	if (authUser.role !== "admin") {
		throw Object.assign(new Error("Acesso restrito ao administrador"), { status: 403 });
	}
}

function resolveClientEmail(authUser, requestedEmail) {
	const email = normalizeEmail(requestedEmail);
	if (authUser.role !== "admin" && email && email !== authUser.email) {
		throw Object.assign(new Error("Você só pode registrar movimentações na sua própria conta"), { status: 403 });
	}
	return authUser.role === "admin" && email ? email : authUser.email;
}

function upsertClient(input) {
	const email = normalizeEmail(input.clientEmail || input.email);
	if (!email || !email.includes("@")) throw Object.assign(new Error("E-mail do cliente inválido"), { status: 400 });
	const current = clients.get(email) || { id: email, email, name: "", document: "", createdAt: new Date().toISOString() };
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
		value: Number(input.value),
		createdAt: new Date().toISOString()
	};
	movements.push(movement);
	return movement;
}

function summarizeClient(client, clientMovements = movements) {
	const history = clientMovements.filter((movement) => movement.clientId === client.id);
	const latestMovement = history.at(-1) || null;
	return { ...client, movementCount: history.length, latestMovement };
}

async function handleRequest(request, response) {
	response.setHeader("Access-Control-Allow-Origin", "*");
	response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
	if (request.method === "OPTIONS") {
		response.writeHead(204);
		response.end();
		return;
	}

	const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
	if (request.method === "GET" && url.pathname === "/health") {
		sendJson(response, 200, { status: "OK" });
		return;
	}

	try {
		if (url.pathname.startsWith("/api/")) {
			request.authUser = await authenticateRequest(request);
		}

		if (request.method === "GET" && url.pathname === "/api/auth/session") {
			sendJson(response, 200, {
				user: { id: request.authUser.user.id, email: request.authUser.email },
				role: request.authUser.role
			});
			return;
		}

		if (request.method === "POST" && url.pathname === "/api/register") {
			const input = await readJson(request);
			const email = resolveClientEmail(request.authUser, input.email || input.clientEmail);
			const client = upsertClient({ ...input, email });
			await saveClient(client);
			sendJson(response, 201, { status: "SUCCESS", client });
			return;
		}

		if (request.method === "GET" && url.pathname === "/api/financial-transactions") {
			requireAdmin(request.authUser);
			const sorted = USE_SUPABASE_DATABASE
				? (await supabaseRows("financial_transactions", { order: "transaction_date.desc,created_at.desc" })).map((row) => ({
					id: row.id,
					type: row.type,
					description: row.description,
					value: Number(row.value),
					date: row.transaction_date,
					createdAt: row.created_at
				}))
				: financialTransactions.slice().sort((left, right) =>
					right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt)
				);
			sendJson(response, 200, { transactions: sorted });
			return;
		}

		if (request.method === "POST" && url.pathname === "/api/financial-transactions") {
			requireAdmin(request.authUser);
			const input = await readJson(request);
			if (!input || typeof input !== "object" || Array.isArray(input)) {
				throw Object.assign(new Error("Dados do lançamento inválidos"), { status: 400 });
			}
			const type = input.type;
			const description = cleanText(input.description, 240);
			const value = Number(input.value);
			const date = input.date;
			const parsedDate = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
				? new Date(`${date}T00:00:00.000Z`)
				: null;

			if (!["CREDIT", "DEBIT"].includes(type)) {
				throw Object.assign(new Error("Tipo de lançamento inválido"), { status: 400 });
			}
			if (!description) {
				throw Object.assign(new Error("A descrição é obrigatória"), { status: 400 });
			}
			if (!Number.isFinite(value) || value <= 0) {
				throw Object.assign(new Error("O valor deve ser maior que zero"), { status: 400 });
			}
			if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
				throw Object.assign(new Error("A data informada é inválida"), { status: 400 });
			}

			const transaction = {
				id: crypto.randomUUID(),
				type,
				description,
				value,
				date,
				createdAt: new Date().toISOString()
			};
			financialTransactions.push(transaction);
			await saveFinancialTransaction(transaction);
			sendJson(response, 201, { status: "SUCCESS", transaction });
			return;
		}

		if (request.method === "GET" && url.pathname === "/api/clients") {
			requireAdmin(request.authUser);
			const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10) || 1);
			const pageSize = 20;
			const allClients = USE_SUPABASE_DATABASE
				? (await supabaseRows("clients", { order: "created_at.desc" })).map((row) => ({
					id: row.id,
					email: row.email,
					name: row.name,
					document: row.document || "",
					createdAt: row.created_at,
					updatedAt: row.updated_at
				}))
				: [...clients.values()];
			const allMovements = USE_SUPABASE_DATABASE
				? (await supabaseRows("movements")).map((row) => ({
					id: row.id,
					clientId: row.client_id,
					type: row.type,
					description: row.description,
					value: Number(row.value),
					createdAt: row.created_at
				}))
				: movements;
			const sorted = allClients.map((client) => summarizeClient(client, allMovements)).sort((left, right) => {
				const leftTime = left.latestMovement?.createdAt || left.createdAt;
				const rightTime = right.latestMovement?.createdAt || right.createdAt;
				return rightTime.localeCompare(leftTime);
			});
			const start = (page - 1) * pageSize;
			sendJson(response, 200, {
				items: sorted.slice(start, start + pageSize),
				page,
				pageSize,
				total: sorted.length,
				hasMore: start + pageSize < sorted.length
			});
			return;
		}

		const historyMatch = url.pathname.match(/^\/api\/clients\/([^/]+)\/movements$/);
		if (request.method === "GET" && historyMatch) {
			const clientId = normalizeEmail(decodeURIComponent(historyMatch[1]));
			if (request.authUser.role !== "admin" && request.authUser.email !== clientId) {
				throw Object.assign(new Error("Você só pode consultar seu próprio histórico"), { status: 403 });
			}
			const clientRow = USE_SUPABASE_DATABASE
				? (await supabaseRows("clients", { id: `eq.${clientId}`, limit: "1" }))[0]
				: clients.get(clientId);
			const client = clientRow && USE_SUPABASE_DATABASE
				? {
					id: clientRow.id,
					email: clientRow.email,
					name: clientRow.name,
					document: clientRow.document || "",
					createdAt: clientRow.created_at,
					updatedAt: clientRow.updated_at
				}
				: clientRow;
			if (!client) {
				sendJson(response, 404, { error: "Cliente não encontrado" });
				return;
			}
			const history = USE_SUPABASE_DATABASE
				? (await supabaseRows("movements", {
					client_id: `eq.${clientId}`,
					order: "created_at.desc"
				})).map((row) => ({
					id: row.id,
					clientId: row.client_id,
					type: row.type,
					description: row.description,
					value: Number(row.value),
					createdAt: row.created_at
				}))
				: movements.filter((movement) => movement.clientId === clientId).slice().reverse();
			sendJson(response, 200, { client, movements: history });
			return;
		}

		if (request.method === "POST" && ["/api/orders", "/api/deposit"].includes(url.pathname)) {
			const input = await readJson(request);
			let movement;

			if (url.pathname === "/api/orders") {
				const price = Number(input.price);
				const amount = Number(input.amount);
				if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(amount) || amount <= 0) {
					sendJson(response, 400, { error: "Preço e quantidade devem ser maiores que zero" });
					return;
				}
				const email = resolveClientEmail(request.authUser, input.clientEmail || input.email);
				const client = upsertClient({ ...input, email });
				await saveClient(client);
				const type = input.type === "VENDA" ? "VENDA" : "COMPRA";
				movement = recordMovement(client, {
					type,
					description: `${type}: ${amount} GX a ${price} USDT`,
					value: price * amount
				});
				await saveMovement(movement);
			} else {
				const amount = Number(input.amount);
				if (!Number.isFinite(amount) || amount <= 0) {
					sendJson(response, 400, { error: "O valor do depósito deve ser maior que zero" });
					return;
				}
				const email = resolveClientEmail(request.authUser, input.clientEmail || input.email);
				const client = upsertClient({ ...input, email });
				await saveClient(client);
				movement = recordMovement(client, {
					type: "DEPÓSITO PIX",
					description: `Depósito via ${cleanText(input.bank, 40) || "Pix"}`,
					value: amount
				});
				await saveMovement(movement);
			}

			sendJson(response, 201, { status: "SUCCESS", id: movement.id, movement });
			return;
		}

		sendJson(response, 404, { error: "Rota não encontrada" });
	} catch (error) {
		if (!error.status || error.status >= 500) {
			console.error("Falha ao processar solicitação da API:", error.message);
		}
		sendJson(response, error.status || 500, { error: error.status ? error.message : "Falha ao processar a solicitação" });
	}
}

const server = http.createServer(handleRequest);
loadData().then(async () => {
	if (process.env.NODE_ENV === "production" && (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !SUPABASE_SECRET_KEY || !ADMIN_EMAILS.size)) {
		throw new Error("Production exige GX_SUPABASE_URL, GX_SUPABASE_PUBLISHABLE_KEY, GX_SUPABASE_SECRET_KEY e GX_ADMIN_EMAILS");
	}
	if (USE_SUPABASE_DATABASE) {
		await Promise.all([
			supabaseRows("clients", { limit: "1" }),
			supabaseRows("movements", { limit: "1" }),
			supabaseRows("financial_transactions", { limit: "1" })
		]);
	} else {
		console.warn("Supabase secret key is not configured; using local JSON file storage.");
	}
}).then(() => {
	server.listen(PORT, "0.0.0.0", () => console.log(`GX API disponível na porta ${PORT}`));
}).catch((error) => {
	console.error("Falha ao iniciar a API:", error.message);
	process.exitCode = 1;
});
