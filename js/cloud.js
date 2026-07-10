/* ICE SISTEMA — nuvem Supabase via REST puro (sem SDK).
   Isolamento multi-tenant: RLS na tabela app_state garante que cada user_id
   só lê/escreve a própria linha (ver supabase.sql).
   Anti-sobrescrita: comparação por updatedAt; aparelho vazio NUNCA apaga nuvem. */
"use strict";

const Cloud = {
  SESSION_KEY: "ice_session",
  status: "off", // off | local | ok | syncing | error
  _timer: null,
  _syncing: false,

  enabled() {
    return !!(ICE_CONFIG.SUPABASE_URL && ICE_CONFIG.SUPABASE_ANON_KEY);
  },

  headers(auth) {
    const h = { apikey: ICE_CONFIG.SUPABASE_ANON_KEY, "Content-Type": "application/json" };
    if (auth) h.Authorization = "Bearer " + auth;
    return h;
  },

  /* ---------- sessão ---------- */
  session() {
    try { return JSON.parse(localStorage.getItem(Cloud.SESSION_KEY) || "null"); }
    catch (e) { return null; }
  },
  saveSession(s) {
    if (s) localStorage.setItem(Cloud.SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(Cloud.SESSION_KEY);
  },

  async authRequest(path, body) {
    const res = await fetch(ICE_CONFIG.SUPABASE_URL + "/auth/v1/" + path, {
      method: "POST", headers: Cloud.headers(), body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json.msg || json.error_description || json.message || (json.error && json.error.message) || "Erro de autenticação";
      throw new Error(msg);
    }
    return json;
  },

  _storeAuth(json) {
    const s = {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: Date.now() + ((json.expires_in || 3600) - 120) * 1000,
      user: { id: json.user && json.user.id, email: json.user && json.user.email },
    };
    Cloud.saveSession(s);
    return s;
  },

  async signup(email, password) {
    const json = await Cloud.authRequest("signup", { email, password });
    if (json.access_token) return Cloud._storeAuth(json);
    return { needsConfirm: true, email }; // confirmação de email ativada no projeto
  },

  async login(email, password) {
    const json = await Cloud.authRequest("token?grant_type=password", { email, password });
    return Cloud._storeAuth(json);
  },

  async refreshIfNeeded() {
    const s = Cloud.session();
    if (!s) return null;
    if (Date.now() < (s.expires_at || 0)) return s;
    try {
      const json = await Cloud.authRequest("token?grant_type=refresh_token", { refresh_token: s.refresh_token });
      return Cloud._storeAuth(json);
    } catch (e) {
      console.warn("refresh falhou", e);
      return null; // sessão expirada — app segue offline com dados locais
    }
  },

  logout() { Cloud.saveSession(null); },

  /* ---------- dados (tabela app_state) ---------- */
  async fetchCloud() {
    const s = await Cloud.refreshIfNeeded();
    if (!s) throw new Error("sem sessão");
    const res = await fetch(
      ICE_CONFIG.SUPABASE_URL + "/rest/v1/app_state?select=data,updated_at&user_id=eq." + s.user.id,
      { headers: Cloud.headers(s.access_token) }
    );
    if (!res.ok) throw new Error("fetch app_state " + res.status);
    const rows = await res.json();
    if (!rows.length) return null;
    const row = rows[0];
    const st = row.data || null;
    if (st && !st.updatedAt && row.updated_at) st.updatedAt = new Date(row.updated_at).getTime();
    return st;
  },

  async pushCloud(state) {
    const s = await Cloud.refreshIfNeeded();
    if (!s) throw new Error("sem sessão");
    const res = await fetch(ICE_CONFIG.SUPABASE_URL + "/rest/v1/app_state", {
      method: "POST",
      headers: { ...Cloud.headers(s.access_token), Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify([{
        user_id: s.user.id,
        data: state,
        updated_at: new Date(state.updatedAt || Date.now()).toISOString(),
      }]),
    });
    if (!res.ok) throw new Error("push app_state " + res.status);
  },

  /* ---------- reconciliação no login/boot ----------
     - aparelho vazio + nuvem com dados → SEMPRE baixa
     - nuvem mais recente → baixa
     - local mais recente → sobe                         */
  async reconcile(localState) {
    let cloud = null;
    try { cloud = await Cloud.fetchCloud(); }
    catch (e) { console.warn("reconcile fetch", e); return { state: localState, source: "local-offline" }; }

    if (cloud && Store.isEmptyState(localState)) return { state: Store.migrate(cloud), source: "cloud" };
    if (!cloud) {
      if (!Store.isEmptyState(localState)) { try { await Cloud.pushCloud(localState); } catch (e) {} }
      return { state: localState, source: "local" };
    }
    if ((cloud.updatedAt || 0) > (localState.updatedAt || 0)) return { state: Store.migrate(cloud), source: "cloud" };
    if ((localState.updatedAt || 0) > (cloud.updatedAt || 0)) { try { await Cloud.pushCloud(localState); } catch (e) {} }
    return { state: localState, source: "local" };
  },

  /* ---------- sync contínuo (debounce após cada alteração) ---------- */
  scheduleSync() {
    if (!Cloud.enabled() || !Cloud.session()) return;
    clearTimeout(Cloud._timer);
    Cloud._timer = setTimeout(() => Cloud.syncNow(), 4000);
  },

  async syncNow() {
    if (!Cloud.enabled() || !Cloud.session() || Cloud._syncing) return;
    Cloud._syncing = true;
    App.setSyncStatus("syncing");
    try {
      // anti-sobrescrita: se a nuvem estiver mais nova (outro aparelho salvou), baixa
      const cloud = await Cloud.fetchCloud().catch(() => null);
      if (cloud && (cloud.updatedAt || 0) > (App.state.updatedAt || 0)) {
        App.state = Store.migrate(cloud);
        Store.saveLocal(App.state, Store.currentUid);
        App.applyBranding();
        App.render();
        UI.toast("Dados atualizados da nuvem ☁️");
      } else {
        await Cloud.pushCloud(App.state);
      }
      App.setSyncStatus("ok");
    } catch (e) {
      console.warn("sync", e);
      App.setSyncStatus("error");
    } finally {
      Cloud._syncing = false;
    }
  },
};

// tenta sincronizar quando a internet volta
window.addEventListener("online", () => Cloud.scheduleSync());
