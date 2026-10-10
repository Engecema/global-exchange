"use strict";

const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const panel = process.argv[2];
if (!new Set(["cliente", "controle"]).has(panel)) {
	throw new Error("Informe o painel: cliente ou controle");
}

const port = Number(process.env.PORT || (panel === "cliente" ? 8080 : 4000));
const apiUrl = process.env.GX_API_URL || "http://127.0.0.1:3000";
const panelDirectory = path.join(__dirname, panel);
const supabaseUrl = process.env.GX_SUPABASE_URL || "";
const supabasePublishableKey = process.env.GX_SUPABASE_PUBLISHABLE_KEY || "";
const app = express();

app.use("/api", async (request, response) => {
	try {
		const chunks = [];
		for await (const chunk of request) chunks.push(chunk);
		const body = Buffer.concat(chunks);
		const headers = {};
		if (request.headers["content-type"]) headers["Content-Type"] = request.headers["content-type"];
		if (request.headers.authorization) headers.Authorization = request.headers.authorization;
		const upstream = await fetch(`${apiUrl}${request.originalUrl}`, {
			method: request.method,
			headers,
			...(body.length ? { body } : {})
		});
		response.status(upstream.status);
		response.type(upstream.headers.get("content-type") || "application/json");
		response.set("Cache-Control", "no-store");
		response.send(await upstream.text());
	} catch (error) {
		console.error("Falha ao encaminhar solicitação para a API:", error.message);
		response.status(502).json({ error: "API indisponível" });
	}
});

app.get(["/", "/index.html"], async (_request, response, next) => {
	try {
		const html = await fs.readFile(path.join(panelDirectory, "index.html"), "utf8");
		const scripts = [
			'<script src="/supabase.js"></script>',
			'<script src="/auth-config.js"></script>',
			'<script src="/auth-client.js"></script>'
		].join("");
		response.set("Cache-Control", "no-store");
		response.type("html").send(html.replace("</body>", `${scripts}</body>`));
	} catch (error) {
		next(error);
	}
});

app.get("/supabase.js", (_request, response) => {
	response.set("Cache-Control", "public, max-age=3600");
	response.sendFile(path.join(__dirname, "node_modules", "@supabase", "supabase-js", "dist", "umd", "supabase.js"));
});

app.get("/auth-config.js", (_request, response) => {
	response.set("Cache-Control", "no-store");
	response.type("application/javascript").send(
		`window.GX_AUTH_CONFIG=${JSON.stringify({
			url: supabaseUrl,
			publishableKey: supabasePublishableKey,
			panel
		})};`
	);
});

app.get("/auth-client.js", (_request, response) => {
	response.set("Cache-Control", "no-store");
	response.sendFile(path.join(__dirname, "auth-client.js"));
});

app.get("/ui-messages.js", (_request, response) => {
	response.sendFile(path.join(__dirname, "ui-messages.js"));
});

app.get("/panel-layout.css", (_request, response) => {
	response.sendFile(path.join(__dirname, "panel-layout.css"));
});

app.use(express.static(panelDirectory, { etag: false, lastModified: false, maxAge: 0 }));
app.listen(port, "0.0.0.0", () => {
	console.log(`Painel ${panel} disponível na porta ${port}; API encaminhada internamente`);
});