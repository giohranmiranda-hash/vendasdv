// @ts-check
/* Suíte funcional do Ice Sistema — roda contra o app real em headless.
   Cobre: onboarding, catálogo/white-label, receitas (fonte única de custo),
   insumos registrado−produzido, produção, estoque FIFO, vendas com CPV real,
   leads, financeiro/DRE, backup e navegação geral. */
const { test, expect } = require("@playwright/test");

// entra no modo offline e completa o onboarding com o template de exemplo
async function bootWithTemplate(page) {
  await page.goto("/index.html");
  await page.click("#btn-offline");
  await page.fill("#onb-name", "Gelato Teste");
  await page.click("#onb-template");
  await expect(page.locator("#brand-name")).toHaveText("Gelato Teste");
}

async function bootEmpty(page) {
  await page.goto("/index.html");
  await page.click("#btn-offline");
  await page.fill("#onb-name", "Empresa Vazia");
  await page.click("#onb-empty");
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(() => localStorage.clear());
});

test("login offline + onboarding com template", async ({ page }) => {
  await bootWithTemplate(page);
  // 5 sabores de exemplo criados
  const catalogLen = await page.evaluate(() => window.App.state.catalog.length);
  expect(catalogLen).toBe(5);
  // insumos por item (2 por sabor) + 2 gerais
  const insumos = await page.evaluate(() => window.App.state.insumos.length);
  expect(insumos).toBe(12);
});

test("onboarding vazio começa sem catálogo", async ({ page }) => {
  await bootEmpty(page);
  const catalogLen = await page.evaluate(() => window.App.state.catalog.length);
  expect(catalogLen).toBe(0);
});

test("todas as telas renderizam sem erro", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await bootWithTemplate(page);
  const ids = await page.evaluate(() => window.App.views.map((v) => v.id));
  for (const id of ids) {
    await page.evaluate((vid) => window.App.go(vid), id);
    await page.waitForTimeout(80);
    await expect(page.locator("#view h2")).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("white-label: renomear negócio e trocar cor reflete na UI", async ({ page }) => {
  await bootWithTemplate(page);
  await page.evaluate(() => {
    App.state.settings.businessName = "Açaí do Porto";
    App.state.settings.accent = "#e91e63";
    App.applyBranding();
  });
  await expect(page.locator("#brand-name")).toHaveText("Açaí do Porto");
  const accent = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());
  expect(accent).toBe("#e91e63");
});

test("catálogo é editável: adicionar produto novo cria insumos próprios", async ({ page }) => {
  await bootWithTemplate(page);
  await page.evaluate(() => App.go("config"));
  await page.click("#cfg-add-item");
  await page.fill("#it-name", "Picolé de Manga");
  await page.click('[data-a="s"]');
  const res = await page.evaluate(() => {
    const it = App.state.catalog.find((c) => c.name === "Picolé de Manga");
    return { exists: !!it, insumos: App.state.insumos.filter((i) => i.itemId === (it && it.id)).length };
  });
  expect(res.exists).toBe(true);
  expect(res.insumos).toBe(2); // matéria-prima + embalagem próprios
});

test("custo da receita: preview e produção usam a MESMA função e batem", async ({ page }) => {
  await bootWithTemplate(page);
  const r = await page.evaluate(() => {
    const st = App.state;
    // define preços conhecidos
    for (const ins of st.insumos) ins.price = ins.role === "materia" ? 10 : ins.role === "embalagem" ? 0.5 : 2;
    const recipe = st.recipes[0];
    const item = st.catalog[0];
    const preview = Engine.recipeCost(st, recipe.id, item.id).unitCost;
    const prod = Engine.buildProduction(st, recipe.id, item.id, 100, "2026-07-01");
    return { preview, prodUnit: prod.unitCost, consumed: prod.consumed.length };
  });
  expect(r.prodUnit).toBeCloseTo(r.preview, 10); // exatamente o mesmo número
  expect(r.consumed).toBeGreaterThan(0);
});

test("override de dose por item: um sabor consome mais que os outros", async ({ page }) => {
  await bootWithTemplate(page);
  const r = await page.evaluate(() => {
    const st = App.state;
    const recipe = st.recipes[0];
    const [a, b] = st.catalog;
    for (const ins of st.insumos) ins.price = 10;
    const lineMateria = recipe.lines.find((l) => l.slot === "materia");
    lineMateria.overrides[b.id] = lineMateria.qtyPerUnit * 3; // sabor B usa 3x mais
    return {
      costA: Engine.recipeCost(st, recipe.id, a.id).unitCost,
      costB: Engine.recipeCost(st, recipe.id, b.id).unitCost,
    };
  });
  expect(r.costB).toBeGreaterThan(r.costA);
});

test("insumos: estoque = registrado − produzido (mesmo produzindo antes de comprar)", async ({ page }) => {
  await bootWithTemplate(page);
  const r = await page.evaluate(() => {
    const st = App.state;
    const item = st.catalog[0];
    const recipe = st.recipes[0];
    const materia = st.insumos.find((i) => i.itemId === item.id && i.role === "materia");
    // produz ANTES de registrar compra (o caso que quebrava o sistema antigo)
    st.productions.push(Engine.buildProduction(st, recipe.id, item.id, 100, "2026-07-01"));
    const stockNegativo = Engine.insumoStock(st, materia.id);
    // agora registra a compra
    st.purchases.push({ id: "p1", insumoId: materia.id, qty: 50, total: 500, date: "2026-07-02", adjust: false });
    const stockDepois = Engine.insumoStock(st, materia.id);
    const dose = recipe.lines.find((l) => l.slot === "materia").qtyPerUnit;
    return { stockNegativo, stockDepois, esperado: 50 - dose * 100 };
  });
  expect(r.stockNegativo).toBeLessThan(0); // consumo registrado mesmo sem compra
  expect(r.stockDepois).toBeCloseTo(r.esperado, 6);
});

test("modal de repor: 'compra nova' lança gasto, 'ajuste' não", async ({ page }) => {
  await bootWithTemplate(page);
  await page.evaluate(() => App.go("insumos"));
  // compra nova
  await page.click("[data-repor]"); // primeiro insumo
  await page.fill("#rp-qty", "10");
  await page.fill("#rp-total", "120");
  await page.click('[data-a="s"]');
  let counts = await page.evaluate(() => ({ p: App.state.purchases.length, e: App.state.expenses.length }));
  expect(counts.p).toBe(1);
  expect(counts.e).toBe(1);
  // ajuste (sem gasto)
  await page.click("[data-repor]");
  await page.selectOption("#rp-mode", "ajuste");
  await page.fill("#rp-qty", "5");
  await page.click('[data-a="s"]');
  counts = await page.evaluate(() => ({ p: App.state.purchases.length, e: App.state.expenses.length }));
  expect(counts.p).toBe(2);
  expect(counts.e).toBe(1); // gasto NÃO aumentou
});

test("venda com CPV FIFO real: consome lotes na ordem e calcula lucro", async ({ page }) => {
  await bootWithTemplate(page);
  const r = await page.evaluate(() => {
    const st = App.state;
    st.settings.taxPct = 10;
    const item = st.catalog[0];
    // dois lotes com custos diferentes (FIFO: o mais antigo primeiro)
    st.productions.push({ id: "l1", date: "2026-07-01", recipeId: "x", itemId: item.id, qty: 10, unitCost: 1.0, totalCost: 10, consumed: [], expiry: "2026-12-01", remaining: 10 });
    st.productions.push({ id: "l2", date: "2026-07-02", recipeId: "x", itemId: item.id, qty: 10, unitCost: 2.0, totalCost: 20, consumed: [], expiry: "2026-12-01", remaining: 10 });
    const { cogs, taken } = Engine.consumeFIFO(st, item.id, 15); // 10×1,00 + 5×2,00 = 20
    const sale = { id: "s1", date: U.todayStr(), channel: "Balcão", items: [{ itemId: item.id, qty: 15, unitPrice: 5 }], freight: 0, received: true, cogs, fifo: taken };
    st.sales.push(sale);
    return {
      cogs,
      rem1: st.productions.find((p) => p.id === "l1").remaining,
      rem2: st.productions.find((p) => p.id === "l2").remaining,
      gross: Engine.saleGross(sale),
      net: Engine.saleNet(st, sale),
    };
  });
  expect(r.cogs).toBeCloseTo(20, 6);
  expect(r.rem1).toBe(0);
  expect(r.rem2).toBe(5);
  expect(r.gross).toBeCloseTo(75, 6);
  expect(r.net).toBeCloseTo(75 - 7.5 - 20, 6); // − imposto 10% − CPV
});

test("apagar venda devolve os itens pros lotes de origem", async ({ page }) => {
  await bootWithTemplate(page);
  const r = await page.evaluate(() => {
    const st = App.state;
    const item = st.catalog[0];
    st.productions.push({ id: "l1", date: "2026-07-01", recipeId: "x", itemId: item.id, qty: 10, unitCost: 1, totalCost: 10, consumed: [], expiry: "2026-12-01", remaining: 10 });
    const { cogs, taken } = Engine.consumeFIFO(st, item.id, 4);
    const before = st.productions[st.productions.length - 1].remaining;
    Engine.restoreFIFO(st, taken);
    const after = st.productions[st.productions.length - 1].remaining;
    return { before, after };
  });
  expect(r.before).toBe(6);
  expect(r.after).toBe(10);
});

test("venda pela UI: multi-item, fiado aparece no banner e 'Recebi' liquida", async ({ page }) => {
  await bootWithTemplate(page);
  // dá estoque
  await page.evaluate(() => {
    const st = App.state;
    for (const it of st.catalog.slice(0, 2))
      st.productions.push({ id: "lote-" + it.id, date: "2026-07-01", recipeId: "x", itemId: it.id, qty: 50, unitCost: 1, totalCost: 50, consumed: [], expiry: "2026-12-31", remaining: 50 });
    App.go("vendas");
  });
  await page.click("#vd-new");
  await page.fill('[data-line="0"] [data-lf="qty"]', "3");
  await page.fill('[data-line="0"] [data-lf="unitPrice"]', "10");
  await page.click("#vd-addline");
  await page.fill('[data-line="1"] [data-lf="qty"]', "2");
  await page.fill('[data-line="1"] [data-lf="unitPrice"]', "8");
  await page.selectOption('[data-line="1"] [data-lf="itemId"]', { index: 1 });
  await page.fill("#vd-custname", "Maria Fiado");
  await page.selectOption("#vd-received", "0"); // fiado
  await page.click('[data-a="s"]');
  await expect(page.locator(".banner.warn")).toContainText("fiado");
  // cliente avulso virou cadastro
  const hasCust = await page.evaluate(() => App.state.customers.some((c) => c.name === "Maria Fiado"));
  expect(hasCust).toBe(true);
  // liquida
  await page.click("[data-receber]");
  const fiados = await page.evaluate(() => Engine.receivables(App.state).length);
  expect(fiados).toBe(0);
});

test("dashboard abre no mês do calendário ATUAL mesmo sem vendas no mês", async ({ page }) => {
  await bootWithTemplate(page);
  await page.evaluate(() => {
    // só vendas de 3 meses atrás
    const st = App.state;
    const item = st.catalog[0];
    st.sales.push({ id: "old", date: "2026-04-15", channel: "Balcão", items: [{ itemId: item.id, qty: 1, unitPrice: 10 }], freight: 0, received: true, cogs: 1, fifo: [] });
    App.go("dashboard");
  });
  const label = await page.locator(".month-nav .m-label").first().textContent();
  const now = new Date();
  const expected = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  expect(label.toLowerCase()).toContain(expected.split(" ")[0].toLowerCase()); // mês atual, não abril
});

test("leads: fechar converte em cliente e abre venda pré-preenchida", async ({ page }) => {
  await bootWithTemplate(page);
  await page.evaluate(() => App.go("leads"));
  await page.click("#ld-new");
  await page.fill("#ld-name", "João Anúncio");
  await page.fill("#ld-phone", "11999998888");
  await page.fill("#ld-source", "Instagram julho");
  await page.click('[data-a="s"]');
  await page.click("[data-fechar]");
  // virou cliente com telefone e modal de venda abriu pré-preenchido
  const r = await page.evaluate(() => {
    const c = App.state.customers.find((x) => x.name === "João Anúncio");
    return { cust: !!c, phone: c && c.phone };
  });
  expect(r.cust).toBe(true);
  expect(r.phone).toBe("11999998888");
  await expect(page.locator("#modal-root h3").first()).toContainText("Nova venda");
  const selected = await page.locator("#vd-cust option:checked").textContent();
  expect(selected).toBe("João Anúncio");
});

test("financeiro: DRE separa investimento do resultado operacional", async ({ page }) => {
  await bootWithTemplate(page);
  const r = await page.evaluate(() => {
    const st = App.state;
    const ym = U.monthStr();
    const item = st.catalog[0];
    st.sales.push({ id: "s1", date: U.todayStr(), channel: "Balcão", items: [{ itemId: item.id, qty: 10, unitPrice: 10 }], freight: 0, received: true, cogs: 10, fifo: [] });
    st.expenses.push({ id: "e1", date: U.todayStr(), desc: "Aluguel", amount: 30, kind: "fixa" });
    st.expenses.push({ id: "e2", date: U.todayStr(), desc: "Freezer novo", amount: 5000, kind: "investimento" });
    const dre = Engine.dre(st, ym);
    return { result: dre.result, invest: dre.invest };
  });
  expect(r.result).toBeCloseTo(100 - 30, 6); // investimento NÃO entra
  expect(r.invest).toBeCloseTo(5000, 6);
});

test("backup: exportar estado e restaurar marca local como mais recente", async ({ page }) => {
  await bootWithTemplate(page);
  const r = await page.evaluate(() => {
    const before = App.state.updatedAt;
    const backup = JSON.parse(JSON.stringify(App.state));
    backup.settings.businessName = "Restaurado LTDA";
    // simula o fluxo de restaurar
    App.state = Store.migrate(backup);
    App.state.updatedAt = U.nowMs();
    Store.saveLocal(App.state, Store.currentUid);
    App.applyBranding();
    return { name: App.state.settings.businessName, newer: App.state.updatedAt >= before };
  });
  expect(r.name).toBe("Restaurado LTDA");
  expect(r.newer).toBe(true);
  await expect(page.locator("#brand-name")).toHaveText("Restaurado LTDA");
});

test("persistência local: recarregar a página mantém os dados (offline)", async ({ page }) => {
  await bootWithTemplate(page);
  await page.evaluate(() => {
    App.state.settings.businessName = "Persistente & Cia";
    App.save({ rerender: false });
  });
  await page.reload();
  await expect(page.locator("#brand-name")).toHaveText("Persistente & Cia");
});

test("datas: helpers usam hora local (nunca UTC puro)", async ({ page }) => {
  await bootWithTemplate(page);
  const r = await page.evaluate(() => {
    const now = new Date();
    const expected = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");
    return { today: U.todayStr(), expected, rel: U.relDate(U.todayStr()), relAmanha: U.relDate(U.addDays(U.todayStr(), 1)) };
  });
  expect(r.today).toBe(r.expected);
  expect(r.rel).toBe("Hoje");
  expect(r.relAmanha).toBe("Amanhã");
});

test("mapa: tela de logística renderiza e cria entrega com pino fallback perto do depósito", async ({ page }) => {
  await bootWithTemplate(page);
  await page.evaluate(() => {
    App.state.settings.address = { text: "Base", cep: "", lat: -23.55, lng: -46.63 };
    App.save({ rerender: false });
    App.go("mapa");
  });
  await expect(page.locator("#map-canvas")).toBeVisible();
  await page.waitForTimeout(700); // tiles/fit retries
  // cria entrega sem conseguir geocodificar (offline no teste → fallback perto do depósito)
  await page.click("#mp-new");
  await page.fill("#dl-name", "Entrega Sem Endereço");
  await page.fill('[data-line="0"] [data-lf="qty"]', "2");
  await page.fill('[data-line="0"] [data-lf="unitPrice"]', "6");
  await page.click('[data-a="s"]');
  await page.waitForTimeout(400);
  const del = await page.evaluate(() => App.state.deliveries[0]);
  expect(del.lat).not.toBeNull(); // NUNCA fica sem pino
  expect(Math.abs(del.lat - -23.55)).toBeLessThan(0.1); // perto do depósito
});

test("assistente local responde perguntas por palavra-chave", async ({ page }) => {
  await bootWithTemplate(page);
  await page.evaluate(() => App.go("assistente"));
  await page.fill("#as-q", "qual meu lucro?");
  await page.click("#as-send");
  await expect(page.locator(".chat-msg.bot").last()).toContainText("lucro líquido", { ignoreCase: true });
});

test("mobile: menu hambúrguer abre gaveta, navega e fecha", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootWithTemplate(page);
  await expect(page.locator("#btn-drawer")).toBeVisible();
  await page.click("#btn-drawer");
  await expect(page.locator("body")).toHaveClass(/drawer-open/);
  await expect(page.locator("#drawer")).toBeVisible();
  // navega pela gaveta
  await page.click('#menu-drawer [data-nav="vendas"]');
  await expect(page.locator("body")).not.toHaveClass(/drawer-open/); // fechou sozinha
  await expect(page.locator("#view h2")).toContainText("Vendas");
  // backdrop também fecha
  await page.click("#btn-drawer");
  await page.click("#drawer-back", { position: { x: 380, y: 400 } });
  await expect(page.locator("body")).not.toHaveClass(/drawer-open/);
});

test("assinatura: mostra plano, PIX copiável e botão de pagamento quando configurados", async ({ page }) => {
  await bootWithTemplate(page);
  await page.evaluate(() => {
    ICE_CONFIG.PLAN.paymentLink = "https://mpago.la/teste";
    ICE_CONFIG.PLAN.pixKey = "pix@icesistema.com";
    ICE_CONFIG.PLAN.whatsapp = "5511999998888";
    App.go("assinatura");
  });
  await expect(page.locator("#view h2")).toContainText("Assinatura");
  await expect(page.locator("#pay-link")).toBeVisible();
  await expect(page.locator("#pay-pix-copy")).toBeVisible();
  await expect(page.locator("#pay-wa")).toBeVisible();
  await expect(page.locator("#view")).toContainText("R$ 49,90/mês");
});

test("assinatura sem configuração: instrui o dono do sistema", async ({ page }) => {
  await bootWithTemplate(page);
  await page.evaluate(() => App.go("assinatura"));
  await expect(page.locator("#view .banner.info")).toContainText("Pagamento ainda não configurado");
});

test("sem nuvem configurada: login esconde formulário e oferece offline", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#login-form")).toBeHidden();
  await expect(page.locator("#login-nocloud")).toBeVisible();
  await expect(page.locator("#btn-offline")).toBeVisible();
});
