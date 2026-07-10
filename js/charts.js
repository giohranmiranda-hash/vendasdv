/* ICE SISTEMA — gráficos SVG leves, sem dependências */
"use strict";

const Charts = {
  // linha/área: series = [{x:label, y:number}]
  line(series, opts) {
    opts = opts || {};
    const W = opts.width || 600, H = opts.height || 200, P = 28;
    if (!series.length) return '<div class="chart-empty">Sem dados no período</div>';
    const ys = series.map((p) => p.y);
    let min = Math.min(0, ...ys), max = Math.max(0, ...ys);
    if (min === max) { max = min + 1; }
    const sx = (i) => P + (i * (W - P * 2)) / Math.max(1, series.length - 1);
    const sy = (v) => H - P - ((v - min) * (H - P * 2)) / (max - min);
    const pts = series.map((p, i) => sx(i).toFixed(1) + "," + sy(p.y).toFixed(1)).join(" ");
    const area = `${P},${sy(0).toFixed(1)} ${pts} ${sx(series.length - 1).toFixed(1)},${sy(0).toFixed(1)}`;
    const zero = sy(0).toFixed(1);
    const labels = series.map((p, i) => {
      if (series.length > 12 && i % Math.ceil(series.length / 10) !== 0) return "";
      return `<text x="${sx(i)}" y="${H - 6}" text-anchor="middle" class="ch-lbl">${U.esc(p.x)}</text>`;
    }).join("");
    const last = series[series.length - 1];
    return `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="none" role="img">
      <line x1="${P}" y1="${zero}" x2="${W - P}" y2="${zero}" class="ch-zero"/>
      <polygon points="${area}" class="ch-area"/>
      <polyline points="${pts}" class="ch-line" fill="none"/>
      <circle cx="${sx(series.length - 1)}" cy="${sy(last.y)}" r="4" class="ch-dot"/>
      ${labels}
    </svg>`;
  },

  // barras horizontais: rows = [{label, value, color?, hint?}]
  bars(rows, opts) {
    opts = opts || {};
    if (!rows.length) return '<div class="chart-empty">Sem dados</div>';
    const max = Math.max(...rows.map((r) => r.value), 0.0001);
    return '<div class="hbars">' + rows.map((r) => `
      <div class="hbar-row">
        <div class="hbar-label" title="${U.esc(r.label)}">${U.esc(r.label)}</div>
        <div class="hbar-track"><div class="hbar-fill" style="width:${((r.value / max) * 100).toFixed(1)}%${r.color ? ";background:" + U.esc(r.color) : ""}"></div></div>
        <div class="hbar-val">${U.esc(r.hint != null ? r.hint : U.num(r.value))}</div>
      </div>`).join("") + "</div>";
  },

  // donut: rows = [{label, value, color}]
  donut(rows, opts) {
    opts = opts || {};
    const size = opts.size || 140, R = size / 2, r = R * 0.62;
    const total = U.sum(rows, (x) => x.value);
    if (!total) return '<div class="chart-empty">Sem dados</div>';
    let a0 = -Math.PI / 2, paths = "";
    for (const row of rows) {
      const frac = row.value / total;
      const a1 = a0 + frac * Math.PI * 2;
      const large = frac > 0.5 ? 1 : 0;
      const p = (a) => `${(R + Math.cos(a) * (R - 2)).toFixed(2)},${(R + Math.sin(a) * (R - 2)).toFixed(2)}`;
      const q = (a) => `${(R + Math.cos(a) * r).toFixed(2)},${(R + Math.sin(a) * r).toFixed(2)}`;
      if (frac >= 0.999) {
        paths += `<circle cx="${R}" cy="${R}" r="${(R - 2 + r) / 2}" fill="none" stroke="${U.esc(row.color || "#888")}" stroke-width="${R - 2 - r}"/>`;
      } else {
        paths += `<path d="M ${p(a0)} A ${R - 2} ${R - 2} 0 ${large} 1 ${p(a1)} L ${q(a1)} A ${r} ${r} 0 ${large} 0 ${q(a0)} Z" fill="${U.esc(row.color || "#888")}"/>`;
      }
      a0 = a1;
    }
    const legend = rows.map((row) =>
      `<div class="dl-row"><span class="dl-dot" style="background:${U.esc(row.color || "#888")}"></span>
       <span class="dl-name">${U.esc(row.label)}</span>
       <span class="dl-val">${U.pct((row.value / total) * 100, 0)}</span></div>`).join("");
    return `<div class="donut-wrap"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${paths}</svg>
      <div class="donut-legend">${legend}</div></div>`;
  },
};
