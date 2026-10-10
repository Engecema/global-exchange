"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const supabaseUrl = (process.env.GX_SUPABASE_URL || "").replace(/\/+$/, "");
const secretKey = process.env.GX_SUPABASE_SECRET_KEY || process.env.GX_SUPABASE_SERVICE_ROLE_KEY || "";
const dataFile = process.argv[2] || process.env.GX_DATA_FILE || path.join(__dirname, "data", "gx-data.json");

if (!supabaseUrl || !secretKey) {
	console.error("Set GX_SUPABASE_URL and GX_SUPABASE_SECRET_KEY in the environment before migrating.");
	process.exitCode = 1;
} else {
	migrate().catch((error) => {
		console.error("Data migration failed:", error.message);
		process.exitCode = 1;
	});
}

async function upsert(table, rows) {
	if (!rows.length) return;
	const headers = {
		apikey: secretKey,
		"Content-Type": "application/json",
		Prefer: "resolution=merge-duplicates,return=minimal"
	};
	if (secretKey.startsWith("eyJ")) headers.Authorization = `Bearer ${secretKey}`;
	const response = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=id`, {
		method: "POST",
		headers,
		body: JSON.stringify(rows),
		signal: AbortSignal.timeout(15000)
	});
	if (!response.ok) {
		throw new Error(`${table} import returned HTTP ${response.status}: ${await response.text()}`);
	}
}

async function migrate() {
	const source = JSON.parse(await fs.readFile(dataFile, "utf8"));
	const clients = (source.clients || []).map((client) => ({
		id: client.id,
		email: client.email.toLowerCase(),
		name: client.name || "",
		document: client.document || "",
		created_at: client.createdAt,
		updated_at: client.updatedAt || client.createdAt
	}));
	const movements = (source.movements || []).map((movement) => ({
		id: movement.id,
		client_id: movement.clientId.toLowerCase(),
		type: movement.type,
		description: movement.description || "",
		value: movement.value,
		created_at: movement.createdAt
	}));
	const financialTransactions = (source.financialTransactions || []).map((transaction) => ({
		id: transaction.id,
		type: transaction.type,
		description: transaction.description,
		value: transaction.value,
		transaction_date: transaction.date,
		created_at: transaction.createdAt
	}));

	for (const client of clients) {
		if (!client.id || client.id !== client.email || !client.email.includes("@") || !client.created_at) {
			throw new Error("Source contains a client with an invalid id, email, or creation date.");
		}
	}
	const clientIds = new Set(clients.map((client) => client.id));
	for (const movement of movements) {
		if (!movement.id || !clientIds.has(movement.client_id) || !movement.created_at || !Number.isFinite(Number(movement.value))) {
			throw new Error("Source contains a movement with an invalid id, client, date, or value.");
		}
	}
	for (const transaction of financialTransactions) {
		if (!transaction.id || !["CREDIT", "DEBIT"].includes(transaction.type) || !transaction.description ||
			!transaction.transaction_date || !transaction.created_at || !Number.isFinite(Number(transaction.value)) ||
			Number(transaction.value) <= 0) {
			throw new Error("Source contains a financial transaction with invalid fields.");
		}
	}

	await upsert("clients", clients);
	await upsert("movements", movements);
	await upsert("financial_transactions", financialTransactions);
	console.log(`Migration complete: ${clients.length} clients, ${movements.length} movements, ${financialTransactions.length} financial transactions.`);
}
