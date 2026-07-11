/* ICE SISTEMA — Configurações do negócio (white-label por tenant) + equipe + backup */
"use strict";

const ViewConfig = {
  render() {
    const s = App.state.settings;
    const v = U.$("#view");
    v.innerHTML = `
      <div class="view-head"><h2>⚙️ Configurações do negócio</h2>
        <button class="btn small" id="cfg-logout">Sair da conta</button></div>

      <div class="grid g2">
        <div class="card">
          <h3>🏷️ Identidade</h3>
          <label>Nome do negócio</label><input id="cfg-name" value="${U.esc(s.businessName)}" maxlength="40"/>
          <label>Tagline</label><input id="cfg-tag" value="${U.esc(s.tagline)}" maxlength="60"/>
          <label>Logo</label>
          <div class="flex">
            <div class="blogo" id="cfg-logo-prev" style="width:44px;height:44px;font-size:28px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:var(--accent-soft);overflow:hidden">
              ${s.logo.type === "image" ? `<img src="${U.esc(s.logo.value)}" style="width:100%;height:100%;object-fit:cover">` : U.esc(s.logo.value)}
            </div>
            <input id="cfg-logo-emoji" value="${s.logo.type === "emoji" ? U.esc(s.logo.value) : ""}" placeholder="Emoji (ex: ❄️ 🍦 🧊)" style="width:150px"/>
            <label class="btn small" style="margin:0">📤 Enviar imagem<input type="file" id="cfg-logo-file" accept="image/*" style="display:none"/></label>
          </div>
          <label>Cor de destaque</label>
          <div class="flex">
            <input type="color" id="cfg-accent" value="${U.esc(s.accent)}" style="width:56px;height:38px;padding:2px"/>
            <button class="btn small" id="cfg-accent-reset">Voltar ao dourado padrão</button>
          </div>
        </div>

        <div class="card">
          <h3>👤 Seu perfil</h3>
          <div class="flex" style="align-items:center">
            <span class="ava" id="cfg-ava" style="width:64px;height:64px;border-radius:50%;overflow:hidden;background:var(--accent-soft);display:flex;align-items:center;justify-content:center;font-size:30px;border:2px solid color-mix(in srgb, var(--accent) 55%, transparent);flex-shrink:0">
              ${s.profile && s.profile.photo ? `<img src="${U.esc(s.profile.photo)}" style="width:100%;height:100%;object-fit:cover">` : "👤"}
            </span>
            <div style="flex:1;min-width:150px">
              <button class="btn small" id="cfg-ava-edit">📷 ${s.profile && s.profile.photo ? "Editar foto" : "Adicionar foto"}</button>
              ${s.profile && s.profile.photo ? `<button class="btn small ghost danger" id="cfg-ava-rm">Remover</button>` : ""}
            </div>
          </div>
          <label>Seu nome</label><input id="cfg-pname" value="${U.esc((s.profile && s.profile.name) || "")}" placeholder="Como você quer aparecer" maxlength="40"/>
          <div class="muted small mt">Aparece na barra lateral e no menu do celular.</div>
        </div>

        <div class="card">
          <h3>🏠 Endereço da fábrica/depósito</h3>
          <div class="muted small">Usado como centro do mapa de logística e para escolher o resultado certo na geocodificação.</div>
          <label>CEP</label><input id="cfg-cep" value="${U.esc(s.address.cep || "")}" placeholder="00000-000"/>
          <label>Endereço completo</label><input id="cfg-addr" value="${U.esc(s.address.text || "")}" placeholder="Rua, número, bairro, cidade - UF"/>
          <div class="flex mt">
            <button class="btn small primary" id="cfg-geo">📍 Localizar pelo endereço</button>
            <button class="btn small" id="cfg-gps">🛰️ Usar minha localização</button>
          </div>
          <div class="muted small mt" id="cfg-geo-st">${s.address.lat != null ? "✅ Localizado (" + s.address.lat.toFixed(4) + ", " + s.address.lng.toFixed(4) + ")" : "⚠️ Ainda sem coordenada — use um dos botões acima ou arraste o pino 🏠 no mapa"}</div>
        </div>

        <div class="card">
          <h3>🎛️ Parâmetros</h3>
          <div class="form-row">
            <div><label class="flex" style="margin-bottom:6px"><input type="checkbox" id="cfg-tax-on" ${s.taxEnabled ? "checked" : ""} style="width:auto"/> Descontar imposto/taxa das vendas</label>
              <input id="cfg-tax" inputmode="decimal" value="${s.taxPct}" placeholder="%" style="display:${s.taxEnabled ? "block" : "none"}"/></div>
            <div><label>Margem alvo (%)</label><input id="cfg-margin" inputmode="decimal" value="${s.targetMarginPct}"/></div>
            <div><label>Custo por km (frete)</label><input id="cfg-km" inputmode="decimal" value="${s.kmCost}"/></div>
            <div><label>Validade padrão (dias)</label><input id="cfg-shelf" inputmode="numeric" value="${s.shelfLifeDays}"/></div>
          </div>
          <div class="form-row">
            <div><label>Moeda</label>${UI.selectHtml("cfg-cur", [{ value: "BRL", label: "Real (R$)" }, { value: "USD", label: "Dólar (US$)" }, { value: "EUR", label: "Euro (€)" }], s.currency)}</div>
            <div><label>Chave LocationIQ (geocodificador preciso, opcional)</label><input id="cfg-liq" value="${U.esc(s.locationIqKey)}" placeholder="pk.xxxxx"/></div>
          </div>
        </div>

        <div class="card">
          <h3>📣 Canais de venda</h3>
          <div class="muted small mb">Um por linha — aparecem no registro de vendas e na análise por canal.</div>
          <textarea id="cfg-channels" rows="5">${U.esc(s.channels.join("\n"))}</textarea>
        </div>
      </div>

      <div class="card mt">
        <h3>🧊 Catálogo de produtos/sabores</h3>
        <div class="muted small mb">Adicione, renomeie e remova livremente. A cor é usada nos gráficos e no mapa.</div>
        <div id="cfg-catalog"></div>
        <button class="btn primary mt" id="cfg-add-item">＋ Adicionar produto/sabor</button>
      </div>

      <div class="card mt">
        <h3>💬 Mensagens de WhatsApp</h3>
        <div class="muted small mb">Use {nome} e {valor} — são substituídos automaticamente.</div>
        <div class="grid g2">
          ${[["sumido", "Cliente sumido"], ["confirmacao", "Confirmação de pedido"], ["entrega", "Entrega saiu"], ["cobranca", "Cobrança (fiado)"]].map(([k, l]) =>
            `<div><label>${l}</label><textarea data-wa="${k}" rows="3">${U.esc(s.waTemplates[k] || "")}</textarea></div>`).join("")}
        </div>
      </div>

      <div class="grid g2 mt">
        <div class="card">
          <h3>🧑‍🤝‍🧑 Equipe / vendedores</h3>
          <div class="muted small mb">Para comissões: associe vendas a um vendedor na tela de Vendas.</div>
          <div id="cfg-team"></div>
          <button class="btn small mt" id="cfg-add-member">＋ Adicionar membro</button>
        </div>
        <div class="card">
          <h3>💾 Backup</h3>
          <div class="muted small mb">Exporta TUDO em um arquivo JSON. Restaurar marca os dados como mais recentes e reenvia pra nuvem (não perde nada).</div>
          <div class="flex">
            <button class="btn" id="cfg-export">⬇️ Exportar backup</button>
            <label class="btn" style="margin:0">⬆️ Restaurar backup<input type="file" id="cfg-import" accept=".json,application/json" style="display:none"/></label>
          </div>
          <hr class="sep"/>
          <div class="muted small">Conta: <b>${Cloud.session() ? U.esc(Cloud.session().user.email) : "modo offline neste aparelho"}</b><br/>
          Nuvem: ${Cloud.enabled() ? "configurada ✅" : "não configurada nesta instalação (README)"}</div>
        </div>
      </div>
      <div class="m-actions mt"><button class="btn primary" id="cfg-save" style="min-width:180px">Salvar configurações</button></div>
    `;

    ViewConfig.renderCatalog();
    ViewConfig.renderTeam();

    /* logo */
    U.$("#cfg-logo-emoji").oninput = (e) => {
      const val = e.target.value.trim();
      if (val) U.$("#cfg-logo-prev").innerHTML = U.esc(val);
    };
    U.$("#cfg-logo-file").onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => UI.imageEditor(rd.result, { title: "Ajustar logo", size: 128 }, (url) => {
        App.state.settings.logo = { type: "image", value: url };
        U.$("#cfg-logo-prev").innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover">`;
        U.$("#cfg-logo-emoji").value = "";
      });
      rd.readAsDataURL(f);
      e.target.value = "";
    };

    // foto de perfil: seleciona → editor (zoom/arrastar, corte redondo) → salva
    U.$("#cfg-ava-edit").onclick = () => UI.pickAndEditImage({ title: "Editar foto de perfil", round: true, size: 256 }, (url) => {
      App.state.settings.profile = App.state.settings.profile || { name: "", photo: "" };
      App.state.settings.profile.photo = url;
      App.applyBranding();
      App.save();
      UI.toast("Foto de perfil atualizada 📷", "ok");
    });
    if (U.$("#cfg-ava-rm")) U.$("#cfg-ava-rm").onclick = () => {
      App.state.settings.profile.photo = "";
      App.applyBranding();
      App.save();
    };
    U.$("#cfg-accent-reset").onclick = () => { U.$("#cfg-accent").value = "#d4af37"; };
    U.$("#cfg-tax-on").onchange = (e) => { U.$("#cfg-tax").style.display = e.target.checked ? "block" : "none"; };

    U.$("#cfg-geo").onclick = async () => {
      const st = U.$("#cfg-geo-st");
      st.textContent = "Buscando…";
      const r = await Geo.geocode(U.$("#cfg-addr").value, U.$("#cfg-cep").value).catch(() => null);
      if (r) {
        App.state.settings.address.lat = r.lat;
        App.state.settings.address.lng = r.lng;
        st.textContent = `✅ Localizado (${r.lat.toFixed(4)}, ${r.lng.toFixed(4)})${r.precise ? " — preciso via CEP" : ""}`;
        UI.toast("Endereço localizado! Você pode ajustar o pino no mapa de Logística.", "ok");
      } else {
        st.textContent = "❌ Não achei — confira o endereço/CEP ou arraste o pino da fábrica no mapa.";
      }
    };

    // GPS: define a posição da fábrica pela localização atual do aparelho
    U.$("#cfg-gps").onclick = () => {
      const st2 = U.$("#cfg-geo-st");
      if (!navigator.geolocation) { st2.textContent = "❌ Este navegador não tem GPS/geolocalização."; return; }
      st2.textContent = "🛰️ Obtendo sua localização… (autorize no navegador)";
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          App.state.settings.address.lat = pos.coords.latitude;
          App.state.settings.address.lng = pos.coords.longitude;
          App.save({ rerender: false });
          st2.textContent = `✅ Localizado pelo GPS (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}) — ajuste fino arrastando o pino 🏠 no mapa.`;
          UI.toast("Fábrica posicionada pela sua localização 🛰️", "ok");
        },
        (err) => { st2.textContent = "❌ Não consegui sua localização (" + err.message + "). Autorize o acesso ou use o endereço."; },
        { enableHighAccuracy: true, timeout: 12000 }
      );
    };

    U.$("#cfg-add-item").onclick = () => ViewConfig.editItem(null);
    U.$("#cfg-add-member").onclick = () => {
      App.state.team.push({ id: U.uid(), name: "Novo membro", commissionPct: 0 });
      ViewConfig.renderTeam();
    };

    U.$("#cfg-export").onclick = () => {
      U.downloadFile(
        "ice-backup-" + (App.state.settings.businessName || "negocio").replace(/\W+/g, "-").toLowerCase() + "-" + U.todayStr() + ".json",
        JSON.stringify(App.state, null, 2), "application/json");
      UI.toast("Backup exportado ⬇️", "ok");
    };
    U.$("#cfg-import").onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const st = Store.migrate(JSON.parse(rd.result));
          UI.confirm("Restaurar este backup? Ele substitui os dados atuais deste negócio (e será reenviado pra nuvem como versão mais recente).", () => {
            App.state = st;
            App.state.updatedAt = U.nowMs(); // restaurar preserva a nuvem: local vira o mais novo
            Store.saveLocal(App.state, Store.currentUid);
            Cloud.scheduleSync();
            App.applyBranding();
            App.render();
            UI.toast("Backup restaurado ✅", "ok");
          }, { title: "Restaurar backup", yes: "Restaurar" });
        } catch (err) { UI.toast("Arquivo inválido: " + err.message, "bad"); }
      };
      rd.readAsText(f);
    };

    U.$("#cfg-logout").onclick = App.logoutApp;

    U.$("#cfg-save").onclick = () => {
      const s = App.state.settings;
      s.businessName = U.$("#cfg-name").value.trim() || s.businessName;
      s.tagline = U.$("#cfg-tag").value.trim();
      const emoji = U.$("#cfg-logo-emoji").value.trim();
      if (emoji) s.logo = { type: "emoji", value: emoji };
      s.profile = s.profile || { name: "", photo: "" };
      s.profile.name = U.$("#cfg-pname").value.trim();
      s.accent = U.$("#cfg-accent").value;
      s.address.cep = U.$("#cfg-cep").value.trim();
      s.address.text = U.$("#cfg-addr").value.trim();
      s.taxEnabled = U.$("#cfg-tax-on").checked;
      s.taxPct = U.parseNum(U.$("#cfg-tax").value);
      s.targetMarginPct = U.parseNum(U.$("#cfg-margin").value);
      s.kmCost = U.parseNum(U.$("#cfg-km").value);
      s.shelfLifeDays = Math.max(1, Math.round(U.parseNum(U.$("#cfg-shelf").value)) || 180);
      s.currency = U.$("#cfg-cur").value;
      s.locationIqKey = U.$("#cfg-liq").value.trim();
      s.channels = U.$("#cfg-channels").value.split("\n").map((x) => x.trim()).filter(Boolean);
      if (!s.channels.length) s.channels = ["Venda direta"];
      U.$$("[data-wa]").forEach((t) => { s.waTemplates[t.dataset.wa] = t.value; });
      // equipe
      U.$$("[data-team-id]").forEach((row) => {
        const m = App.state.team.find((x) => x.id === row.dataset.teamId);
        if (m) {
          m.name = U.$("[data-tf=name]", row).value.trim() || m.name;
          m.commissionPct = U.parseNum(U.$("[data-tf=pct]", row).value);
        }
      });
      App.applyBranding();
      App.save();
      UI.toast("Configurações salvas ✅", "ok");
    };
  },

  renderCatalog() {
    const box = U.$("#cfg-catalog");
    const items = App.state.catalog;
    if (!items.length) { box.innerHTML = UI.emptyHtml("🧊", "Nenhum produto ainda — adicione o primeiro!"); return; }
    box.innerHTML = `<div class="list">` + items.map((it) => `
      <div class="row-card" style="${it.archived ? "opacity:.5" : ""}">
        <span class="color-dot" style="background:${U.esc(it.color || "#888")}"></span>
        <div class="rc-main"><div class="rc-title">${U.esc(it.name)}</div>
          <div class="rc-sub">${it.archived ? "arquivado" : "Estoque: " + U.num(Engine.productStock(App.state, it.id), 2) + " un"}</div></div>
        <div class="rc-actions">
          <button class="btn small" data-edit="${it.id}">✏️ Editar</button>
          <button class="btn small ${it.archived ? "" : "ghost"}" data-arch="${it.id}">${it.archived ? "↩️ Reativar" : "🗄️ Arquivar"}</button>
          <button class="btn small danger" data-del="${it.id}">🗑️</button>
        </div>
      </div>`).join("") + "</div>";
    U.$$("[data-edit]", box).forEach((b) => (b.onclick = () => ViewConfig.editItem(b.dataset.edit)));
    U.$$("[data-arch]", box).forEach((b) => (b.onclick = () => {
      const it = App.state.catalog.find((x) => x.id === b.dataset.arch);
      it.archived = !it.archived;
      App.save({ rerender: false });
      ViewConfig.renderCatalog();
    }));
    U.$$("[data-del]", box).forEach((b) => (b.onclick = () => {
      const it = App.state.catalog.find((x) => x.id === b.dataset.del);
      const used = App.state.sales.some((s) => (s.items || []).some((i) => i.itemId === it.id)) ||
        App.state.productions.some((p) => p.itemId === it.id);
      if (used) return UI.toast("Este item tem histórico de vendas/produção — use Arquivar para não perder os dados.", "bad");
      UI.confirm(`Excluir "${it.name}"? Os insumos próprios dele também serão removidos.`, () => {
        App.state.catalog = App.state.catalog.filter((x) => x.id !== it.id);
        App.state.insumos = App.state.insumos.filter((i) => !(i.scope === "item" && i.itemId === it.id));
        App.save({ rerender: false });
        ViewConfig.renderCatalog();
      }, { danger: true, yes: "Excluir" });
    }));
  },

  editItem(id) {
    const it = id ? App.state.catalog.find((x) => x.id === id) : null;
    const m = UI.modal(`
      <h3>${it ? "Editar" : "Novo"} produto/sabor</h3>
      <label>Nome</label><input id="it-name" value="${U.esc(it ? it.name : "")}" placeholder="Ex: Gelo de Coco" maxlength="40"/>
      <label>Cor (gráficos e mapa)</label><input type="color" id="it-color" value="${U.esc(it && it.color ? it.color : "#4fc3f7")}" style="width:64px;height:40px;padding:2px"/>
      <div class="m-actions"><button class="btn" data-a="c">Cancelar</button><button class="btn primary" data-a="s">Salvar</button></div>
    `);
    U.$('[data-a="c"]', m.el).onclick = m.close;
    U.$('[data-a="s"]', m.el).onclick = () => {
      const name = U.$("#it-name").value.trim();
      if (!name) return U.$("#it-name").focus();
      const color = U.$("#it-color").value;
      if (it) { it.name = name; it.color = color; }
      else App.state.catalog.push({ id: U.uid(), name, color, archived: false });
      m.close();
      App.save({ rerender: false });
      ViewConfig.renderCatalog();
      UI.toast("Catálogo atualizado ✅", "ok");
    };
  },

  renderTeam() {
    const box = U.$("#cfg-team");
    if (!App.state.team.length) { box.innerHTML = `<div class="muted small">Nenhum membro ainda.</div>`; return; }
    box.innerHTML = App.state.team.map((mb) => `
      <div class="flex mb" data-team-id="${mb.id}">
        <input data-tf="name" value="${U.esc(mb.name)}" style="flex:2" placeholder="Nome"/>
        <input data-tf="pct" value="${mb.commissionPct}" style="width:88px" inputmode="decimal" title="Comissão %"/>
        <span class="muted small">%</span>
        <button class="btn small danger" data-tdel="${mb.id}">🗑️</button>
      </div>`).join("");
    U.$$("[data-tdel]", box).forEach((b) => (b.onclick = () => {
      App.state.team = App.state.team.filter((x) => x.id !== b.dataset.tdel);
      App.save({ rerender: false });
      ViewConfig.renderTeam();
    }));
  },
};
