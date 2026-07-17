// ui.js — Formatage (€, dates, %) + petits graphiques SVG dessinés à la main.
// Aucune dépendance externe → fonctionne 100 % hors-ligne.

import { getSettings } from './store.js';

// --- Formatage -----------------------------------------------------------

export function fmtMoney(n, { sign = false } = {}) {
  const s = getSettings();
  const value = Number(n) || 0;
  const str = new Intl.NumberFormat(s.locale, {
    style: 'currency',
    currency: s.currency,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
  if (sign) return (value < 0 ? '−' : '+') + ' ' + str;
  return value < 0 ? '− ' + str : str;
}

export function fmtCompact(n) {
  const s = getSettings();
  return new Intl.NumberFormat(s.locale, {
    style: 'currency',
    currency: s.currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(Number(n) || 0);
}

export function fmtPct(n, digits = 1) {
  const v = Number(n) || 0;
  return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(digits) + ' %';
}

export function fmtDate(iso) {
  if (!iso) return '';
  const s = getSettings();
  const d = new Date(iso + 'T00:00:00');
  return new Intl.DateTimeFormat(s.locale, { day: '2-digit', month: 'short' }).format(d);
}

export function fmtMonthLabel(month) {
  const s = getSettings();
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const str = new Intl.DateTimeFormat(s.locale, { month: 'long', year: 'numeric' }).format(d);
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function currentMonth() {
  return todayISO().slice(0, 7);
}

export function addMonths(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// --- DOM ------------------------------------------------------------------

// Fabrique d'éléments : el('div', { class:'x', onclick:fn }, [enfants|texte]).
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  return n;
}

// --- Graphique en anneau (donut) -----------------------------------------
// segments : [{ label, value, color }]
export function donutChart(segments, { size = 180, thickness = 26, centerLabel, centerSub } = {}) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const r = (size - thickness) / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'donut' });

  if (total <= 0) {
    svg.append(svgEl('circle', { cx, cy, r, fill: 'none', stroke: 'var(--track)', 'stroke-width': thickness }));
  } else {
    let offset = 0;
    segments.forEach((seg) => {
      const frac = Math.max(0, seg.value) / total;
      if (frac <= 0) return;
      const dash = frac * circ;
      const c = svgEl('circle', {
        cx, cy, r, fill: 'none', stroke: seg.color, 'stroke-width': thickness,
        'stroke-dasharray': `${dash} ${circ - dash}`,
        'stroke-dashoffset': -offset,
        transform: `rotate(-90 ${cx} ${cy})`,
        'stroke-linecap': 'butt',
      });
      const title = svgEl('title');
      title.textContent = `${seg.label} : ${fmtMoney(seg.value)}`;
      c.append(title);
      svg.append(c);
      offset += dash;
    });
  }

  if (centerLabel != null) {
    const t1 = svgEl('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', class: 'donut-center' });
    t1.textContent = centerLabel;
    svg.append(t1);
  }
  if (centerSub != null) {
    const t2 = svgEl('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', class: 'donut-sub' });
    t2.textContent = centerSub;
    svg.append(t2);
  }
  return svg;
}

// --- Histogramme (barres verticales) -------------------------------------
// bars : [{ label, value, color? }]
export function barChart(bars, { height = 160, color = 'var(--accent)' } = {}) {
  const wrap = el('div', { class: 'barchart' });
  const max = Math.max(1, ...bars.map((b) => b.value));
  bars.forEach((b) => {
    const h = Math.max(2, Math.round((b.value / max) * (height - 28)));
    const col = el('div', { class: 'barchart-col' }, [
      el('div', { class: 'barchart-val', text: b.value ? fmtCompact(b.value) : '' }),
      el('div', {
        class: 'barchart-bar',
        style: `height:${h}px;background:${b.color || color}`,
        title: `${b.label} : ${fmtMoney(b.value)}`,
      }),
      el('div', { class: 'barchart-label', text: b.label }),
    ]);
    wrap.append(col);
  });
  return wrap;
}

// --- Courbe (line/area) pour la projection -------------------------------
// series : [{ points:[{x,y}], color, fill? }] ; xLabels optionnel
export function lineChart(series, { width = 640, height = 220, xLabels = [], yFormat = fmtCompact } = {}) {
  const padL = 52, padR = 12, padT = 12, padB = 26;
  const w = width, h = height;
  const allY = series.flatMap((s) => s.points.map((p) => p.y));
  const allX = series.flatMap((s) => s.points.map((p) => p.x));
  const maxY = Math.max(1, ...allY);
  const maxX = Math.max(1, ...allX);
  const minX = Math.min(0, ...allX);
  const sx = (x) => padL + ((x - minX) / (maxX - minX || 1)) * (w - padL - padR);
  const sy = (y) => h - padB - (y / maxY) * (h - padT - padB);

  const svg = svgEl('svg', { viewBox: `0 0 ${w} ${h}`, class: 'linechart', preserveAspectRatio: 'none' });

  // Lignes de repère + graduations Y
  for (let i = 0; i <= 4; i++) {
    const y = padT + (i / 4) * (h - padT - padB);
    const val = maxY * (1 - i / 4);
    svg.append(svgEl('line', { x1: padL, y1: y, x2: w - padR, y2: y, class: 'grid' }));
    const t = svgEl('text', { x: padL - 8, y: y + 4, 'text-anchor': 'end', class: 'axis' });
    t.textContent = yFormat(val);
    svg.append(t);
  }

  series.forEach((s) => {
    const d = s.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.x)} ${sy(p.y)}`).join(' ');
    if (s.fill) {
      const area = `${d} L ${sx(s.points[s.points.length - 1].x)} ${sy(0)} L ${sx(s.points[0].x)} ${sy(0)} Z`;
      svg.append(svgEl('path', { d: area, fill: s.color, 'fill-opacity': 0.12, stroke: 'none' }));
    }
    svg.append(svgEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
  });

  // Étiquettes X : positionnées sur l'abscisse réelle des points de la 1re série.
  const labelPts = series[0] ? series[0].points : [];
  if (xLabels.length && labelPts.length) {
    xLabels.forEach((lbl, i) => {
      if (!lbl || !labelPts[i]) return;
      const x = sx(labelPts[i].x);
      const t = svgEl('text', { x, y: h - 8, 'text-anchor': 'middle', class: 'axis' });
      t.textContent = lbl;
      svg.append(t);
    });
  }
  return svg;
}

// Légende réutilisable : items = [{ label, color, value? }]
export function legend(items) {
  const wrap = el('ul', { class: 'legend' });
  items.forEach((it) => {
    wrap.append(el('li', {}, [
      el('span', { class: 'legend-dot', style: `background:${it.color}` }),
      el('span', { class: 'legend-label', text: it.label }),
      it.value != null ? el('span', { class: 'legend-val', text: it.value }) : null,
    ]));
  });
  return wrap;
}
