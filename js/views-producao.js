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
      ${!st.recipes.length ? `<div class="banner info">Crie uma receita primeiro (tela 📖 Receitas) — o custo da produção vem dela.</div>` : ""}
      <div class="list" id="pr-list"></div>`;

    U.$("#pr-new").onclick = () => ViewProducao.newModal();

    const list = U.$("#pr-list");
    if (!prods.length) { list.innerHTML = UI.emptyHtml("🏭", "Nenhuma produção registrada ainda."); return; }
    list.innerHTML = prods.map((p) => {
      const est = Engine.expiryStatus(p.expiry);
      const badge = est === "vencido" ? `<span class="badge bad">vencido ${U.fmtDateShort(p.expiry)}</span>`
        : est === "vencendo" ? `<span class="badge warn">vence ${U.fmtDateShort(p.expiry)}</span>`
        : `<span class="badge ok">validade ${U.fmtDateShort(p.expiry)}</span>`;
      const recipe = st.recipes.find((r) => r.id === p.recipeId);
      return `<div class="row-card">
        <span class="color-dot" style="background:${UI.itemColor(p.itemId)}"></span>
        <div class="rc-main">
          <div class="rc-title">${U.num(p.qty, 0)}× ${U.esc(UI.itemName(p.itemId))} ${badge}</div>
          <div class="rc-sub">${U.fmtDate(p.date)} · receita ${U.esc(recipe ? recipe.name : "(removida)")} · lote com ${U.num(p.remaining, 0)}/${U.num(p.qty, 0)} restantes</div>
        </div>
        <div class="rc-side"><div><b>${U.money(p.totalCost)}</b></div><div class="muted small">${U.money(p.unitCost)}/un</div></div>
        <div class="rc-actions"><button class="btn small danger" data-del="${p.id}">🗑️</button></div>
      </div>`;
    }).join("");
    U.$$("[data-del]", list).forEach((b) => (b.onclick = () => {
      const p = st.productions.find((x) => x.id === b.dataset.del);
      UI.confirm(`Apagar esta produção de ${U.num(p.qty, 0)}× ${UI.itemName(p.itemId)}? O consumo de insumos dela é devolvido e o lote sai do estoque.`, () => {
        st.productions = st.productions.filter((x) => x.id !== p.id);
        App.save();
      }, { danger: true, yes: "Apagar" });
    }));
  },

  newModal() {
    const st = App.state;
    const items = UI.activeItems();
    if (!items.length) return UI.toast("Cadastre produtos no catálogo primeiro (⚙️ Configurações).", "bad");
    if (!st.recipes.length) return UI.toast("Crie uma receita primeiro (📖 Receitas).", "bad");
    const shelf = Number(st.settings.shelfLifeDays) || 180;
    const m = UI.modal(`
      <h3>🏭 Registrar produção</h3>
      <div class="form-row">
        <div><label>Receita</label>${UI.selectHtml("pr-recipe", st.recipes.map((r) => ({ value: r.id, label: r.name })), st.recipes[0].id)}</div>
        <div><label>Item/sabor</label>${UI.selectHtml("pr-item", items.map((i) => ({ value: i.id, label: i.name })), items[0].id)}</div>
      </div>
      <div class="form-row">
        <div><label>Quantidade produzida</label><input id="pr-qty" inputmode="numeric" placeholder="0"/></div>
        <div><label>Data</label><input type="date" id="pr-date" value="${U.todayStr()}"/></div>
      </div>
      <label>Validade do lote (padrão ${shelf} dias — configurável)</label>
      <input type="date" id="pr-expiry" value="${U.addDays(U.todayStr(), shelf)}"/>
      <div class="card mt" id="pr-preview" style="background:var(--bg2)"></div>
      <div class="m-actions"><button class="btn" data-a="c">Cancelar</button><button class="btn primary" data-a="s">Produzir</button></div>`);

    const upd = () => {
      const rid = U.$("#pr-recipe").value, iid = U.$("#pr-item").value;
      const qty = U.parseNum(U.$("#pr-qty").value);
      const bd = Engine.recipeCost(st, rid, iid); // mesma função do preview de Receitas
      let warn = "";
      for (const l of bd.lines) {
        if (!l.insumo || l.dose <= 0) continue;
        const stock = Engine.insumoStock(st, l.insumo.id);
        const need = l.dose * qty;
        if (qty > 0 && need > stock)
          warn += `<div class="badge bad" style="margin:2px 4px 2px 0">⚠️ ${U.esc(l.insumo.name)}: precisa ${U.num(need, 2)}, tem ${U.num(stock, 2)}</div>`;
      }
      U.$("#pr-preview").innerHTML = `
        <div class="flex spread"><span class="muted small">Custo desta produção (preço atual dos insumos):</span>
        <b style="color:var(--accent-text)">${U.money(bd.unitCost)}/un ${qty > 0 ? "· total " + U.money(bd.unitCost * qty) : ""}</b></div>
        ${warn ? `<div class="mt">${warn}<div class="muted small">Você pode produzir mesmo assim — o estoque do insumo ficará negativo até registrar a compra (modelo registrado − produzido).</div></div>` : ""}`;
      // validade acompanha a data
      const d = U.$("#pr-date").value || U.todayStr();
      U.$("#pr-expiry").value = U.addDays(d, shelf);
    };
    ["pr-recipe", "pr-item", "pr-qty", "pr-date"].forEach((id) => {
      U.$("#" + id).addEventListener("input", upd);
      U.$("#" + id).addEventListener("change", upd);
    });
    upd();

    U.$('[data-a="c"]', m.el).onclick = m.close;
    U.$('[data-a="s"]', m.el).onclick = () => {
      const qty = U.parseNum(U.$("#pr-qty").value);
      if (qty <= 0) return U.$("#pr-qty").focus();
      const prod = Engine.buildProduction(st, U.$("#pr-recipe").value, U.$("#pr-item").value, qty,
        U.$("#pr-date").value, U.$("#pr-expiry").value);
      st.productions.push(prod);
      m.close();
      App.save();
      UI.toast(`Produção registrada: ${U.num(qty, 0)}× ${UI.itemName(prod.itemId)} a ${U.money(prod.unitCost)}/un ✅`, "ok");
    };
  },

  /* ============ ESTOQUE ============ */
  renderEstoque() {
    const v = U.$("#view");
    const st = App.state;
    const items = UI.activeItems();

    const totalValue = Engine.stockValue(st);
    const expiring = st.productions.filter((p) => (p.remaining || 0) > 0 && Engine.expiryStatus(p.expiry) === "vencendo");
    const expired = st.productions.filter((p) => (p.remaining || 0) > 0 && Engine.expiryStatus(p.expiry) === "vencido");

    v.innerHTML = `
      <div class="view-head"><h2>📦 Estoque</h2></div>
      ${expired.length ? `<div class="banner bad">🚨 <div><b>${expired.length} lote(s) vencido(s)</b> ainda com saldo — considere dar baixa. ${expired.map((p) => U.esc(UI.itemName(p.itemId)) + " (" + U.num(p.remaining, 0) + " un)").join(", ")}</div></div>` : ""}
      ${expiring.length ? `<div class="banner warn">⏳ <div><b>${expiring.length} lote(s) vencendo em até 14 dias:</b> ${expiring.map((p) => U.esc(UI.itemName(p.itemId)) + " " + U.fmtDateShort(p.expiry)).join(", ")} — priorize a venda!</div></div>` : ""}
      <div class="grid g3 mb">
        <div class="card kpi accent"><div class="k-label">Valor do estoque (custo real FIFO)</div><div class="k-value">${U.money(totalValue)}</div></div>
        <div class="card kpi"><div class="k-label">Unidades em estoque</div><div class="k-value">${U.num(U.sum(items, (i) => Engine.productStock(st, i.id)), 0)}</div></div>
        <div class="card kpi ${expired.length ? "bad" : ""}"><div class="k-label">Lotes ativos</div><div class="k-value">${st.productions.filter((p) => (p.remaining || 0) > 0).length}</div></div>
      </div>
      <div class="list">${items.map((it) => {
        const qty = Engine.productStock(st, it.id);
        const val = Engine.stockValue(st, it.id);
        const lots = U.sortBy(st.productions.filter((p) => p.itemId === it.id && (p.remaining || 0) > 0), (p) => p.expiry || p.date);
        return `<div class="row-card">
          <span class="color-dot" style="background:${U.esc(it.color)}"></span>
          <div class="rc-main"><div class="rc-title">${U.esc(it.name)}</div>
            <div class="rc-sub">${lots.length ? lots.map((p) => {
              const est = Engine.expiryStatus(p.expiry);
              const cls = est === "vencido" ? "bad" : est === "vencendo" ? "warn" : "ok";
              return `<span class="badge ${cls}">${U.num(p.remaining, 0)} un · val. ${U.fmtDateShort(p.expiry)}</span>`;
            }).join(" ") : "sem lotes"}</div></div>
          <div class="rc-side"><div style="font-size:1.15rem"><b>${U.num(qty, 0)} un</b></div><div class="muted small">${U.money(val)}</div></div>
          ${lots.length ? `<div class="rc-actions"><button class="btn small" data-baixa="${it.id}">📉 Dar baixa</button></div>` : ""}
        </div>`;
      }).join("") || UI.emptyHtml("📦", "Estoque vazio — registre uma produção.")}</div>`;

    // baixa manual (perda/vencido/consumo próprio) — FIFO, sem gerar venda
    U.$$("[data-baixa]").forEach((b) => (b.onclick = () => {
      const it = items.find((x) => x.id === b.dataset.baixa);
      const m = UI.modal(`
        <h3>📉 Dar baixa — ${U.esc(it.name)}</h3>
        <div class="muted small mb">Para perdas, vencidos ou consumo próprio. Sai do estoque (FIFO) sem registrar venda.</div>
        <label>Quantidade</label><input id="bx-qty" inputmode="numeric" placeholder="0"/>
        <div class="m-actions"><button class="btn" data-a="c">Cancelar</button><button class="btn danger" data-a="s">Dar baixa</button></div>`);
      U.$('[data-a="c"]', m.el).onclick = m.close;
      U.$('[data-a="s"]', m.el).onclick = () => {
        const qty = U.parseNum(U.$("#bx-qty").value);
        if (qty <= 0) return;
        Engine.consumeFIFO(st, it.id, Math.min(qty, Engine.productStock(st, it.id)));
        m.close();
        App.save();
        UI.toast("Baixa registrada 📉", "ok");
      };
    }));
  },
};
