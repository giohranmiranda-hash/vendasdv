/* ICE SISTEMA — Produção (registra por receita+item+qtd, custo real na hora,
   lote rastreável com validade) e Estoque (FIFO, alertas de validade). */
"use strict";

const ViewProducao = {
  render() {
    const v = U.$("#view");
    const st = App.state;
    const prods = U.sortBy(st.productions, (p) => p.date + p.id, true).slice(0, 60);
    v.innerHTML = `
      <div class="view-head"><h2>🏭 Produção</h2>
        <button class="btn primary" id="pr-new">＋ Registrar produção</button></div>
      <div class="muted small mb">Simples assim: quantas unidades produziu e quanto gastou — o custo por unidade e o lucro das vendas saem daí.</div>
      <div class="list" id="pr-list"></div>`;

    U.$("#pr-new").onclick = () => ViewProducao.newModal();

    const list = U.$("#pr-list");
    if (!prods.length) { list.innerHTML = UI.emptyHtml("🏭", "Nenhuma produção registrada ainda — toque em ＋ Registrar produção."); return; }
    list.innerHTML = prods.map((p) => {
      const est = Engine.expiryStatus(p.expiry);
      const badge = est === "vencido" ? `<span class="badge bad">vencido ${U.fmtDateShort(p.expiry)}</span>`
        : est === "vencendo" ? `<span class="badge warn">vence ${U.fmtDateShort(p.expiry)}</span>`
        : `<span class="badge ok">validade ${U.fmtDateShort(p.expiry)}</span>`;
      return `<div class="row-card">
        <span class="color-dot" style="background:${UI.itemColor(p.itemId)}"></span>
        <div class="rc-main">
          <div class="rc-title">${U.num(p.qty, 0)}× ${U.esc(UI.itemName(p.itemId))} ${badge}</div>
          <div class="rc-sub">${U.fmtDate(p.date)} · produzidas ${U.num(p.qty, 0)} un</div>
        </div>
        <div class="rc-side"><div><b>${U.money(p.totalCost)}</b></div><div class="muted small">${U.money(p.unitCost)}/un</div></div>
        <div class="rc-actions"><button class="btn small danger" data-del="${p.id}">🗑️</button></div>
      </div>`;
    }).join("");
    U.$$("[data-del]", list).forEach((b) => (b.onclick = () => {
      const p = st.productions.find((x) => x.id === b.dataset.del);
      UI.confirm(`Apagar esta produção de ${U.num(p.qty, 0)}× ${UI.itemName(p.itemId)}? O lote sai do estoque e o gasto ligado a ela sai do Financeiro.`, () => {
        st.productions = st.productions.filter((x) => x.id !== p.id);
        st.expenses = st.expenses.filter((e) => e.productionId !== p.id);
        App.save();
      }, { danger: true, yes: "Apagar" });
    }));
  },

  // registro simples: quantidade + quanto gastou (o cliente informa o custo)
  newModal() {
    if (!App.guardPaid("registrar produções")) return;
    const st = App.state;
    const items = UI.activeItems();
    if (!items.length) return UI.toast("Cadastre produtos no catálogo primeiro (⚙️ Configurações).", "bad");
    const shelf = Number(st.settings.shelfLifeDays) || 180;
    const m = UI.modal(`
      <h3>🏭 Registrar produção</h3>
      <label>Produto/sabor</label>
      ${UI.selectHtml("pr-item", items.map((i) => ({ value: i.id, label: i.name })), items[0].id)}
      <div class="form-row">
        <div><label>Quantidade produzida</label><input id="pr-qty" inputmode="numeric" placeholder="Ex: 100"/></div>
        <div><label>Quanto gastou pra produzir (R$)</label><input id="pr-cost" inputmode="decimal" placeholder="Ex: 80,00"/></div>
      </div>
      <div class="form-row">
        <div><label>Data</label><input type="date" id="pr-date" value="${U.todayStr()}"/></div>
        <div><label>Validade do lote</label><input type="date" id="pr-expiry" value="${U.addDays(U.todayStr(), shelf)}"/></div>
      </div>
      <div class="card mt" id="pr-preview" style="background:var(--bg2)"></div>
      <label class="flex mt"><input type="checkbox" id="pr-expense" checked style="width:auto"/> Lançar esse gasto no Financeiro (custo variável)</label>
      <div class="m-actions"><button class="btn" data-a="c">Cancelar</button><button class="btn primary" data-a="s">Adicionar ao estoque</button></div>`);

    const upd = () => {
      const qty = U.parseNum(U.$("#pr-qty").value);
      const total = U.parseNum(U.$("#pr-cost").value);
      const unit = qty > 0 ? total / qty : 0;
      const s2 = st.settings;
      const effTax = Engine.effTaxPct(st);
      const suggested = unit > 0 ? unit / (1 - (Number(s2.targetMarginPct || 0) + effTax) / 100) : 0;
      U.$("#pr-preview").innerHTML = `
        <div class="flex spread"><span class="muted small">Custo por unidade:</span>
          <b style="color:var(--accent-text)">${U.money(unit)}</b></div>
        ${suggested > 0 ? `<div class="flex spread"><span class="muted small">Preço de venda sugerido (margem ${U.pct(s2.targetMarginPct, 0)}${effTax ? " + imposto " + U.pct(effTax, 0) : ""}):</span>
          <b>${U.money(suggested)}</b></div>` : ""}`;
      const d = U.$("#pr-date").value || U.todayStr();
      U.$("#pr-expiry").value = U.addDays(d, shelf);
    };
    ["pr-qty", "pr-cost", "pr-date"].forEach((id) => {
      U.$("#" + id).addEventListener("input", upd);
      U.$("#" + id).addEventListener("change", upd);
    });
    upd();

    U.$('[data-a="c"]', m.el).onclick = m.close;
    U.$('[data-a="s"]', m.el).onclick = () => {
      const qty = U.parseNum(U.$("#pr-qty").value);
      const total = U.parseNum(U.$("#pr-cost").value);
      if (qty <= 0) return U.$("#pr-qty").focus();
      const itemId = U.$("#pr-item").value;
      const date = U.$("#pr-date").value || U.todayStr();
      const prod = {
        id: U.uid(), date, recipeId: null, itemId, qty,
        unitCost: qty > 0 ? total / qty : 0, totalCost: total,
        consumed: [],
        expiry: U.$("#pr-expiry").value || U.addDays(date, shelf),
        remaining: qty,
      };
      st.productions.push(prod);
      if (total > 0 && U.$("#pr-expense").checked) {
        st.expenses.push({ id: U.uid(), date, desc: "Produção: " + U.num(qty, 0) + "× " + UI.itemName(itemId), amount: total, kind: "variavel", productionId: prod.id });
      }
      m.close();
      App.save();
      UI.toast(`${U.num(qty, 0)}× ${UI.itemName(itemId)} no estoque a ${U.money(prod.unitCost)}/un ✅`, "ok");
    };
  },

  /* ============ ESTOQUE ============ */
  renderEstoque() {
    const v = U.$("#view");
    const st = App.state;
    const items = UI.activeItems();

    const totalValue = Engine.stockValue(st);
    // lotes COM saldo restante calculado ao vivo (produzido − vendido − baixas)
    const liveLots = (id) => Engine.computedLots(st, id).filter((cl) => cl.remaining > 0);
    const allLive = items.flatMap((it) => liveLots(it.id));
    const expiring = allLive.filter((cl) => Engine.expiryStatus(cl.lot.expiry) === "vencendo");
    const expired = allLive.filter((cl) => Engine.expiryStatus(cl.lot.expiry) === "vencido");

    v.innerHTML = `
      <div class="view-head"><h2>📦 Estoque</h2></div>
      ${expired.length ? `<div class="banner bad">🚨 <div><b>${expired.length} lote(s) vencido(s)</b> ainda com saldo — considere dar baixa. ${expired.map((cl) => U.esc(UI.itemName(cl.lot.itemId)) + " (" + U.num(cl.remaining, 0) + " un)").join(", ")}</div></div>` : ""}
      ${expiring.length ? `<div class="banner warn">⏳ <div><b>${expiring.length} lote(s) vencendo em até 14 dias:</b> ${expiring.map((cl) => U.esc(UI.itemName(cl.lot.itemId)) + " " + U.fmtDateShort(cl.lot.expiry)).join(", ")} — priorize a venda!</div></div>` : ""}
      <div class="grid g3 mb">
        <div class="card kpi accent"><div class="k-label">Valor do estoque (custo real)</div><div class="k-value">${U.money(totalValue)}</div></div>
        <div class="card kpi"><div class="k-label">Unidades em estoque</div><div class="k-value">${U.num(U.sum(items, (i) => Engine.productStock(st, i.id)), 0)}</div></div>
        <div class="card kpi ${expired.length ? "bad" : ""}"><div class="k-label">Lotes ativos</div><div class="k-value">${allLive.length}</div></div>
      </div>
      <div class="list">${items.map((it) => {
        const qty = Engine.productStock(st, it.id);
        const val = Engine.stockValue(st, it.id);
        const lots = U.sortBy(liveLots(it.id), (cl) => cl.lot.expiry || cl.lot.date);
        return `<div class="row-card">
          <span class="color-dot" style="background:${U.esc(it.color)}"></span>
          <div class="rc-main"><div class="rc-title">${U.esc(it.name)}</div>
            <div class="rc-sub">${lots.length ? lots.map((cl) => {
              const est = Engine.expiryStatus(cl.lot.expiry);
              const cls = est === "vencido" ? "bad" : est === "vencendo" ? "warn" : "ok";
              return `<span class="badge ${cls}">${U.num(cl.remaining, 0)} un · val. ${U.fmtDateShort(cl.lot.expiry)}</span>`;
            }).join(" ") : (qty < 0 ? `<span class="badge bad">${U.num(qty, 0)} un — vendeu mais do que produziu</span>` : "sem estoque")}</div></div>
          <div class="rc-side"><div style="font-size:1.15rem"><b>${U.num(qty, 0)} un</b></div><div class="muted small">${U.money(val)}</div></div>
          ${qty > 0 ? `<div class="rc-actions"><button class="btn small" data-baixa="${it.id}">📉 Dar baixa</button></div>` : ""}
        </div>`;
      }).join("") || UI.emptyHtml("📦", "Estoque vazio — registre uma produção.")}</div>`;

    // baixa manual (perda/vencido/consumo próprio) — registra uma saída, sem venda
    U.$$("[data-baixa]").forEach((b) => (b.onclick = () => {
      const it = items.find((x) => x.id === b.dataset.baixa);
      const m = UI.modal(`
        <h3>📉 Dar baixa — ${U.esc(it.name)}</h3>
        <div class="muted small mb">Para perdas, vencidos ou consumo próprio. Sai do estoque sem registrar venda.</div>
        <label>Quantidade</label><input id="bx-qty" inputmode="numeric" placeholder="0"/>
        <div class="m-actions"><button class="btn" data-a="c">Cancelar</button><button class="btn danger" data-a="s">Dar baixa</button></div>`);
      U.$('[data-a="c"]', m.el).onclick = m.close;
      U.$('[data-a="s"]', m.el).onclick = () => {
        const qty = U.parseNum(U.$("#bx-qty").value);
        if (qty <= 0) return;
        st.stockAdjust.push({ id: U.uid(), itemId: it.id, qty, date: U.todayStr(), reason: "baixa" });
        m.close();
        App.save();
        UI.toast("Baixa registrada 📉", "ok");
      };
    }));
  },
};
