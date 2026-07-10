/* ICE SISTEMA — estado por tenant + persistência local (ice_*)
   Nada de negócio específico hardcoded: tudo vem de state.settings/catalog/recipes. */
"use strict";

const Store = {
  KEY_PREFIX: "ice_",

  // chave do estado depende do usuário logado (isolamento local entre contas no mesmo aparelho)
  stateKey(uid) { return Store.KEY_PREFIX + "state_" + (uid || "local"); },

  defaultSettings() {
    return {
      businessName: "",
      tagline: "",
      logo: { type: "emoji", value: "❄️" }, // ou {type:"image", value:dataURL}
      accent: "#d4af37", // dourado premium padrão — trocável por tenant
      address: { text: "", cep: "", lat: null, lng: null },
      taxPct: 0,            // imposto/taxa %
      targetMarginPct: 30,  // margem alvo %
      kmCost: 1.0,          // custo por km de frete
      shelfLifeDays: 180,   // validade padrão do produto
      currency: "BRL",
      locale: "pt-BR",
      channels: ["Venda direta", "Balcão", "Delivery", "WhatsApp", "Distribuidor"],
      waTemplates: {
        sumido: "Oi {nome}! Sentimos sua falta por aqui 😊 Temos novidades e promoções — quer dar uma olhada?",
        confirmacao: "Oi {nome}! Seu pedido foi confirmado ✅ Total: {valor}. Qualquer coisa é só chamar!",
        entrega: "Oi {nome}! Sua entrega saiu e está a caminho 🚚❄️",
        cobranca: "Oi {nome}, tudo bem? Passando pra lembrar do valor em aberto de {valor}. Pode acertar quando puder 🙏",
      },
      locationIqKey: "", // geocodificador preciso opcional, por tenant
      profile: { name: "", photo: "" }, // foto de perfil do dono/usuário (dataURL)
      onboarded: false,
    };
  },

  defaultState() {
    return {
      v: 1,
      updatedAt: 0,
      settings: Store.defaultSettings(),
      catalog: [],      // [{id, name, color, archived}]
      insumos: [],      // [{id, name, unit, price, scope:'geral'|'item', itemId?, role:'materia'|'embalagem'|''}]
      purchases: [],    // [{id, insumoId, qty, total, date, adjust}]  adjust=true: só ajusta estoque, sem gasto
      recipes: [],      // [{id, name, note, lines:[{type:'insumo'|'slot', insumoId?, slot?, qtyPerUnit, overrides:{itemId:qty}}], yield:1}]
      productions: [],  // [{id, date, recipeId, itemId, qty, unitCost, totalCost, consumed:[{insumoId,qty,price}], expiry, remaining}]
      sales: [],        // [{id, date, channel, customerId, customerName, items:[{itemId,qty,unitPrice}], freight, received, sellerId, cogs, note}]
      customers: [],    // [{id, name, phone, address, cep, lat, lng, pinManual, createdAt}]
      leads: [],        // [{id, name, phone, source, interest, status, createdAt, closedAt, customerId}]
      deliveries: [],   // [{id, date, name, phone, customerId, address, lat, lng, pinManual, items, freight, freightFree, done, saleId, price}]
      expenses: [],     // [{id, date, desc, amount, kind:'fixa'|'variavel'|'investimento', purchaseId?}]
      goals: { revenue: 0, profit: 0 },
      team: [],         // [{id, name, commissionPct}]
      calendarNotes: [],// [{id, date, text, done}]
    };
  },

  // Template de exemplo do onboarding — 100% editável/apagável depois
  applyExampleTemplate(state) {
    const mk = (name, color) => ({ id: U.uid(), name, color, archived: false });
    const items = [
      mk("Gelo de Coco", "#f5f0e1"), mk("Gelo de Morango", "#e74c3c"),
      mk("Gelo de Maracujá", "#f1c40f"), mk("Gelo de Limão", "#2ecc71"),
      mk("Gelo de Uva", "#9b59b6"),
    ];
    state.catalog = items;
    const insumos = [];
    for (const it of items) {
      insumos.push({ id: U.uid(), name: "Polpa " + it.name.replace(/^Gelo de /, ""), unit: "kg", price: 12, scope: "item", itemId: it.id, role: "materia" });
      insumos.push({ id: U.uid(), name: "Embalagem " + it.name.replace(/^Gelo de /, ""), unit: "un", price: 0.35, scope: "item", itemId: it.id, role: "embalagem" });
    }
    const acucar = { id: U.uid(), name: "Açúcar", unit: "kg", price: 5, scope: "geral", role: "" };
    const agua = { id: U.uid(), name: "Água", unit: "L", price: 0.02, scope: "geral", role: "" };
    insumos.push(acucar, agua);
    state.insumos = insumos;
    state.recipes = [{
      id: U.uid(),
      name: "Padrão",
      note: "Receita de exemplo — edite as doses na tela Receitas.",
      lines: [
        { type: "slot", slot: "materia", qtyPerUnit: 0.05, overrides: {} },   // 50g de polpa por unidade
        { type: "slot", slot: "embalagem", qtyPerUnit: 1, overrides: {} },    // 1 embalagem por unidade
        { type: "insumo", insumoId: acucar.id, qtyPerUnit: 0.02, overrides: {} }, // 20g açúcar
        { type: "insumo", insumoId: agua.id, qtyPerUnit: 0.15, overrides: {} },   // 150ml água
      ],
    }];
    return state;
  },

  /* ---------- persistência local ---------- */
  currentUid: null, // definido pelo cloud/auth; null = modo offline "local"

  load(uid) {
    try {
      const raw = localStorage.getItem(Store.stateKey(uid));
      if (!raw) return null;
      const st = JSON.parse(raw);
      return Store.migrate(st);
    } catch (e) {
      console.error("Store.load", e);
      return null;
    }
  },

  saveLocal(state, uid) {
    try {
      localStorage.setItem(Store.stateKey(uid), JSON.stringify(state));
      return true;
    } catch (e) {
      console.error("Store.saveLocal", e);
      return false;
    }
  },

  // migração defensiva: garante que todas as chaves existem (updates futuros)
  migrate(st) {
    const def = Store.defaultState();
    for (const k in def) if (st[k] == null) st[k] = def[k];
    const ds = Store.defaultSettings();
    for (const k in ds) if (st.settings[k] == null) st.settings[k] = ds[k];
    for (const k in ds.waTemplates) if (!st.settings.waTemplates[k]) st.settings.waTemplates[k] = ds.waTemplates[k];
    return st;
  },

  isEmptyState(st) {
    if (!st) return true;
    return !st.settings.onboarded && !st.catalog.length && !st.sales.length &&
      !st.productions.length && !st.customers.length && !st.insumos.length;
  },
};
