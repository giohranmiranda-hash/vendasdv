/* ICE SISTEMA — orquestração: boot, login, onboarding, navegação, save/sync */
"use strict";

const App = {
  state: null,
  currentView: "dashboard",
  viewState: {}, // estado volátil por tela (mês selecionado etc.)

  views: [
    { id: "dashboard", icon: "📊", label: "Dashboard", render: () => ViewDashboard.render() },
    { id: "vendas", icon: "💰", label: "Vendas", render: () => ViewVendas.render() },
    { id: "leads", icon: "🎯", label: "Leads", render: () => ViewCRM.renderLeads() },
    { id: "clientes", icon: "👥", label: "Clientes", render: () => ViewCRM.renderClientes() },
    { id: "producao", icon: "🏭", label: "Produção", render: () => ViewProducao.render() },
    { id: "estoque", icon: "📦", label: "Estoque", render: () => ViewProducao.renderEstoque() },
    { id: "insumos", icon: "🧂", label: "Insumos", render: () => ViewInsumos.render() },
    { id: "receitas", icon: "📖", label: "Receitas", render: () => ViewReceitas.render() },
    { id: "mapa", icon: "🗺️", label: "Logística", render: () => ViewMapa.render() },
    { id: "assistente", icon: "🤖", label: "Assistente", render: () => ViewAssistente.render() },
    { id: "financeiro", icon: "🏦", label: "Financeiro", render: () => ViewFinanceiro.render() },
    { id: "relatorios", icon: "📈", label: "Relatórios", render: () => ViewExtras.renderRelatorios() },
    { id: "metas", icon: "🏁", label: "Metas & Comissões", render: () => ViewExtras.renderMetas() },
    { id: "calendario", icon: "📅", label: "Calendário", render: () => ViewExtras.renderCalendario() },
    { id: "assinatura", icon: "💎", label: "Assinatura", render: () => ViewAssinatura.render() },
    { id: "config", icon: "⚙️", label: "Configurações", render: () => ViewConfig.render() },
  ],

  /* ---------- persistência ---------- */
  save(opts) {
    opts = opts || {};
    App.state.updatedAt = U.nowMs();
    Store.saveLocal(App.state, Store.currentUid);
    Cloud.scheduleSync();
    if (opts.rerender !== false) App.render();
  },

  /* ---------- branding por tenant ---------- */
  applyBranding() {
    const s = App.state.settings;
    document.documentElement.style.setProperty("--accent", s.accent || "#d4af37");
    const name = s.businessName || "Ice Sistema";
    const logoHtml = s.logo && s.logo.type === "image"
      ? `<img src="${U.esc(s.logo.value)}" alt="logo">`
      : U.esc((s.logo && s.logo.value) || "❄️");
    for (const id of ["brand-logo", "brand-logo-m", "brand-logo-d"]) U.$("#" + id).innerHTML = logoHtml;
    for (const id of ["brand-name", "brand-name-m", "brand-name-d"]) U.$("#" + id).textContent = name;
    U.$("#brand-tag").textContent = s.tagline || "";
    U.$("#brand-tag-d").textContent = s.tagline || "";
    document.title = name + " — Ice Sistema";
  },

  setSyncStatus(st) {
    Cloud.status = st;
    const map = {
      off: "📴 Offline (sem nuvem)",
      local: "💾 Salvo neste aparelho",
      syncing: "☁️ Sincronizando…",
      ok: "☁️ Sincronizado",
      error: "⚠️ Nuvem indisponível — dados salvos localmente",
    };
    const txt = map[st] || "—";
    U.$("#sync-foot").textContent = txt;
    U.$("#sync-foot-d").textContent = txt;
    U.$("#sync-foot-m").textContent = txt.split(" ")[0];
  },

  /* ---------- navegação ---------- */
  renderMenu() {
    const mk = (v) =>
      `<button data-nav="${v.id}" class="${App.currentView === v.id ? "on" : ""}">` +
      `<span class="mi">${v.icon}</span><span>${U.esc(v.label)}</span></button>`;
    U.$("#menu-desktop").innerHTML = App.views.map(mk).join("");
    U.$("#menu-drawer").innerHTML = App.views.map(mk).join("");
    U.$$("[data-nav]").forEach((b) => (b.onclick = () => App.go(b.dataset.nav)));
  },

  openDrawer(open) {
    document.body.classList.toggle("drawer-open", open);
  },

  go(viewId) {
    App.currentView = viewId;
    App.openDrawer(false);
    App.renderMenu();
    App.render();
    U.$("#view").scrollIntoView({ block: "start" });
  },

  render() {
    const v = App.views.find((x) => x.id === App.currentView) || App.views[0];
    // reinicia a animação de entrada da tela
    const main = U.$("#view");
    main.classList.remove("anim");
    void main.offsetWidth;
    main.classList.add("anim");
    try { v.render(); }
    catch (e) {
      console.error("render " + v.id, e);
      U.$("#view").innerHTML = `<div class="banner bad">Erro ao renderizar esta tela: ${U.esc(e.message)}</div>`;
    }
  },

  /* ---------- entrada no app ---------- */
  enter(uid) {
    Store.currentUid = uid;
    App.state = Store.load(uid) || Store.defaultState();
    U.$("#login-screen").style.display = "none";
    U.$("#app").classList.add("on");
    App.applyBranding();
    App.renderMenu();
    App.setSyncStatus(uid ? "ok" : "local");
    if (!App.state.settings.onboarded) App.onboarding();
    else App.render();
  },

  async enterCloud() {
    const s = Cloud.session();
    Store.currentUid = s.user.id;
    const local = Store.load(s.user.id) || Store.defaultState();
    App.state = local;
    U.$("#login-screen").style.display = "none";
    U.$("#app").classList.add("on");
    App.applyBranding();
    App.renderMenu();
    App.setSyncStatus("syncing");
    const rec = await Cloud.reconcile(local);
    App.state = rec.state;
    Store.saveLocal(App.state, Store.currentUid);
    App.setSyncStatus(rec.source === "local-offline" ? "error" : "ok");
    App.applyBranding();
    if (!App.state.settings.onboarded) App.onboarding();
    else App.render();
    if (rec.source === "cloud") UI.toast("Dados carregados da nuvem ☁️", "ok");
  },

  logoutApp() {
    UI.confirm("Sair da conta? Os dados continuam salvos neste aparelho e na nuvem.", () => {
      Cloud.logout();
      location.reload();
    }, { title: "Sair", yes: "Sair" });
  },

  /* ---------- onboarding: wizard de primeira configuração ---------- */
  onboarding() {
    const m = UI.modal(`
      <div class="flex" style="gap:12px;margin-bottom:6px">
        <svg viewBox="0 0 100 100" width="46" height="46"><use href="#ice-logo-mark"/></svg>
        <div><h3 style="margin:0">Bem-vindo ao Ice Sistema! 🎉</h3>
        <div class="muted small">Vamos configurar o seu negócio em 30 segundos.</div></div>
      </div>
      <label>Nome do seu negócio *</label>
      <input id="onb-name" placeholder="Ex: Gelato do Vale" maxlength="40" />
      <label>Tagline (opcional)</label>
      <input id="onb-tag" placeholder="Ex: O sabor que refresca" maxlength="60" />
      <label>Como quer começar o catálogo?</label>
      <div class="onb-choice">
        <button class="btn" id="onb-empty">🧊<br><b>Começar do zero</b><br><small>Eu cadastro meus produtos</small></button>
        <button class="btn primary" id="onb-template">✨<br><b>Com exemplo</b><br><small>5 sabores + receita editável</small></button>
      </div>
      <div class="muted small mt">Tudo é editável depois em ⚙️ Configurações — inclusive nome, logo, cores, sabores, receitas e preços.</div>
    `, { sticky: true });

    const finish = (useTemplate) => {
      const name = U.$("#onb-name").value.trim();
      if (!name) { U.$("#onb-name").focus(); U.$("#onb-name").style.borderColor = "var(--bad)"; return; }
      App.state.settings.businessName = name;
      App.state.settings.tagline = U.$("#onb-tag").value.trim();
      App.state.settings.onboarded = true;
      if (useTemplate) Store.applyExampleTemplate(App.state);
      m.close();
      App.applyBranding();
      App.save();
      UI.toast(useTemplate ? "Catálogo de exemplo carregado — personalize à vontade!" : "Vamos lá! Cadastre seus produtos em ⚙️ Configurações.", "ok");
    };
    U.$("#onb-empty", m.el).onclick = () => finish(false);
    U.$("#onb-template", m.el).onclick = () => finish(true);
  },

  /* ---------- boot ---------- */
  boot() {
    // gaveta mobile (☰)
    U.$("#btn-drawer").onclick = () => App.openDrawer(true);
    U.$("#btn-drawer-close").onclick = () => App.openDrawer(false);
    U.$("#drawer-back").onclick = () => App.openDrawer(false);

    // service worker (PWA)
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("sw.js").catch((e) => console.warn("sw", e));
    }

    const hasCloud = Cloud.enabled();
    if (!hasCloud) {
      U.$("#login-form").style.display = "none";
      U.$("#login-nocloud").style.display = "block";
    }

    // sessão nuvem existente → entra direto
    if (hasCloud && Cloud.session()) { App.enterCloud(); return; }
    // modo offline já escolhido antes → entra direto
    if (localStorage.getItem("ice_offline_mode") === "1" || (!hasCloud && Store.load(null))) {
      App.enter(null); return;
    }

    // tela de login
    const msg = (t, k) => { const m = U.$("#login-msg"); m.textContent = t; m.className = "login-msg " + (k || ""); };
    U.$("#btn-offline").onclick = () => { localStorage.setItem("ice_offline_mode", "1"); App.enter(null); };
    if (hasCloud) {
      const getCreds = () => ({ email: U.$("#login-email").value.trim(), pass: U.$("#login-pass").value });
      U.$("#btn-login").onclick = async () => {
        const { email, pass } = getCreds();
        if (!email || !pass) return msg("Preencha email e senha.", "err");
        msg("Entrando…");
        try { await Cloud.login(email, pass); localStorage.removeItem("ice_offline_mode"); App.enterCloud(); }
        catch (e) { msg(traduzAuth(e.message), "err"); }
      };
      U.$("#btn-signup").onclick = async () => {
        const { email, pass } = getCreds();
        if (!email || !pass) return msg("Preencha email e senha para criar a conta.", "err");
        if (pass.length < 6) return msg("A senha precisa de pelo menos 6 caracteres.", "err");
        msg("Criando conta…");
        try {
          const r = await Cloud.signup(email, pass);
          if (r.needsConfirm) msg("Conta criada! Confirme o email que enviamos e depois faça login. 📧", "ok");
          else { localStorage.removeItem("ice_offline_mode"); App.enterCloud(); }
        } catch (e) { msg(traduzAuth(e.message), "err"); }
      };
      U.$("#login-pass").addEventListener("keydown", (ev) => { if (ev.key === "Enter") U.$("#btn-login").click(); });
    }

    function traduzAuth(m) {
      m = String(m || "");
      if (/invalid login credentials/i.test(m)) return "Email ou senha incorretos.";
      if (/already registered/i.test(m)) return "Este email já tem conta — use Entrar.";
      if (/rate limit/i.test(m)) return "Muitas tentativas — aguarde um instante.";
      if (/confirm/i.test(m)) return "Confirme seu email antes de entrar.";
      return m;
    }
  },
};

// expõe no window (depuração e testes automatizados)
Object.assign(window, { App, U, UI, Store, Engine, Cloud, Geo, Charts, Assistant });

document.addEventListener("DOMContentLoaded", App.boot);
