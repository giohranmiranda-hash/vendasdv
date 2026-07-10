/* ICE SISTEMA — CRM: Leads (anúncios) e Clientes.
   Leads: prioridade automática por status, WhatsApp com mensagem por status,
   conversão em cliente + pré-preenche venda, análise por origem. */
"use strict";

const ViewCRM = {
  LEAD_STATUS: ["Novo", "Em conversa", "Quente", "Fechou", "Perdido"],
  statusRank(s) { return { "Quente": 0, "Em conversa": 1, "Novo": 2, "Fechou": 3, "Perdido": 4 }[s] ?? 5; },
  statusBadge(s) {
    const cls = { "Novo": "info", "Em conversa": "accent", "Quente": "warn", "Fechou": "ok", "Perdido": "bad" }[s] || "";
    return `<span class="badge ${cls}">${U.esc(s)}</span>`;
  },
  // mensagem de WhatsApp varia pelo status do lead
  leadMsg(lead) {
    const nome = lead.name.split(" ")[0];
    const interesse = lead.interest ? ` sobre ${lead.interest}` : "";
    switch (lead.status) {
      case "Novo": return `Oi ${nome}! Vi seu interesse${interesse} 😊 Posso te passar os valores e condições?`;
      case "Em conversa": return `Oi ${nome}! Ficou alguma dúvida${interesse}? Estou por aqui pra ajudar!`;
      case "Quente": return `Oi ${nome}! Bora fechar seu pedido${interesse}? Consigo uma condição especial se confirmar hoje 🎉`;
      case "Fechou": return `Oi ${nome}! Obrigado pela confiança 🙏 Qualquer coisa é só chamar!`;
      default: return `Oi ${nome}! Tudo bem? Temos novidades${interesse} — posso te contar?`;
    }
  },

  /* ============ LEADS ============ */
  renderLeads() {
    const v = U.$("#view");
    const st = App.state;
    const leads = U.sortBy(st.leads, (l) => ViewCRM.statusRank(l.status) + "|" + l.createdAt);

    // análise por origem/anúncio
    const bySource = U.groupBy(st.leads, (l) => l.source || "(sem origem)");
    const sourceRows = U.sortBy(Object.keys(bySource).map((src) => {
      const all = bySource[src], closed = all.filter((l) => l.status === "Fechou").length;
      return { src, total: all.length, closed, conv: all.length ? (closed / all.length) * 100 : 0 };
    }), (r) => r.total, true);

    v.innerHTML = `
      <div class="view-head"><h2>🎯 Leads (CRM de anúncios)</h2>
        <button class="btn primary" id="ld-new">＋ Novo lead</button></div>

      ${st.leads.length ? `<div class="card mb"><h3>📊 Análise por origem</h3>
        <div class="tbl-wrap"><table class="tbl">
          <thead><tr><th>Origem/anúncio</th><th class="right">Leads</th><th class="right">Fecharam</th><th class="right">Conversão</th></tr></thead>
          <tbody>${sourceRows.map((r) => `<tr><td>${U.esc(r.src)}</td><td class="right">${r.total}</td>
            <td class="right">${r.closed}</td><td class="right"><b>${U.pct(r.conv, 0)}</b></td></tr>`).join("")}</tbody>
        </table></div></div>` : ""}

      <div class="list" id="ld-list"></div>`;

    U.$("#ld-new").onclick = () => ViewCRM.leadModal(null);

    const list = U.$("#ld-list");
    if (!leads.length) { list.innerHTML = UI.emptyHtml("🎯", "Nenhum lead ainda. Cadastre quem chegou pelos seus anúncios!"); return; }
    list.innerHTML = leads.map((l) => `
      <div class="row-card" style="${l.status === "Perdido" ? "opacity:.55" : ""}">
        <div class="rc-main">
          <div class="rc-title">${U.esc(l.name)} ${ViewCRM.statusBadge(l.status)}</div>
          <div class="rc-sub">${l.source ? "📣 " + U.esc(l.source) + " · " : ""}${l.interest ? "interesse: " + U.esc(l.interest) + " · " : ""}${U.relDate(l.createdAt)}</div>
        </div>
        <div class="rc-actions">
          ${l.phone ? `<button class="btn small wa" data-wa="${l.id}">💬 WhatsApp</button>` : ""}
          ${l.status !== "Fechou" && l.status !== "Perdido" ? `<button class="btn small primary" data-fechar="${l.id}">🎉 Fechou!</button>` : ""}
          <button class="btn small" data-edit="${l.id}">✏️</button>
          <button class="btn small danger" data-del="${l.id}">🗑️</button>
        </div></div>`).join("");

    U.$$("[data-wa]", list).forEach((b) => (b.onclick = () => {
      const l = st.leads.find((x) => x.id === b.dataset.wa);
      window.open(U.waLink(l.phone, ViewCRM.leadMsg(l)), "_blank");
    }));
    U.$$("[data-edit]", list).forEach((b) => (b.onclick = () => ViewCRM.leadModal(b.dataset.edit)));
    U.$$("[data-del]", list).forEach((b) => (b.onclick = () => {
      UI.confirm("Excluir este lead?", () => {
        st.leads = st.leads.filter((x) => x.id !== b.dataset.del);
        App.save();
      }, { danger: true, yes: "Excluir" });
    }));
    // conversão: lead fechado → cliente de verdade (salva telefone) + pré-preenche venda
    U.$$("[data-fechar]", list).forEach((b) => (b.onclick = () => {
      const l = st.leads.find((x) => x.id === b.dataset.fechar);
      l.status = "Fechou";
      l.closedAt = U.todayStr();
      let cust = st.customers.find((c) => c.phone && l.phone && U.phoneDigits(c.phone) === U.phoneDigits(l.phone)) ||
        st.customers.find((c) => c.name.toLowerCase() === l.name.toLowerCase());
      if (!cust) {
        cust = { id: U.uid(), name: l.name, phone: l.phone || "", address: "", cep: "", lat: null, lng: null, createdAt: U.todayStr() };
        st.customers.push(cust);
      } else if (l.phone && !cust.phone) cust.phone = l.phone;
      l.customerId = cust.id;
      App.save({ rerender: false });
      UI.toast(`${l.name} virou cliente! Registre a primeira venda 👇`, "ok");
      ViewVendas.saleModal({ customerId: cust.id, channel: st.settings.channels.includes("WhatsApp") ? "WhatsApp" : st.settings.channels[0] });
    }));
  },

  leadModal(id) {
    const st = App.state;
    const l = id ? st.leads.find((x) => x.id === id) : null;
    const m = UI.modal(`
      <h3>${l ? "Editar" : "Novo"} lead</h3>
      <div class="form-row">
        <div><label>Nome</label><input id="ld-name" value="${U.esc(l ? l.name : "")}" placeholder="Nome do contato"/></div>
        <div><label>WhatsApp</label><input id="ld-phone" inputmode="tel" value="${U.esc(l ? l.phone : "")}" placeholder="(00) 90000-0000"/></div>
      </div>
      <div class="form-row">
        <div><label>Origem/anúncio</label><input id="ld-source" value="${U.esc(l ? l.source : "")}" placeholder="Ex: Instagram promo julho" list="ld-sources"/>
        <datalist id="ld-sources">${[...new Set(st.leads.map((x) => x.source).filter(Boolean))].map((s) => `<option value="${U.esc(s)}">`).join("")}</datalist></div>
        <div><label>Interesse</label><input id="ld-interest" value="${U.esc(l ? l.interest : "")}" placeholder="Ex: 100 un pro evento"/></div>
      </div>
      <label>Status</label>${UI.selectHtml("ld-status", ViewCRM.LEAD_STATUS, l ? l.status : "Novo")}
      <div class="m-actions"><button class="btn" data-a="c">Cancelar</button><button class="btn primary" data-a="s">Salvar</button></div>`);
    U.$('[data-a="c"]', m.el).onclick = m.close;
    U.$('[data-a="s"]', m.el).onclick = () => {
      const name = U.$("#ld-name").value.trim();
      if (!name) return U.$("#ld-name").focus();
      const data = {
        name, phone: U.$("#ld-phone").value.trim(), source: U.$("#ld-source").value.trim(),
        interest: U.$("#ld-interest").value.trim(), status: U.$("#ld-status").value,
      };
      if (l) Object.assign(l, data);
      else st.leads.push({ id: U.uid(), createdAt: U.todayStr(), ...data });
      m.close();
      App.save();
    };
  },

  /* ============ CLIENTES ============ */
  renderClientes() {
    const v = U.$("#view");
    const st = App.state;
    const custs = U.sortBy(st.customers, (c) => c.name.toLowerCase());

    v.innerHTML = `
      <div class="view-head"><h2>👥 Clientes</h2>
        <button class="btn primary" id="ct-new">＋ Novo cliente</button></div>
      <div class="list" id="ct-list"></div>`;

    U.$("#ct-new").onclick = () => ViewCRM.clienteModal(null);

    const list = U.$("#ct-list");
    if (!custs.length) { list.innerHTML = UI.emptyHtml("👥", "Nenhum cliente ainda — eles também são criados automaticamente ao registrar vendas com nome."); return; }
    list.innerHTML = custs.map((c) => {
      const sales = st.sales.filter((s) => s.customerId === c.id);
      const total = U.sum(sales, (s) => Engine.saleGross(s));
      const last = sales.length ? U.sortBy(sales, (s) => s.date, true)[0].date : null;
      // indicador visual de geolocalização
      const geoBadge = c.lat != null ? '<span class="badge ok" title="No mapa">📍 no mapa</span>'
        : (c.address || c.cep) ? '<span class="badge warn" title="Endereço sem coordenada — use Logística pra localizar">📍 sem coordenada</span>'
        : '<span class="badge" title="Sem endereço">sem endereço</span>';
      return `<div class="row-card">
        <div class="rc-main">
          <div class="rc-title">${U.esc(c.name)} ${geoBadge}</div>
          <div class="rc-sub">${c.phone ? "📱 " + U.esc(c.phone) + " · " : ""}${sales.length} compra(s) · ${U.money(total)}${last ? " · última " + U.relDate(last).toLowerCase() : ""}</div>
        </div>
        <div class="rc-actions">
          ${c.phone ? `<button class="btn small wa" data-wa="${c.id}">💬</button>` : ""}
          <button class="btn small primary" data-venda="${c.id}">💰 Venda</button>
          <button class="btn small" data-edit="${c.id}">✏️</button>
          <button class="btn small danger" data-del="${c.id}">🗑️</button>
        </div></div>`;
    }).join("");

    U.$$("[data-wa]", list).forEach((b) => (b.onclick = () => {
      const c = st.customers.find((x) => x.id === b.dataset.wa);
      const msg = U.fillTemplate(st.settings.waTemplates.sumido, { nome: c.name.split(" ")[0] });
      window.open(U.waLink(c.phone, msg), "_blank");
    }));
    U.$$("[data-venda]", list).forEach((b) => (b.onclick = () => ViewVendas.saleModal({ customerId: b.dataset.venda })));
    U.$$("[data-edit]", list).forEach((b) => (b.onclick = () => ViewCRM.clienteModal(b.dataset.edit)));
    U.$$("[data-del]", list).forEach((b) => (b.onclick = () => {
      const c = st.customers.find((x) => x.id === b.dataset.del);
      UI.confirm(`Excluir "${c.name}"? As vendas dele viram vendas avulsas (não são apagadas).`, () => {
        for (const s of st.sales) if (s.customerId === c.id) { s.customerId = null; s.customerName = c.name; }
        st.customers = st.customers.filter((x) => x.id !== c.id);
        App.save();
      }, { danger: true, yes: "Excluir" });
    }));
  },

  clienteModal(id) {
    const st = App.state;
    const c = id ? st.customers.find((x) => x.id === id) : null;
    const m = UI.modal(`
      <h3>${c ? "Editar" : "Novo"} cliente</h3>
      <div class="form-row">
        <div><label>Nome</label><input id="ct-name" value="${U.esc(c ? c.name : "")}"/></div>
        <div><label>WhatsApp</label><input id="ct-phone" inputmode="tel" value="${U.esc(c ? c.phone : "")}" placeholder="(00) 90000-0000"/></div>
      </div>
      <div class="form-row">
        <div><label>CEP</label><input id="ct-cep" value="${U.esc(c ? c.cep : "")}" placeholder="00000-000"/></div>
        <div><label>Endereço</label><input id="ct-addr" value="${U.esc(c ? c.address : "")}" placeholder="Rua, nº, bairro, cidade"/></div>
      </div>
      <div class="muted small mt" id="ct-geo-st">${c && c.lat != null ? "📍 No mapa (" + c.lat.toFixed(4) + ", " + c.lng.toFixed(4) + ")" : "O endereço será localizado no mapa ao salvar."}</div>
      <div class="m-actions"><button class="btn" data-a="c">Cancelar</button><button class="btn primary" data-a="s">Salvar</button></div>`);
    U.$('[data-a="c"]', m.el).onclick = m.close;
    U.$('[data-a="s"]', m.el).onclick = async () => {
      const name = U.$("#ct-name").value.trim();
      if (!name) return U.$("#ct-name").focus();
      const cep = U.$("#ct-cep").value.trim(), addr = U.$("#ct-addr").value.trim();
      let cust = c;
      if (cust) {
        const addrChanged = cust.address !== addr || cust.cep !== cep;
        Object.assign(cust, { name, phone: U.$("#ct-phone").value.trim(), cep, address: addr });
        if (addrChanged) { cust.lat = null; cust.lng = null; cust.pinManual = false; }
      } else {
        cust = { id: U.uid(), name, phone: U.$("#ct-phone").value.trim(), cep, address: addr, lat: null, lng: null, createdAt: U.todayStr() };
        st.customers.push(cust);
      }
      m.close();
      App.save();
      // geocodifica em segundo plano (não trava o salvar)
      if ((addr || cep) && cust.lat == null) {
        const r = await Geo.geocode(addr, cep).catch(() => null);
        if (r) {
          cust.lat = r.lat; cust.lng = r.lng;
          App.save();
          UI.toast("📍 " + name + " localizado no mapa!", "ok");
        } else {
          UI.toast("Não achei o endereço de " + name + " — posicione o pino manualmente na Logística.", "bad");
        }
      }
    };
  },
};
