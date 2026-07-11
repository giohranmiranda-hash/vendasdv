/* ICE SISTEMA — Assistente: sugestões PROATIVAS calculadas localmente (sem
   custo/sem internet), chat local por palavra-chave, e Gemini OPCIONAL
   (chave por tenant, salva SÓ neste aparelho, fallback automático pro local). */
"use strict";

const Assistant = {
  GEMINI_KEY_STORAGE: "ice_device_gemini_key", // nunca vai pro app_state/nuvem

  /* ============ MOTOR DE SUGESTÕES ============ */
  suggestions(st) {
    const out = [];
    const today = U.todayStr();
    const ym = U.monthStr();

    // assinatura vencendo/vencida
    const subDays = Cloud.subDaysLeft(App.subscription);
    if (subDays != null && subDays <= 5) out.push({
      kind: subDays < 0 ? "bad" : "warn", icon: "💎",
      title: subDays < 0 ? "Assinatura vencida" : `Assinatura vence em ${subDays} dia(s)`,
      text: "Renove pra manter seus dados sincronizados na nuvem.",
      action: { label: "Renovar agora", go: "assinatura" },
    });

    // entregas de hoje
    const todayDel = st.deliveries.filter((d) => !d.done && d.date === today);
    if (todayDel.length) out.push({
      kind: "info", icon: "🚚", title: `${todayDel.length} entrega(s) HOJE`,
      text: todayDel.map((d) => d.name).join(", ") + " — confira a rota na Logística.",
      action: { label: "Ver rota", go: "mapa" },
    });

    // contas a receber
    const fiado = Engine.receivables(st);
    if (fiado.length) out.push({
      kind: "warn", icon: "💳", title: `${U.money(U.sum(fiado, (s) => Engine.saleGross(s)))} a receber (fiado)`,
      text: `${fiado.length} venda(s) em aberto. Cobre com 1 clique na tela de Vendas.`,
      action: { label: "Ver fiados", go: "vendas" },
    });

    // validade vencendo/vencida
    const expired = st.productions.filter((p) => (p.remaining || 0) > 0 && Engine.expiryStatus(p.expiry) === "vencido");
    const expiring = st.productions.filter((p) => (p.remaining || 0) > 0 && Engine.expiryStatus(p.expiry) === "vencendo");
    if (expired.length) out.push({
      kind: "bad", icon: "🚨", title: "Lote(s) vencido(s) em estoque",
      text: expired.map((p) => `${UI.itemName(p.itemId)} (${U.num(p.remaining, 0)} un)`).join(", ") + " — dê baixa ou verifique.",
      action: { label: "Ver estoque", go: "estoque" },
    });
    if (expiring.length) out.push({
      kind: "warn", icon: "⏳", title: "Validade chegando (≤14 dias)",
      text: expiring.map((p) => `${UI.itemName(p.itemId)} vence ${U.fmtDateShort(p.expiry)}`).join(", ") + " — priorize a venda.",
      action: { label: "Ver estoque", go: "estoque" },
    });

    // cliente sumido (30+ dias sem comprar, já comprou 2+)
    for (const c of st.customers) {
      const sales = st.sales.filter((s) => s.customerId === c.id);
      if (sales.length < 2) continue;
      const last = U.sortBy(sales, (s) => s.date, true)[0].date;
      const days = U.daysBetween(last, today);
      if (days >= 30) {
        out.push({
          kind: "info", icon: "👋", title: `${c.name} sumiu (${days} dias)`,
          text: "Manda uma mensagem — o custo de reativar é quase zero.",
          action: c.phone ? { label: "💬 WhatsApp", wa: { phone: c.phone, msg: U.fillTemplate(st.settings.waTemplates.sumido, { nome: c.name.split(" ")[0] }) } } : { label: "Ver cliente", go: "clientes" },
        });
        if (out.filter((o) => o.icon === "👋").length >= 3) break;
      }
    }

    // sugestão de produção: vende bem e estoque baixo
    const sales30 = st.sales.filter((s) => U.daysBetween(s.date, today) <= 30);
    const soldQty = {};
    for (const s of sales30) for (const it of s.items || []) soldQty[it.itemId] = (soldQty[it.itemId] || 0) + it.qty;
    for (const it of UI.activeItems()) {
      const sold = soldQty[it.id] || 0, stock = Engine.productStock(st, it.id);
      if (sold >= 10 && stock < sold * 0.3) {
        out.push({
          kind: "ok", icon: "🏭", title: `Produzir ${it.name}`,
          text: `Vendeu ${U.num(sold, 0)} un em 30 dias e só tem ${U.num(stock, 0)} em estoque.`,
          action: { label: "Registrar produção", go: "producao" },
        });
      }
    }

    // produto parado (tem estoque, não vende há 30 dias)
    for (const it of UI.activeItems()) {
      const stock = Engine.productStock(st, it.id);
      if (stock >= 10 && !(soldQty[it.id] > 0)) out.push({
        kind: "warn", icon: "🧊", title: `${it.name} parado`,
        text: `${U.num(stock, 0)} un em estoque e nenhuma venda em 30 dias — que tal uma promoção?`,
      });
    }

    // canal de marketing forte
    const ch = Engine.channelBreakdown(st, ym);
    if (ch.length >= 2 && ch[0].pct >= 50) out.push({
      kind: "ok", icon: "📣", title: `${ch[0].channel} domina (${U.pct(ch[0].pct, 0)})`,
      text: `É seu canal mais forte no mês — vale investir mais nele.`,
    });

    // resultado do mês
    const ms = Engine.monthSummary(st, ym);
    if (ms.count > 0) out.push({
      kind: ms.profit >= 0 ? "ok" : "bad", icon: ms.profit >= 0 ? "🎉" : "📉",
      title: `Mês atual: ${U.money(ms.profit)} de lucro`,
      text: `Faturamento ${U.money(ms.revenue)} · margem ${U.pct(ms.margin)}${Number(st.goals.profit) > 0 ? " · meta de lucro " + U.pct((ms.profit / st.goals.profit) * 100, 0) : ""}.`,
    });

    // sem vendas hoje
    if (!st.sales.some((s) => s.date === today) && st.sales.length) out.push({
      kind: "info", icon: "🕐", title: "Sem vendas hoje ainda",
      text: "Que tal ativar os leads quentes ou mandar oferta pros clientes de sempre?",
      action: { label: "Ver leads", go: "leads" },
    });

    return out;
  },

  sugCardHtml(sg) {
    return `<div class="row-card sug-card ${sg.kind}">
      <div style="font-size:1.4rem">${sg.icon}</div>
      <div class="rc-main"><div class="rc-title">${U.esc(sg.title)}</div><div class="rc-sub">${U.esc(sg.text)}</div></div>
      ${sg.action ? `<button class="btn small ${sg.action.wa ? "wa" : "primary"}" data-sug-act='${U.esc(JSON.stringify(sg.action))}'>${U.esc(sg.action.label)}</button>` : ""}
    </div>`;
  },
  bindSugActions(root) {
    if (!root) return;
    U.$$("[data-sug-act]", root).forEach((b) => (b.onclick = () => {
      const a = JSON.parse(b.dataset.sugAct);
      if (a.go) App.go(a.go);
      else if (a.wa) window.open(U.waLink(a.wa.phone, a.wa.msg), "_blank");
    }));
  },

  /* ============ CHAT LOCAL (palavra-chave) ============ */
  localAnswer(q) {
    const st = App.state;
    const ym = U.monthStr();
    const ms = Engine.monthSummary(st, ym);
    const t = q.toLowerCase();

    if (/lucro|resultado|ganho|ganhei/.test(t))
      return `No mês atual (${U.monthLabel(ym)}): lucro líquido de ${U.money(ms.profit)} — faturamento ${U.money(ms.revenue)}, imposto ${U.money(ms.tax)}, CPV ${U.money(ms.cogs)}. Margem: ${U.pct(ms.margin)}.`;
    if (/fatur|vend.*quanto|quanto.*vend|receita/.test(t))
      return `Faturamento de ${U.monthLabel(ym)}: ${U.money(ms.revenue)} em ${ms.count} venda(s). Ticket médio: ${U.money(ms.ticket)}.`;
    if (/campe|mais vend|top|melhor produto/.test(t)) {
      const perItem = {};
      for (const s of ms.sales) for (const i of s.items || []) perItem[i.itemId] = (perItem[i.itemId] || 0) + i.qty;
      const top = U.sortBy(Object.keys(perItem).map((id) => ({ id, q: perItem[id] })), (x) => x.q, true)[0];
      return top ? `Campeão do mês: ${UI.itemName(top.id)} com ${U.num(top.q, 0)} un vendidas 🏆` : "Ainda não teve vendas este mês.";
    }
    if (/estoque/.test(t)) {
      const linhas = UI.activeItems().map((it) => `• ${it.name}: ${U.num(Engine.productStock(st, it.id), 0)} un`).join("\n");
      return `Estoque atual (valor FIFO ${U.money(Engine.stockValue(st))}):\n${linhas || "vazio"}`;
    }
    if (/custo|cpv/.test(t)) {
      const linhas = UI.activeItems()
        .map((it) => ({ it, c: Engine.estimatedUnitCost(st, it.id) }))
        .filter((x) => x.c > 0).slice(0, 8)
        .map((x) => `• ${x.it.name}: ${U.money(x.c)}/un`).join("\n");
      return linhas ? `Custo por unidade (da sua última produção de cada item):\n${linhas}`
        : "Registre uma produção informando quanto gastou (🏭 Produção) que eu te digo o custo por unidade de cada produto.";
    }
    if (/receber|fiado|dívida|devendo/.test(t)) {
      const f = Engine.receivables(st);
      return f.length ? `Tem ${U.money(U.sum(f, (s) => Engine.saleGross(s)))} a receber em ${f.length} venda(s) fiado. Cobre na tela 💰 Vendas.` : "Nenhuma conta a receber — tudo em dia ✅";
    }
    if (/cliente/.test(t)) {
      return `Você tem ${st.customers.length} cliente(s). ${st.leads.filter((l) => l.status === "Quente").length} lead(s) quente(s) esperando fechamento 🔥`;
    }
    if (/produ[çc]/.test(t)) {
      const prods30 = st.productions.filter((p) => U.daysBetween(p.date, U.todayStr()) <= 30);
      const unids = U.sum(prods30, (p) => Number(p.qty) || 0);
      return prods30.length
        ? `Nos últimos 30 dias você produziu ${U.num(unids, 0)} un em ${prods30.length} lote(s), gastando ${U.money(U.sum(prods30, (p) => p.totalCost || 0))}. Estoque atual: ${U.num(U.sum(UI.activeItems(), (i) => Engine.productStock(st, i.id)), 0)} un.`
        : "Nenhuma produção nos últimos 30 dias — registre em 🏭 Produção (quantidade + quanto gastou).";
    }
    if (/entrega|rota/.test(t)) {
      const hoje = st.deliveries.filter((d) => !d.done && d.date === U.todayStr());
      return hoje.length ? `Hoje tem ${hoje.length} entrega(s): ${hoje.map((d) => d.name).join(", ")}. Rota otimizada na 🗺️ Logística.` : "Nenhuma entrega pra hoje.";
    }
    return "Posso responder sobre: lucro, faturamento, campeão de vendas, estoque, custos, contas a receber, clientes, produção e entregas. Pergunta de novo com uma dessas palavras? 😉\n\nDica: com uma chave Gemini (grátis) eu respondo qualquer pergunta — configure no topo desta tela.";
  },

  /* ============ GEMINI OPCIONAL ============ */
  geminiKey() { return localStorage.getItem(Assistant.GEMINI_KEY_STORAGE) || ""; },

  async askGemini(q) {
    const key = Assistant.geminiKey();
    if (!key) return null;
    const st = App.state;
    const ym = U.monthStr();
    const ms = Engine.monthSummary(st, ym);
    const resumo = {
      negocio: st.settings.businessName,
      mesAtual: { faturamento: ms.revenue, lucro: ms.profit, margemPct: ms.margin, vendas: ms.count },
      estoque: UI.activeItems().map((it) => ({ item: it.name, un: Engine.productStock(st, it.id) })),
      aReceber: U.sum(Engine.receivables(st), (s) => Engine.saleGross(s)),
      clientes: st.customers.length,
      leadsQuentes: st.leads.filter((l) => l.status === "Quente").length,
    };
    const body = {
      contents: [{ parts: [{ text: `Você é o assistente do "${st.settings.businessName}", um negócio de produtos gelados que usa o Ice Sistema. Dados atuais (JSON): ${JSON.stringify(resumo)}. Responda em português do Brasil, direto e prático, no máximo 6 frases. Pergunta: ${q}` }] }],
      generationConfig: { maxOutputTokens: 512, thinkingConfig: { thinkingBudget: 0 } }, // sem "modo pensar": evita resposta cortada
    };
    // modelo mais atual com plano grátis na data da build
    const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(key);
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error("Gemini " + res.status);
    const j = await res.json();
    const txt = j.candidates && j.candidates[0] && j.candidates[0].content &&
      j.candidates[0].content.parts && j.candidates[0].content.parts.map((p) => p.text || "").join("");
    if (!txt) throw new Error("resposta vazia");
    return txt;
  },

  /* ============ TELA ============ */
  chatLog: [],

  render() {
    const v = U.$("#view");
    const st = App.state;
    const sugs = Assistant.suggestions(st);
    const hasKey = !!Assistant.geminiKey();

    v.innerHTML = `
      <div class="view-head"><h2>🤖 Assistente</h2>
        <button class="btn small" id="as-key">${hasKey ? "🔑 Chave Gemini ativa" : "🔑 Conectar IA (Gemini, grátis)"}</button></div>

      <div class="card mb">
        <h3>💡 Sugestões de agora</h3>
        <div class="list" id="as-sugs">${sugs.length ? sugs.map((s) => Assistant.sugCardHtml(s)).join("") : '<div class="muted">Tudo em dia ✅ Registre vendas e produções pra eu ter o que analisar.'}</div>
      </div>

      <div class="card">
        <h3>💬 Pergunte sobre o seu negócio</h3>
        <div class="chat-box" id="as-chat">${Assistant.chatLog.map((c) => `<div class="chat-msg ${c.role}">${U.esc(c.text)}</div>`).join("") || '<div class="muted small">Ex: "qual meu lucro?", "campeão de vendas?", "como tá o estoque?"</div>'}</div>
        <div class="flex mt" style="flex-wrap:nowrap">
          <input id="as-q" placeholder="Digite sua pergunta…" style="flex:1"/>
          <button class="btn primary" id="as-send">Enviar</button>
        </div>
        <div class="muted small mt">${hasKey ? "IA Gemini ativa neste aparelho — cai pro modo local se falhar/offline." : "Modo local (grátis, offline). Conecte uma chave Gemini pra respostas mais inteligentes."}</div>
      </div>`;

    Assistant.bindSugActions(U.$("#as-sugs"));

    U.$("#as-key").onclick = () => {
      const m = UI.modal(`
        <h3>🔑 Conectar Gemini (opcional)</h3>
        <div class="muted small mb">1. Acesse <b>aistudio.google.com/apikey</b> e crie uma chave grátis.<br/>
        2. Cole abaixo. A chave fica salva <b>só neste aparelho</b> — nunca sincroniza nem vai pro código.<br/>
        3. Sem chave (ou offline) o assistente local continua funcionando normalmente.</div>
        <label>Chave da API</label><input id="gk" value="${U.esc(Assistant.geminiKey())}" placeholder="AIza..."/>
        <div class="m-actions">
          <button class="btn danger" data-a="rm">Remover</button>
          <button class="btn" data-a="c">Cancelar</button>
          <button class="btn primary" data-a="s">Salvar</button>
        </div>`);
      U.$('[data-a="c"]', m.el).onclick = m.close;
      U.$('[data-a="rm"]', m.el).onclick = () => { localStorage.removeItem(Assistant.GEMINI_KEY_STORAGE); m.close(); App.render(); };
      U.$('[data-a="s"]', m.el).onclick = () => {
        const k = U.$("#gk").value.trim();
        if (k) localStorage.setItem(Assistant.GEMINI_KEY_STORAGE, k);
        m.close(); App.render();
        UI.toast(k ? "Chave salva neste aparelho 🔑" : "Chave removida", "ok");
      };
    };

    const send = async () => {
      const q = U.$("#as-q").value.trim();
      if (!q) return;
      U.$("#as-q").value = "";
      Assistant.chatLog.push({ role: "user", text: q });
      const box = U.$("#as-chat");
      box.innerHTML += `<div class="chat-msg user">${U.esc(q)}</div><div class="chat-msg bot" id="as-typing">…</div>`;
      box.scrollTop = box.scrollHeight;
      let ans = null;
      if (Assistant.geminiKey() && navigator.onLine) {
        try { ans = await Assistant.askGemini(q); }
        catch (e) { console.warn("Gemini falhou, usando local", e); }
      }
      if (!ans) ans = Assistant.localAnswer(q); // fallback automático
      Assistant.chatLog.push({ role: "bot", text: ans });
      const typing = U.$("#as-typing");
      if (typing) { typing.textContent = ans; typing.id = ""; }
      box.scrollTop = box.scrollHeight;
    };
    U.$("#as-send").onclick = send;
    U.$("#as-q").addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
  },
};

const ViewAssistente = Assistant;
