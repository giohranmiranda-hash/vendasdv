/* ICE SISTEMA — Vendas: múltiplos itens por pedido, canal editável, fiado,
   imposto/lucro líquido/CPV real (FIFO dos lotes), vendas por canal no mês. */
"use strict";

const ViewVendas = {
  month() { return App.viewState.vendasMonth || U.monthStr(); }, // padrão: mês CALENDÁRIO atual

  render() {
    const v = U.$("#view");
    const st = App.state;
    const ym = ViewVendas.month();
    const ms = Engine.monthSummary(st, ym);
    const channels = Engine.channelBreakdown(st, ym);
    const fiado = Engine.receivables(st);

    v.innerHTML = `
      <div class="view-head"><h2>💰 Vendas</h2>
        <div class="flex">${UI.monthNavHtml(ym)}
        <button class="btn primary" id="vd-new">＋ Nova venda</button></div></div>

      ${fiado.length ? `<div class="banner warn">💳 <div><b>${fiado.length} venda(s) em aberto (fiado)</b> somando ${U.money(U.sum(fiado, (s) => Engine.saleGross(s)))} — cobre pelo WhatsApp na lista abaixo.</div></div>` : ""}

      <div class="grid g4 mb">
        <div class="card kpi accent"><div class="k-label">Faturamento no mês</div><div class="k-value">${U.money(ms.revenue)}</div><div class="k-sub">${ms.count} venda(s)</div></div>
        <div class="card kpi ${ms.profit >= 0 ? "good" : "bad"}"><div class="k-label">Lucro líquido</div><div class="k-value">${U.money(ms.profit)}</div><div class="k-sub">margem ${U.pct(ms.margin)}</div></div>
        <div class="card kpi"><div class="k-label">CPV real (FIFO)</div><div class="k-value">${U.money(ms.cogs)}</div><div class="k-sub">imposto ${U.money(ms.tax)}</div></div>
        <div class="card kpi"><div class="k-label">Ticket médio</div><div class="k-value">${U.money(ms.ticket)}</div></div>
      </div>

      <div class="card mb">
        <h3>📣 Vendas por canal no mês</h3>
        <div class="muted small mb">Pra medir onde seu tráfego/marketing tá performando.</div>
        ${channels.length ? Charts.bars(channels.map((c) => ({ label: c.channel, value: c.revenue, hint: U.money(c.revenue) + " · " + U.pct(c.pct, 0) + " · " + c.count + "v" }))) : '<div class="chart-empty">Sem vendas neste mês</div>'}
      </div>

      <div class="list" id="vd-list"></div>`;

    UI.bindMonthNav(v, () => ViewVendas.month(), (nym) => { App.viewState.vendasMonth = nym; App.render(); });
    U.$("#vd-new").onclick = () => ViewVendas.saleModal(null);

    const list = U.$("#vd-list");
    const sales = U.sortBy(ms.sales, (s) => s.date + s.id, true);
    if (!sales.length) { list.innerHTML = UI.emptyHtml("💰", "Nenhuma venda em " + U.monthLabel(ym) + "."); return; }
    list.innerHTML = sales.map((s) => {
      const gross = Engine.saleGross(s);
      const net = Engine.saleNet(st, s);
      const cust = s.customerId ? st.customers.find((c) => c.id === s.customerId) : null;
      const custName = cust ? cust.name : s.customerName || "";
      return `<div class="row-card">
        <div class="rc-main">
          <div class="rc-title">${U.esc(UI.itemsSummary(s.items))} ${s.received ? "" : '<span class="badge warn">fiado</span>'}</div>
          <div class="rc-sub">${U.relDate(s.date)} · ${U.fmtDate(s.date)} · <span class="badge info">${U.esc(s.channel || "—")}</span>
            ${custName ? " · 👤 " + U.esc(custName) : ""}${s.sellerId ? " · 🧑‍💼 " + U.esc((st.team.find((t) => t.id === s.sellerId) || {}).name || "") : ""}</div>
        </div>
        <div class="rc-side"><div><b>${U.money(gross)}</b></div>
          <div class="small ${net >= 0 ? "" : ""}" style="color:${net >= 0 ? "var(--ok)" : "var(--bad)"}">líq. ${U.money(net)}</div></div>
        <div class="rc-actions">
          ${!s.received ? `<button class="btn small primary" data-receber="${s.id}">✅ Recebi</button>
          ${cust && cust.phone ? `<button class="btn small wa" data-cobrar="${s.id}">💬 Cobrar</button>` : ""}` : ""}
          <button class="btn small danger" data-del="${s.id}">🗑️</button>
        </div></div>`;
    }).join("");

    U.$$("[data-receber]", list).forEach((b) => (b.onclick = () => {
      const s = st.sales.find((x) => x.id === b.dataset.receber);
      s.received = true;
      App.save();
      UI.toast("Recebido registrado ✅", "ok");
    }));
    U.$$("[data-cobrar]", list).forEach((b) => (b.onclick = () => {
      const s = st.sales.find((x) => x.id === b.dataset.cobrar);
      const cust = st.customers.find((c) => c.id === s.customerId);
      const msg = U.fillTemplate(st.settings.waTemplates.cobranca, { nome: cust.name, valor: U.money(Engine.saleGross(s)) });
      window.open(U.waLink(cust.phone, msg), "_blank");
    }));
    U.$$("[data-del]", list).forEach((b) => (b.onclick = () => {
      const s = st.sales.find((x) => x.id === b.dataset.del);
      UI.confirm("Apagar esta venda? Os itens voltam pro estoque (lotes de origem).", () => {
        Engine.restoreFIFO(st, s.fifo);
        st.sales = st.sales.filter((x) => x.id !== s.id);
        App.save();
      }, { danger: true, yes: "Apagar" });
    }));
  },

  /* modal de venda — usado também pelo CRM (pré-preenchido de um lead) */
  saleModal(prefill) {
    const st = App.state;
    const items = UI.activeItems();
    if (!items.length) return UI.toast("Cadastre produtos no catálogo primeiro (⚙️ Configurações).", "bad");
    prefill = prefill || {};
    const lines = prefill.lines || [{ itemId: items[0].id, qty: "", unitPrice: "" }];
    const custOptions = [{ value: "", label: "— avulso / digitar nome —" }]
      .concat(st.customers.map((c) => ({ value: c.id, label: c.name })));

    const m = UI.modal(`
      <h3>💰 Nova venda</h3>
      <div class="form-row">
        <div><label>Data</label><input type="date" id="vd-date" value="${U.todayStr()}"/></div>
        <div><label>Canal</label>${UI.selectHtml("vd-channel", st.settings.channels, prefill.channel || st.settings.channels[0])}</div>
      </div>
      <div class="form-row">
        <div><label>Cliente</label>${UI.selectHtml("vd-cust", custOptions, prefill.customerId || "")}</div>
        <div id="vd-custname-wrap" style="${prefill.customerId ? "display:none" : ""}"><label>Nome (avulso)</label><input id="vd-custname" value="${U.esc(prefill.customerName || "")}" placeholder="opcional"/></div>
      </div>
      ${st.team.length ? `<label>Vendedor (comissão)</label>${UI.selectHtml("vd-seller", [{ value: "", label: "—" }].concat(st.team.map((t) => ({ value: t.id, label: t.name }))), "")}` : ""}
      <h3 class="mt">Itens</h3>
      <div id="vd-lines"></div>
      <button class="btn small mt" id="vd-addline">＋ Adicionar item</button>
      <div class="form-row mt">
        <div><label>Frete cobrado</label><input id="vd-freight" inputmode="decimal" value="${prefill.freight || ""}" placeholder="0,00"/></div>
        <div><label>Pagamento</label>${UI.selectHtml("vd-received", [{ value: "1", label: "✅ Recebido" }, { value: "0", label: "💳 Fiado (a receber)" }], "1")}</div>
      </div>
      <div class="card mt" id="vd-preview" style="background:var(--bg2)"></div>
      <div class="m-actions"><button class="btn" data-a="c">Cancelar</button><button class="btn primary" data-a="s">Registrar venda</button></div>`);

    const renderLines = () => {
      U.$("#vd-lines", m.el).innerHTML = lines.map((l, i) => `
        <div class="form-row3 mb" data-line="${i}">
          <select data-lf="itemId">${items.map((it) => `<option value="${it.id}" ${it.id === l.itemId ? "selected" : ""}>${U.esc(it.name)} (${U.num(Engine.productStock(st, it.id), 0)} un)</option>`).join("")}</select>
          <input data-lf="qty" inputmode="decimal" placeholder="Qtd" value="${l.qty}"/>
          <div class="flex" style="flex-wrap:nowrap"><input data-lf="unitPrice" inputmode="decimal" placeholder="Preço/un" value="${l.unitPrice}"/>
          ${lines.length > 1 ? `<button class="btn small danger" data-ldel="${i}">✕</button>` : ""}</div>
        </div>`).join("");
      U.$$("[data-line]", m.el).forEach((row) => {
        const i = Number(row.dataset.line);
        U.$$("[data-lf]", row).forEach((f) => {
          f.addEventListener("input", () => { lines[i][f.dataset.lf] = f.value; preview(); });
          f.addEventListener("change", () => { lines[i][f.dataset.lf] = f.value; preview(); });
        });
      });
      U.$$("[data-ldel]", m.el).forEach((b) => (b.onclick = () => { lines.splice(Number(b.dataset.ldel), 1); renderLines(); preview(); }));
    };

    const preview = () => {
      const gross = U.sum(lines, (l) => U.parseNum(l.qty) * U.parseNum(l.unitPrice)) + U.parseNum(U.$("#vd-freight").value);
      const tax = gross * ((Number(st.settings.taxPct) || 0) / 100);
      // estimativa de CPV sem consumir (consumo real só no salvar)
      let cogs = 0;
      for (const l of lines) cogs += U.parseNum(l.qty) * Engine.estimatedUnitCost(st, l.itemId);
      U.$("#vd-preview", m.el).innerHTML = `
        <div class="flex spread"><span class="muted small">Total</span><b>${U.money(gross)}</b></div>
        <div class="flex spread"><span class="muted small">Imposto (${U.pct(st.settings.taxPct, 1)}) + CPV estimado</span><span>−${U.money(tax + cogs)}</span></div>
        <div class="flex spread"><span class="muted small">Lucro líquido estimado</span><b style="color:${gross - tax - cogs >= 0 ? "var(--ok)" : "var(--bad)"}">${U.money(gross - tax - cogs)}</b></div>`;
    };

    U.$("#vd-addline", m.el).onclick = () => { lines.push({ itemId: items[0].id, qty: "", unitPrice: "" }); renderLines(); };
    U.$("#vd-cust", m.el).onchange = (e) => { U.$("#vd-custname-wrap", m.el).style.display = e.target.value ? "none" : "block"; };
    U.$("#vd-freight", m.el).addEventListener("input", preview);
    renderLines(); preview();

    U.$('[data-a="c"]', m.el).onclick = m.close;
    U.$('[data-a="s"]', m.el).onclick = () => {
      const saleItems = lines
        .map((l) => ({ itemId: l.itemId, qty: U.parseNum(l.qty), unitPrice: U.parseNum(l.unitPrice) }))
        .filter((l) => l.qty > 0);
      if (!saleItems.length) return UI.toast("Informe a quantidade de pelo menos um item.", "bad");
      // CPV real: consome lotes FIFO agora
      let cogs = 0; const fifo = [];
      for (const it of saleItems) {
        const r = Engine.consumeFIFO(st, it.itemId, it.qty);
        cogs += r.cogs; fifo.push(...r.taken);
      }
      const sale = {
        id: U.uid(),
        date: U.$("#vd-date").value || U.todayStr(),
        channel: U.$("#vd-channel").value,
        customerId: U.$("#vd-cust").value || null,
        customerName: U.$("#vd-cust").value ? "" : U.$("#vd-custname").value.trim(),
        sellerId: U.$("#vd-seller") ? U.$("#vd-seller").value || null : null,
        items: saleItems,
        freight: U.parseNum(U.$("#vd-freight").value),
        received: U.$("#vd-received").value === "1",
        cogs, fifo,
      };
      st.sales.push(sale);
      m.close();
      // cliente avulso com nome vira cadastro editável depois
      if (!sale.customerId && sale.customerName) {
        const exists = st.customers.find((c) => c.name.toLowerCase() === sale.customerName.toLowerCase());
        if (!exists) {
          const nc = { id: U.uid(), name: sale.customerName, phone: "", address: "", cep: "", lat: null, lng: null, createdAt: U.todayStr() };
          st.customers.push(nc);
          sale.customerId = nc.id;
        } else sale.customerId = exists.id;
      }
      App.save();
      if (App.currentView !== "vendas") App.go("vendas");
      UI.toast("Venda registrada 💰 Lucro líq. " + U.money(Engine.saleNet(st, sale)), "ok");
    };
  },
};
