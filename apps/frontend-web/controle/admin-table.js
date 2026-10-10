(() => {
  const pageSize = 20;
  const clients = new Map();
  const rows = document.getElementById("admin-clientes-rows");
  const emptyRow = document.getElementById("tabela-vazia-row");
  const adminContainer = document.getElementById("admin-container");
  let page = 1;
  let hasMore = true;
  let loading = false;

  const apiRoot = location.origin;
  const financialTransactionsUrl = `${apiRoot}/api/financial-transactions`;

  function localDateValue() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 10);
  }

  function createFinancialPanel() {
    if (!adminContainer || !document.getElementById("admin-tx-history")) return null;

    const panel = document.createElement("section");
    panel.style.cssText = "margin:20px 0;padding:20px;background:#1e2329;border:1px solid #2f343b;border-radius:8px;color:#eaecef";

    const heading = document.createElement("h3");
    heading.textContent = "Lançamentos Financeiros";
    heading.style.cssText = "margin-top:0;color:var(--primary)";

    const form = document.createElement("form");
    form.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;align-items:end";

    function createField(labelText, control) {
      const field = document.createElement("label");
      field.style.cssText = "display:grid;gap:6px;color:#b7bdc6;font-size:14px";
      field.append(labelText, control);
      control.style.cssText = "width:100%;box-sizing:border-box;padding:10px;background:#2b3139;border:1px solid #474d57;border-radius:4px;color:#eaecef";
      return field;
    }

    const type = document.createElement("select");
    for (const [value, label] of [["CREDIT", "Crédito"], ["DEBIT", "Débito"]]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      type.append(option);
    }

    const description = document.createElement("input");
    description.type = "text";
    description.maxLength = 240;
    description.required = true;
    description.placeholder = "Ex.: pagamento de fornecedor";

    const amount = document.createElement("input");
    amount.type = "number";
    amount.min = "0.01";
    amount.step = "0.01";
    amount.required = true;
    amount.placeholder = "0,00";

    const date = document.createElement("input");
    date.type = "date";
    date.required = true;
    date.value = localDateValue();

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Registrar lançamento";
    submit.style.cssText = "padding:11px;background:var(--primary);border:0;border-radius:4px;font-weight:bold;cursor:pointer";

    form.append(
      createField("Tipo", type),
      createField("Descrição", description),
      createField("Valor (R$)", amount),
      createField("Data", date),
      submit
    );

    const status = document.createElement("p");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.style.cssText = "min-height:20px;margin:12px 0;color:#b7bdc6;font-size:14px";

    const listHeading = document.createElement("h4");
    listHeading.textContent = "Histórico de lançamentos";
    listHeading.style.cssText = "margin:20px 0 8px;color:#eaecef";

    const tableWrapper = document.createElement("div");
    tableWrapper.style.cssText = "overflow-x:auto";
    const table = document.createElement("table");
    table.style.cssText = "width:100%;border-collapse:collapse;color:#eaecef;font-size:14px;text-align:left";
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const label of ["Data", "Tipo", "Descrição", "Valor"]) {
      const cell = document.createElement("th");
      cell.textContent = label;
      cell.style.cssText = "padding:10px;border-bottom:1px solid #474d57;color:#848e9c";
      headerRow.append(cell);
    }
    thead.append(headerRow);
    const body = document.createElement("tbody");
    table.append(thead, body);
    tableWrapper.append(table);

    panel.append(heading, form, status, listHeading, tableWrapper);
    const auditCard = document.getElementById("admin-tx-history").parentElement;
    auditCard.parentElement.insertBefore(panel, auditCard);
    return { panel, form, type, description, amount, date, submit, status, body };
  }

  const financialPanel = createFinancialPanel();

  function showFinancialStatus(message, isError = false) {
    if (!financialPanel) return;
    financialPanel.status.textContent = message;
    financialPanel.status.style.color = isError ? "#cf304a" : "#02c076";
  }

  function renderFinancialTransactions(transactions) {
    financialPanel.body.replaceChildren();
    if (!transactions.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = "Nenhum lançamento financeiro registrado.";
      cell.style.cssText = "padding:14px 10px;color:#848e9c;text-align:center";
      row.append(cell);
      financialPanel.body.append(row);
      return;
    }

    for (const transaction of transactions) {
      const row = document.createElement("tr");
      const dateCell = makeCell(new Date(`${transaction.date}T00:00:00`).toLocaleDateString("pt-BR"));
      const typeCell = makeCell(transaction.type === "CREDIT" ? "Crédito" : "Débito");
      typeCell.style.color = transaction.type === "CREDIT" ? "#02c076" : "#cf304a";
      const descriptionCell = makeCell(transaction.description);
      const valueCell = makeCell(
        `${transaction.type === "CREDIT" ? "+" : "-"} ${Number(transaction.value).toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL"
        })}`
      );
      valueCell.style.color = typeCell.style.color;
      row.style.borderBottom = "1px solid #2f343b";
      row.append(dateCell, typeCell, descriptionCell, valueCell);
      financialPanel.body.append(row);
    }
  }

  async function refreshFinancialTransactions() {
    if (!financialPanel) return;
    try {
      const response = await fetch(financialTransactionsUrl);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Falha ao carregar lançamentos (${response.status})`);
      renderFinancialTransactions(result.transactions);
      showFinancialStatus("");
    } catch (error) {
      showFinancialStatus(`Não foi possível carregar os lançamentos: ${error.message}`, true);
      console.error(error);
    }
  }

  if (financialPanel) {
    financialPanel.form.addEventListener("submit", async (event) => {
      event.preventDefault();
      financialPanel.submit.disabled = true;
      showFinancialStatus("Salvando lançamento...");
      try {
        const response = await fetch(financialTransactionsUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: financialPanel.type.value,
            description: financialPanel.description.value,
            value: financialPanel.amount.value,
            date: financialPanel.date.value
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Falha ao salvar lançamento (${response.status})`);
        financialPanel.form.reset();
        financialPanel.date.value = localDateValue();
        await refreshFinancialTransactions();
        showFinancialStatus("Lançamento financeiro registrado.");
      } catch (error) {
        showFinancialStatus(`Não foi possível salvar o lançamento: ${error.message}`, true);
        console.error(error);
      } finally {
        financialPanel.submit.disabled = false;
      }
    });
    refreshFinancialTransactions();
  }

  window.addEventListener("gx-authenticated", () => {
    refreshFirstPage();
    refreshFinancialTransactions();
  });

  function makeCell(value) {
    const cell = document.createElement("td");
    cell.style.padding = "10px";
    cell.textContent = value || "-";
    return cell;
  }

  function renderRows() {
    rows.replaceChildren();
    const sortedClients = [...clients.values()].sort((left, right) => {
      const leftDate = left.latestMovement?.createdAt || left.createdAt;
      const rightDate = right.latestMovement?.createdAt || right.createdAt;
      return rightDate.localeCompare(leftDate);
    });

    if (!sortedClients.length) {
      const empty = emptyRow || document.createElement("tr");
      empty.id = "tabela-vazia-row";
      empty.innerHTML = '<td colspan="5" style="padding:20px;text-align:center;color:#848e9c">Nenhum cliente cadastrado.</td>';
      rows.append(empty);
    } else {
      for (const client of sortedClients) {
        const latest = client.latestMovement;
        const row = document.createElement("tr");
        row.style.borderBottom = "1px solid #2f343b";
        row.append(
          makeCell(client.name || client.email),
          makeCell(client.document),
          makeCell(latest ? new Date(latest.createdAt).toLocaleString("pt-BR") : "Sem movimentações"),
          makeCell(latest ? `${latest.type === "DEPÓSITO PIX" ? "R$" : "USDT"} ${latest.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "-")
        );

        const actionCell = document.createElement("td");
        actionCell.style.cssText = "padding:10px;text-align:center";
        const historyButton = document.createElement("button");
        historyButton.type = "button";
        historyButton.textContent = `Histórico (${client.movementCount})`;
        historyButton.style.cssText = "background:var(--primary);color:#000;border:0;padding:6px 10px;border-radius:3px;cursor:pointer";
        historyButton.addEventListener("click", () => window.abrirHistoricoCliente(client.id, client.name || client.email));
        actionCell.append(historyButton);
        row.append(actionCell);
        rows.append(row);
      }
    }

    if (hasMore) {
      const moreRow = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.style.cssText = "padding:12px;text-align:center";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = loading ? "Carregando..." : "Carregar próximos 20 clientes";
      button.disabled = loading;
      button.addEventListener("click", loadNextPage);
      cell.append(button);
      moreRow.append(cell);
      rows.append(moreRow);
    }
  }

  async function fetchPage(requestedPage) {
    const response = await fetch(`${apiRoot}/api/clients?page=${requestedPage}&pageSize=${pageSize}`);
    if (!response.ok) throw new Error(`Falha ao carregar clientes (${response.status})`);
    return response.json();
  }

  async function loadNextPage() {
    if (loading || !hasMore || adminContainer?.style.display === "none") return;
    loading = true;
    renderRows();
    try {
      const result = await fetchPage(page);
      result.items.forEach((client) => clients.set(client.id, client));
      page += 1;
      hasMore = result.hasMore;
    } catch (error) {
      console.error(error);
    } finally {
      loading = false;
      renderRows();
    }
  }

  async function refreshFirstPage() {
    if (document.hidden || adminContainer?.style.display === "none") return;
    try {
      const result = await fetchPage(1);
      result.items.forEach((client) => clients.set(client.id, client));
      hasMore = result.total > clients.size;
      renderRows();
    } catch (error) {
      console.error(error);
    }
  }

  window.abrirHistoricoCliente = async (clientId, name) => {
    const modal = document.getElementById("modal-historico-cliente");
    const title = document.getElementById("modal-cliente-titulo");
    const documentLabel = document.getElementById("modal-cliente-doc");
    const list = document.getElementById("modal-cliente-lista");
    const client = clients.get(clientId);
    title.textContent = `Movimentações de ${name}`;
    documentLabel.textContent = `Doc: ${client?.document || "não informado"}`;
    list.replaceChildren();
    const loadingItem = document.createElement("div");
    loadingItem.textContent = "Carregando histórico...";
    list.append(loadingItem);
    modal.style.display = "flex";

    try {
      const response = await fetch(`${apiRoot}/api/clients/${encodeURIComponent(clientId)}/movements`);
      if (!response.ok) throw new Error("Não foi possível carregar o histórico");
      const result = await response.json();
      list.replaceChildren();
      if (!result.movements.length) {
        const empty = document.createElement("div");
        empty.textContent = "Nenhuma movimentação registrada.";
        list.append(empty);
      }
      for (const movement of result.movements) {
        const item = document.createElement("div");
        item.style.cssText = "padding:8px 0;border-bottom:1px solid #2f343b";
        const date = document.createElement("span");
        date.style.color = "#848e9c";
        date.textContent = `[${new Date(movement.createdAt).toLocaleString("pt-BR")}] `;
        const description = document.createElement("span");
        description.style.color = "#02c076";
        description.textContent = movement.description;
        const value = document.createElement("strong");
        value.textContent = ` ${movement.type === "DEPÓSITO PIX" ? "R$" : "USDT"} ${movement.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
        item.append(date, description, value);
        list.append(item);
      }
    } catch (error) {
      list.replaceChildren();
      const failure = document.createElement("div");
      failure.textContent = "Falha ao carregar o histórico.";
      list.append(failure);
      console.error(error);
    }
  };

  window.addEventListener("scroll", () => {
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 240) loadNextPage();
  });

  loadNextPage();
  window.setInterval(refreshFirstPage, 3000);
})();