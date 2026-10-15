"use strict";

(() => {
	const layoutStylesheet = document.createElement("link");
	layoutStylesheet.rel = "stylesheet";
	layoutStylesheet.href = "/panel-layout.css";
	document.head.append(layoutStylesheet);

	document.querySelectorAll('.login-card input[type="password"]').forEach((input) => {
		let toggle = input.nextElementSibling;
		if (!toggle || toggle.tagName !== "BUTTON") {
			toggle = document.createElement("button");
			input.after(toggle);
		}

		toggle.type = "button";
		toggle.className = "password-toggle";
		toggle.setAttribute("aria-label", "Mostrar senha");
		toggle.setAttribute("aria-pressed", "false");
		toggle.textContent = "👁";
		toggle.onclick = null;
		toggle.addEventListener("click", () => {
			const visible = input.type === "password";
			input.type = visible ? "text" : "password";
			toggle.textContent = visible ? "🙈" : "👁";
			toggle.setAttribute("aria-label", visible ? "Ocultar senha" : "Mostrar senha");
			toggle.setAttribute("aria-pressed", String(visible));
			input.focus();
		});

		const field = document.createElement("div");
		field.className = "password-field";
		input.before(field);
		field.append(input, toggle);
	});

	const styles = {
		error: "#cf304a",
		success: "#02c076",
		info: "#f0b90b"
	};

	window.mostrarMensagem = (message, type = "error") => {
		let notice = document.getElementById("gx-page-notice");
		if (!notice) {
			notice = document.createElement("div");
			notice.id = "gx-page-notice";
			notice.setAttribute("role", "alert");
			notice.setAttribute("aria-live", "assertive");
			notice.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:10000;max-width:min(440px,calc(100vw - 40px));max-height:80vh;overflow-y:auto;padding:14px 18px;border:1px solid #474d57;border-left:4px solid;border-radius:4px;background:#1e2329;color:#eaecef;font:14px/1.5 sans-serif;box-shadow:0 8px 24px #0008;white-space:pre-wrap;";
			document.body.append(notice);
		}
		notice.style.borderLeftColor = styles[type] || styles.info;
		notice.textContent = message;
		notice.hidden = false;
		clearTimeout(notice.dismissTimer);
		notice.dismissTimer = setTimeout(() => { notice.hidden = true; }, 8000);
	};

	window.converterValorBR = (input) => {
		const normalized = String(input).trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
		if (!normalized || !/^-?[\d.,]+$/.test(normalized)) return Number.NaN;
		const decimalValue = normalized.includes(",")
			? normalized.replace(/\./g, "").replace(",", ".")
			: normalized;
		return Number(decimalValue);
	};
})();