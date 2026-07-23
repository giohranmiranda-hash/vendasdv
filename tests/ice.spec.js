// @ts-check
/* Suíte funcional do Ice Sistema — roda contra o app real em headless.
   Cobre: onboarding, catálogo/white-label, receitas (fonte única de custo),
   insumos registrado−produzido, produção, estoque FIFO, vendas com CPV real,
   leads, financeiro/DRE, backup e navegação geral. */
const { test, expect } = require("@playwright/test");

// simula instalação SEM nuvem (o botão offline só existe nesse cenário),
// com um PLAN de teste — independente do config.js real de produção
const NO_CLOUD_CONFIG = () => {
  const fake = {
    SUPABASE_URL: "", SUPABASE_ANON_KEY: "",
    PLAN: {
      name: "Plano Mensal", price: "R$ 19,97/mês", oldPrice: "R$ 49,90",
      benefits: ["Todos os módulos liberados"], paymentLink: "", pixKey: "", whatsapp: "",
    },
  };
  Object.defineProperty(window, "ICE_CONFIG", { get: () => fake, set: () => {} });
};

// entra no modo offline e completa o onboarding com o template de exemplo
async function bootWithTemplate(page) {
  await page.addInitScript(NO_CLOUD_CONFIG);
  await page.goto("/index.html");
  await page.click("#btn-offline");
  await page.fill("#onb-name", "Gelato Teste");
  await page.click("#onb-template");
  await expect(page.locator("#brand-name")).toHaveText("Gelato Teste");
}

async function bootEmpty(page) {
  await page.addInitScript(NO_CLOUD_CONFIG);
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

test("catálogo é editável: adicionar produto novo pelo modal", async ({ page }) => {
  await bootWithTemplate(page);
  await page.evaluate(() => App.go("config"));
  await page.click("#cfg-add-item");
  await page.fill("#it-name", "Picolé de Manga");
  await page.click('[data-a="s"]');
  const exists = await page.evaluate(() => App.state.catalog.some((c) => c.name === "Picolé de Manga"));
  expect(exists).toBe(true);
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

test("produção simplificada: quantidade + gasto → estoque, custo/un e gasto no financeiro", async ({ page }) => {
  await bootWithTemplate(page);
  await page.evaluate(() => App.go("producao"));
  await page.click("#pr-new");
  await page.fill("#pr-qty", "100");
  await page.fill("#pr-cost", "80");
  // preview mostra custo por unidade calculado na hora
  await expect(page.locator("#pr-preview")).toContainText("0,80");
  await page.click('[data-a="s"]');
  const r = await page.evaluate(() => {
    const p = App.state.productions[0];
    return {
      qty: p.qty, unitCost: p.unitCost,
      stock: Engine.productStock(App.state, p.itemId),
      expense: App.state.expenses.find((e) => e.productionId === p.id),
    };
  });
  expect(r.qty).toBe(100);
  expect(r.unitCost).toBeCloseTo(0.8, 6);
  expect(r.stock).toBe(100);
  expect(r.expense.amount).toBeCloseTo(80, 6); // gasto lançado no financeiro
  // apagar a produção remove o lote e o gasto ligado
  await page.click("[data-del]");
  await page.click('[data-a="yes"]');
  const after = await page.evaluate(() => ({ p: App.state.productions.length, e: App.state.expenses.length }));
  expect(after.p).toBe(0);
  expect(after.e).toBe(0);
});

test("estoque = produzido − vendido: CPV FIFO e baixa correta na ordem certa", async ({ page }) => {
  await bootWithTemplate(page);
  const r = await page.evaluate(() => {
    const st = App.state;
    st.settings.taxEnabled = true;
    st.settings.taxPct = 10;
    const item = st.catalog[0];
    // dois lotes com custos diferentes (FIFO: o mais antigo primeiro)
    st.productions.push({ id: "l1", date: "2026-07-01", itemId: item.id, qty: 10, unitCost: 1.0, totalCost: 10, expiry: "2026-12-01" });
    st.productions.push({ id: "l2", date: "2026-07-02", itemId: item.id, qty: 10, unitCost: 2.0, totalCost: 20, expiry: "2026-12-01" });
    const stockAntes = Engine.productStock(st, item.id);
    const cogs = Engine.cogsFor(st, item.id, 15); // 10×1 + 5×2 = 20
    st.sales.push({ id: "s1", date: U.todayStr(), channel: "Balcão", items: [{ itemId: item.id, qty: 15, unitPrice: 5 }], freight: 0, received: true, cogs });
    const sale = st.sales[0];
    return { stockAntes, cogs, stockDepois: Engine.productStock(st, item.id), gross: Engine.saleGross(sale), net: Engine.saleNet(st, sale) };
  });
  expect(r.stockAntes).toBe(20);
  expect(r.cogs).toBeCloseTo(20, 6);
  expect(r.stockDepois).toBe(5); // 20 produzidas − 15 vendidas
  expect(r.gross).toBeCloseTo(75, 6);
  expect(r.net).toBeCloseTo(75 - 7.5 - 20, 6);
});

test("BUG DO CLIENTE: vender ANTES de cadastrar a produção baixa o estoque igual", async ({ page }) => {
  await bootWithTemplate(page);
  const r = await page.evaluate(() => {
    const st = App.state;
    const item = st.catalog[0];
    // 1) registra a venda PRIMEIRO (estoque ainda vazio)
    st.sales.push({ id: "s1", date: U.todayStr(), channel: "Balcão", items: [{ itemId: item.id, qty: 154, unitPrice: 2 }], freight: 0, received: true, cogs: 0 });
    const stockAposVenda = Engine.productStock(st, item.id);
    // 2) só DEPOIS cadastra a produção de 2954
    st.productions.push({ id: "p1", date: U.todayStr(), itemId: item.id, qty: 2954, unitCost: 0.5, totalCost: 1477, expiry: U.addDays(U.todayStr(), 180) });
    return { stockAposVenda, stockFinal: Engine.productStock(st, item.id) };
  });
  expect(r.stockAposVenda).toBe(-154);    // vendeu sem estoque: fica negativo (informativo)
  expect(r.stockFinal).toBe(2954 - 154);  // 2800 — a venda antiga baixa do estoque novo sozinha
});

test("apagar venda devolve os itens pro estoque automaticamente", async ({ page }) => {
  await bootWithTemplate(page);
  const r = await page.evaluate(() => {
    const st = App.state;
    const item = st.catalog[0];
    st.productions.push({ id: "l1", date: "2026-07-01", itemId: item.id, qty: 10, unitCost: 1, totalCost: 10, expiry: "2026-12-01" });
    st.sales.push({ id: "s1", date: U.todayStr(), channel: "Balcão", items: [{ itemId: item.id, qty: 4, unitPrice: 5 }], freight: 0, received: true, cogs: 4 });
    const before = Engine.productStock(st, item.id);
    st.sales = st.sales.filter((s) => s.id !== "s1"); // apaga a venda
    const after = Engine.productStock(st, item.id);
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
      st.productions.push({ id: "lote-" + it.id, date: "2026-07-01", itemId: it.id, qty: 50, unitCost: 1, totalCost: 50, expiry: "2026-12-31" });
    App.go("vendas");
  });
  const firstItem = await page.evaluate(() => App.state.catalog[0].id);
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
  // a venda baixou o estoque (50 − 3 = 47 do primeiro item)
  const stock0 = await page.evaluate((id) => Engine.productStock(App.state, id), firstItem);
  expect(stock0).toBe(47);
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

test("imposto: chave desligada ignora o %, ligada desconta", async ({ page }) => {
  await bootWithTemplate(page);
  const r = await page.evaluate(() => {
    const st = App.state;
    st.settings.taxPct = 10;
    const sale = { items: [{ itemId: st.catalog[0].id, qty: 10, unitPrice: 10 }], freight: 0, cogs: 0 };
    st.settings.taxEnabled = false;
    const off = Engine.saleTax(st, sale);
    st.settings.taxEnabled = true;
    const on = Engine.saleTax(st, sale);
    return { off, on };
  });
  expect(r.off).toBeCloseTo(0, 6);   // desligado: nada descontado
  expect(r.on).toBeCloseTo(10, 6);   // ligado: 10% de R$100
  // UI: checkbox mostra/esconde o campo de %
  await page.evaluate(() => App.go("config"));
  await expect(page.locator("#cfg-tax")).toBeVisible(); // taxEnabled=true acima
  await page.uncheck("#cfg-tax-on");
  await expect(page.locator("#cfg-tax")).toBeHidden();
  await page.click("#cfg-save");
  const enabled = await page.evaluate(() => App.state.settings.taxEnabled);
  expect(enabled).toBe(false);
});

test("assinatura vencida: bloqueia registrar venda e leva pra renovar", async ({ page }) => {
  await bootWithTemplate(page);
  await page.evaluate(() => {
    // simula conta na nuvem com assinatura vencida há 3 dias
    Cloud.enabled = () => true;
    Cloud.session = () => ({ user: { id: "t1", email: "cliente@empresa.com" }, access_token: "x" });
    App.subscription = { paidUntil: U.addDays(U.todayStr(), -3) };
    App.go("vendas");
  });
  // banner de cadeado presente
  await expect(page.locator("#view")).toContainText("Assinatura vencida");
  // tentar nova venda NÃO abre o modal — redireciona pra Assinatura
  await page.click("#vd-new");
  await expect(page.locator("#modal-root")).not.toContainText("Nova venda");
  await expect(page.locator("#view h2")).toContainText("Assinatura");

  // ao renovar (dias positivos), volta a permitir vender
  await page.evaluate(() => {
    App.subscription = { paidUntil: U.addDays(U.todayStr(), 30) };
    App.go("vendas");
  });
  await expect(page.locator("#view")).not.toContainText("Assinatura vencida");
  await page.click("#vd-new");
  await expect(page.locator("#modal-root h3").first()).toContainText("Nova venda");
});

test("sem assinatura conhecida (offline/rede) NÃO bloqueia — nunca tranca por engano", async ({ page }) => {
  await bootWithTemplate(page); // modo offline, sem sessão de nuvem
  const locked = await page.evaluate(() => App.subLocked());
  expect(locked).toBe(false);
  await page.evaluate(() => App.go("vendas"));
  await page.click("#vd-new");
  await expect(page.locator("#modal-root h3").first()).toContainText("Nova venda");
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
  await expect(page.locator("#view")).toContainText("R$ 19,97/mês"); // promoção
  await expect(page.locator("#view")).toContainText("R$ 49,90");     // preço antigo riscado
});

test("assinatura sem configuração: instrui o dono do sistema", async ({ page }) => {
  await bootWithTemplate(page);
  // simula instalação sem métodos de pagamento, independente do config.js real
  await page.evaluate(() => {
    ICE_CONFIG.PLAN.paymentLink = "";
    ICE_CONFIG.PLAN.pixKey = "";
    ICE_CONFIG.PLAN.whatsapp = "";
    App.go("assinatura");
  });
  await expect(page.locator("#view")).toContainText("Pagamento ainda não configurado");
});

test("menu integrado: 7 seções, sub-abas aparecem e lembram a última visitada", async ({ page }) => {
  await bootWithTemplate(page);
  // menu principal enxuto
  const count = await page.locator("#menu-desktop [data-nav]").count();
  expect(count).toBe(7);
  // seção Produção abre com sub-abas (Produção + Estoque)
  await page.click('#menu-desktop [data-nav="producao"]');
  await expect(page.locator("#subtabs")).toBeVisible();
  expect(await page.locator("#subtabs [data-sub]").count()).toBe(2);
  // navega pra Estoque pela sub-aba
  await page.click('#subtabs [data-sub="estoque"]');
  await expect(page.locator("#view h2")).toContainText("Estoque");
  // sai pra outra seção e volta → lembra que estava em Estoque
  await page.click('#menu-desktop [data-nav="inicio"]');
  await expect(page.locator("#view h2")).toContainText("Dashboard");
  await page.click('#menu-desktop [data-nav="producao"]');
  await expect(page.locator("#view h2")).toContainText("Estoque");
  // seção de tela única não mostra sub-abas
  await page.click('#menu-desktop [data-nav="assistente"]');
  await expect(page.locator("#subtabs")).toBeHidden();
});

test("assinatura: mostra dias restantes (ativa, vencendo e vencida)", async ({ page }) => {
  await bootWithTemplate(page);
  // simula sessão na nuvem + assinatura paga por mais 12 dias
  await page.evaluate(() => {
    Cloud.session = () => ({ user: { id: "t1", email: "teste@empresa.com" }, access_token: "x" });
    App.subscription = { paidUntil: U.addDays(U.todayStr(), 12) };
    App.go("assinatura");
  });
  await expect(page.locator("#view")).toContainText("ATIVA");
  await expect(page.locator("#view")).toContainText("12 dia(s) restante(s)");
  // vencendo (3 dias) → badge VENCENDO e sugestão no assistente
  const sug = await page.evaluate(() => {
    App.subscription = { paidUntil: U.addDays(U.todayStr(), 3) };
    App.render();
    return Assistant.suggestions(App.state).some((s) => s.icon === "💎");
  });
  await expect(page.locator("#view")).toContainText("VENCENDO");
  expect(sug).toBe(true);
  // vencida
  await page.evaluate(() => {
    App.subscription = { paidUntil: U.addDays(U.todayStr(), -2) };
    App.render();
  });
  await expect(page.locator("#view")).toContainText("VENCIDA");
  await expect(page.locator("#view")).toContainText("Venceu há 2 dia(s)");
});

test("foto de perfil: upload abre editor, corta e aparece na barra lateral", async ({ page }) => {
  await bootWithTemplate(page);
  await page.evaluate(() => App.go("config"));
  // 1x1 png vermelho
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64");
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.click("#cfg-ava-edit"),
  ]);
  await chooser.setFiles({ name: "avatar.png", mimeType: "image/png", buffer: png });
  // editor abre com canvas e zoom
  await expect(page.locator("#imged-cv")).toBeVisible();
  await expect(page.locator("#imged-zoom")).toBeVisible();
  await page.click('[data-a="s"]'); // "Usar imagem"
  const photo = await page.evaluate(() => App.state.settings.profile.photo);
  expect(photo).toMatch(/^data:image/);
  // avatar visível na sidebar
  await expect(page.locator("#profile-side")).toBeVisible();
  await expect(page.locator("#profile-side .ava img")).toBeVisible();
  // nome do perfil salvo junto
  await page.fill("#cfg-pname", "Giohran");
  await page.click("#cfg-save");
  await expect(page.locator("#profile-side .pname")).toHaveText("Giohran");
  // persiste após recarregar
  await page.reload();
  await expect(page.locator("#profile-side .pname")).toHaveText("Giohran");
});

test("sem nuvem configurada: login esconde formulário e oferece offline", async ({ page }) => {
  await page.addInitScript(NO_CLOUD_CONFIG);
  await page.goto("/index.html");
  await expect(page.locator("#login-form")).toBeHidden();
  await expect(page.locator("#login-nocloud")).toBeVisible();
  await expect(page.locator("#btn-offline")).toBeVisible();
});

test("sair da conta: item no menu, confirma e volta pra tela de login", async ({ page }) => {
  await bootWithTemplate(page);
  // item presente na sidebar e na gaveta
  await expect(page.locator("#menu-desktop [data-logout]")).toBeVisible();
  expect(await page.locator("#menu-drawer [data-logout]").count()).toBe(1);
  await page.click("#menu-desktop [data-logout]");
  await expect(page.locator("#modal-root")).toContainText("Sair do modo offline?");
  await page.click('[data-a="yes"]');
  // volta pro login (não reentra sozinho no modo offline)
  await expect(page.locator("#login-screen")).toBeVisible();
  await expect(page.locator("#app")).toBeHidden();
  // e os dados continuam salvos: entrar de novo mantém o negócio
  await page.click("#btn-offline");
  await expect(page.locator("#brand-name")).toHaveText("Gelato Teste");
});

test("com nuvem configurada: mostra email/senha e ESCONDE o modo offline", async ({ page }) => {
  await page.goto("/index.html");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#login-form")).toBeVisible();
  await expect(page.locator("#btn-login")).toBeVisible();
  await expect(page.locator("#btn-signup")).toBeVisible();
  // opção offline não aparece em instalações com nuvem
  await expect(page.locator("#btn-offline")).toBeHidden();
  await expect(page.locator("#login-sep")).toBeHidden();
});
