/* ICE SISTEMA — geocodificação em cascata com viés regional por tenant.
   Ordem: CEP via BrasilAPI (coordenada direta) → ViaCEP (expande endereço) →
   LocationIQ (se o tenant tiver chave) → Nominatim (grátis).
   Entre candidatos, escolhe SEMPRE o mais próximo da região do tenant
   (evita cair em rua homônima de outro estado). */
"use strict";

const Geo = {
  MAX_REGION_KM: 300, // além disso o pino é considerado "fora da região"

  // âncora regional do tenant: endereço da fábrica; fallback centro do Brasil
  anchor() {
    const a = App.state.settings.address;
    if (a && a.lat != null && a.lng != null) return { lat: a.lat, lng: a.lng };
    return { lat: -14.235, lng: -51.925, weak: true };
  },

  pickClosest(cands) {
    const anc = Geo.anchor();
    if (!cands.length) return null;
    if (anc.weak) return cands[0];
    return U.sortBy(cands, (c) => U.distKm(anc.lat, anc.lng, c.lat, c.lng))[0];
  },

  isFarFromRegion(lat, lng) {
    const anc = Geo.anchor();
    if (anc.weak || lat == null || lng == null) return false;
    return U.distKm(anc.lat, anc.lng, lat, lng) > Geo.MAX_REGION_KM;
  },

  extractCep(text) {
    const m = String(text || "").match(/\b(\d{5})-?(\d{3})\b/);
    return m ? m[1] + m[2] : null;
  },

  // fetch com timeout de 10s — geocodificador lento não pode travar o app
  async fetchJson(url, opts) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10000);
    try {
      const res = await fetch(url, { ...(opts || {}), signal: ctl.signal });
      if (!res.ok) throw new Error(url + " → " + res.status);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  },

  // BrasilAPI v2: pode trazer coordenada direta do CEP (mais preciso)
  async byCepBrasilApi(cep) {
    const j = await Geo.fetchJson("https://brasilapi.com.br/api/cep/v2/" + cep);
    const c = j.location && j.location.coordinates;
    const out = {
      street: j.street || "", city: j.city || "", state: j.state || "",
      lat: c && c.latitude ? parseFloat(c.latitude) : null,
      lng: c && c.longitude ? parseFloat(c.longitude) : null,
    };
    return out;
  },

  async byCepViaCep(cep) {
    const j = await Geo.fetchJson("https://viacep.com.br/ws/" + cep + "/json/");
    if (j.erro) throw new Error("CEP não encontrado");
    return { street: j.logradouro || "", city: j.localidade || "", state: j.uf || "", lat: null, lng: null };
  },

  async searchLocationIq(q, key) {
    const j = await Geo.fetchJson(
      "https://us1.locationiq.com/v1/search?key=" + encodeURIComponent(key) +
      "&q=" + encodeURIComponent(q) + "&format=json&limit=5&countrycodes=br"
    );
    return (j || []).map((r) => ({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), label: r.display_name }));
  },

  async searchNominatim(q) {
    const j = await Geo.fetchJson(
      "https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=br&q=" + encodeURIComponent(q),
      { headers: { Accept: "application/json" } }
    );
    return (j || []).map((r) => ({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), label: r.display_name }));
  },

  // busca textual: LocationIQ (chave do tenant) com fallback Nominatim
  async searchText(q) {
    const key = (App.state.settings.locationIqKey || "").trim();
    if (key) {
      try {
        const c = await Geo.searchLocationIq(q, key);
        if (c.length) return Geo.pickClosest(c);
      } catch (e) { console.warn("LocationIQ falhou, caindo pro Nominatim", e); }
    }
    try {
      const c = await Geo.searchNominatim(q);
      if (c.length) return Geo.pickClosest(c);
    } catch (e) { console.warn("Nominatim falhou", e); }
    return null;
  },

  /* Geocodifica um endereço livre (pode conter CEP).
     → {lat, lng, precise, viaCep} ou null (caller cria pino perto do depósito) */
  async geocode(addressText, cepField) {
    const cep = (cepField && U.phoneDigits(cepField).length === 8 ? U.phoneDigits(cepField) : null) ||
      Geo.extractCep(addressText);
    let expanded = addressText || "";

    if (cep) {
      try {
        const b = await Geo.byCepBrasilApi(cep);
        if (b.lat != null && b.lng != null) return { lat: b.lat, lng: b.lng, precise: true, viaCep: true };
        if (b.street || b.city) expanded = [addressText, b.street, b.city, b.state].filter(Boolean).join(", ");
      } catch (e) {
        try {
          const v = await Geo.byCepViaCep(cep);
          if (v.street || v.city) expanded = [addressText, v.street, v.city, v.state].filter(Boolean).join(", ");
        } catch (e2) { /* segue com o texto original */ }
      }
    }

    if (expanded.trim()) {
      const hit = await Geo.searchText(expanded.trim());
      if (hit) return { lat: hit.lat, lng: hit.lng, precise: false, label: hit.label };
    }
    return null;
  },

  // posição fallback: perto do depósito com um pequeno deslocamento aleatório
  fallbackNearDepot() {
    const anc = Geo.anchor();
    return {
      lat: anc.lat + (Math.random() - 0.5) * 0.01,
      lng: anc.lng + (Math.random() - 0.5) * 0.01,
      fallback: true,
    };
  },
};
