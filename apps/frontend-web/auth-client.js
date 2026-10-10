"use strict";

(() => {
	const config = window.GX_AUTH_CONFIG;
	const loginScreen = document.getElementById("login-screen");
	const loginForm = document.getElementById("form-login");
	const registrationForm = document.getElementById("form-cadastro");
	const loginButton = document.getElementById("btn-entrar");
	const registerButton = document.getElementById("btn-cadastrar");
	const mainContainer = document.getElementById("main-container");
	const adminContainer = document.getElementById("admin-container");
	const supabaseSdk = window.supabase;

	localStorage.removeItem("gx_autenticado");
	if (mainContainer) mainContainer.style.display = "none";
	if (adminContainer) adminContainer.style.display = "none";
	loginScreen.style.display = "flex";

	if (!config?.url || !config.publishableKey || !supabaseSdk?.createClient) {
		window.mostrarMensagem("Configure a URL e a chave pública do Supabase no servidor para habilitar o acesso.");
		return;
	}

	const authClient = supabaseSdk.createClient(config.url, config.publishableKey, {
		auth: {
			autoRefreshToken: true,
			detectSessionInUrl: true,
			persistSession: true
		}
	});
	const nativeFetch = window.fetch.bind(window);
	window.fetch = async (input, init = {}) => {
		let requestUrl = new URL(input instanceof Request ? input.url : input, location.href);
		if (!requestUrl.pathname.startsWith("/api/")) {
			return nativeFetch(input, init);
		}
		if (requestUrl.origin !== location.origin) {
			requestUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, location.origin);
			input = input instanceof Request ? new Request(requestUrl, input) : requestUrl.href;
		}
		const { data } = await authClient.auth.getSession();
		const headers = new Headers(input instanceof Request ? input.headers : undefined);
		new Headers(init.headers).forEach((value, key) => headers.set(key, value));
		if (!headers.has("Authorization") && data.session?.access_token) {
			headers.set("Authorization", `Bearer ${data.session.access_token}`);
		}
		return nativeFetch(input, { ...init, headers });
	};

	const emailInput = document.getElementById("login-email");
	const passwordInput = document.getElementById("login-senha");
	const authStep = document.createElement("section");
	authStep.className = "login-card auth-step";
	authStep.hidden = true;
	loginScreen.append(authStep);

	function showLogin(message = "") {
		authStep.hidden = true;
		authStep.replaceChildren();
		loginForm.style.display = "block";
		registrationForm.style.display = "none";
		loginScreen.style.display = "flex";
		if (message) window.mostrarMensagem(message);
	}

	function setBusy(busy) {
		loginButton.disabled = busy;
		registerButton.disabled = busy;
		loginButton.textContent = busy ? "Aguarde..." : "Entrar na Plataforma";
		registerButton.textContent = busy ? "Aguarde..." : "Concluir Cadastro Comercial";
	}

	function createActionButton(label, onClick) {
		const button = document.createElement("button");
		button.type = "button";
		button.textContent = label;
		button.addEventListener("click", onClick);
		return button;
	}

	function showCodeStep({ title, instructions, factorId, challengeId, enrollment }) {
		loginForm.style.display = "none";
		registrationForm.style.display = "none";
		authStep.hidden = false;
		authStep.replaceChildren();

		const heading = document.createElement("h2");
		heading.textContent = title;
		heading.style.cssText = "margin-top:0;color:var(--primary);text-align:center";
		const description = document.createElement("p");
		description.textContent = instructions;
		description.style.cssText = "color:#b7bdc6;line-height:1.5";
		authStep.append(heading, description);

		if (enrollment) {
			const qrCode = document.createElement("img");
			qrCode.src = enrollment.qrCode;
			qrCode.alt = "Código QR para configurar o aplicativo autenticador";
			qrCode.style.cssText = "display:block;width:200px;height:200px;max-width:100%;margin:16px auto;background:white";
			const manualSecret = document.createElement("p");
			manualSecret.textContent = `Se não conseguir ler o QR, insira esta chave no autenticador: ${enrollment.secret}`;
			manualSecret.style.cssText = "overflow-wrap:anywhere;color:#b7bdc6;font-size:13px";
			authStep.append(qrCode, manualSecret);
		}

		const form = document.createElement("form");
		const label = document.createElement("label");
		label.textContent = "Código de 6 dígitos do aplicativo autenticador";
		label.style.cssText = "display:block;margin:12px 0 6px;color:#b7bdc6";
		const code = document.createElement("input");
		code.type = "text";
		code.inputMode = "numeric";
		code.autocomplete = "one-time-code";
		code.pattern = "[0-9]{6}";
		code.maxLength = 6;
		code.required = true;
		code.setAttribute("aria-label", label.textContent);
		form.append(label, code);

		const status = document.createElement("p");
		status.setAttribute("role", "alert");
		status.style.cssText = "min-height:20px;color:#cf304a;font-size:14px";
		form.append(status);

		const submit = document.createElement("button");
		submit.type = "submit";
		submit.textContent = enrollment ? "Ativar autenticador e continuar" : "Verificar e entrar";
		form.append(submit);
		authStep.append(form, createActionButton("Cancelar e sair", async () => {
			await authClient.auth.signOut();
			showLogin();
		}));

		form.addEventListener("submit", async (event) => {
			event.preventDefault();
			if (!/^\d{6}$/.test(code.value)) {
				status.textContent = "Informe o código de 6 dígitos.";
				return;
			}
			submit.disabled = true;
			status.textContent = "";
			try {
				const result = enrollment
					? await authClient.auth.mfa.challengeAndVerify({ factorId, code: code.value })
					: await authClient.auth.mfa.verify({ factorId, challengeId, code: code.value });
				if (result.error) throw result.error;
				await finishAuthenticatedSession();
			} catch (error) {
				status.textContent = error.message || "Código inválido. Tente novamente.";
				console.error("Falha na verificação TOTP:", error);
			} finally {
				submit.disabled = false;
			}
		});
		code.focus();
	}

	async function finishAuthenticatedSession() {
		const { data: sessionData, error: sessionError } = await authClient.auth.getSession();
		if (sessionError) throw sessionError;
		if (!sessionData.session) throw new Error("A sessão não foi iniciada. Faça login novamente.");

		const response = await fetch("/api/auth/session", {
			headers: { Authorization: `Bearer ${sessionData.session.access_token}` }
		});
		const result = await response.json();
		if (!response.ok) throw new Error(result.error || "Não foi possível validar o acesso.");

		const expectedRole = config.panel === "controle" ? "admin" : "client";
		if (result.role !== expectedRole) {
			await authClient.auth.signOut();
			throw new Error(expectedRole === "admin"
				? "Esta conta não está autorizada como administradora."
				: "Use o painel administrativo para acessar com esta conta.");
		}

		if (config.panel === "cliente") {
			const metadata = sessionData.session.user.user_metadata || {};
			const profileResponse = await fetch("/api/register", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${sessionData.session.access_token}`
				},
				body: JSON.stringify({
					name: metadata.name,
					document: metadata.document,
					email: result.user.email
				})
			});
			if (!profileResponse.ok) {
				const profileResult = await profileResponse.json();
				throw new Error(profileResult.error || "Não foi possível carregar o perfil do cliente.");
			}
			localStorage.setItem("gx_cliente_perfil", JSON.stringify({
				name: metadata.name || "",
				document: metadata.document || "",
				email: result.user.email
			}));
			localStorage.setItem("gx_cliente_email", result.user.email);
		}

		loginScreen.style.display = "none";
		authStep.hidden = true;
		if (expectedRole === "admin") adminContainer.style.display = "block";
		else mainContainer.style.display = "grid";
		window.dispatchEvent(new Event("gx-authenticated"));
	}

	async function requireTotp() {
		const { data: assurance, error: assuranceError } = await authClient.auth.mfa.getAuthenticatorAssuranceLevel();
		if (assuranceError) throw assuranceError;
		if (assurance.currentLevel === "aal2") {
			await finishAuthenticatedSession();
			return;
		}

		const { data: factorData, error: factorError } = await authClient.auth.mfa.listFactors();
		if (factorError) throw factorError;
		const verifiedFactor = factorData.totp.find((factor) => factor.status === "verified");
		if (verifiedFactor) {
			const { data: challenge, error } = await authClient.auth.mfa.challenge({ factorId: verifiedFactor.id });
			if (error) throw error;
			showCodeStep({
				title: "Verificação em duas etapas",
				instructions: "Abra seu aplicativo autenticador e informe o código atual para continuar.",
				factorId: verifiedFactor.id,
				challengeId: challenge.id
			});
			return;
		}

		for (const factor of factorData.totp) {
			const { error } = await authClient.auth.mfa.unenroll({ factorId: factor.id });
			if (error) throw error;
		}
		const { data: enrollment, error: enrollmentError } = await authClient.auth.mfa.enroll({
			factorType: "totp",
			friendlyName: "GX Authenticator",
			issuer: "GX Global Exchange"
		});
		if (enrollmentError) throw enrollmentError;
		showCodeStep({
			title: "Configure seu aplicativo autenticador",
			instructions: "Escaneie o QR com um aplicativo autenticador e digite o código gerado. O TOTP é obrigatório para acessar a conta.",
			factorId: enrollment.id,
			enrollment: {
				qrCode: enrollment.totp.qr_code,
				secret: enrollment.totp.secret
			}
		});
	}

	async function login() {
		const email = emailInput.value.trim().toLowerCase();
		const password = passwordInput.value;
		if (!email || !password) {
			window.mostrarMensagem("Informe seu e-mail e senha.");
			return;
		}
		setBusy(true);
		try {
			const { error } = await authClient.auth.signInWithPassword({ email, password });
			if (error) throw error;
			await requireTotp();
		} catch (error) {
			window.mostrarMensagem(error.message || "Não foi possível entrar.");
			console.error("Falha no login Supabase:", error);
		} finally {
			setBusy(false);
		}
	}

	async function register() {
		const name = document.getElementById("cad-nome").value.trim();
		const email = document.getElementById("cad-email").value.trim().toLowerCase();
		const documentNumber = document.getElementById("cad-documento").value.trim();
		const password = document.getElementById("cad-senha").value;
		if (!name || !email || !documentNumber || !password) {
			window.mostrarMensagem("Preencha nome, e-mail, CPF/CNPJ e senha.");
			return;
		}
		if (password.length < 8) {
			window.mostrarMensagem("A senha deve conter pelo menos 8 caracteres.");
			return;
		}
		setBusy(true);
		try {
			const { error } = await authClient.auth.signUp({
				email,
				password,
				options: {
					data: { name, document: documentNumber },
					emailRedirectTo: `${location.origin}/`
				}
			});
			if (error) throw error;
			document.getElementById("cad-senha").value = "";
			document.getElementById("login-email").value = email;
			showLogin("Cadastro recebido. Confirme o e-mail enviado antes de entrar; depois, configure o aplicativo autenticador.");
		} catch (error) {
			window.mostrarMensagem(error.message || "Não foi possível criar a conta.");
			console.error("Falha no cadastro Supabase:", error);
		} finally {
			setBusy(false);
		}
	}

	loginButton.onclick = login;
	registerButton.onclick = register;
	window.processarAutenticacao = login;
	emailInput.onkeydown = passwordInput.onkeydown = (event) => {
		if (event.key === "Enter") login();
	};
	window.addEventListener("click", (event) => {
		const target = event.target;
		const logoutButton = target instanceof Element && target.closest("#btn-sair,#btn-sair-admin");
		if (!logoutButton) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		authClient.auth.signOut().then(() => {
			localStorage.removeItem("gx_cliente_perfil");
			localStorage.removeItem("gx_cliente_email");
			location.reload();
		}).catch((error) => {
			console.error("Falha ao encerrar sessão Supabase:", error);
			window.mostrarMensagem("Não foi possível encerrar a sessão. Tente novamente.");
		});
	}, true);

	authClient.auth.getSession().then(async ({ data, error }) => {
		if (error) throw error;
		if (data.session) await requireTotp();
	}).catch((error) => {
		console.error("Falha ao restaurar sessão Supabase:", error);
		showLogin(error.message || "Não foi possível restaurar a sessão. Entre novamente.");
	});
})();
