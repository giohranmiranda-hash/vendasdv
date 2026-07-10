/* ICE SISTEMA — Financeiro: DRE de caixa simples por mês.
   Investimentos/maquinário ficam numa aba SEPARADA (não entram no resultado
   operacional — senão dá falso negativo), com indicador de payback. */
"use strict";

const ViewFinanceiro = {
  month() { return App.viewState.finMonth || U.monthStr(); },
  tab() { return App.viewState.finTab || "dre"; },

  render() {
    const v = U.$("#view");
    const st = App.state;
    const ym = ViewFinanceiro.month();
    const tab = ViewFinanceiro.tab();
    const dre = Engine.dre(st, ym);
    const pb = Engine.payback(st);

    v.innerHTML = `
      <div class="view-head"><h2>🏦 Financeiro</h2>
        <div class="flex">${UI.monthNavHtml(ym)}
        <button class="btn primary" id="fn-new">＋ Lançamento</button></div></div>

      <div class="flex mb">
        <button class="btn small ${tab === "dre" ? "primary" : ""}" data-tab="dre">📑 DRE do mês</button>
        <button class="btn small ${tab === "inv" ? "primary" : ""}" data-tab="inv">🏗️ Investimentos</button>
      </div>
      <div id="fn-body"></div>`;

    UI.bindMonthNav(v, () => ViewFinanceiro.month(), (nym) => { App.viewState.finMonth = nym; App.render(); });
    U.$$("[data-tab]", v).forEach((b) => (b.onclick = () => { App.viewState.finTab = b.dataset.tab; App.render(); }));
    U.$("#fn-new").onclick = () => ViewFinanceiro.expenseModal();

    const body = U.$("#fn-body");
    if (tab === "dre") {
      const rows = [
        ["Faturamento bruto", dre.revenue, ""],
        ["(−) Imposto/taxa", -dre.tax, ""],
        ["= Faturamento líquido", dre.netRevenue, "b"],
        ["(−) Custos variáveis (compras de insumo etc.)", -dre.varCosts, ""],
        ["(−) Custos fixos", -dre.fixCosts, ""],
        ["= Resultado do mês", dre.result, "b"],
      ];
      const exp = U.sortBy(st.expenses.filter((e) => U.monthOf(e.date) === ym && e.kind !== "investimento"), (e) => e.date, true);
      body.innerHTML = `
        <div class="card mb">
          <h3>📑 DRE de caixa — ${U.esc(U.monthLabel(ym))}</h3>
          <table class="tbl">${rows.map(([l, val, b]) => `
            <tr><td>${b ? "<b>" + l + "</b>" : l}</td>
            <td class="right" style="color:${val < 0 ? "var(--bad)" : b ? (val >= 0 ? "var(--ok)" : "var(--bad)") : "inherit"}">
              ${b ? "<b>" + U.money(val) + "</b>" : U.money(val)}</td></tr>`).join("")}
          </table>
          <div class="muted small mt">CPV informativo (custo dos itens vendidos, FIFO): ${U.money(dre.cogs)} — no caixa, o gasto aparece quando você COMPRA insumo, não quando vende.</div>
        </div>
        <div class="card">
          <h3>Lançamentos do mês (fixos e variáveis)</h3>
          <div class="list">${exp.length ? exp.map((e) => ViewFinanceiro.expRowHtml(e)).join("") : '<div class="muted small">Nenhum lançamento neste mês.</div>'}</div>
        </div>`;
    } else {
      const inv = U.sortBy(st.expenses.filter((e) => e.kind === "investimento"), (e) => e.date, true);
      body.innerHTML = `
        ${pb ? `<div class="card mb">
          <h3>⏱️ Quando o investimento se paga (payback)</h3>
          <div class="flex spread"><span>Total investido</span><b>${U.money(pb.totalInvest)}</b></div>
          <div class="flex spread"><span>Lucro operacional acumulado</span><b style="color:${pb.accProfit >= 0 ? "var(--ok)" : "var(--bad)"}">${U.money(pb.accProfit)}</b></div>
          <div class="hbar-track mt" style="height:18px"><div class="hbar-fill" style="width:${U.clamp(pb.pct, 0, 100)}%"></div></div>
          <div class="muted small mt">${pb.paid ? "🎉 Investimento pago! O lucro acumulado já superou o total investido." : `Faltam ${U.money(pb.totalInvest - pb.accProfit)} de lucro acumulado (${U.pct(pb.pct, 0)} do caminho).`}</div>
        </div>` : ""}
        <div class="card">
          <h3>🏗️ Investimentos & maquinário</h3>
          <div class="muted small mb">Fora do resultado operacional de propósito — equipamento não é custo do mês.</div>
          <div class="list">${inv.length ? inv.map((e) => ViewFinanceiro.expRowHtml(e)).join("") : '<div class="muted small">Nenhum investimento lançado.</div>'}</div>
        </div>`;
    }

    U.$$("[data-exp-del]", body).forEach((b) => (b.onclick = () => {
      const e = st.expenses.find((x) => x.id === b.dataset.expDel);
      UI.confirm(`Apagar "${e.desc}" (${U.money(e.amount)})?${e.purchaseId ? " A compra de insumo ligada a ele também será removida do estoque." : ""}`, () => {
        st.expenses = st.expenses.filter((x) => x.id !== e.id);
        if (e.purchaseId) st.purchases = st.purchases.filter((p) => p.id !== e.purchaseId);
        App.save();
      }, { danger: true, yes: "Apagar" });
    }));
  },

  expRowHtml(e) {
    const kindBadge = { fixa: '<span class="badge info">fixo</span>', variavel: '<span class="badge warn">variável</span>', investimento: '<span class="badge accent">investimento</span>' }[e.kind] || "";
    return `<div class="row-card">
      <div class="rc-main"><div class="rc-title">${U.esc(e.desc)} ${kindBadge}${e.purchaseId ? ' <span class="badge">auto: compra de insumo</span>' : ""}</div>
      <div class="rc-sub">${U.fmtDate(e.date)}</div></div>
      <div class="rc-side"><b>${U.money(e.amount)}</b></div>
      <div class="rc-actions"><button class="btn small danger" data-exp-del="${e.id}">🗑️</button></div></div>`;
  },

  expenseModal() {
    const m = UI.modal(`
      <h3>＋ Novo lançamento</h3>
      <label>Descrição</label><input id="ex-desc" placeholder="Ex: Aluguel, freezer novo, energia…"/>
      <div class="form-row">
        <div><label>Valor</label><input id="ex-amount" inputmode="decimal" placeholder="0,00"/></div>
        <div><label>Data</label><input type="date" id="ex-date" value="${U.todayStr()}"/></div>
      </div>
      <label>Tipo</label>
      ${UI.selectHtml("ex-kind", [
        { value: "fixa", label: "🏠 Custo fixo (aluguel, energia, salário…)" },
        { value: "variavel", label: "📦 Custo variável (insumos, frete, embalagem…)" },
        { value: "investimento", label: "🏗️ Investimento/maquinário (fora do resultado do mês)" },
      ], "fixa")}
      <div class="m-actions"><button class="btn" data-a="c">Cancelar</button><button class="btn primary" data-a="s">Lançar</button></div>`);
    U.$('[data-a="c"]', m.el).onclick = m.close;
    U.$('[data-a="s"]', m.el).onclick = () => {
      const desc = U.$("#ex-desc").value.trim();
      const amount = U.parseNum(U.$("#ex-amount").value);
      if (!desc) return U.$("#ex-desc").focus();
      if (amount <= 0) return U.$("#ex-amount").focus();
      App.state.expenses.push({ id: U.uid(), desc, amount, date: U.$("#ex-date").value || U.todayStr(), kind: U.$("#ex-kind").value });
      m.close();
      App.save();
      UI.toast("Lançamento registrado ✅", "ok");
    };
  },
};
