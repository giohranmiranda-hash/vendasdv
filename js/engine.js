/* ICE SISTEMA — motor de cálculo.
   REGRAS DE OURO (aprendidas com dor):
   1. recipeCost() é a ÚNICA fonte de custo de receita — preview da tela Receitas
      e custo real da Produção chamam a MESMA função.
   2. Estoque de insumo = registrado (compras) − consumido (histórico de produções).
      NUNCA subtrai direto no ato de produzir: funciona em qualquer ordem de
      compra/produção.
   3. CPV de venda = FIFO real dos lotes produzidos. */
"use strict";

const Engine = {
  /* =============== INSUMOS =============== */
  insumoById(state, id) { return state.insumos.find((i) => i.id === id) || null; },

  // resolve a linha da receita para um insumo concreto, considerando slots por item
  // (slot 'materia'/'embalagem' → insumo próprio do sabor sendo produzido)
  resolveLineInsumo(state, line, itemId) {
    if (line.type === "insumo") return Engine.insumoById(state, line.insumoId);
    return state.insumos.find((i) => i.scope === "item" && i.itemId === itemId && i.role === line.slot) || null;
  },

  // dose da linha para um item específico (override por item > dose padrão)
  lineDose(line, itemId) {
    if (line.overrides && line.overrides[itemId] != null && line.overrides[itemId] !== "")
      return Number(line.overrides[itemId]) || 0;
    return Number(line.qtyPerUnit) || 0;
  },

  insumoRegistered(state, insumoId) {
    return U.sum(state.purchases.filter((p) => p.insumoId === insumoId), (p) => Number(p.qty) || 0);
  },
  insumoConsumed(state, insumoId) {
    let t = 0;
    for (const pr of state.productions)
      for (const c of pr.consumed || [])
        if (c.insumoId === insumoId) t += Number(c.qty) || 0;
    return t;
  },
  insumoStock(state, insumoId) {
    return Engine.insumoRegistered(state, insumoId) - Engine.insumoConsumed(state, insumoId);
  },

  /* =============== CUSTO DE RECEITA (fonte única!) =============== */
  // → { unitCost, lines: [{line, insumo, dose, price, cost, missing}] }
  recipeCost(state, recipeId, itemId) {
    const recipe = state.recipes.find((r) => r.id === recipeId);
    const out = { unitCost: 0, lines: [], recipe };
    if (!recipe) return out;
    for (const line of recipe.lines || []) {
      const insumo = Engine.resolveLineInsumo(state, line, itemId);
      const dose = Engine.lineDose(line, itemId);
      const price = insumo ? Number(insumo.price) || 0 : 0;
      const cost = dose * price;
      out.lines.push({
        line, insumo, dose, price, cost,
        missing: !insumo && line.type === "slot" ? line.slot : null,
      });
      out.unitCost += cost;
    }
    return out;
  },

  /* =============== PRODUÇÃO / LOTES =============== */
  // cria o registro de produção (que também é o lote rastreável, com validade)
  buildProduction(state, recipeId, itemId, qty, dateStr, expiryStr) {
    qty = Number(qty) || 0;
    const bd = Engine.recipeCost(state, recipeId, itemId);
    const consumed = bd.lines
      .filter((l) => l.insumo && l.dose > 0)
      .map((l) => ({ insumoId: l.insumo.id, qty: l.dose * qty, price: l.price }));
    const shelf = Number(state.settings.shelfLifeDays) || 180;
    return {
      id: U.uid(),
      date: dateStr || U.todayStr(),
      recipeId, itemId, qty,
      unitCost: bd.unitCost,
      totalCost: bd.unitCost * qty,
      consumed,
      expiry: expiryStr || U.addDays(dateStr || U.todayStr(), shelf),
      remaining: qty, // saldo do lote para FIFO
    };
  },

  /* Estoque de produto = PRODUZIDO − SAÍDAS (vendas + baixas manuais),
     sempre recalculado do histórico. Independe da ordem de lançamento:
     vender antes de cadastrar a produção funciona igual, e estoques que
     ficaram errados se corrigem sozinhos. Nunca subtrai direto no ato. */
  producedQty(state, itemId) {
    return U.sum(state.productions.filter((p) => p.itemId === itemId), (p) => Number(p.qty) || 0);
  },
  soldQty(state, itemId) {
    let t = 0;
    for (const s of state.sales)
      for (const i of s.items || []) if (i.itemId === itemId) t += Number(i.qty) || 0;
    return t;
  },
  adjustedOutQty(state, itemId) { // baixas manuais (perda/vencido/consumo próprio)
    return U.sum((state.stockAdjust || []).filter((a) => a.itemId === itemId), (a) => Number(a.qty) || 0);
  },
  outQty(state, itemId) {
    return Engine.soldQty(state, itemId) + Engine.adjustedOutQty(state, itemId);
  },

  productStock(state, itemId) {
    return Engine.producedQty(state, itemId) - Engine.outQty(state, itemId);
  },

  // lotes com o saldo restante calculado ao vivo: distribui as saídas nos
  // lotes por ordem (FIFO, mais antigo primeiro) — usado no Estoque e no valor
  computedLots(state, itemId) {
    const lots = U.sortBy(state.productions.filter((p) => p.itemId === itemId), (p) => p.date + p.id);
    let out = Engine.outQty(state, itemId);
    return lots.map((lot) => {
      const q = Number(lot.qty) || 0;
      const consume = Math.min(q, Math.max(0, out));
      out -= consume;
      return { lot, remaining: q - consume };
    });
  },

  stockValue(state, itemId) {
    const ids = itemId ? [itemId] : state.catalog.map((c) => c.id);
    let t = 0;
    for (const id of ids)
      for (const cl of Engine.computedLots(state, id)) t += cl.remaining * (Number(cl.lot.unitCost) || 0);
    return t;
  },

  // status de validade de um lote
  expiryStatus(expiryStr) {
    if (!expiryStr) return "ok";
    const d = U.daysBetween(U.todayStr(), expiryStr);
    if (d < 0) return "vencido";
    if (d <= 14) return "vencendo";
    return "ok";
  },

  // custo unitário estimado atual de um item (p/ fallback quando não há lote)
  estimatedUnitCost(state, itemId) {
    const prods = state.productions.filter((p) => p.itemId === itemId);
    if (prods.length) return Number(prods[prods.length - 1].unitCost) || 0;
    if (state.recipes && state.recipes.length) return Engine.recipeCost(state, state.recipes[0].id, itemId).unitCost;
    return 0;
  },

  // CPV de uma venda: custo FIFO dos lotes DISPONÍVEIS no momento (sem mutar
  // nada). Chamado antes de gravar a venda, então reflete o estoque de antes.
  cogsFor(state, itemId, qty) {
    qty = Number(qty) || 0;
    let left = qty, cogs = 0;
    for (const cl of Engine.computedLots(state, itemId)) {
      if (left <= 0) break;
      const take = Math.min(left, cl.remaining);
      cogs += take * (Number(cl.lot.unitCost) || 0);
      left -= take;
    }
    if (left > 0) cogs += left * Engine.estimatedUnitCost(state, itemId); // vendeu antes de produzir: melhor estimativa
    return cogs;
  },

  /* =============== CAPACIDADE / GARGALO =============== */
  // quantas unidades de um item dá pra produzir com o estoque atual de insumos
  unitsProducible(state, itemId, recipeId) {
    const rid = recipeId || (state.recipes[0] && state.recipes[0].id);
    if (!rid) return { units: Infinity, limiting: null };
    const bd = Engine.recipeCost(state, rid, itemId);
    let units = Infinity, limiting = null;
    for (const l of bd.lines) {
      if (!l.insumo || l.dose <= 0) continue;
      const stock = Engine.insumoStock(state, l.insumo.id);
      const can = stock / l.dose;
      if (can < units) { units = can; limiting = l.insumo; }
    }
    return { units: units === Infinity ? Infinity : Math.max(0, Math.floor(units)), limiting };
  },

  // gargalo global: insumo que mais limita a produção agora + quanto comprar libera
  bottleneck(state) {
    const items = state.catalog.filter((c) => !c.archived);
    if (!items.length || !state.recipes.length) return null;
    let worst = null;
    for (const it of items) {
      const r = Engine.unitsProducible(state, it.id);
      if (r.limiting && (worst == null || r.units < worst.units))
        worst = { item: it, units: r.units, limiting: r.limiting };
    }
    if (!worst || !worst.limiting) return null;
    // quanto 1 compra padrão do insumo liberaria (dose da 1ª receita que o usa)
    const rid = state.recipes[0].id;
    const bd = Engine.recipeCost(state, rid, worst.item.id);
    const line = bd.lines.find((l) => l.insumo && l.insumo.id === worst.limiting.id);
    const dose = line ? line.dose : 0;
    return {
      item: worst.item,
      insumo: worst.limiting,
      unitsNow: worst.units,
      stock: Engine.insumoStock(state, worst.limiting.id),
      dose,
      unitsPerPurchaseUnit: dose > 0 ? 1 / dose : 0, // cada 1 unid. do insumo libera X unid. de produto
    };
  },

  /* =============== VENDAS =============== */
  // % efetivo de imposto: 0 quando a chave está desligada nas Configurações
  effTaxPct(state) {
    return state.settings.taxEnabled ? (Number(state.settings.taxPct) || 0) : 0;
  },
  saleGross(sale) {
    return U.sum(sale.items || [], (i) => (Number(i.qty) || 0) * (Number(i.unitPrice) || 0)) +
      (Number(sale.freight) || 0);
  },
  saleTax(state, sale) {
    return Engine.saleGross(sale) * (Engine.effTaxPct(state) / 100);
  },
  saleNet(state, sale) {
    return Engine.saleGross(sale) - Engine.saleTax(state, sale) - (Number(sale.cogs) || 0);
  },

  salesOfMonth(state, ym) {
    return state.sales.filter((s) => U.monthOf(s.date) === ym);
  },

  monthSummary(state, ym) {
    const sales = Engine.salesOfMonth(state, ym);
    const revenue = U.sum(sales, (s) => Engine.saleGross(s));
    const tax = U.sum(sales, (s) => Engine.saleTax(state, s));
    const cogs = U.sum(sales, (s) => Number(s.cogs) || 0);
    const profit = revenue - tax - cogs;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const ticket = sales.length ? revenue / sales.length : 0;
    return { sales, count: sales.length, revenue, tax, cogs, profit, margin, ticket };
  },

  // por canal no mês: faturamento e %
  channelBreakdown(state, ym) {
    const sales = Engine.salesOfMonth(state, ym);
    const total = U.sum(sales, (s) => Engine.saleGross(s));
    const g = U.groupBy(sales, (s) => s.channel || "—");
    return U.sortBy(Object.keys(g).map((ch) => {
      const rev = U.sum(g[ch], (s) => Engine.saleGross(s));
      return { channel: ch, revenue: rev, count: g[ch].length, pct: total > 0 ? (rev / total) * 100 : 0 };
    }), (x) => x.revenue, true);
  },

  // contas a receber (fiado)
  receivables(state) {
    return state.sales.filter((s) => !s.received);
  },

  /* =============== FINANCEIRO (DRE de caixa) =============== */
  dre(state, ym) {
    const ms = Engine.monthSummary(state, ym);
    const exp = state.expenses.filter((e) => U.monthOf(e.date) === ym);
    const varCosts = U.sum(exp.filter((e) => e.kind === "variavel"), (e) => Number(e.amount) || 0);
    const fixCosts = U.sum(exp.filter((e) => e.kind === "fixa"), (e) => Number(e.amount) || 0);
    const invest = U.sum(exp.filter((e) => e.kind === "investimento"), (e) => Number(e.amount) || 0);
    const netRevenue = ms.revenue - ms.tax;
    const result = netRevenue - varCosts - fixCosts; // investimentos NÃO entram no operacional
    return { ...ms, netRevenue, varCosts, fixCosts, invest, result };
  },

  // payback: lucro operacional acumulado vs total investido
  payback(state) {
    const totalInvest = U.sum(state.expenses.filter((e) => e.kind === "investimento"), (e) => Number(e.amount) || 0);
    if (totalInvest <= 0) return null;
    const months = new Set();
    for (const s of state.sales) months.add(U.monthOf(s.date));
    for (const e of state.expenses) if (e.kind !== "investimento") months.add(U.monthOf(e.date));
    let acc = 0;
    for (const ym of Array.from(months).sort()) acc += Engine.dre(state, ym).result;
    return { totalInvest, accProfit: acc, paid: acc >= totalInvest, pct: U.clamp((acc / totalInvest) * 100, 0, 999) };
  },
};
