/* ICE SISTEMA — Relatórios (CSV + resumo 7 dias pro WhatsApp), Metas &
   Comissões, Calendário operacional. */
"use strict";

const ViewExtras = {
  /* ============ RELATÓRIOS ============ */
  renderRelatorios() {
    const v = U.$("#view");
    const st = App.state;
    const today = U.todayStr();

    // últimos 7 dias
    const d7 = st.sales.filter((s) => U.daysBetween(s.date, today) <= 6 && U.daysBetween(s.date, today) >= 0);
    const rev7 = U.sum(d7, (s) => Engine.saleGross(s));
    const profit7 = U.sum(d7, (s) => Engine.saleNet(st, s));
    const perItem = {};
    for (const s of d7) for (const i of s.items || []) perItem[i.itemId] = (perItem[i.itemId] || 0) + i.qty;
    const top7 = U.sortBy(Object.keys(perItem).map((id) => ({ id, q: perItem[id] })), (x) => x.q, true).slice(0, 3);

    const resumoWa = [
      `📊 *${st.settings.businessName || "Meu negócio"}* — últimos 7 dias`,
      ``,
      `💰 Faturamento: ${U.money(rev7)}`,
      `✅ Lucro líquido: ${U.money(profit7)}`,
      `🛒 Vendas: ${d7.length}`,
      top7.length ? `🏆 Mais vendidos: ${top7.map((t) => UI.itemName(t.id) + " (" + U.num(t.q, 0) + ")").join(", ")}` : "",
      `📬 A receber: ${U.money(U.sum(Engine.receivables(st), (s) => Engine.saleGross(s)))}`,
      ``,
      `_Gerado pelo Ice Sistema_ ❄️`,
    ].filter((l) => l !== "").join("\n");

    v.innerHTML = `
      <div class="view-head"><h2>📈 Relatórios</h2></div>
      <div class="grid g2">
        <div class="card">
          <h3>📤 Resumo dos últimos 7 dias</h3>
          <textarea id="rp-wa" rows="10" readonly style="font-size:.85rem">${U.esc(resumoWa)}</textarea>
          <div class="flex mt">
            <button class="btn wa" id="rp-share">💬 Compartilhar no WhatsApp</button>
            <button class="btn" id="rp-copy">📋 Copiar</button>
          </div>
        </div>
        <div class="card">
          <h3>⬇️ Exportar CSV</h3>
          <div class="muted small mb">Arquivos prontos pra abrir no Excel/Planilhas Google.</div>
          <div class="grid" style="gap:8px">
            <button class="btn" data-csv="vendas">💰 Vendas</button>
            <button class="btn" data-csv="producao">🏭 Produções</button>
            <button class="btn" data-csv="clientes">👥 Clientes</button>
            <button class="btn" data-csv="financeiro">🏦 Lançamentos financeiros</button>
            <button class="btn" data-csv="leads">🎯 Leads</button>
          </div>
        </div>
      </div>`;

    U.$("#rp-share").onclick = () => window.open("https://wa.me/?text=" + encodeURIComponent(resumoWa), "_blank");
    U.$("#rp-copy").onclick = async () => {
      try { await navigator.clipboard.writeText(resumoWa); UI.toast("Copiado 📋", "ok"); }
      catch (e) { U.$("#rp-wa").select(); document.execCommand("copy"); UI.toast("Copiado 📋", "ok"); }
    };
    U.$$("[data-csv]").forEach((b) => (b.onclick = () => ViewExtras.exportCsv(b.dataset.csv)));
  },

  exportCsv(kind) {
    const st = App.state;
    const SEP = ";", rows = [];
    const push = (arr) => rows.push(arr.map(U.csvCell).join(SEP));
    if (kind === "vendas") {
      push(["Data", "Canal", "Cliente", "Itens", "Frete", "Total", "Imposto", "CPV", "Lucro liq.", "Recebido", "Vendedor"]);
      for (const s of U.sortBy(st.sales, (x) => x.date)) {
        const cust = st.customers.find((c) => c.id === s.customerId);
        push([s.date, s.channel, cust ? cust.name : s.customerName || "", UI.itemsSummary(s.items),
          s.freight || 0, Engine.saleGross(s).toFixed(2), Engine.saleTax(st, s).toFixed(2),
          (s.cogs || 0).toFixed(2), Engine.saleNet(st, s).toFixed(2), s.received ? "sim" : "fiado",
          (st.team.find((t) => t.id === s.sellerId) || {}).name || ""]);
      }
    } else if (kind === "producao") {
      push(["Data", "Item", "Receita", "Qtd", "Custo/un", "Custo total", "Validade", "Restante no lote"]);
      for (const p of U.sortBy(st.productions, (x) => x.date))
        push([p.date, UI.itemName(p.itemId), (st.recipes.find((r) => r.id === p.recipeId) || {}).name || "",
          p.qty, p.unitCost.toFixed(4), p.totalCost.toFixed(2), p.expiry, p.remaining]);
    } else if (kind === "clientes") {
      push(["Nome", "Telefone", "CEP", "Endereço", "Compras", "Total gasto"]);
      for (const c of st.customers) {
        const sales = st.sales.filter((s) => s.customerId === c.id);
        push([c.name, c.phone, c.cep, c.address, sales.length, U.sum(sales, (s) => Engine.saleGross(s)).toFixed(2)]);
      }
    } else if (kind === "financeiro") {
      push(["Data", "Descrição", "Tipo", "Valor"]);
      for (const e of U.sortBy(st.expenses, (x) => x.date)) push([e.date, e.desc, e.kind, e.amount.toFixed(2)]);
    } else if (kind === "leads") {
      push(["Nome", "Telefone", "Origem", "Interesse", "Status", "Criado", "Fechou em"]);
      for (const l of st.leads) push([l.name, l.phone, l.source, l.interest, l.status, l.createdAt, l.closedAt || ""]);
    }
    U.downloadFile("ice-" + kind + "-" + U.todayStr() + ".csv", "﻿" + rows.join("\r\n"), "text/csv;charset=utf-8");
    UI.toast("CSV exportado ⬇️", "ok");
  },

  /* ============ METAS & COMISSÕES ============ */
  renderMetas() {
    const v = U.$("#view");
    const st = App.state;
    const ym = App.viewState.metasMonth || U.monthStr();
    const ms = Engine.monthSummary(st, ym);
    const goalR = Number(st.goals.revenue) || 0;
    const goalP = Number(st.goals.profit) || 0;

    // comissões do mês por vendedor
    const commRows = st.team.map((t) => {
      const sales = ms.sales.filter((s) => s.sellerId === t.id);
      const base = U.sum(sales, (s) => Engine.saleGross(s));
      return { t, count: sales.length, base, comm: base * ((Number(t.commissionPct) || 0) / 100) };
    });

    const bar = (val, goal) => goal > 0 ? `
      <div class="hbar-track mt" style="height:16px"><div class="hbar-fill" style="width:${U.clamp((val / goal) * 100, 0, 100)}%"></div></div>
      <div class="muted small mt">${U.money(val)} de ${U.money(goal)} (${U.pct(goal > 0 ? (val / goal) * 100 : 0, 0)})</div>` :
      `<div class="muted small mt">Defina a meta abaixo 👇</div>`;

    v.innerHTML = `
      <div class="view-head"><h2>🏁 Metas & Comissões</h2>${UI.monthNavHtml(ym)}</div>
      <div class="grid g2">
        <div class="card"><h3>🎯 Meta de faturamento</h3>${bar(ms.revenue, goalR)}
          <label>Meta mensal</label><input id="mt-rev" inputmode="decimal" value="${goalR || ""}" placeholder="0,00"/></div>
        <div class="card"><h3>💎 Meta de lucro</h3>${bar(ms.profit, goalP)}
          <label>Meta mensal</label><input id="mt-prof" inputmode="decimal" value="${goalP || ""}" placeholder="0,00"/></div>
      </div>
      <div class="m-actions mt mb"><button class="btn primary" id="mt-save">Salvar metas</button></div>
      <div class="card">
        <h3>🧑‍💼 Comissões — ${U.esc(U.monthLabel(ym))}</h3>
        ${st.team.length ? `<div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Vendedor</th><th class="right">%</th><th class="right">Vendas</th><th class="right">Base</th><th class="right">Comissão</th></tr></thead>
          <tbody>${commRows.map((r) => `<tr><td>${U.esc(r.t.name)}</td><td class="right">${U.pct(r.t.commissionPct, 1)}</td>
            <td class="right">${r.count}</td><td class="right">${U.money(r.base)}</td>
            <td class="right"><b>${U.money(r.comm)}</b></td></tr>`).join("")}</tbody>
        </table></div>` : '<div class="muted small">Cadastre a equipe em ⚙️ Configurações e associe vendas a vendedores.</div>'}
      </div>`;

    UI.bindMonthNav(v, () => ym, (nym) => { App.viewState.metasMonth = nym; App.render(); });
    U.$("#mt-save").onclick = () => {
      st.goals.revenue = U.parseNum(U.$("#mt-rev").value);
      st.goals.profit = U.parseNum(U.$("#mt-prof").value);
      App.save();
      UI.toast("Metas salvas 🏁", "ok");
    };
  },

  /* ============ CALENDÁRIO OPERACIONAL ============ */
  renderCalendario() {
    const v = U.$("#view");
    const st = App.state;
    const ym = App.viewState.calMonth || U.monthStr();
    const [y, m] = ym.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const startWd = first.getDay();
    const today = U.todayStr();

    // eventos por dia: vendas, produções, entregas, validades, notas
    const events = {};
    const add = (dateStr, ev) => {
      if (U.monthOf(dateStr) !== ym) return;
      const d = Number(dateStr.slice(8, 10));
      (events[d] = events[d] || []).push(ev);
    };
    for (const s of st.sales) add(s.date, { icon: "💰", cls: "ok" });
    for (const p of st.productions) { add(p.date, { icon: "🏭", cls: "info" }); if (p.remaining > 0) add(p.expiry, { icon: "⌛", cls: "warn" }); }
    for (const d of st.deliveries.filter((x) => !x.done)) add(d.date, { icon: "🚚", cls: "accent" });
    for (const n of st.calendarNotes) add(n.date, { icon: n.done ? "✅" : "📝", cls: "" });

    let cells = "";
    for (let i = 0; i < startWd; i++) cells += "<div></div>";
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = ym + "-" + U.pad2(d);
      const evs = events[d] || [];
      cells += `<div class="cal-day ${ds === today ? "today" : ""}" data-day="${ds}">
        <div class="cal-num">${d}</div>
        <div class="cal-evs">${[...new Set(evs.map((e) => e.icon))].slice(0, 4).join("")}</div>
      </div>`;
    }

    const notes = U.sortBy(st.calendarNotes.filter((n) => U.monthOf(n.date) === ym), (n) => n.date);

    v.innerHTML = `
      <div class="view-head"><h2>📅 Calendário operacional</h2>${UI.monthNavHtml(ym)}</div>
      <style>
        .cal-grid { display:grid; grid-template-columns:repeat(7,1fr); gap:4px; }
        .cal-wd { text-align:center; color:var(--muted); font-size:.72rem; padding:4px 0; text-transform:uppercase; }
        .cal-day { background:var(--card); border:1px solid var(--line); border-radius:8px; min-height:58px; padding:4px 6px; cursor:pointer; }
        .cal-day:hover { border-color:var(--accent); }
        .cal-day.today { border-color:var(--accent); background:var(--accent-soft); }
        .cal-num { font-size:.78rem; color:var(--muted); }
        .cal-evs { font-size:.85rem; letter-spacing:1px; }
      </style>
      <div class="card">
        <div class="cal-grid">${["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => `<div class="cal-wd">${d}</div>`).join("")}${cells}</div>
        <div class="muted small mt">💰 venda · 🏭 produção · 🚚 entrega · ⌛ validade de lote · 📝 nota — toque num dia pra adicionar nota/lembrete.</div>
      </div>
      <div class="card mt"><h3>📝 Notas do mês</h3>
        <div class="list">${notes.length ? notes.map((n) => `
          <div class="row-card"><div class="rc-main"><div class="rc-title" style="${n.done ? "text-decoration:line-through;opacity:.6" : ""}">${U.esc(n.text)}</div>
          <div class="rc-sub">${U.relDate(n.date)} · ${U.fmtDate(n.date)}</div></div>
          <div class="rc-actions">
            <button class="btn small" data-nt-done="${n.id}">${n.done ? "↩️" : "✅"}</button>
            <button class="btn small danger" data-nt-del="${n.id}">🗑️</button>
          </div></div>`).join("") : '<div class="muted small">Nenhuma nota neste mês.</div>'}</div>
      </div>`;

    UI.bindMonthNav(v, () => ym, (nym) => { App.viewState.calMonth = nym; App.render(); });
    U.$$(".cal-day").forEach((c) => (c.onclick = () => {
      const ds = c.dataset.day;
      const m2 = UI.modal(`
        <h3>📝 Nota para ${U.fmtDate(ds)} (${U.relDate(ds)})</h3>
        <input id="nt-text" placeholder="Ex: produzir 200 un de coco, buscar embalagens…"/>
        <div class="m-actions"><button class="btn" data-a="c">Cancelar</button><button class="btn primary" data-a="s">Salvar</button></div>`);
      U.$('[data-a="c"]', m2.el).onclick = m2.close;
      U.$('[data-a="s"]', m2.el).onclick = () => {
        const text = U.$("#nt-text").value.trim();
        if (!text) return;
        st.calendarNotes.push({ id: U.uid(), date: ds, text, done: false });
        m2.close();
        App.save();
      };
    }));
    U.$$("[data-nt-done]").forEach((b) => (b.onclick = (e) => {
      e.stopPropagation();
      const n = st.calendarNotes.find((x) => x.id === b.dataset.ntDone);
      n.done = !n.done;
      App.save();
    }));
    U.$$("[data-nt-del]").forEach((b) => (b.onclick = (e) => {
      e.stopPropagation();
      st.calendarNotes = st.calendarNotes.filter((x) => x.id !== b.dataset.ntDel);
      App.save();
    }));
  },
};
