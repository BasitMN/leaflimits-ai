#!/usr/bin/env node
'use strict';
// Draws the figures of docs/LEAFLIMITS_FORKLARING_SV.md (Swedish beginner guide) as SVG and renders them to PNG.
//
//   FIG_MODULES=/dir/with/node_modules  FIG_OUT=/dir/for/png  node docs/figures/build-figures.js [figure names]
//
// FIG_MODULES needs @resvg/resvg-js and dejavu-fonts-ttf (npm install both). The drawing helpers are in lib.js.
const path = require('node:path');
const { C, Fig, T, R, B, D, L, A, badge, renderAll } = require('./lib');

const OUT = process.env.FIG_OUT || path.join(__dirname, 'out');

// ---------------------------------------------------------------------------------------------------------------------
function figOverview() {
    const f = new Fig(1000, 660);
    R(f, 505, 20, 340, 625, { fill: '#F7FAFB', stroke: C.accent, sw: 3, r: 16 });
    T(f, 675, 48, 'Node-RED   (port 1881)', { size: 18, bold: true, fill: C.accent });
    B(f, 20, 240, 190, 150, 'ESP32-S3', 'i växtlådan\nSHT31 + 2 × DS18B20\nskickar var 5:e sekund', { fill: C.warnFill, stroke: C.warn });
    B(f, 290, 240, 150, 150, 'Mosquitto', 'MQTT-broker\n"postkontoret"\nport 1884', { fill: C.purpleFill, stroke: C.purple });
    B(f, 525, 80, 290, 110, 'Flik 1: MQTT Validation', 'kontrollerar att\nmätvärdena är rimliga', { fill: C.fill });
    B(f, 525, 235, 290, 110, 'Flik 2: InfluxDB storage', 'sparar godkända\nmätvärden i databasen', { fill: C.fill });
    B(f, 525, 395, 290, 225, 'Flik 3: LeafLimits   (NY)', 'jämför mätvärden med\nväxtens gränser → larm\n\nAPI och appfiler (HTTP)\n\nfrågar AI om foton', { fill: C.okFill, stroke: C.ok, sw: 3, tfill: C.ok });
    B(f, 865, 235, 120, 110, 'InfluxDB', 'databas för\nmätvärden\nport 8087', { fill: C.grayFill, stroke: C.gray });
    B(f, 865, 80, 120, 110, 'Grafana', 'grafer\nport 3002', { fill: C.grayFill, stroke: C.gray });
    B(f, 865, 460, 120, 120, 'Claude AI', 'Anthropic\n(på internet)', { fill: C.purpleFill, stroke: C.purple, dash: '7 5' });
    B(f, 20, 470, 190, 130, 'LeafLimits-appen', 'i din mobil\neller dator', { fill: C.okFill, stroke: C.ok, tfill: C.ok });
    A(f, [[210, 315], [290, 315]], { label: 'raw\n(WiFi)', at: [250, 275] });
    A(f, [[440, 290], [478, 290], [478, 135], [525, 135]], { label: 'raw', at: [478, 215] });
    A(f, [[670, 190], [670, 235]], { label: 'validated', at: [722, 212] });
    A(f, [[815, 135], [832, 135], [832, 470], [815, 470]], { color: C.ok });
    A(f, [[832, 262], [815, 262]], { color: C.ok });
    L(f, 832, 205, 'validated', { fill: C.ok });
    A(f, [[815, 320], [865, 320]]);
    A(f, [[925, 235], [925, 190]]);
    A(f, [[525, 545], [210, 545]], { both: true, color: C.ok, label: 'HTTP-API + token', at: [368, 545] });
    A(f, [[815, 545], [865, 545]], { color: C.purple, label: 'foto', at: [840, 572] });
    A(f, [[525, 440], [365, 440], [365, 390]], { both: true, color: C.purple, dash: '7 5', label: 'gränser\n(retained)\noch larm', at: [440, 478] });
    return f.svg();
}

function figValidation() {
    const f = new Fig(1000, 1000);
    const cx = 290;
    B(f, cx - 130, 15, 260, 62, 'Nytt meddelande', 'i .../telemetry/raw', { fill: C.warnFill, stroke: C.warn, r: 30 });
    const steps = [
        { y: 165, q: 'Är det giltig JSON?', why: 'Underkänt:\ninvalid_json' },
        { y: 305, q: 'Stämmer device_id\nmed namnet i topicen?', why: 'Underkänt:\ndevice_id_mismatch' },
        { y: 445, q: 'Är sequence större än\nsist sedda (samma boot_id)?', why: 'Dubblett:\nkastas tyst' },
        { y: 715, q: 'Har sensorn status ok\noch finns ett tal?', why: 'Underkänt:\nsensor_read_error\n(eller invalid_value)' },
        { y: 855, q: 'Ligger värdet inom det\nplausibla intervallet?', why: 'Underkänt:\nout_of_plausible_range' }
    ];
    A(f, [[cx, 77], [cx, steps[0].y - 55]]);
    steps.forEach((s, i) => {
        D(f, cx, s.y, 300, 110, s.q);
        B(f, 610, s.y - 38, 250, 76, '', s.why, { fill: C.badFill, stroke: C.bad, ssize: 13, sfill: C.bad });
        A(f, [[cx + 150, s.y], [610, s.y]], { color: C.bad, label: 'nej', at: [cx + 185, s.y - 14], lcolor: C.bad });
    });
    A(f, [[cx, steps[0].y + 55], [cx, steps[1].y - 55]], { label: 'ja', at: [cx + 24, (steps[0].y + steps[1].y) / 2] });
    A(f, [[cx, steps[1].y + 55], [cx, steps[2].y - 55]], { label: 'ja', at: [cx + 24, (steps[1].y + steps[2].y) / 2] });
    B(f, cx - 150, 545, 300, 76, 'Kontrollera varje\nmätvärde för sig', '', { fill: C.fill, tsize: 15 });
    A(f, [[cx, steps[2].y + 55], [cx, 545]], { label: 'ja', at: [cx + 24, 523] });
    A(f, [[cx, 621], [cx, steps[3].y - 55]]);
    A(f, [[cx, steps[3].y + 55], [cx, steps[4].y - 55]], { label: 'ja', at: [cx + 24, 785] });
    B(f, cx - 150, 935, 300, 55, 'Publiceras på .../validated/…', '', { fill: C.okFill, stroke: C.ok, tfill: C.ok, r: 27, tsize: 15 });
    A(f, [[cx, steps[4].y + 55], [cx, 935]], { color: C.ok, label: 'ja', at: [cx + 24, 924], lcolor: C.ok });
    T(f, 735, 580, 'Varje mätvärde granskas för sig,\nså en trasig sensor stoppar\ninte de andra tre.', { size: 13, fill: C.gray, italic: true });
    return f.svg();
}

function figStates() {
    const f = new Fig(1000, 560);
    const ok = { x: 500, y: 300 }, hi = { x: 860, y: 300 }, lo = { x: 140, y: 300 }, un = { x: 500, y: 85 };
    const w = 170, h = 84;
    B(f, un.x - w / 2, un.y - h / 2, w, h, 'unknown', 'ingen gräns satt,\neller ny bedömning', { fill: C.grayFill, stroke: C.gray, r: 42 });
    B(f, ok.x - w / 2, ok.y - h / 2, w, h, 'ok', 'inom gränserna', { fill: C.okFill, stroke: C.ok, r: 42, tfill: C.ok, tsize: 19 });
    B(f, hi.x - w / 2, hi.y - h / 2, w, h, 'high', 'för högt', { fill: C.badFill, stroke: C.bad, r: 42, tfill: C.bad, tsize: 19 });
    B(f, lo.x - w / 2, lo.y - h / 2, w, h, 'low', 'för lågt', { fill: C.badFill, stroke: C.bad, r: 42, tfill: C.bad, tsize: 19 });
    A(f, [[un.x, un.y + h / 2], [ok.x, ok.y - h / 2]], { color: C.gray, label: 'första bedömningen\nutgår från ok', at: [ok.x + 105, 190] });
    // ok <-> high
    A(f, [[ok.x + w / 2, ok.y - 22], [hi.x - w / 2, hi.y - 22]], { color: C.bad, label: '3 mätvärden i rad över max\n→ LARM skickas', at: [680, 228], lcolor: C.bad });
    A(f, [[hi.x - w / 2, hi.y + 22], [ok.x + w / 2, ok.y + 22]], { color: C.ok, label: '2 i rad tillbaka (minus 2 % marginal)\n→ larmet släpps', at: [680, 372], lcolor: C.ok });
    // ok <-> low
    A(f, [[ok.x - w / 2, ok.y - 22], [lo.x + w / 2, lo.y - 22]], { color: C.bad, label: '3 i rad under min\n→ LARM', at: [320, 228], lcolor: C.bad });
    A(f, [[lo.x + w / 2, lo.y + 22], [ok.x - w / 2, ok.y + 22]], { color: C.ok, label: '2 i rad tillbaka\n→ larmet släpps', at: [320, 372], lcolor: C.ok });
    // high <-> low
    A(f, [[hi.x, hi.y + h / 2], [hi.x, 470], [lo.x, 470], [lo.x, lo.y + h / 2]], { color: C.bad, both: true, label: 'direkt mellan high och low: 3 mätvärden i rad åt andra hållet', at: [500, 470], lcolor: C.bad });
    T(f, 500, 525, 'Ett enstaka avvikande mätvärde ändrar aldrig tillståndet. Serien måste hålla i sig.', { size: 14, fill: C.gray, italic: true });
    return f.svg();
}

function figChart() {
    const f = new Fig(1000, 620);
    const X0 = 120, X1 = 940, Y0 = 90, Y1 = 400, vmin = 20.5, vmax = 25.5;
    const y = (v) => Y1 - ((v - vmin) / (vmax - vmin)) * (Y1 - Y0);
    T(f, 500, 32, 'Vattentemperatur, gräns 18 till 24 °C (min 18 ligger under bilden)', { size: 17, bold: true, fill: C.accent });
    for (let v = 21; v <= 25; v += 1) {
        f.add(`<line x1="${X0}" y1="${y(v)}" x2="${X1}" y2="${y(v)}" stroke="#E3E8EA" stroke-width="1"/>`);
        T(f, X0 - 12, y(v), String(v), { size: 13, anchor: 'end', fill: C.gray });
    }
    T(f, 34, (Y0 + Y1) / 2, '°C', { size: 14, fill: C.gray });
    f.add(`<line x1="${X0}" y1="${y(24)}" x2="${X1}" y2="${y(24)}" stroke="${C.bad}" stroke-width="3" stroke-dasharray="10 6"/>`);
    T(f, X0 + 6, y(24) - 14, 'max 24,0', { size: 13, bold: true, fill: C.bad, anchor: 'start' });
    f.add(`<line x1="${X0}" y1="${y(23.88)}" x2="${X1}" y2="${y(23.88)}" stroke="${C.warn}" stroke-width="2.5" stroke-dasharray="3 5"/>`);
    T(f, 300, y(23.88) + 17, 'marginal 23,88 (max minus 2 %)', { size: 12.5, fill: C.warn, anchor: 'start' });
    const vals = [21.0, 24.5, 24.6, 24.7, 24.0, 23.5, 23.4];
    const xs = vals.map((_, i) => 175 + i * 118);
    const states = [['ok', C.ok, C.okFill], ['ok\n(1 av 3)', C.ok, C.okFill], ['ok\n(2 av 3)', C.ok, C.okFill], ['HÖG\nLARM', C.bad, C.badFill], ['HÖG\n(marginal)', C.bad, C.badFill], ['HÖG\n(1 av 2)', C.bad, C.badFill], ['OK\nlarm släpps', C.ok, C.okFill]];
    f.add(`<polyline points="${xs.map((x, i) => `${x},${y(vals[i])}`).join(' ')}" fill="none" stroke="${C.blue}" stroke-width="3"/>`);
    vals.forEach((v, i) => {
        f.add(`<circle cx="${xs[i]}" cy="${y(v)}" r="7" fill="${states[i][1]}" stroke="#fff" stroke-width="2"/>`);
        T(f, xs[i], y(v) - 22, String(v).replace('.', ',').replace(/^(\d+)$/, '$1,0'), { size: 13, bold: true });
        T(f, xs[i], 428, String(i + 1), { size: 13, fill: C.gray });
        B(f, xs[i] - 50, 448, 100, 64, '', states[i][0], { fill: states[i][2], stroke: states[i][1], r: 10, ssize: 13, sfill: states[i][1] });
    });
    T(f, X0 - 8, 428, 'Nr', { size: 12, fill: C.gray, anchor: 'end' });
    T(f, X0 - 8, 480, 'Tillstånd', { size: 12, fill: C.gray, anchor: 'end' });
    B(f, xs[3] - 62, 56, 124, 30, '', 'LARM skickas', { fill: C.badFill, stroke: C.bad, ssize: 13, sfill: C.bad, r: 15 });
    f.add(`<line x1="${xs[3]}" y1="86" x2="${xs[3]}" y2="${y(24.7) - 34}" stroke="${C.bad}" stroke-width="2"/>`);
    B(f, xs[6] - 68, 140, 136, 30, '', 'larmet släpps', { fill: C.okFill, stroke: C.ok, ssize: 13, sfill: C.ok, r: 15 });
    f.add(`<line x1="${xs[6]}" y1="170" x2="${xs[6]}" y2="${y(23.4) - 34}" stroke="${C.ok}" stroke-width="2"/>`);
    T(f, 500, 570, 'Värde 5 (24,0) är inte över max, men ligger över marginalen 23,88, så det räknas fortfarande som för högt.\nFörst när två värden i rad är tillbaka innanför marginalen (nr 6 och 7) släpps larmet.', { size: 13.5, fill: C.gray, italic: true });
    return f.svg();
}

function figAi() {
    const f = new Fig(1000, 720);
    const lanes = [['Din mobil (appen)', 50, 220, C.okFill, C.ok], ['Node-RED (fliken LeafLimits)', 235, 505, C.fill, C.accent], ['Anthropic (Claude)', 520, 700, C.purpleFill, C.purple]];
    lanes.forEach(([n, y0, y1, fill, st]) => { f.add(`<rect x="10" y="${y0}" width="980" height="${y1 - y0 - 6}" rx="14" fill="${fill}" fill-opacity="0.55" stroke="${st}" stroke-width="1.5"/>`); T(f, 26, y0 + 18, n, { size: 14, bold: true, fill: st, anchor: 'start' }); });
    const bw = 160, bh = 100;
    const S = (cx, cy, n, title, sub, st = C.accent) => { B(f, cx - bw / 2, cy - bh / 2, bw, bh, title, sub, { fill: '#fff', stroke: st, tsize: 13, ssize: 11.5 }); badge(f, cx - bw / 2 + 4, cy - bh / 2 + 4, n, st); };
    S(100, 145, 1, 'Välj foto', 'kamera eller\ngalleri', C.ok);
    S(290, 145, 2, 'Kontrollera + krymp', 'bild, högst 25 MB,\nJPEG max 1024 px', C.ok);
    S(290, 360, 3, 'Node-RED tar emot', 'POST /suggest\nmed din token', C.accent);
    S(490, 360, 4, 'Kontroller', 'token, AI-nyckel,\nmax 20 per timme,\nfotoformat', C.accent);
    S(490, 610, 5, 'Claude tittar', 'på fotot och fyller\ni verktygsanropet', C.purple);
    S(690, 360, 6, 'Rensa svaret', 'klipp eller släng\nogiltiga gränser', C.accent);
    S(690, 145, 7, 'Visa förslaget', 'sidan Granska:\nväxt, säkerhet,\ngränser', C.ok);
    S(890, 145, 8, 'Du bestämmer', 'ändra och tryck\nSpara', C.ok);
    A(f, [[180, 145], [210, 145]], { color: C.ok });
    A(f, [[290, 195], [290, 310]], { label: 'foto', at: [322, 250] });
    A(f, [[370, 360], [410, 360]]);
    A(f, [[490, 410], [490, 560]], { color: C.purple, label: 'foto + instruktion\n(HTTPS)', at: [585, 445], lcolor: C.purple });
    A(f, [[570, 610], [840, 610], [840, 372], [770, 372]], { color: C.purple, label: 'svar med\nfasta fält', at: [840, 560], lcolor: C.purple });
    A(f, [[690, 310], [690, 195]], { label: 'förslag', at: [726, 250] });
    A(f, [[770, 145], [810, 145]], { color: C.ok });
    f.add('');
    return f.svg();
}

function figPubSub() {
    const f = new Fig(1000, 560);
    R(f, 315, 18, 370, 520, { fill: C.purpleFill, stroke: C.purple, sw: 3, r: 16 });
    T(f, 500, 44, 'Mosquitto: brevlådorna (topics)', { size: 16, bold: true, fill: C.purple });
    const topics = [
        [95, 'microhydros/…/telemetry/raw'], [180, 'microhydros/…/telemetry/validated/…'], [265, 'microhydros/…/telemetry/rejected'],
        [370, 'microhydros/…/limits/config\n(retained: sparas)'], [470, 'microhydros/…/limits/alert']
    ];
    topics.forEach(([cy, t]) => B(f, 340, cy - 28, 320, 56, '', t, { fill: '#fff', stroke: C.purple, ssize: 13, sfill: C.ink, r: 8 }));
    const N = (x, cy, t, col = C.accent, fill = C.fill, dash) => B(f, x, cy - 30, 190, 60, t, '', { fill, stroke: col, tsize: 14, dash });
    // publishers (left)
    N(15, 95, 'ESP32', C.warn, C.warnFill);
    N(15, 222, 'Flik Validation', C.accent, C.fill);
    N(15, 420, 'Flik LeafLimits', C.ok, C.okFill);
    // subscribers (right)
    N(795, 95, 'Flik Validation', C.accent, C.fill);
    N(795, 195, 'Flik Storage', C.accent, C.fill);
    N(795, 300, 'Flik LeafLimits', C.ok, C.okFill);
    N(795, 470, 'ingen lyssnar än', C.gray, C.grayFill, '6 4');
    T(f, 110, 160, 'lägger brev\n(publish)', { size: 12, fill: C.gray, italic: true });
    T(f, 890, 30, 'hämtar brev\n(subscribe)', { size: 12, fill: C.gray, italic: true });
    A(f, [[205, 95], [340, 95]], { color: C.warn });
    A(f, [[205, 210], [270, 210], [270, 180], [340, 180]]);
    A(f, [[205, 234], [270, 234], [270, 265], [340, 265]], { color: C.bad });
    A(f, [[205, 408], [270, 408], [270, 370], [340, 370]], { color: C.ok });
    A(f, [[205, 432], [270, 432], [270, 470], [340, 470]], { color: C.ok });
    A(f, [[660, 95], [795, 95]]);
    A(f, [[660, 195], [795, 195]]);
    A(f, [[660, 165], [730, 165], [730, 290], [795, 290]], { color: C.ok });
    A(f, [[660, 370], [730, 370], [730, 315], [795, 315]], { color: C.ok });
    A(f, [[660, 470], [795, 470]], { color: C.gray, dash: '6 4' });
    return f.svg();
}

function phone(f, x, label, sub, body, tab) {
    const w = 210, h = 520, y = 60;
    T(f, x + w / 2, 22, label, { size: 15, bold: true, fill: C.accent });
    T(f, x + w / 2, 42, sub, { size: 12, fill: C.gray });
    f.add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="26" fill="#F5F7F6" stroke="#1B2B34" stroke-width="4"/>`);
    T(f, x + 16, y + 30, 'LeafLimits', { size: 14, bold: true, anchor: 'start' });
    body(f, x + 12, y + 56, w - 24);
    f.add(`<rect x="${x + 4}" y="${y + h - 52}" width="${w - 8}" height="48" rx="0" fill="#fff" stroke="#D6DDD9" stroke-width="1"/>`);
    ['Current', 'Photo', 'Settings'].forEach((t, i) => {
        const cx = x + 4 + (w - 8) / 6 + i * (w - 8) / 3;
        T(f, cx, y + h - 28, t, { size: 12, bold: i === tab, fill: i === tab ? C.ok : C.gray });
        if (i === tab) f.add(`<rect x="${cx - 26}" y="${y + h - 52}" width="52" height="4" fill="${C.ok}"/>`);
    });
}
const card = (f, x, y, w, h, fill = '#fff', stroke = '#D6DDD9') => f.add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`);
const btn = (f, x, y, w, label, primary, size = 11.5) => { f.add(`<rect x="${x}" y="${y}" width="${w}" height="30" rx="9" fill="${primary ? C.ok : '#fff'}" stroke="${primary ? C.ok : '#C5CDC9'}" stroke-width="1.5"/>`); T(f, x + w / 2, y + 15, label, { size, bold: true, fill: primary ? '#fff' : C.ink }); };
const chip = (f, x, y, label, col, fill) => { f.add(`<rect x="${x}" y="${y}" width="${label.length * 6.6 + 14}" height="18" rx="9" fill="${fill}"/>`); T(f, x + (label.length * 6.6 + 14) / 2, y + 9, label, { size: 10.5, bold: true, fill: col }); };

function figScreens() {
    const f = new Fig(1000, 650);
    phone(f, 20, 'Current', '(Aktuellt)', (g, x, y, w) => {
        card(g, x, y, w, 96); T(g, x + 8, y + 16, 'Fig (Ficus carica)', { size: 12.5, bold: true, anchor: 'start' });
        T(g, x + 8, y + 36, 'Limits suggested by AI\nand confirmed by you', { size: 10, fill: C.gray, anchor: 'start' });
        btn(g, x + 8, y + 58, 84, 'Take a photo', true, 10); btn(g, x + 96, y + 58, 82, 'Edit by hand', false, 10);
        [['Water temperature', '24.1 °C', 'Limit 18 to 24', 'Too high', C.bad, C.badFill], ['Air temperature, inside', '24.5 °C', 'Limit 18 to 30', 'In range', C.ok, C.okFill], ['Humidity, inside', '58.5 %', 'Limit 40 to 60', 'In range', C.ok, C.okFill], ['Air temperature, outside', '24.8 °C', 'Limit 10 to 35', 'In range', C.ok, C.okFill]].forEach((r, i) => {
            const yy = y + 108 + i * 72; card(g, x, yy, w, 66);
            T(g, x + 8, yy + 13, r[0], { size: 10.5, bold: true, anchor: 'start' }); T(g, x + 8, yy + 32, r[2], { size: 9.5, fill: C.gray, anchor: 'start' });
            T(g, x + w - 8, yy + 32, r[1], { size: 14, bold: true, anchor: 'end' }); chip(g, x + w - 8 - (r[3].length * 6.6 + 14), yy + 43, r[3], r[4], r[5]);
        });
    }, 0);
    phone(f, 265, 'Photo', '(Foto)', (g, x, y, w) => {
        card(g, x, y, w, 300); T(g, x + 8, y + 16, 'Add a photo of the plant', { size: 12, bold: true, anchor: 'start' });
        T(g, x + 8, y + 46, 'Take a new photo or choose\none you already have.', { size: 10, fill: C.gray, anchor: 'start' });
        btn(g, x + 8, y + 76, 88, 'Take a photo', true); btn(g, x + 100, y + 76, 78, 'Gallery', false);
        g.add(`<rect x="${x + 8}" y="${y + 120}" width="${w - 16}" height="100" rx="8" fill="#DDE7DF"/>`); T(g, x + w / 2, y + 168, 'photo preview', { size: 11, fill: C.gray, italic: true });
        T(g, x + 8, y + 232, 'photo.jpg · sent as about 210 KB', { size: 9.5, fill: C.gray, anchor: 'start' });
        btn(g, x + 8, y + 252, w - 16, 'Get suggested limits', true);
    }, 1);
    phone(f, 510, 'Review', '(Granska)', (g, x, y, w) => {
        card(g, x, y, w, 74, C.warnFill, C.warn); T(g, x + 8, y + 14, 'Suggested by AI', { size: 11.5, bold: true, anchor: 'start' });
        T(g, x + 8, y + 32, 'Fig (Ficus carica)\nconfidence 90 %', { size: 10, anchor: 'start' });
        [['Water temperature', '18', '24'], ['Air temp, inside', '18', '30'], ['Humidity, inside', '40', '60']].forEach((r, i) => {
            const yy = y + 84 + i * 84; card(g, x, yy, w, 76); T(g, x + 8, yy + 14, r[0], { size: 11, bold: true, anchor: 'start' });
            [[8, 'Min ' + r[1]], [w / 2 + 2, 'Max ' + r[2]]].forEach(([dx, t]) => { g.add(`<rect x="${x + dx}" y="${yy + 28}" width="${w / 2 - 12}" height="34" rx="7" fill="#fff" stroke="#C5CDC9"/>`); T(g, x + dx + 10, yy + 45, t, { size: 11, anchor: 'start' }); });
        });
        btn(g, x, y + 340, w, 'Save limits', true);
    }, 1);
    phone(f, 755, 'Settings', '(Inställningar)', (g, x, y, w) => {
        card(g, x, y, w, 250); T(g, x + 8, y + 16, 'Settings', { size: 12.5, bold: true, anchor: 'start' });
        T(g, x + 8, y + 42, 'LeafLimits access token', { size: 10.5, bold: true, anchor: 'start' });
        g.add(`<rect x="${x + 8}" y="${y + 54}" width="${w - 16}" height="30" rx="7" fill="#fff" stroke="#C5CDC9"/>`); T(g, x + 18, y + 69, '••••••••••••••••', { size: 12, anchor: 'start' });
        T(g, x + 8, y + 104, 'NOT your Anthropic API key.\nThat key stays on the server.', { size: 9.5, fill: C.bad, anchor: 'start' });
        T(g, x + 8, y + 148, 'Device', { size: 10.5, bold: true, anchor: 'start' });
        g.add(`<rect x="${x + 8}" y="${y + 160}" width="${w - 16}" height="30" rx="7" fill="#fff" stroke="#C5CDC9"/>`); T(g, x + 18, y + 175, 'esp32s3-01', { size: 12, anchor: 'start' });
        btn(g, x + 8, y + 204, 70, 'Save', true);
    }, 2);
    T(f, 500, 628, 'Appens text är på engelska. Under varje skärm står det svenska namnet.', { size: 13, fill: C.gray, italic: true });
    return f.svg();
}

function figDeploy() {
    const f = new Fig(1000, 560);
    const steps = [
        ['1', 'Säkerhetskopia', 'flows.json och nycklar\nsparade på mobilen', 'identisk (md5)'],
        ['2', 'Repetition på kopia', 'allt körs först mot en\nkopia av serverns flöden', '0 ändrade noder'],
        ['3', 'Kopiera appfilerna', 'in i Node-REDs\negen datamapp', '12 filer identiska'],
        ['4', 'Importera avstängd', 'fliken kommer in men\nkörs inte', '15 noder oförändrade'],
        ['5', 'Sätt token och nyckel', 'krypterade uppgifter,\nskrivs aldrig ut', 'inga hemligheter i filen'],
        ['6', 'Slå på LeafLimits', 'rätt token ger 200,\nfel token ger 401', 'API svarar rätt'],
        ['7', 'Slå på lagringsfliken', 'teamets flik, av misstag\navstängd sedan 18 sep', 'bara flaggan ändrad'],
        ['8', 'Test och bevis', 'märkt testenhet genom\nhela kedjan, raderad', '0 avbrott i MQTT']
    ];
    steps.forEach((s, i) => {
        const col = i % 4, row = Math.floor(i / 4), x = 20 + col * 245, y = 30 + row * 250;
        B(f, x, y, 220, 150, s[1], s[2], { fill: C.fill, tsize: 15 });
        badge(f, x + 18, y + 18, s[0]);
        B(f, x + 20, y + 158, 180, 36, '', '✓ ' + s[3], { fill: C.okFill, stroke: C.ok, ssize: 12.5, sfill: C.ok, r: 18 });
        if (col < 3) A(f, [[x + 220, y + 75], [x + 245, y + 75]]);
    });
    A(f, [[905, 224 + 10], [905, 258], [130, 258], [130, 275 - 4]], { color: C.gray, dash: '6 4' });
    T(f, 500, 528, 'Under hela inläggningen startades ingen container om och MQTT-anslutningen bröts aldrig.', { size: 14, fill: C.gray, italic: true });
    return f.svg();
}

function figSecrets() {
    const f = new Fig(1000, 560);
    B(f, 20, 60, 240, 300, 'Din mobil (appen)', 'Här finns bara:\n\nåtkomsttoken\n(48 tecken, sparas\ni webbläsaren)', { fill: C.okFill, stroke: C.ok, tfill: C.ok });
    B(f, 380, 60, 240, 300, 'Node-RED (fliken)', 'Krypterade uppgifter:\n\nåtkomsttoken (för att\nkontrollera appen)\n\nAPI-nyckel (för att\nanvända AI:n)', { fill: C.fill, stroke: C.accent });
    B(f, 740, 60, 240, 300, 'Anthropic (Claude)', 'Kontrollerar API-nyckeln,\ndebiterar ditt konto,\nsvarar med förslaget', { fill: C.purpleFill, stroke: C.purple, tfill: C.purple });
    A(f, [[260, 150], [380, 150]], { color: C.ok, label: 'Authorization:\nBearer token', at: [320, 112], lcolor: C.ok });
    A(f, [[620, 150], [740, 150]], { color: C.purple, label: 'x-api-key', at: [680, 122], lcolor: C.purple });
    A(f, [[740, 260], [620, 260]], { color: C.purple, label: 'förslag', at: [680, 236], lcolor: C.purple });
    A(f, [[380, 260], [260, 260]], { color: C.ok, label: 'svar', at: [320, 236], lcolor: C.ok });
    B(f, 20, 390, 400, 130, 'ALDRIG i appen', 'API-nyckeln (sk-ant-…). Appen nekar den,\ntar bort den om den redan ligger sparad\noch skickar den aldrig.', { fill: C.badFill, stroke: C.bad, tfill: C.bad, dash: '7 5', ssize: 13 });
    B(f, 450, 390, 530, 130, 'Bara för dig som administratör', 'Node-RED-redigerarens lösenord (port 1881) och serverns SSH-\nlösenord. De används för att logga in, aldrig av appen eller AI:n.\nHemliga filer ligger utanför git, och git ignorerar dem.', { fill: C.grayFill, stroke: C.gray, ssize: 13 });
    return f.svg();
}

function figSensors() {
    const f = new Fig(1000, 500);
    B(f, 30, 130, 230, 240, 'ESP32-S3', 'lilla datorn\ni växtlådan', { fill: C.warnFill, stroke: C.warn, tsize: 19 });
    T(f, 145, 328, 'GPIO 8 = SDA\nGPIO 9 = SCL\nGPIO 4 = 1-Wire', { size: 12.5, fill: C.ink });
    B(f, 620, 40, 350, 110, 'SHT31', 'mäter lufttemperatur och luftfuktighet\ninne i lådan  (I2C)', { fill: C.fill });
    A(f, [[260, 175], [620, 95]], { label: 'I2C-ledning', at: [440, 120] });
    f.add(`<line x1="260" y1="330" x2="440" y2="330" stroke="${C.ok}" stroke-width="6"/>`);
    f.add(`<line x1="440" y1="330" x2="440" y2="255" stroke="${C.ok}" stroke-width="4"/><line x1="440" y1="330" x2="440" y2="395" stroke="${C.ok}" stroke-width="4"/>`);
    L(f, 350, 306, '1-Wire\n(en ledning)', { fill: C.ok, size: 12.5 });
    B(f, 560, 200, 410, 110, 'DS18B20  probe A', 'ROM-adress: BE0000006DEFD428 (?)', { fill: C.warnFill, stroke: C.warn });
    B(f, 560, 340, 410, 110, 'DS18B20  probe B', 'ROM-adress: DA00000070118128 (?)', { fill: C.warnFill, stroke: C.warn });
    A(f, [[440, 255], [560, 255]], { color: C.ok });
    A(f, [[440, 395], [560, 395]], { color: C.ok });
    T(f, 765, 178, 'Vilken är VATTEN och vilken är LUFT?', { size: 15, bold: true, fill: C.bad });
    T(f, 500, 486, 'Varje probe har ett eget nummer (ROM-adress). Firmware måste veta vilket som hör till vatten och vilket till luft.', { size: 12.5, fill: C.gray, italic: true });
    return f.svg();
}

function figRetained() {
    const f = new Fig(1000, 640);
    const cols = [[150, 'Appen'], [500, 'Node-RED (LeafLimits)'], [850, 'Mosquitto (postkontoret)']];
    cols.forEach(([x, n]) => { B(f, x - 110, 14, 220, 46, n, '', { fill: C.fill, tsize: 14, r: 10 }); f.add(`<line x1="${x}" y1="60" x2="${x}" y2="620" stroke="#B9C4C8" stroke-width="2" stroke-dasharray="5 5"/>`); });
    const step = (y, x1, x2, txt, col = C.accent, n) => { A(f, [[x1, y], [x2, y]], { color: col, label: txt, at: [(x1 + x2) / 2, y - 20], lcolor: col }); if (n) badge(f, Math.min(x1, x2) - 22, y, n, col); };
    step(110, 150, 500, 'PUT limits (dina nya gränser)', C.ok, 1);
    step(190, 500, 850, 'publicera på .../limits/config\nmed flaggan "retained"', C.purple, 2);
    B(f, 738, 220, 224, 54, '', 'Mosquitto sparar meddelandet\nsom senaste "brevet"', { fill: C.purpleFill, stroke: C.purple, ssize: 12 });
    step(330, 500, 150, 'svar 200: sparat', C.ok, 3);
    B(f, 384, 380, 232, 46, '', 'Node-RED startar om', { fill: C.badFill, stroke: C.bad, ssize: 13, sfill: C.bad });
    step(470, 500, 850, 'prenumerera på .../limits/config', C.accent, 4);
    step(540, 850, 500, 'levererar det sparade brevet direkt', C.purple, 5);
    B(f, 384, 575, 232, 40, '', 'gränserna är tillbaka i minnet', { fill: C.okFill, stroke: C.ok, ssize: 13, sfill: C.ok });
    return f.svg();
}

const FIGS = {
    'fig-overview': figOverview, 'fig-validation': figValidation, 'fig-states': figStates, 'fig-chart': figChart,
    'fig-ai': figAi, 'fig-pubsub': figPubSub, 'fig-screens': figScreens, 'fig-deploy': figDeploy,
    'fig-secrets': figSecrets, 'fig-sensors': figSensors, 'fig-retained': figRetained
};

renderAll(FIGS, OUT, 2000, process.argv.slice(2));
