/* ICE SISTEMA — Insumos.
   Estoque de insumo = registrado (compras) − produzido (histórico) — NUNCA
   subtração direta na produção. Tela organizada POR ITEM do catálogo
   (matéria-prima + embalagem + capacidade), com insumos gerais à parte. */
"use strict";

const ViewInsumos = {
  render() {
    const v = U.$("#view");
    const st = App.state;
    const items = UI.activeItems();
    const gerais = st.insumos.filter((i) => i.scope === "geral");

    // banner de gargalo: o que está limitando a produção agora
    const bn = Engine.bottleneck(st);
    let bnHtml = "";
    if (bn && isFinite(bn.unitsNow)) {
      const buyHint = bn.dose > 0
        ? `Cada +1 ${U.esc(bn.insumo.unit)} de <b>${U.esc(bn.insumo.name)}</b> libera ≈ ${U.num(1 / bn.dose, 0)} un de produção.`
        : "";
      bnHtml = `<div class="banner warn">⛔ <div><b>O que está te limitando:</b> ${U.esc(bn.insumo.name)}
        (${U.num(bn.stock, 2)} ${U.esc(bn.insumo.unit)} em estoque) — dá pra produzir só
        <b>${U.num(bn.unitsNow, 0)} un</b> de ${U.esc(bn.item.name)}. ${buyHint}
        <button class="btn small primary" style="margin-left:8px" data-bn-repor="${bn.insumo.id}">🛒 Repor agora</button></div></div>`;
    }

    v.innerHTML = `
      <div class="view-head"><h2>🧂 Insumos</h2>
        <button class="btn primary" id="in-new">＋ Novo insumo</button></div>
      ${bnHtml}
      ${items.length ? `<h3>Por item do catálogo</h3>
      <div class="muted small mb">Matéria-prima + embalagem de cada sabor e quantas unidades dá pra produzir com o que tem.</div>
      <div class="list" id="in-por-item"></div>` : ""}
      <h3 class="mt">Insumos gerais (compartilhados)</h3>
      <div class="list" id="in-gerais"></div>`;

    if (U.$("[data-bn-repor]")) U.$("[data-bn-repor]").onclick = (e) => ViewInsumos.reporModal(e.target.dataset.bnRepor);
    U.$("#in-new").onclick = () => ViewInsumos.editModal(null);

    /* --- por item: 1 linha por sabor --- */
    const box = U.$("#in-por-item");
    if (box) {
      box.innerHTML = items.map((it) => {
        const mine = st.insumos.filter((i) => i.scope === "item" && i.itemId === it.id);
        const cap = Engine.unitsProducible(st, it.id);
        const capTxt = !st.recipes.length ? "" :
          cap.units === Infinity ? "" :
          `<span class="badge ${cap.units <= 0 ? "bad" : cap.units < 30 ? "warn" : "ok"}">≈ ${U.num(cap.units, 0)} un produzíveis</span>`;
        const cells = mine.map((ins) => {
          const stock = Engine.insumoStock(st, ins.id);
          return `<div class="flex" style="gap:6px">
            <span class="muted small">${ins.role === "materia" ? "🧪" : ins.role === "embalagem" ? "📦" : "•"} ${U.esc(ins.name)}:</span>
            <b class="${stock <= 0 ? "muted" : ""}" style="${stock <= 0 ? "color:var(--bad)" : ""}">${U.num(stock, 2)} ${U.esc(ins.unit)}</b>
            <button class="btn small" data-repor="${ins.id}">🛒</button>
            <button class="btn small ghost" data-edit="${ins.id}">✏️</button>
          </div>`;
        }).join("") || `<span class="muted small">sem insumos próprios — <a href="#" data-mk="${it.id}">criar matéria-prima + embalagem</a></span>`;
        return `<div class="row-card">
          <span class="color-dot" style="background:${U.esc(it.color)}"></span>
          <div class="rc-main"><div class="rc-title">${U.esc(it.name)} ${capTxt}</div>
            <div class="mt" style="display:flex;flex-direction:column;gap:4px">${cells}</div></div>
        </div>`;
      }).join("");
      U.$$("[data-mk]", box).forEach((a) => (a.onclick = (e) => {
        e.preventDefault();
        const it = items.find((x) => x.id === a.dataset.mk);
        st.insumos.push(
          { id: U.uid(), name: "Matéria-prima " + it.name, unit: "kg", price: 0, scope: "item", itemId: it.id, role: "materia" },
          { id: U.uid(), name: "Embalagem " + it.name, unit: "un", price: 0, scope: "item", itemId: it.id, role: "embalagem" });
        App.save();
      }));
    }

    /* --- gerais --- */
    const gbox = U.$("#in-gerais");
    gbox.innerHTML = gerais.length ? gerais.map((ins) => {
      const stock = Engine.insumoStock(st, ins.id);
      const reg = Engine.insumoRegistered(st, ins.id);
      const cons = Engine.insumoConsumed(st, ins.id);
      return `<div class="row-card">
        <div class="rc-main"><div class="rc-title">${U.esc(ins.name)}</div>
          <div class="rc-sub">${U.money(ins.price)}/${U.esc(ins.unit)} · registrado ${U.num(reg, 2)} − produzido ${U.num(cons, 2)}</div></div>
        <div class="rc-side"><b style="font-size:1.1rem;${stock <= 0 ? "color:var(--bad)" : ""}">${U.num(stock, 2)} ${U.esc(ins.unit)}</b></div>
        <div class="rc-actions">
          <button class="btn small primary" data-repor="${ins.id}">🛒 Repor</button>
          <button class="btn small" data-edit="${ins.id}">✏️</button>
          <button class="btn small danger" data-del="${ins.id}">🗑️</button>
        </div></div>`;
    }).join("") : UI.emptyHtml("🧂", "Nenhum insumo geral — ex: açúcar, água, gás, rótulo.");

    U.$$("[data-repor]").forEach((b) => (b.onclick = () => ViewInsumos.reporModal(b.dataset.repor)));
    U.$$("[data-edit]").forEach((b) => (b.onclick = () => ViewInsumos.editModal(b.dataset.edit)));
    U.$$("[data-del]").forEach((b) => (b.onclick = () => {
      const ins = st.insumos.find((x) => x.id === b.dataset.del);
      UI.confirm(`Excluir o insumo "${ins.name}"? Receitas que o usam ficarão sem essa linha.`, () => {
        st.insumos = st.insumos.filter((x) => x.id !== ins.id);
        for (const r of st.recipes) r.lines = r.lines.filter((l) => !(l.type === "insumo" && l.insumoId === ins.id));
        App.save();
      }, { danger: true, yes: "Excluir" });
    }));
  },

  editModal(id) {
    const st = App.state;
    const ins = id ? st.insumos.find((x) => x.id === id) : null;
    const items = UI.activeItems();
    const m = UI.modal(`
      <h3>${ins ? "Editar" : "Novo"} insumo</h3>
      <label>Nome</label><input id="ins-name" value="${U.esc(ins ? ins.name : "")}" placeholder="Ex: Açúcar cristal"/>
      <div class="form-row">
        <div><label>Unidade</label>${UI.selectHtml("ins-unit", ["kg", "g", "L", "ml", "un", "cx", "pct"], ins ? ins.unit : "kg")}</div>
        <div><label>Preço por unidade</label><input id="ins-price" inputmode="decimal" value="${ins ? ins.price : ""}" placeholder="0,00"/></div>
      </div>
      <label>Tipo</label>
      ${UI.selectHtml("ins-scope", [{ value: "geral", label: "Geral (compartilhado entre itens)" }, { value: "item", label: "Próprio de um item do catálogo" }], ins ? ins.scope : "geral")}
      <div id="ins-item-wrap" style="display:${ins && ins.scope === "item" ? "block" : "none"}">
        <div class="form-row">
          <div><label>Item do catálogo</label>${UI.selectHtml("ins-item", items.map((i) => ({ value: i.id, label: i.name })), ins ? ins.itemId : "")}</div>
          <div><label>Papel na receita</label>${UI.selectHtml("ins-role", [{ value: "materia", label: "🧪 Matéria-prima" }, { value: "embalagem", label: "📦 Embalagem" }], ins ? ins.role : "materia")}</div>
        </div>
      </div>
      <div class="m-actions"><button class="btn" data-a="c">Cancelar</button><button class="btn primary" data-a="s">Salvar</button></div>`);
    U.$("#ins-scope", m.el).onchange = (e) => { U.$("#ins-item-wrap", m.el).style.display = e.target.value === "item" ? "block" : "none"; };
    U.$('[data-a="c"]', m.el).onclick = m.close;
    U.$('[data-a="s"]', m.el).onclick = () => {
      const name = U.$("#ins-name").value.trim();
      if (!name) return U.$("#ins-name").focus();
      const data = {
        name, unit: U.$("#ins-unit").value, price: U.parseNum(U.$("#ins-price").value),
        scope: U.$("#ins-scope").value,
        itemId: U.$("#ins-scope").value === "item" ? U.$("#ins-item").value : null,
        role: U.$("#ins-scope").value === "item" ? U.$("#ins-role").value : "",
      };
      if (ins) Object.assign(ins, data);
      else st.insumos.push({ id: U.uid(), ...data });
      m.close();
      App.save();
      UI.toast("Insumo salvo ✅", "ok");
    };
  },

  /* Repor: "compra nova" lança gasto no financeiro; "só ajustar" não lança
     (pra quando o custo já foi registrado em outro lugar). */
  reporModal(insumoId) {
    const st = App.state;
    const ins = st.insumos.find((x) => x.id === insumoId);
    if (!ins) return;
    const stock = Engine.insumoStock(st, ins.id);
    const m = UI.modal(`
      <h3>🛒 Repor — ${U.esc(ins.name)}</h3>
      <div class="muted small mb">Estoque atual: <b>${U.num(stock, 2)} ${U.esc(ins.unit)}</b></div>
      <label>Tipo de lançamento</label>
      ${UI.selectHtml("rp-mode", [
        { value: "compra", label: "🧾 Compra nova (lança gasto no Financeiro)" },
        { value: "ajuste", label: "🔧 Só ajustar o estoque que já tenho (sem lançar gasto)" },
      ], "compra")}
      <div class="form-row">
        <div><label>Quantidade (${U.esc(ins.unit)})</label><input id="rp-qty" inputmode="decimal" placeholder="0"/></div>
        <div id="rp-total-wrap"><label>Valor total pago</label><input id="rp-total" inputmode="decimal" placeholder="0,00"/></div>
      </div>
      <label>Data</label><input type="date" id="rp-date" value="${U.todayStr()}"/>
      <label class="flex"><input type="checkbox" id="rp-upd-price" checked style="width:auto"/> Atualizar preço do insumo pelo valor desta compra</label>
      <div class="m-actions"><button class="btn" data-a="c">Cancelar</button><button class="btn primary" data-a="s">Registrar</button></div>`);
    U.$("#rp-mode", m.el).onchange = (e) => {
      U.$("#rp-total-wrap", m.el).style.display = e.target.value === "ajuste" ? "none" : "block";
    };
    U.$('[data-a="c"]', m.el).onclick = m.close;
    U.$('[data-a="s"]', m.el).onclick = () => {
      const mode = U.$("#rp-mode").value;
      const qty = U.parseNum(U.$("#rp-qty").value);
      const total = U.parseNum(U.$("#rp-total").value);
      const date = U.$("#rp-date").value || U.todayStr();
      if (qty <= 0) return U.$("#rp-qty").focus();
      const purchase = { id: U.uid(), insumoId: ins.id, qty, total: mode === "compra" ? total : 0, date, adjust: mode === "ajuste" };
      st.purchases.push(purchase);
      if (mode === "compra") {
        if (total > 0 && U.$("#rp-upd-price").checked) ins.price = total / qty;
        st.expenses.push({ id: U.uid(), date, desc: "Compra de insumo: " + ins.name, amount: total, kind: "variavel", purchaseId: purchase.id });
      }
      m.close();
      App.save();
      UI.toast(mode === "compra" ? "Compra registrada — estoque e financeiro atualizados ✅" : "Estoque ajustado (sem lançar gasto) ✅", "ok");
    };
  },
};
