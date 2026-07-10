/* ICE SISTEMA — Dashboard: resumo do mês (padrão = mês do CALENDÁRIO atual),
   lucro acumulado, top produtos, sugestões proativas da IA local. */
"use strict";

const ViewDashboard = {
  month() { return App.viewState.dashMonth || U.monthStr(); }, // SEMPRE mês calendário como padrão

  render() {
    const v = U.$("#view");
    const st = App.state;
    const ym = ViewDashboard.month();
    const ms = Engine.monthSummary(st, ym);
    const s = st.settings;

    // lucro acumulado dia a dia no mês
    const [yy, mm] = ym.split("-").map(Number);
    const daysInMonth = new Date(yy, mm, 0).getDate();
    const byDay = {};
    for (const sale of ms.sales) {
      const d = Number(sale.date.slice(8, 10));
      byDay[d] = (byDay[d] || 0) + Engine.saleNet(st, sale);
    }
    const isCurrentMonth = ym === U.monthStr();
    const lastDay = isCurrentMonth ? new Date().getDate() : daysInMonth;
    let acc = 0;
    const series = [];
    for (let d = 1; d <= lastDay; d++) { acc += byDay[d] || 0; series.push({ x: String(d), y: acc }); }

    // top produtos do mês
    const perItem = {};
    for (const sale of ms.sales)
      for (const it of sale.items || [])
        perItem[it.itemId] = (perItem[it.itemId] || 0) + it.qty * it.unitPrice;
    const top = U.sortBy(Object.keys(perItem).map((id) => ({ id, val: perItem[id] })), (x) => x.val, true).slice(0, 6);

    const goal = Number(st.goals.revenue) || 0;
    const goalPct = goal > 0 ? U.clamp((ms.revenue / goal) * 100, 0, 100) : null;

    const sugs = Assistant.suggestions(st).slice(0, 5);

    v.innerHTML = `
      <div class="view-head"><h2>📊 Dashboard</h2>${UI.monthNavHtml(ym)}</div>

      <div class="grid g4 mb">
        <div class="card kpi accent"><div class="k-label">Faturamento</div><div class="k-value" data-countup="${ms.revenue}" data-fmt="money">${U.money(ms.revenue)}</div><div class="k-sub">${ms.count} venda(s)</div></div>
        <div class="card kpi ${ms.profit >= 0 ? "good" : "bad"}"><div class="k-label">Lucro líquido</div><div class="k-value" data-countup="${ms.profit}" data-fmt="money">${U.money(ms.profit)}</div><div class="k-sub">após imposto e CPV</div></div>
        <div class="card kpi"><div class="k-label">Margem</div><div class="k-value" data-countup="${ms.margin}" data-fmt="pct">${U.pct(ms.margin)}</div><div class="k-sub">alvo ${U.pct(s.targetMarginPct, 0)}</div></div>
        <div class="card kpi"><div class="k-label">Ticket médio</div><div class="k-value" data-countup="${ms.ticket}" data-fmt="money">${U.money(ms.ticket)}</div>
          ${goalPct != null ? `<div class="k-sub">meta do mês: ${U.pct(goalPct, 0)} de ${U.money(goal)}</div>` : ""}</div>
      </div>

      <div class="grid g2">
        <div class="card">
          <h3>📈 Lucro acumulado — ${U.esc(U.monthLabel(ym))}</h3>
          ${Charts.line(series)}
        </div>
        <div class="card">
          <h3>🏆 Top produtos do mês</h3>
          ${top.length ? Charts.bars(top.map((t) => ({ label: UI.itemName(t.id), value: t.val, color: UI.itemColor(t.id), hint: U.money(t.val) }))) : '<div class="chart-empty">Sem vendas neste mês</div>'}
        </div>
      </div>

      <div class="card mt">
        <div class="flex spread"><h3 style="margin:0">🤖 Sugestões do assistente</h3>
        <button class="btn small" data-nav-assist>ver todas →</button></div>
        <div class="list mt" id="dash-sugs">
          ${sugs.length ? sugs.map((sg) => Assistant.sugCardHtml(sg)).join("") : '<div class="muted small">Tudo em dia por aqui ✅</div>'}
        </div>
      </div>`;

    UI.bindMonthNav(v, () => ViewDashboard.month(), (nym) => { App.viewState.dashMonth = nym; App.render(); });
    UI.animateCounters(v);
    const va = U.$("[data-nav-assist]");
    if (va) va.onclick = () => App.go("assistente");
    Assistant.bindSugActions(U.$("#dash-sugs"));
  },
};
