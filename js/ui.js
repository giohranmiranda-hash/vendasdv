/* ICE SISTEMA — componentes de UI: modal, toast, confirm, helpers de formulário */
"use strict";

const UI = {
  toast(msg, kind) {
    const root = U.$("#toast-root");
    const t = U.el("div", { class: "toast " + (kind || "") }, U.esc(msg));
    root.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; }, 2600);
    setTimeout(() => t.remove(), 3000);
  },

  modal(html, opts) {
    opts = opts || {};
    const root = U.$("#modal-root");
    root.innerHTML = `<div class="modal-back"></div><div class="modal" role="dialog">${html}</div>`;
    root.classList.add("on");
    const close = () => { root.classList.remove("on"); root.innerHTML = ""; if (opts.onClose) opts.onClose(); };
    U.$(".modal-back", root).addEventListener("click", () => { if (!opts.sticky) close(); });
    root._close = close;
    return { root, close, el: U.$(".modal", root) };
  },
  closeModal() { const r = U.$("#modal-root"); if (r._close) r._close(); },

  confirm(msg, onYes, opts) {
    opts = opts || {};
    const m = UI.modal(`
      <h3>${U.esc(opts.title || "Confirmar")}</h3>
      <p>${U.esc(msg)}</p>
      <div class="m-actions">
        <button class="btn" data-a="no">Cancelar</button>
        <button class="btn ${opts.danger ? "danger" : "primary"}" data-a="yes">${U.esc(opts.yes || "Confirmar")}</button>
      </div>`);
    U.$('[data-a="no"]', m.el).onclick = m.close;
    U.$('[data-a="yes"]', m.el).onclick = () => { m.close(); onYes(); };
  },

  // campo <select> de opções
  selectHtml(id, options, value, extra) {
    return `<select id="${id}" ${extra || ""}>` + options.map((o) => {
      const v = typeof o === "object" ? o.value : o;
      const l = typeof o === "object" ? o.label : o;
      return `<option value="${U.esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${U.esc(l)}</option>`;
    }).join("") + "</select>";
  },

  monthNavHtml(ym) {
    return `<div class="month-nav">
      <button class="btn small" data-mnav="-1">‹</button>
      <div class="m-label">${U.esc(U.monthLabel(ym))}</div>
      <button class="btn small" data-mnav="1">›</button>
    </div>`;
  },
  bindMonthNav(container, get, set) {
    U.$$("[data-mnav]", container).forEach((b) => {
      b.onclick = () => { set(U.shiftMonth(get(), Number(b.dataset.mnav))); };
    });
  },

  emptyHtml(icon, text, cta) {
    return `<div class="empty"><div class="e-icon">${icon}</div><div>${U.esc(text)}</div>${cta || ""}</div>`;
  },

  itemName(itemId) {
    const it = App.state.catalog.find((c) => c.id === itemId);
    return it ? it.name : "(item removido)";
  },
  itemColor(itemId) {
    const it = App.state.catalog.find((c) => c.id === itemId);
    return it && it.color ? it.color : "#888";
  },
  activeItems() { return App.state.catalog.filter((c) => !c.archived); },

  // contador animado nos KPIs: <div class="k-value" data-countup="1234.5" data-fmt="money">
  animateCounters(root) {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    U.$$("[data-countup]", root).forEach((el) => {
      const target = parseFloat(el.dataset.countup) || 0;
      const fmt = el.dataset.fmt || "num";
      const render = (v) => {
        el.textContent = fmt === "money" ? U.money(v) : fmt === "pct" ? U.pct(v) : U.num(v, fmt === "int" ? 0 : 2);
      };
      const t0 = performance.now(), dur = 650;
      const step = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        const ease = 1 - Math.pow(1 - p, 3);
        render(target * ease);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  },

  itemsSummary(items) {
    return (items || []).map((i) => `${U.num(i.qty, 2)}× ${UI.itemName(i.itemId)}`).join(", ");
  },
};
