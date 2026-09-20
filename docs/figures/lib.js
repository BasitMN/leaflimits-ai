// Shared drawing helpers for the figure scripts (SVG text builders) and the PNG renderer (resvg, DejaVu Sans font).
//   FIG_MODULES=/dir/with/node_modules  (needs @resvg/resvg-js and dejavu-fonts-ttf)
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const C = {
    ink: '#1B2B34', accent: '#1F4E5F', blue: '#2A7F9E', fill: '#E8F1F4',
    ok: '#2E7D5B', okFill: '#DDF1E7', bad: '#B3372B', badFill: '#FBE3DF',
    warn: '#B36B00', warnFill: '#FFF0D6', gray: '#5A6770', grayFill: '#F1F3F4',
    purple: '#6B4E9B', purpleFill: '#EEE8F6', white: '#FFFFFF'
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

class Fig {
    constructor(w, h) { this.w = w; this.h = h; this.p = []; }
    add(s) { this.p.push(s); return this; }
    svg() {
        // resvg does not support orient="auto-start-reverse", so the start arrow is a mirrored second marker
        const markers = Object.values(C).filter((c) => c[0] === '#').map((c) =>
            `<marker id="m${c.slice(1)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="${c}"/></marker>` +
            `<marker id="s${c.slice(1)}" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M10 0 L0 5 L10 10 z" fill="${c}"/></marker>`).join('');
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.w}" height="${this.h}" viewBox="0 0 ${this.w} ${this.h}" font-family="DejaVu Sans">` +
            `<defs>${markers}</defs><rect width="${this.w}" height="${this.h}" fill="#FFFFFF"/>${this.p.join('')}</svg>`;
    }
}

// multi-line text centred on (x, y)
function T(f, x, y, s, o = {}) {
    const size = o.size || 14, lh = o.lh || size * 1.32, lines = String(s).split('\n'), n = lines.length;
    const y0 = y - ((n - 1) * lh) / 2;
    const tsp = lines.map((l, i) => `<tspan x="${x}" y="${(y0 + i * lh + size * 0.35).toFixed(1)}">${esc(l)}</tspan>`).join('');
    f.add(`<text font-size="${size}" font-weight="${o.bold ? 'bold' : 'normal'}" fill="${o.fill || C.ink}" text-anchor="${o.anchor || 'middle'}"${o.italic ? ' font-style="italic"' : ''}>${tsp}</text>`);
}
// rectangle with optional title and sub text
function R(f, x, y, w, h, o = {}) {
    f.add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.r ?? 12}" fill="${o.fill || C.white}" stroke="${o.stroke || C.accent}" stroke-width="${o.sw || 2}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}/>`);
}
function B(f, x, y, w, h, title, sub, o = {}) {
    R(f, x, y, w, h, o);
    const ts = o.tsize || 16, ss = o.ssize || 12.5, sl = String(sub || '').split('\n').filter((l, i, a) => sub !== undefined && sub !== '' && (l !== '' || i < a.length)).length;
    const subLines = sub ? String(sub).split('\n').length : 0;
    const titleH = title ? ts * 1.4 : 0, subH = subLines * ss * 1.32, top = y + (h - titleH - subH) / 2;
    if (title) T(f, x + w / 2, top + titleH / 2, title, { size: ts, bold: true, fill: o.tfill || C.ink });
    if (sub) T(f, x + w / 2, top + titleH + subH / 2, sub, { size: ss, fill: o.sfill || C.gray });
    void sl;
}
function D(f, cx, cy, w, h, label, o = {}) {
    f.add(`<polygon points="${cx},${cy - h / 2} ${cx + w / 2},${cy} ${cx},${cy + h / 2} ${cx - w / 2},${cy}" fill="${o.fill || C.warnFill}" stroke="${o.stroke || C.warn}" stroke-width="2"/>`);
    T(f, cx, cy, label, { size: o.size || 13.5, bold: false });
}
function mid(pts) { const a = pts[Math.floor((pts.length - 1) / 2)], b = pts[Math.floor((pts.length - 1) / 2) + 1] || a; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
function L(f, x, y, s, o = {}) {
    const size = o.size || 12, lh = size * 1.3, lines = String(s).split('\n');
    const w = Math.max(...lines.map((l) => l.length)) * size * 0.58 + 12, h = lines.length * lh + 6;
    f.add(`<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="6" fill="#fff" fill-opacity="0.94"/>`);
    T(f, x, y, s, { size, fill: o.fill || C.gray, bold: o.bold });
}
function A(f, pts, o = {}) {
    const col = o.color || C.accent, id = `m${col.slice(1)}`;
    const d = 'M' + pts.map((p) => p.join(' ')).join(' L');
    f.add(`<path d="${d}" fill="none" stroke="${col}" stroke-width="${o.w || 2.5}" stroke-linejoin="round"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''} marker-end="url(#${id})"${o.both ? ` marker-start="url(#s${col.slice(1)})"` : ''}/>`);
    if (o.label) { const at = o.at || mid(pts); L(f, at[0], at[1], o.label, { size: o.lsize, fill: o.lcolor || col }); }
}
function badge(f, x, y, n, col = C.accent) {
    f.add(`<circle cx="${x}" cy="${y}" r="13" fill="${col}"/>`); T(f, x, y, String(n), { size: 14, bold: true, fill: '#fff' });
}

let renderer = null;
function loadRenderer() {
    if (renderer) return renderer;
    const MODS = process.env.FIG_MODULES;
    if (!MODS) { console.error('set FIG_MODULES to a folder with node_modules that has @resvg/resvg-js and dejavu-fonts-ttf'); process.exit(1); }
    const req = createRequire(path.join(MODS, 'x.js'));
    const { Resvg } = req('@resvg/resvg-js');
    const dir = path.join(path.dirname(req.resolve('dejavu-fonts-ttf/package.json')), 'ttf');
    renderer = { Resvg, fontFiles: ['DejaVuSans.ttf', 'DejaVuSans-Bold.ttf', 'DejaVuSans-Oblique.ttf'].map((f) => path.join(dir, f)) };
    return renderer;
}
function renderPng(svg, width = 2000) {
    const { Resvg, fontFiles } = loadRenderer();
    return new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'DejaVu Sans' }, fitTo: { mode: 'width', value: width } }).render().asPng();
}
// renders every figure of a {name: function} map to OUT/<name>.svg and OUT/<name>.png; optional names on the command line select some
function renderAll(figs, out, width, only = []) {
    fs.mkdirSync(out, { recursive: true });
    for (const [name, fn] of Object.entries(figs)) {
        if (only.length && !only.includes(name)) continue;
        const svg = fn();
        fs.writeFileSync(path.join(out, name + '.svg'), svg);
        const png = renderPng(svg, width);
        fs.writeFileSync(path.join(out, name + '.png'), png);
        console.log(name + '.png  ' + Math.round(png.length / 1024) + ' KB');
    }
}

module.exports = { C, esc, Fig, T, R, B, D, L, A, mid, badge, renderPng, renderAll };
