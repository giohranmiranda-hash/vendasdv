/* ICE SISTEMA — Logística: mapa Leaflet (tiles OSM claros), pino da fábrica
   arrastável, entregas/clientes arrastáveis (salva posição corrigida),
   geocodificação em cascata (geo.js), rota por vizinho mais próximo.
   Cuidados aprendidos: invalidateSize() ANTES de fitBounds com retentativas;
   pinos muito longe da região são ignorados no enquadramento. */
"use strict";

const ViewMapa = {
  map: null,
  markers: [],

  render() {
    const v = U.$("#view");
    const st = App.state;
    const dels = ViewMapa.sortedDeliveries();
    const pending = dels.filter((d) => !d.done);

    // pinos fora da região esperada (>~300km do depósito)
    const farPins = [];
    for (const d of pending) if (d.lat != null && Geo.isFarFromRegion(d.lat, d.lng)) farPins.push({ type: "entrega", obj: d });
    for (const c of st.customers) if (c.lat != null && Geo.isFarFromRegion(c.lat, c.lng)) farPins.push({ type: "cliente", obj: c });

    v.innerHTML = `
      <div class="view-head"><h2>🗺️ Logística</h2>
        <div class="flex">
          <button class="btn small" id="mp-center">🎯 Recentralizar</button>
          <button class="btn small" id="mp-route">🧭 Otimizar rota</button>
          <button class="btn primary" id="mp-new">＋ Nova entrega</button>
        </div></div>

      ${st.settings.address.lat == null ? `<div class="banner info">📍 Defina o endereço da fábrica/depósito em ⚙️ Configurações (ou arraste o pino dourado) — ele centra o mapa e a otimização de rota.</div>` : ""}
      ${farPins.length ? `<div class="banner warn">⚠️ <div><b>${farPins.length} pino(s) muito longe da sua região</b> (provável erro de geocodificação): ${farPins.map((f) => U.esc(f.obj.name)).join(", ")}. <button class="btn small" id="mp-fixfar">Trazer pra perto do depósito</button> e arraste pro lugar certo.</div></div>` : ""}

      <div id="map-canvas"></div>
      <div id="mp-route-info" class="mt"></div>

      <h3 class="mt">Entregas</h3>
      <div class="muted small mb">Hoje e futuras primeiro; concluídas somem do mapa mas ficam na lista.</div>
      <div class="list" id="mp-list"></div>`;

    U.$("#mp-new").onclick = () => ViewMapa.deliveryModal(null);
    U.$("#mp-center").onclick = () => ViewMapa.fitMap(true);
    U.$("#mp-route").onclick = () => ViewMapa.showRoute();
    if (U.$("#mp-fixfar")) U.$("#mp-fixfar").onclick = () => {
      for (const f of farPins) {
        const p = Geo.fallbackNearDepot();
        f.obj.lat = p.lat; f.obj.lng = p.lng; f.obj.pinManual = false;
      }
      App.save();
      UI.toast("Pinos trazidos pra perto do depósito — arraste cada um pro lugar certo.", "ok");
    };

    ViewMapa.renderList();
    ViewMapa.initMap();
  },

  sortedDeliveries() {
    const today = U.todayStr();
    // hoje/futuras primeiro (mais próximas antes), passadas no fim
    return App.state.deliveries.slice().sort((a, b) => {
      const fa = a.date >= today ? 0 : 1, fb = b.date >= today ? 0 : 1;
      if (fa !== fb) return fa - fb;
      return fa === 0 ? (a.date < b.date ? -1 : 1) : (a.date > b.date ? -1 : 1);
    });
  },

  /* ---------- mapa ---------- */
  initMap() {
    const st = App.state;
    if (ViewMapa.map) { try { ViewMapa.map.remove(); } catch (e) {} ViewMapa.map = null; }
    const anc = Geo.anchor();
    const map = L.map("map-canvas", { zoomControl: true }).setView([anc.lat, anc.lng], anc.weak ? 4 : 12);
    // tiles claros com ruas legíveis (nunca tema escuro aqui);
    // se o OSM falhar (bloqueio/lentidão), troca sozinho pro CARTO
    const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    let tileErrors = 0;
    osm.on("tileerror", () => {
      tileErrors++;
      if (tileErrors >= 3 && !ViewMapa._tilesFallback) {
        ViewMapa._tilesFallback = true;
        try { map.removeLayer(osm); } catch (e) {}
        L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
          maxZoom: 19, subdomains: "abcd",
          attribution: '&copy; OpenStreetMap &copy; CARTO',
        }).addTo(map);
        console.warn("tiles OSM falharam — usando CARTO");
      }
    });
    ViewMapa.map = map;
    ViewMapa.markers = [];

    const iconHtml = (emoji, color) =>
      L.divIcon({
        className: "",
        html: `<div style="background:${color};border:2px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);width:34px;height:34px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.4)"><span style="transform:rotate(45deg);font-size:16px">${emoji}</span></div>`,
        iconSize: [34, 34], iconAnchor: [17, 30], popupAnchor: [0, -28],
      });

    // pino da fábrica (arrastável — salva a posição corrigida)
    const dep = L.marker([anc.lat, anc.lng], { draggable: true, icon: iconHtml("🏠", "#d4af37"), zIndexOffset: 1000 })
      .addTo(map).bindPopup("<b>Fábrica/Depósito</b><br>Arraste pra corrigir a posição.");
    dep.on("dragend", () => {
      const p = dep.getLatLng();
      st.settings.address.lat = p.lat; st.settings.address.lng = p.lng;
      App.save({ rerender: false });
      UI.toast("Posição da fábrica salva 📍", "ok");
    });

    // entregas pendentes (concluídas somem do mapa)
    for (const d of App.state.deliveries.filter((x) => !x.done)) {
      if (d.lat == null) continue;
      const mk = L.marker([d.lat, d.lng], { draggable: true, icon: iconHtml("🚚", "#3498db") })
        .addTo(map).bindPopup(`<b>${U.esc(d.name)}</b><br>${U.esc(U.relDate(d.date))} · ${U.esc(UI.itemsSummary(d.items))}`);
      mk.on("dragend", () => {
        const p = mk.getLatLng();
        d.lat = p.lat; d.lng = p.lng; d.pinManual = true;
        App.save({ rerender: false });
        UI.toast("Posição da entrega salva 📍", "ok");
      });
      ViewMapa.markers.push({ lat: d.lat, lng: d.lng });
    }

    // clientes com coordenada
    for (const c of st.customers) {
      if (c.lat == null) continue;
      const mk = L.marker([c.lat, c.lng], { draggable: true, icon: iconHtml("👤", "#8e44ad"), opacity: 0.85 })
        .addTo(map).bindPopup(`<b>${U.esc(c.name)}</b>${c.phone ? "<br>📱 " + U.esc(c.phone) : ""}${c.address ? "<br>" + U.esc(c.address) : ""}`);
      mk.on("dragend", () => {
        const p = mk.getLatLng();
        c.lat = p.lat; c.lng = p.lng; c.pinManual = true;
        App.save({ rerender: false });
        UI.toast("Posição de " + c.name + " salva 📍", "ok");
      });
      ViewMapa.markers.push({ lat: c.lat, lng: c.lng });
    }

    ViewMapa.fitMap();
  },

  // invalidateSize ANTES de fitBounds, com retentativas (senão zoom mundo/cinza)
  fitMap(force) {
    const map = ViewMapa.map;
    if (!map) return;
    const anc = Geo.anchor();
    // ignora pinos fora da região no enquadramento (1 endereço ruim não pode
    // forçar o zoom pro mundo todo)
    const pts = ViewMapa.markers.filter((p) => !Geo.isFarFromRegion(p.lat, p.lng));
    if (!anc.weak) pts.push({ lat: anc.lat, lng: anc.lng });
    const doFit = () => {
      map.invalidateSize();
      if (pts.length >= 2) map.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 15 });
      else if (pts.length === 1) map.setView([pts[0].lat, pts[0].lng], 13);
    };
    [60, 250, 600].forEach((ms) => setTimeout(doFit, ms));
    if (force) doFit();
  },

  /* ---------- rota (vizinho mais próximo a partir do depósito) ---------- */
  showRoute() {
    const st = App.state;
    const anc = Geo.anchor();
    if (anc.weak) return UI.toast("Defina o endereço da fábrica primeiro (⚙️ Configurações).", "bad");
    const today = U.todayStr();
    const stops = st.deliveries.filter((d) => !d.done && d.lat != null && d.date <= today);
    const pool = stops.length ? stops : st.deliveries.filter((d) => !d.done && d.lat != null);
    if (!pool.length) return UI.toast("Nenhuma entrega pendente com pino no mapa.", "bad");

    let cur = { lat: anc.lat, lng: anc.lng };
    const left = pool.slice(), order = [];
    let totalKm = 0;
    while (left.length) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < left.length; i++) {
        const d = U.distKm(cur.lat, cur.lng, left[i].lat, left[i].lng);
        if (d < bd) { bd = d; bi = i; }
      }
      const next = left.splice(bi, 1)[0];
      totalKm += bd;
      order.push({ d: next, km: bd });
      cur = next;
    }

    // desenha a polyline
    const pathPts = [[anc.lat, anc.lng]].concat(order.map((o) => [o.d.lat, o.d.lng]));
    if (ViewMapa._routeLine) { try { ViewMapa.map.removeLayer(ViewMapa._routeLine); } catch (e) {} }
    ViewMapa._routeLine = L.polyline(pathPts, { color: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#d4af37", weight: 4, dashArray: "8 6", opacity: 0.9 }).addTo(ViewMapa.map);
    ViewMapa.map.fitBounds(ViewMapa._routeLine.getBounds(), { padding: [40, 40] });

    const kmCost = Number(st.settings.kmCost) || 0;
    U.$("#mp-route-info").innerHTML = `<div class="card">
      <h3>🧭 Rota sugerida (${order.length} parada(s) · ${U.num(totalKm, 1)} km · custo ≈ ${U.money(totalKm * kmCost)})</h3>
      <ol style="margin:6px 0 0 20px;padding:0">${order.map((o) => `<li>${U.esc(o.d.name)} <span class="muted small">(${U.num(o.km, 1)} km)</span></li>`).join("")}</ol>
    </div>`;
  },

  /* ---------- lista de entregas ---------- */
  renderList() {
    const st = App.state;
    const list = U.$("#mp-list");
    const dels = ViewMapa.sortedDeliveries();
    if (!dels.length) { list.innerHTML = UI.emptyHtml("🚚", "Nenhuma entrega — registre a primeira!"); return; }
    list.innerHTML = dels.map((d) => {
      const totalItems = U.sum(d.items || [], (i) => i.qty * i.unitPrice);
      const freight = d.freightFree ? 0 : Number(d.freight) || 0;
      const pinBadge = d.lat == null ? '<span class="badge bad">sem pino</span>' :
        d.pinManual ? '<span class="badge ok">pino ajustado</span>' :
        d.geoFallback ? '<span class="badge warn">pino aproximado — arraste!</span>' : '<span class="badge ok">📍 no mapa</span>';
      return `<div class="row-card" style="${d.done ? "opacity:.55" : ""}">
        <div class="rc-main">
          <div class="rc-title">${d.done ? "✅ " : ""}${U.esc(d.name)} <span class="badge accent">${U.esc(U.relDate(d.date))}</span> <span class="muted small">${U.fmtDate(d.date)}</span> ${d.done ? "" : pinBadge}</div>
          <div class="rc-sub">${U.esc(UI.itemsSummary(d.items) || "—")} · ${d.freightFree ? "frete grátis" : "frete " + U.money(freight)} · total ${U.money(totalItems + freight)}</div>
          ${d.address ? `<div class="rc-sub">📍 ${U.esc(d.address)}</div>` : ""}
        </div>
        <div class="rc-actions">
          ${d.phone ? `<button class="btn small wa" data-wa="${d.id}">💬</button>` : ""}
          ${!d.done ? `<button class="btn small primary" data-done="${d.id}">✅ Concluir</button>` : ""}
          <button class="btn small" data-edit="${d.id}">✏️</button>
          <button class="btn small danger" data-del="${d.id}">🗑️</button>
        </div></div>`;
    }).join("");

    U.$$("[data-wa]", list).forEach((b) => (b.onclick = () => {
      const d = st.deliveries.find((x) => x.id === b.dataset.wa);
      const msg = U.fillTemplate(st.settings.waTemplates.entrega, { nome: d.name.split(" ")[0] });
      window.open(U.waLink(d.phone, msg), "_blank");
    }));
    U.$$("[data-done]", list).forEach((b) => (b.onclick = () => ViewMapa.concludeDelivery(b.dataset.done)));
    U.$$("[data-edit]", list).forEach((b) => (b.onclick = () => ViewMapa.deliveryModal(b.dataset.edit)));
    U.$$("[data-del]", list).forEach((b) => (b.onclick = () => {
      UI.confirm("Excluir esta entrega?", () => {
        st.deliveries = st.deliveries.filter((x) => x.id !== b.dataset.del);
        App.save();
      }, { danger: true, yes: "Excluir" });
    }));
  },

  concludeDelivery(id) {
    const st = App.state;
    const d = st.deliveries.find((x) => x.id === id);
    const hasItems = (d.items || []).some((i) => i.qty > 0 && i.unitPrice > 0);
    const doIt = (registerSale) => {
      d.done = true;
      if (registerSale && !d.saleId) {
        let cogs = 0; const fifo = [];
        for (const it of d.items) {
          const r = Engine.consumeFIFO(st, it.itemId, it.qty);
          cogs += r.cogs; fifo.push(...r.taken);
        }
        const sale = {
          id: U.uid(), date: U.todayStr(),
          channel: st.settings.channels.includes("Delivery") ? "Delivery" : st.settings.channels[0],
          customerId: d.customerId || null, customerName: d.customerId ? "" : d.name,
          items: d.items.slice(), freight: d.freightFree ? 0 : Number(d.freight) || 0,
          received: true, cogs, fifo,
        };
        st.sales.push(sale);
        d.saleId = sale.id;
      }
      App.save();
      UI.toast("Entrega concluída ✅" + (registerSale && d.saleId ? " Venda registrada 💰" : ""), "ok");
    };
    if (hasItems && !d.saleId) {
      const m = UI.modal(`
        <h3>✅ Concluir entrega — ${U.esc(d.name)}</h3>
        <p class="muted small">Registrar também a venda (itens + frete) pra entrar no faturamento?</p>
        <div class="m-actions">
          <button class="btn" data-a="c">Cancelar</button>
          <button class="btn" data-a="semvenda">Concluir sem venda</button>
          <button class="btn primary" data-a="comvenda">Concluir + registrar venda</button>
        </div>`);
      U.$('[data-a="c"]', m.el).onclick = m.close;
      U.$('[data-a="semvenda"]', m.el).onclick = () => { m.close(); doIt(false); };
      U.$('[data-a="comvenda"]', m.el).onclick = () => { m.close(); doIt(true); };
    } else doIt(false);
  },

  /* ---------- criar/editar entrega ---------- */
  deliveryModal(id) {
    if (!id && !App.guardPaid("registrar entregas")) return;
    const st = App.state;
    const d = id ? st.deliveries.find((x) => x.id === id) : null;
    const items = UI.activeItems();
    const lines = d && d.items && d.items.length ? d.items.map((i) => ({ ...i })) : [{ itemId: items[0] ? items[0].id : "", qty: "", unitPrice: "" }];
    const custOptions = [{ value: "", label: "— digitar nome —" }].concat(st.customers.map((c) => ({ value: c.id, label: c.name })));

    const m = UI.modal(`
      <h3>${d ? "Editar" : "Nova"} entrega 🚚</h3>
      <div class="form-row">
        <div><label>Data</label><input type="date" id="dl-date" value="${d ? d.date : U.todayStr()}"/></div>
        <div><label>Cliente</label>${UI.selectHtml("dl-cust", custOptions, d ? d.customerId || "" : "")}</div>
      </div>
      <div class="form-row">
        <div id="dl-name-wrap" style="${d && d.customerId ? "display:none" : ""}"><label>Nome</label><input id="dl-name" value="${U.esc(d && !d.customerId ? d.name : "")}"/></div>
        <div><label>WhatsApp</label><input id="dl-phone" inputmode="tel" value="${U.esc(d ? d.phone : "")}"/></div>
      </div>
      <div class="form-row">
        <div><label>CEP</label><input id="dl-cep" value="${U.esc(d ? d.cep || "" : "")}" placeholder="00000-000"/></div>
        <div><label>Endereço</label><input id="dl-addr" value="${U.esc(d ? d.address : "")}"/></div>
      </div>
      <h3 class="mt">Itens/sabores</h3>
      <div id="dl-lines"></div>
      <button class="btn small mt" id="dl-addline">＋ Adicionar item</button>
      <div class="form-row mt">
        <div><label>Frete cobrado</label><input id="dl-freight" inputmode="decimal" value="${d ? d.freight || "" : ""}"/></div>
        <div><label class="flex" style="margin-top:28px"><input type="checkbox" id="dl-free" ${d && d.freightFree ? "checked" : ""} style="width:auto"/> Frete grátis</label></div>
      </div>
      <div class="m-actions"><button class="btn" data-a="c">Cancelar</button><button class="btn primary" data-a="s">Salvar entrega</button></div>`);

    const renderLines = () => {
      U.$("#dl-lines", m.el).innerHTML = lines.map((l, i) => `
        <div class="form-row3 mb" data-line="${i}">
          <select data-lf="itemId">${items.map((it) => `<option value="${it.id}" ${it.id === l.itemId ? "selected" : ""}>${U.esc(it.name)}</option>`).join("")}</select>
          <input data-lf="qty" inputmode="decimal" placeholder="Qtd" value="${l.qty}"/>
          <div class="flex" style="flex-wrap:nowrap"><input data-lf="unitPrice" inputmode="decimal" placeholder="Preço/un" value="${l.unitPrice}"/>
          ${lines.length > 1 ? `<button class="btn small danger" data-ldel="${i}">✕</button>` : ""}</div>
        </div>`).join("");
      U.$$("[data-line]", m.el).forEach((row) => {
        const i = Number(row.dataset.line);
        U.$$("[data-lf]", row).forEach((f) => f.addEventListener("input", () => { lines[i][f.dataset.lf] = f.value; }));
      });
      U.$$("[data-ldel]", m.el).forEach((b) => (b.onclick = () => { lines.splice(Number(b.dataset.ldel), 1); renderLines(); }));
    };
    renderLines();
    U.$("#dl-addline", m.el).onclick = () => { lines.push({ itemId: items[0] ? items[0].id : "", qty: "", unitPrice: "" }); renderLines(); };
    U.$("#dl-cust", m.el).onchange = (e) => {
      const c = st.customers.find((x) => x.id === e.target.value);
      U.$("#dl-name-wrap", m.el).style.display = e.target.value ? "none" : "block";
      if (c) {
        if (c.phone) U.$("#dl-phone", m.el).value = c.phone;
        if (c.address) U.$("#dl-addr", m.el).value = c.address;
        if (c.cep) U.$("#dl-cep", m.el).value = c.cep;
      }
    };

    U.$('[data-a="c"]', m.el).onclick = m.close;
    U.$('[data-a="s"]', m.el).onclick = async () => {
      const custId = U.$("#dl-cust").value || null;
      const cust = custId ? st.customers.find((c) => c.id === custId) : null;
      const name = cust ? cust.name : U.$("#dl-name").value.trim();
      if (!name) return U.$("#dl-name").focus();
      const addr = U.$("#dl-addr").value.trim(), cep = U.$("#dl-cep").value.trim();
      const data = {
        date: U.$("#dl-date").value || U.todayStr(),
        customerId: custId, name,
        phone: U.$("#dl-phone").value.trim(),
        cep, address: addr,
        items: lines.map((l) => ({ itemId: l.itemId, qty: U.parseNum(l.qty), unitPrice: U.parseNum(l.unitPrice) })).filter((l) => l.qty > 0),
        freight: U.parseNum(U.$("#dl-freight").value),
        freightFree: U.$("#dl-free").checked,
      };
      let del = d;
      const addrChanged = d && (d.address !== addr || (d.cep || "") !== cep);
      if (del) Object.assign(del, data);
      else { del = { id: U.uid(), done: false, lat: null, lng: null, ...data }; st.deliveries.push(del); }
      m.close();
      App.save();

      // geocodifica se precisar (novo, endereço mudou, ou ainda sem pino manual)
      if ((!d || addrChanged || del.lat == null) && !del.pinManual) {
        let r = null;
        if (cust && cust.lat != null && !addrChanged && !addr) r = { lat: cust.lat, lng: cust.lng, precise: true };
        else if (addr || cep) r = await Geo.geocode(addr, cep).catch(() => null);
        if (r) {
          del.lat = r.lat; del.lng = r.lng; del.geoFallback = false;
          UI.toast("📍 Entrega localizada no mapa!", "ok");
        } else {
          // NUNCA deixa sem pino: cria perto do depósito com aviso
          const p = Geo.fallbackNearDepot();
          del.lat = p.lat; del.lng = p.lng; del.geoFallback = true;
          UI.toast("Não achei o endereço — criei o pino perto do depósito, arraste pro lugar certo.", "bad");
        }
        App.save();
      }
    };
  },
};
