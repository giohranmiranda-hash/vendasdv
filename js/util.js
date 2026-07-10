/* ICE SISTEMA — utilitários (datas SEMPRE em hora local, moeda, DOM) */
"use strict";

const U = {
  uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  /* ---------- DATAS: sempre hora LOCAL do aparelho (nunca toISOString puro) ---------- */
  pad2(n) { return String(n).padStart(2, "0"); },

  // "YYYY-MM-DD" da data local
  dateStr(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + U.pad2(d.getMonth() + 1) + "-" + U.pad2(d.getDate());
  },
  todayStr() { return U.dateStr(new Date()); },

  // "YYYY-MM" do mês local
  monthStr(d) {
    d = d || new Date();
    return d.getFullYear() + "-" + U.pad2(d.getMonth() + 1);
  },

  // parse "YYYY-MM-DD" como data LOCAL (new Date("YYYY-MM-DD") seria UTC!)
  parseDate(s) {
    if (!s) return null;
    const p = String(s).slice(0, 10).split("-").map(Number);
    if (p.length !== 3 || !p[0]) return null;
    return new Date(p[0], p[1] - 1, p[2]);
  },

  addDays(dateStr, days) {
    const d = U.parseDate(dateStr) || new Date();
    d.setDate(d.getDate() + days);
    return U.dateStr(d);
  },

  daysBetween(a, b) { // b - a em dias corridos (strings YYYY-MM-DD)
    const da = U.parseDate(a), db = U.parseDate(b);
    if (!da || !db) return 0;
    return Math.round((db - da) / 86400000);
  },

  monthOf(dateStr) { return String(dateStr || "").slice(0, 7); },

  // navegação de meses: "YYYY-MM" +- n
  shiftMonth(ym, n) {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return U.monthStr(d);
  },

  monthLabel(ym) {
    const [y, m] = ym.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  },

  fmtDate(dateStr) {
    const d = U.parseDate(dateStr);
    return d ? d.toLocaleDateString("pt-BR") : "—";
  },

  fmtDateShort(dateStr) {
    const d = U.parseDate(dateStr);
    return d ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";
  },

  // "Hoje", "Amanhã", "Ontem", "Depois de amanhã", senão dia da semana/data
  relDate(dateStr) {
    const diff = U.daysBetween(U.todayStr(), dateStr);
    if (diff === 0) return "Hoje";
    if (diff === 1) return "Amanhã";
    if (diff === 2) return "Depois de amanhã";
    if (diff === -1) return "Ontem";
    if (diff > 2 && diff <= 7) {
      const d = U.parseDate(dateStr);
      const wd = d.toLocaleDateString("pt-BR", { weekday: "long" });
      return wd.charAt(0).toUpperCase() + wd.slice(1);
    }
    return diff < 0 ? `${-diff} dias atrás` : `Em ${diff} dias`;
  },

  nowMs() { return Date.now(); },

  /* ---------- MOEDA / NÚMEROS ---------- */
  money(v, opts) {
    const s = (window.App && App.state && App.state.settings) || {};
    const cur = (opts && opts.currency) || s.currency || "BRL";
    const loc = (opts && opts.locale) || s.locale || "pt-BR";
    if (v == null || isNaN(v)) v = 0;
    try {
      return new Intl.NumberFormat(loc, { style: "currency", currency: cur }).format(v);
    } catch (e) {
      return "R$ " + Number(v).toFixed(2);
    }
  },
  num(v, dec) {
    if (v == null || isNaN(v)) v = 0;
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: dec == null ? 2 : dec }).format(v);
  },
  pct(v, dec) {
    if (v == null || isNaN(v) || !isFinite(v)) v = 0;
    return U.num(v, dec == null ? 1 : dec) + "%";
  },
  // aceita "1.234,56" e "1234.56"
  parseNum(s) {
    if (typeof s === "number") return s;
    s = String(s || "").trim();
    if (!s) return 0;
    if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  },

  /* ---------- TELEFONE / WHATSAPP ---------- */
  phoneDigits(p) { return String(p || "").replace(/\D/g, ""); },
  waLink(phone, msg) {
    let d = U.phoneDigits(phone);
    if (d && d.length <= 11 && !d.startsWith("55")) d = "55" + d;
    return "https://wa.me/" + d + (msg ? "?text=" + encodeURIComponent(msg) : "");
  },
  // substitui {nome}, {valor}, etc.
  fillTemplate(tpl, vars) {
    return String(tpl || "").replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
  },

  /* ---------- DOM ---------- */
  $(sel, root) { return (root || document).querySelector(sel); },
  $$(sel, root) { return Array.from((root || document).querySelectorAll(sel)); },
  esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  },
  el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  },

  debounce(fn, ms) {
    let t = null;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  },

  sortBy(arr, fn, desc) {
    return arr.slice().sort((a, b) => {
      const va = fn(a), vb = fn(b);
      if (va < vb) return desc ? 1 : -1;
      if (va > vb) return desc ? -1 : 1;
      return 0;
    });
  },

  sum(arr, fn) { return arr.reduce((t, x) => t + (fn ? fn(x) : x || 0), 0); },

  groupBy(arr, fn) {
    const g = {};
    for (const x of arr) { const k = fn(x); (g[k] = g[k] || []).push(x); }
    return g;
  },

  clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },

  distKm(lat1, lng1, lat2, lng2) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },

  downloadFile(name, content, mime) {
    const blob = new Blob([content], { type: mime || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 500);
  },

  csvCell(v) {
    v = String(v == null ? "" : v);
    return /[";\n,]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  },
};
