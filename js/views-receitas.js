/* ICE SISTEMA — Receitas: múltiplas receitas/variações por produto, doses
   configuráveis, overrides por item, breakdown de custo ao vivo.
   O preview usa Engine.recipeCost — a MESMA função da Produção. */
"use strict";

const ViewReceitas = {
  render() {
    const v = U.$("#view");
    const recipes = App.state.recipes;
    v.innerHTML = `
      <div class="view-head"><h2>📖 Receitas & custos</h2>
        <button class="btn primary" id="rc-new">＋ Nova receita</button></div>
      ${!App.state.catalog.length ? `<div class="banner info">Cadastre produtos no catálogo (⚙️ Configurações) para ver o custo por item.</div>` : ""}
      <div id="rc-list" class="list"></div>`;

    U.$("#rc-new").onclick = () => {
      App.state.recipes.push({ id: U.uid(), name: "Receita " + (recipes.length + 1), note: "", lines: [] });
      App.save();
    };

    const list = U.$("#rc-list");
    if (!recipes.length) {
      list.innerHTML = UI.emptyHtml("📖", "Nenhuma receita ainda. Crie a primeira — ex: 'Padrão' e depois uma 'Econômica'.");
      return;
    }
    list.innerHTML = recipes.map((r) => ViewReceitas.recipeCardHtml(r)).join("");
    recipes.forEach((r) => ViewReceitas.bindRecipeCard(r));
  },

  recipeCardHtml(r) {
    const items = UI.activeItems();
    const selItem = App.viewState["rc-item-" + r.id] || (items[0] && items[0].id) || "";
    return `<div class="card" data-recipe="${r.id}">
      <div class="flex spread">
        <input data-rc-name value="${U.esc(r.name)}" style="max-width:260px;font-weight:700"/>
        <div class="flex">
          <button class="btn small" data-rc-dup>📋 Duplicar (variação)</button>
          <button class="btn small danger" data-rc-del>🗑️ Excluir</button>
        </div>
      </div>
      <label>Observação</label>
      <input data-rc-note value="${U.esc(r.note || "")}" placeholder="Ex: versão econômica com menos polpa"/>

      <h3 class="mt">Composição (por unidade produzida)</h3>
      <div class="muted small mb">Slots "matéria-prima/embalagem do item" usam o insumo próprio de cada sabor — assim UM sabor nunca puxa valor de outro.</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Insumo</th><th>Dose/un</th><th></th></tr></thead>
      <tbody data-rc-lines></tbody></table></div>
      <div class="flex mt">
        <button class="btn small" data-rc-addslot="materia">＋ Matéria-prima do item</button>
        <button class="btn small" data-rc-addslot="embalagem">＋ Embalagem do item</button>
        <button class="btn small" data-rc-addinsumo>＋ Insumo geral</button>
      </div>

      <hr class="sep"/>
      <div class="flex spread">
        <h3 style="margin:0">💰 Custo ao vivo por item</h3>
        <div style="min-width:200px">${UI.selectHtml("rc-prev-" + r.id, items.map((i) => ({ value: i.id, label: i.name })), selItem)}</div>
      </div>
      <div data-rc-preview class="mt"></div>
    </div>`;
  },

  bindRecipeCard(r) {
    const card = U.$(`[data-recipe="${r.id}"]`);
    if (!card) return;
    const save = U.debounce(() => App.save({ rerender: false }), 600);

    U.$("[data-rc-name]", card).oninput = (e) => { r.name = e.target.value; save(); };
    U.$("[data-rc-note]", card).oninput = (e) => { r.note = e.target.value; save(); };
    U.$("[data-rc-del]", card).onclick = () => UI.confirm(`Excluir a receita "${r.name}"? Produções passadas não são alteradas.`, () => {
      App.state.recipes = App.state.recipes.filter((x) => x.id !== r.id);
      App.save();
    }, { danger: true, yes: "Excluir" });
    U.$("[data-rc-dup]", card).onclick = () => {
      const copy = JSON.parse(JSON.stringify(r));
      copy.id = U.uid();
      copy.name = r.name + " (variação)";
      copy.lines.forEach((l) => { /* ids de linha não existem — cópia direta ok */ });
      App.state.recipes.push(copy);
      App.save();
    };
    U.$$("[data-rc-addslot]", card).forEach((b) => (b.onclick = () => {
      r.lines.push({ type: "slot", slot: b.dataset.rcAddslot, qtyPerUnit: 0, overrides: {} });
      App.save();
    }));
    U.$("[data-rc-addinsumo]", card).onclick = () => {
      const gerais = App.state.insumos.filter((i) => i.scope === "geral");
      if (!gerais.length) return UI.toast("Cadastre um insumo geral primeiro (tela Insumos).", "bad");
      r.lines.push({ type: "insumo", insumoId: gerais[0].id, qtyPerUnit: 0, overrides: {} });
      App.save();
    };

    const sel = U.$("#rc-prev-" + r.id, card);
    if (sel) sel.onchange = () => { App.viewState["rc-item-" + r.id] = sel.value; ViewReceitas.renderLines(r, card); };

    ViewReceitas.renderLines(r, card);
  },

  renderLines(r, card) {
    const tbody = U.$("[data-rc-lines]", card);
    const items = UI.activeItems();
    const previewItem = (U.$("#rc-prev-" + r.id, card) || {}).value || (items[0] && items[0].id);
    const gerais = App.state.insumos.filter((i) => i.scope === "geral");

    tbody.innerHTML = r.lines.map((l, idx) => {
      let name;
      if (l.type === "slot") {
        name = `<span class="badge accent">${l.slot === "materia" ? "🧪 Matéria-prima do item" : "📦 Embalagem do item"}</span>`;
      } else {
        name = `<select data-l-insumo="${idx}" style="max-width:220px">` + gerais.map((g) =>
          `<option value="${g.id}" ${g.id === l.insumoId ? "selected" : ""}>${U.esc(g.name)} (${U.esc(g.unit)})</option>`).join("") + "</select>";
      }
      const ins = Engine.resolveLineInsumo(App.state, l, previewItem);
      const unit = ins ? ins.unit : "";
      const hasOv = l.overrides && Object.keys(l.overrides).filter((k) => l.overrides[k] !== "" && l.overrides[k] != null).length;
      return `<tr>
        <td>${name}${ins ? `<div class="muted small">${U.esc(ins.name)} — ${U.money(ins.price)}/${U.esc(unit)}</div>` : `<div class="muted small">⚠️ item sem insumo próprio</div>`}</td>
        <td style="min-width:130px"><div class="flex" style="flex-wrap:nowrap">
          <input data-l-dose="${idx}" value="${l.qtyPerUnit}" inputmode="decimal" style="width:90px"/>
          <span class="muted small">${U.esc(unit)}</span></div>
          ${hasOv ? `<span class="badge info small">doses específicas: ${hasOv}</span>` : ""}
        </td>
        <td class="right" style="white-space:nowrap">
          <button class="btn small" data-l-ov="${idx}" title="Dose diferente para um item específico">🎯</button>
          <button class="btn small danger" data-l-del="${idx}">🗑️</button>
        </td>
      </tr>`;
    }).join("") || `<tr><td colspan="3" class="muted">Nenhuma linha — adicione insumos abaixo.</td></tr>`;

    const save = U.debounce(() => { App.save({ rerender: false }); ViewReceitas.renderPreview(r, card); }, 500);
    U.$$("[data-l-dose]", tbody).forEach((inp) => (inp.oninput = () => {
      r.lines[Number(inp.dataset.lDose)].qtyPerUnit = U.parseNum(inp.value);
      save();
    }));
    U.$$("[data-l-insumo]", tbody).forEach((s) => (s.onchange = () => {
      r.lines[Number(s.dataset.lInsumo)].insumoId = s.value;
      App.save({ rerender: false });
      ViewReceitas.renderLines(r, card);
    }));
    U.$$("[data-l-del]", tbody).forEach((b) => (b.onclick = () => {
      r.lines.splice(Number(b.dataset.lDel), 1);
      App.save({ rerender: false });
      ViewReceitas.renderLines(r, card);
    }));
    U.$$("[data-l-ov]", tbody).forEach((b) => (b.onclick = () => ViewReceitas.editOverrides(r, Number(b.dataset.lOv), card)));

    ViewReceitas.renderPreview(r, card);
  },

  // doses específicas por item (ex: um sabor consome mais polpa que os outros)
  editOverrides(r, lineIdx, card) {
    const l = r.lines[lineIdx];
    const items = UI.activeItems();
    const m = UI.modal(`
      <h3>🎯 Dose específica por item</h3>
      <div class="muted small mb">Deixe em branco para usar a dose padrão (${l.qtyPerUnit}). Preencha só os itens que fogem da regra.</div>
      ${items.map((it) => `
        <div class="flex mb"><span class="color-dot" style="background:${U.esc(it.color)}"></span>
        <span style="flex:1">${U.esc(it.name)}</span>
        <input data-ov="${it.id}" value="${l.overrides && l.overrides[it.id] != null ? l.overrides[it.id] : ""}" inputmode="decimal" placeholder="${l.qtyPerUnit}" style="width:110px"/></div>`).join("")}
      <div class="m-actions"><button class="btn" data-a="c">Cancelar</button><button class="btn primary" data-a="s">Salvar</button></div>`);
    U.$('[data-a="c"]', m.el).onclick = m.close;
    U.$('[data-a="s"]', m.el).onclick = () => {
      l.overrides = l.overrides || {};
      U.$$("[data-ov]", m.el).forEach((inp) => {
        const v = inp.value.trim();
        if (v === "") delete l.overrides[inp.dataset.ov];
        else l.overrides[inp.dataset.ov] = U.parseNum(v);
      });
      m.close();
      App.save({ rerender: false });
      ViewReceitas.renderLines(r, card);
    };
  },

  renderPreview(r, card) {
    const box = U.$("[data-rc-preview]", card);
    const sel = U.$("#rc-prev-" + r.id, card);
    const itemId = sel ? sel.value : null;
    if (!itemId) { box.innerHTML = `<div class="muted small">Cadastre produtos no catálogo para ver o custo.</div>`; return; }
    const bd = Engine.recipeCost(App.state, r.id, itemId); // ← fonte única de custo
    const s = App.state.settings;
    const suggested = bd.unitCost > 0 ? bd.unitCost / (1 - (s.targetMarginPct + s.taxPct) / 100) : 0;
    box.innerHTML = `
      <div class="tbl-wrap"><table class="tbl">
        <thead><tr><th>Insumo</th><th class="right">Dose</th><th class="right">Preço</th><th class="right">Custo</th></tr></thead>
        <tbody>${bd.lines.map((l) => `
          <tr><td>${l.insumo ? U.esc(l.insumo.name) : `<span class="badge bad">sem insumo (${U.esc(l.missing || "?")})</span>`}</td>
          <td class="right">${U.num(l.dose, 4)} ${l.insumo ? U.esc(l.insumo.unit) : ""}</td>
          <td class="right">${U.money(l.price)}</td>
          <td class="right"><b>${U.money(l.cost)}</b></td></tr>`).join("")}
        </tbody></table></div>
      <div class="flex spread mt" style="align-items:baseline">
        <div class="muted small">Preço sugerido (margem ${U.pct(s.targetMarginPct, 0)} + imposto ${U.pct(s.taxPct, 0)}): <b>${U.money(suggested)}</b></div>
        <div style="font-size:1.2rem">Custo/un: <b style="color:var(--accent-text)">${U.money(bd.unitCost)}</b></div>
      </div>`;
  },
};
