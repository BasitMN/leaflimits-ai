#!/usr/bin/env node
'use strict';
// Draws the figures of docs/NODERED_FLOWS_GUIDE.md. The nodes are drawn to look like Node-RED nodes: coloured by type,
// an icon strip on the left, input and output ports, curved wires, tabs and groups.
//
//   FIG_MODULES=/dir/with/node_modules  FIG_OUT=/dir/for/png  node docs/figures/build-nodered-figures.js [figure names]
const path = require('node:path');
const { C, Fig, T, R, B, L, badge, renderAll } = require('./lib');

const OUT = process.env.FIG_OUT || path.join(__dirname, 'out');
C.wire = '#8C8C8C';

// ---- Node-RED look ----------------------------------------------------------------------------------------------------
const NRC = { mqtt: '#D8BFD8', function: '#FDD0A2', http: '#E7E7AE', debug: '#87A980', inject: '#A6BBCF', json: '#DEBD5C', catch: '#E49191', file: '#DEBD5C' };
function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 - k))));
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('');
}
function icon(f, kind, cx, cy, col) {
    switch (kind) {
        case 'function': T(f, cx, cy + 1, 'ƒ', { size: 20, bold: true, fill: col }); break;
        case 'mqtt': f.add(`<circle cx="${cx - 5}" cy="${cy}" r="2.6" fill="${col}"/><path d="M${cx} ${cy - 5} A5 5 0 0 1 ${cx} ${cy + 5}" fill="none" stroke="${col}" stroke-width="2"/><path d="M${cx + 4} ${cy - 8.5} A9 9 0 0 1 ${cx + 4} ${cy + 8.5}" fill="none" stroke="${col}" stroke-width="2"/>`); break;
        case 'http': f.add(`<circle cx="${cx}" cy="${cy}" r="8" fill="none" stroke="${col}" stroke-width="2"/><ellipse cx="${cx}" cy="${cy}" rx="3.4" ry="8" fill="none" stroke="${col}" stroke-width="1.6"/><line x1="${cx - 8}" y1="${cy}" x2="${cx + 8}" y2="${cy}" stroke="${col}" stroke-width="1.6"/>`); break;
        case 'debug': f.add(`<rect x="${cx - 8}" y="${cy - 8}" width="16" height="3.5" fill="${col}"/><rect x="${cx - 8}" y="${cy - 1.8}" width="16" height="3.5" fill="${col}"/><rect x="${cx - 8}" y="${cy + 4.5}" width="10" height="3.5" fill="${col}"/>`); break;
        case 'inject': f.add(`<rect x="${cx - 8}" y="${cy - 8}" width="16" height="16" rx="3" fill="none" stroke="${col}" stroke-width="2"/><path d="M${cx - 3} ${cy - 4} L${cx + 4} ${cy} L${cx - 3} ${cy + 4} z" fill="${col}"/>`); break;
        case 'json': T(f, cx, cy + 1, '{ }', { size: 14, bold: true, fill: col }); break;
        case 'catch': f.add(`<path d="M${cx} ${cy - 8} L${cx + 9} ${cy + 7} L${cx - 9} ${cy + 7} z" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>`); T(f, cx, cy + 3, '!', { size: 11, bold: true, fill: col }); break;
        case 'file': f.add(`<path d="M${cx - 6} ${cy - 8} H${cx + 2} L${cx + 7} ${cy - 3} V${cy + 8} H${cx - 6} z" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>`); break;
        default: break;
    }
}
// x = left edge, y = vertical centre of the node. Returns anchor points for wires.
function NODE(f, x, y, kind, label, o = {}) {
    const outs = o.outs === undefined ? 1 : o.outs, ins = o.ins === undefined ? 1 : o.ins;
    const h = outs > 1 ? 46 : 36, w = o.w || Math.max(140, Math.round(label.length * 7.1 + 62)), y0 = y - h / 2;
    const fill = NRC[kind], edge = shade(fill, 0.32), strip = shade(fill, 0.12);
    f.add(`<rect x="${x}" y="${y0}" width="${w}" height="${h}" rx="6" fill="${fill}" stroke="${edge}" stroke-width="1.6"${o.dash ? ' stroke-dasharray="5 4"' : ''}/>`);
    f.add(`<path d="M${x + 6} ${y0 + 0.8} H${x + 30} V${y0 + h - 0.8} H${x + 6} A5.2 5.2 0 0 1 ${x + 0.8} ${y0 + h - 6} V${y0 + 6} A5.2 5.2 0 0 1 ${x + 6} ${y0 + 0.8} z" fill="${strip}" opacity="0.8"/>`);
    icon(f, kind, x + 15, y, shade(fill, 0.62));
    T(f, x + 30 + (w - 30) / 2, y, label, { size: 13, fill: '#222' });
    const pts = { x, y, w, h, inPt: [x, y], outPt: (i = 0) => [x + w, outs > 1 ? y0 + (h * (i + 1)) / (outs + 1) : y] };
    if (ins) f.add(`<rect x="${x - 5}" y="${y - 5}" width="10" height="10" rx="3" fill="#D9D9D9" stroke="#8C8C8C"/>`);
    for (let i = 0; i < outs; i++) { const p = pts.outPt(i); f.add(`<rect x="${p[0] - 5}" y="${p[1] - 5}" width="10" height="10" rx="3" fill="#D9D9D9" stroke="#8C8C8C"/>`); }
    if (o.status) { f.add(`<circle cx="${x + 38}" cy="${y0 + h + 10}" r="4" fill="${o.status[1] || '#3FA34D'}"/>`); T(f, x + 47, y0 + h + 10, o.status[0], { size: 10.5, fill: C.gray, anchor: 'start' }); }
    return pts;
}
function WIRE(f, p1, p2, o = {}) {
    const col = o.color || C.wire, dx = Math.max(46, Math.abs(p2[0] - p1[0]) * 0.45);
    f.add(`<path d="M${p1[0] + 5} ${p1[1]} C${p1[0] + 5 + dx} ${p1[1]} ${p2[0] - 5 - dx} ${p2[1]} ${p2[0] - 10} ${p2[1]}" fill="none" stroke="${col}" stroke-width="${o.w || 3}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''} marker-end="url(#m${col.slice(1)})"/>`);
    if (o.label) L(f, o.at ? o.at[0] : (p1[0] + p2[0]) / 2, o.at ? o.at[1] : (p1[1] + p2[1]) / 2, o.label, { size: o.lsize || 11.5, fill: o.lcolor || C.gray });
}
function TAB(f, x, y, w, h, title) {
    f.add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#F6F6F6" stroke="#BDBDBD" stroke-width="2"/>`);
    f.add(`<path d="M${x} ${y + 30} V${y + 10} A10 10 0 0 1 ${x + 10} ${y} H${x + 30 + title.length * 7.6} V${y + 30} z" fill="#E6E6E6" stroke="#BDBDBD" stroke-width="2"/>`);
    T(f, x + 14, y + 15, title, { size: 13, bold: true, fill: '#444', anchor: 'start' });
}
function GROUP(f, x, y, w, h, title, col = C.gray) {
    f.add(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${col}" fill-opacity="0.07" stroke="${col}" stroke-width="1.8" stroke-dasharray="6 4"/>`);
    T(f, x + 12, y + 16, title, { size: 12.5, bold: true, fill: col, anchor: 'start' });
}
const note = (f, x, y, s, o = {}) => T(f, x, y, s, { size: o.size || 11.5, fill: o.fill || C.gray, anchor: o.anchor || 'start', italic: o.italic, bold: o.bold });

// ---- figures -----------------------------------------------------------------------------------------------------------
function figEditor() {
    const f = new Fig(900, 600);
    f.add('<rect x="10" y="10" width="880" height="500" rx="10" fill="#fff" stroke="#8F8F8F" stroke-width="2"/>');
    f.add('<path d="M10 20 A10 10 0 0 1 20 10 H880 A10 10 0 0 1 890 20 V56 H10 z" fill="#8F0000"/>');
    T(f, 40, 33, 'Node-RED', { size: 17, bold: true, fill: '#fff', anchor: 'start' });
    f.add('<rect x="700" y="18" width="98" height="30" rx="5" fill="#AD1625" stroke="#fff" stroke-width="1.5"/>'); T(f, 749, 33, 'Deploy', { size: 14, bold: true, fill: '#fff' });
    f.add('<rect x="820" y="20" width="46" height="26" rx="5" fill="#B33"/><rect x="832" y="27" width="22" height="3" fill="#fff"/><rect x="832" y="33" width="22" height="3" fill="#fff"/><rect x="832" y="39" width="22" height="3" fill="#fff"/>');
    // palette
    f.add('<rect x="10" y="56" width="190" height="454" fill="#F3F3F3" stroke="#D0D0D0"/>'); T(f, 105, 76, 'Palette (nodes)', { size: 12.5, bold: true, fill: '#555' });
    [['common', '#E6E0F8'], ['function', '#FDD0A2'], ['network', '#E7E7AE'], ['sequence', '#F0F0F0'], ['parser', '#DEBD5C']].forEach(([n, c], i) => {
        const y = 92 + i * 84; f.add(`<rect x="20" y="${y}" width="170" height="24" rx="4" fill="#E4E4E4"/>`); T(f, 30, y + 12, '▾ ' + n, { size: 11.5, fill: '#555', anchor: 'start' });
        f.add(`<rect x="34" y="${y + 32}" width="120" height="26" rx="5" fill="${c}" stroke="${shade(c, 0.3)}"/>`); T(f, 94, y + 45, i === 1 ? 'function' : i === 2 ? 'http request' : i === 0 ? 'inject / debug' : i === 3 ? 'delay' : 'json', { size: 11, fill: '#333' });
    });
    // workspace
    f.add('<rect x="200" y="56" width="500" height="454" fill="#fff"/>');
    ['MQTT Validation', 'InfluxDB storage', 'LeafLimits'].forEach((n, i) => { const x = 206 + i * 148; f.add(`<rect x="${x}" y="62" width="142" height="26" rx="4" fill="${i === 0 ? '#fff' : '#EAEAEA'}" stroke="#C8C8C8"/>`); T(f, x + 71, 75, n, { size: 11.5, bold: i === 0, fill: '#444' }); });
    f.add('<pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0 H0 V20" fill="none" stroke="#EDEDED"/></pattern><rect x="200" y="92" width="500" height="418" fill="url(#grid)"/>');
    const a = NODE(f, 226, 190, 'mqtt', 'Raw telemetry', { w: 150 }), b = NODE(f, 430, 190, 'function', 'Validate', { outs: 2, w: 120 }), c1 = NODE(f, 580, 150, 'mqtt', 'validated', { w: 106, outs: 0 }), c2 = NODE(f, 580, 232, 'mqtt', 'rejected', { w: 106, outs: 0 });
    WIRE(f, a.outPt(), b.inPt); WIRE(f, b.outPt(0), c1.inPt); WIRE(f, b.outPt(1), c2.inPt);
    // sidebar
    f.add('<rect x="700" y="56" width="190" height="454" fill="#F3F3F3" stroke="#D0D0D0"/>');
    ['info', 'debug', 'config'].forEach((n, i) => { f.add(`<rect x="${706 + i * 60}" y="62" width="56" height="24" rx="4" fill="${i === 1 ? '#fff' : '#E4E4E4'}" stroke="#C8C8C8"/>`); T(f, 734 + i * 60, 74, n, { size: 11.5, bold: i === 1, fill: '#444' }); });
    [['sensor', 'msg.payload : Object'], ['rejected', 'msg.payload : Object'], ['sensor', 'msg.payload : Object']].forEach((r, i) => { const y = 102 + i * 60; f.add(`<rect x="708" y="${y}" width="174" height="50" rx="4" fill="#fff" stroke="#DADADA"/>`); T(f, 716, y + 14, '20 Sep 07:24:06', { size: 10, fill: C.gray, anchor: 'start' }); T(f, 716, y + 34, r[1], { size: 11, fill: '#333', anchor: 'start' }); });
    // callouts
    badge(f, 186, 76, 1, C.bad); badge(f, 330, 420, 2, C.bad); badge(f, 672, 75, 3, C.bad); badge(f, 795, 440, 4, C.bad); badge(f, 884, 104, 5, C.bad); badge(f, 682, 33, 6, C.bad);
    const leg = [['1', 'Palette: the box of ready-made nodes. Drag a node onto the canvas.'], ['2', 'Canvas: where you place nodes and draw wires between them.'], ['3', 'Tabs: one tab = one flow (a group of nodes that belong together).'], ['4', 'Sidebar: info about the selected node, and the debug tab with messages.'], ['5', 'Debug messages: what the debug nodes print.'], ['6', 'Deploy button: saves and starts your changes. Menu (three lines): import, export, settings.']];
    leg.forEach((l, i) => { const y = 535 + i * 0; void y; });
    T(f, 450, 528, '① Palette   ② Canvas   ③ Tabs   ④ Sidebar   ⑤ Debug messages   ⑥ Deploy and menu', { size: 13.5, bold: true, fill: C.accent });
    T(f, 450, 556, 'Drag nodes from ① onto ②, connect them with wires, press ⑥ Deploy, and watch ⑤ for output.', { size: 13, fill: C.gray, italic: true });
    return f.svg();
}

function figMsg() {
    const f = new Fig(900, 470);
    const a = NODE(f, 20, 110, 'mqtt', 'mqtt in', { w: 130 }), b = NODE(f, 250, 110, 'json', 'json', { w: 110 }), c = NODE(f, 460, 110, 'function', 'function', { w: 130 }), d = NODE(f, 690, 110, 'debug', 'debug', { w: 120 });
    WIRE(f, a.outPt(), b.inPt); WIRE(f, b.outPt(), c.inPt); WIRE(f, c.outPt(), d.inPt);
    const card = (x, title, lines, col) => {
        f.add(`<rect x="${x}" y="190" width="200" height="150" rx="8" fill="#fff" stroke="${col}" stroke-width="2"/>`);
        T(f, x + 100, 210, title, { size: 12.5, bold: true, fill: col });
        f.add(`<rect x="${x + 10}" y="224" width="180" height="106" rx="5" fill="#F4F6F7"/>`);
        T(f, x + 18, 277, lines, { size: 11.5, fill: '#222', anchor: 'start', lh: 15.5 });
    };
    card(20, 'msg after mqtt in', 'msg = {\n  topic: ".../raw",\n  payload: "{\\"water\\":21.5}"\n}\n(payload is TEXT)', C.purple);
    card(250, 'msg after json', 'msg = {\n  topic: ".../raw",\n  payload: { water: 21.5 }\n}\n(payload is an OBJECT)', C.warn);
    card(460, 'msg after function', 'msg = {\n  topic: ".../raw",\n  payload: { water: 21.5,\n    state: "ok" }\n}', C.warn);
    card(690, 'what debug shows', 'the message is printed\nin the debug sidebar,\nnothing is passed on', C.ok);
    [[120, 20], [350, 250], [560, 460], [790, 690]].forEach(([cx]) => { void cx; });
    f.add(`<path d="M120 152 V188 M350 152 V188 M560 152 V188 M790 152 V188" stroke="${C.gray}" stroke-width="1.6" stroke-dasharray="4 4"/>`);
    T(f, 450, 370, 'Every node receives ONE message object (msg), may change it, and passes it on along its wires.', { size: 14, bold: true, fill: C.accent });
    T(f, 450, 398, 'msg.payload holds the data. msg.topic is the label of the data. A node can add its own fields.', { size: 13, fill: C.gray });
    T(f, 450, 426, 'The json node turns text into an object, so that a function can use msg.payload.water.', { size: 13, fill: C.gray });
    return f.svg();
}

function figTabs() {
    const f = new Fig(900, 640);
    B(f, 15, 16, 150, 64, 'ESP32', 'publishes readings', { fill: C.warnFill, stroke: C.warn, tsize: 14, ssize: 11.5 });
    B(f, 740, 112, 145, 60, 'Phone app', 'asks over HTTP', { fill: C.okFill, stroke: C.ok, tsize: 14, ssize: 11.5 });
    // broker band
    f.add(`<rect x="15" y="112" width="700" height="60" rx="10" fill="${C.purpleFill}" stroke="${C.purple}" stroke-width="2"/>`);
    T(f, 365, 132, 'Mosquitto (MQTT broker): the shared "post office"', { size: 13.5, bold: true, fill: C.purple });
    T(f, 365, 154, 'one config node "Local Mosquitto" = ONE connection, reused by every mqtt node', { size: 11.5, fill: C.purple });
    // tabs
    TAB(f, 15, 240, 280, 320, 'Tab 1: MQTT Validation'); TAB(f, 310, 240, 280, 320, 'Tab 2: InfluxDB storage'); TAB(f, 605, 240, 280, 320, 'Tab 3: LeafLimits');
    NODE(f, 30, 300, 'mqtt', 'Raw telemetry', { w: 160, ins: 0 }); NODE(f, 30, 350, 'function', 'Validate telemetry', { w: 200 }); NODE(f, 30, 400, 'mqtt', 'Publish validated', { w: 190, outs: 0 }); NODE(f, 30, 450, 'mqtt', 'Publish rejected', { w: 190, outs: 0 });
    NODE(f, 325, 300, 'mqtt', 'Validated telemetry', { w: 210, ins: 0 }); NODE(f, 325, 350, 'json', 'Parse validated JSON', { w: 215 }); NODE(f, 325, 400, 'function', 'Build InfluxDB write', { w: 215 }); NODE(f, 325, 450, 'http', 'InfluxDB write', { w: 170 });
    NODE(f, 620, 300, 'mqtt', 'Validated readings', { w: 195, ins: 0 }); NODE(f, 620, 350, 'function', 'Evaluate against limits', { w: 225 }); NODE(f, 620, 400, 'mqtt', 'Limits profile (retained)', { w: 235, ins: 0 }); NODE(f, 620, 450, 'http', 'HTTP API + app files', { w: 210, outs: 1 });
    T(f, 155, 525, 'checks every reading', { size: 12, fill: C.gray, italic: true }); T(f, 450, 525, 'saves accepted readings', { size: 12, fill: C.gray, italic: true }); T(f, 745, 525, 'compares with plant limits', { size: 12, fill: C.gray, italic: true });
    // arrows: down = the tab subscribes (gets messages), up = the tab publishes
    const AR = (x, y1, y2, col, label, dx = 42) => { f.add(`<path d="M${x} ${y1} V${y2}" fill="none" stroke="${col}" stroke-width="2.6" marker-end="url(#m${col.slice(1)})"/>`); if (label) L(f, x + dx, (y1 + y2) / 2, label, { size: 11, fill: col }); };
    AR(90, 80, 112, C.warn);
    AR(60, 172, 240, C.purple, 'raw');
    AR(250, 240, 172, C.bad, 'validated\nrejected');
    AR(350, 172, 240, C.purple, 'validated');
    AR(660, 172, 240, C.purple, 'validated\nconfig', -40);
    AR(715, 240, 172, C.ok, 'config\nalert', 32);
    AR(812, 172, 240, C.ok, '');
    L(f, 812, 206, 'HTTP', { size: 11.5, fill: C.ok, bold: true });
    T(f, 450, 588, 'Tabs never call each other. They only talk through topics on the broker.', { size: 14, bold: true, fill: C.accent });
    T(f, 450, 614, 'So a tab can be switched off, or a new one added, without touching the others.', { size: 13, fill: C.gray, italic: true });
    return f.svg();
}

function figTab1() {
    const f = new Fig(800, 340);
    TAB(f, 8, 8, 784, 324, 'Tab: MQTT Validation');
    const n1 = NODE(f, 30, 160, 'mqtt', 'Raw telemetry', { status: ['connected'] }), n2 = NODE(f, 250, 160, 'function', 'Validate telemetry', { outs: 2 });
    const n3 = NODE(f, 530, 110, 'mqtt', 'Publish validated', { outs: 0 }), n4 = NODE(f, 530, 210, 'mqtt', 'Publish rejected', { outs: 0 }), n5 = NODE(f, 530, 275, 'debug', 'Rejected debug', { outs: 0 });
    WIRE(f, n1.outPt(), n2.inPt); WIRE(f, n2.outPt(0), n3.inPt, { label: 'output 1: good readings', at: [420, 118], lcolor: C.ok }); WIRE(f, n2.outPt(1), n4.inPt, { label: 'output 2: rejected', at: [420, 200], lcolor: C.bad }); WIRE(f, n2.outPt(1), n5.inPt, { color: C.bad });
    badge(f, 30, 138, 1); badge(f, 250, 134, 2); badge(f, 530, 88, 3); badge(f, 530, 188, 4); badge(f, 530, 253, 5);
    note(f, 30, 205, 'listens to  microhydros/v1/devices/+/telemetry/raw', { size: 10.5 });
    note(f, 530, 148, 'topic comes from msg.topic', { size: 10.5 }); note(f, 530, 313, 'shows rejections in the debug sidebar', { size: 10.5 });
    return f.svg();
}

function figTab2() {
    const f = new Fig(900, 440);
    TAB(f, 8, 8, 884, 424, 'Tab: InfluxDB storage');
    GROUP(f, 24, 44, 852, 200, 'Production path (runs all the time)', C.ok);
    const n1 = NODE(f, 44, 100, 'mqtt', 'Validated telemetry', { status: ['connected'] }), n2 = NODE(f, 330, 100, 'json', 'Parse validated JSON'), n3 = NODE(f, 620, 100, 'function', 'Build InfluxDB write');
    const n4 = NODE(f, 330, 190, 'http', 'InfluxDB write'), n5 = NODE(f, 560, 190, 'debug', 'debug 1');
    WIRE(f, n1.outPt(), n2.inPt); WIRE(f, n2.outPt(), n3.inPt); WIRE(f, n3.outPt(), n4.inPt); WIRE(f, n4.outPt(), n5.inPt);
    badge(f, 44, 78, 1); badge(f, 330, 78, 2); badge(f, 620, 78, 3); badge(f, 330, 168, 4); badge(f, 560, 168, 5);
    note(f, 44, 150, 'topic  .../telemetry/validated/+', { size: 10.5 }); note(f, 330, 142, 'text  →  object', { size: 10.5 }); note(f, 660, 66, 'builds ONE line of text', { size: 10.5 });
    note(f, 330, 228, 'POST http://influxdb:8086/api/v2/write', { size: 10.5 }); note(f, 560, 228, 'shows the HTTP status (204 = saved)', { size: 10.5 });
    GROUP(f, 24, 262, 852, 152, 'Development only (started by hand with the button on the inject node)', C.warn);
    const t1 = NODE(f, 44, 340, 'inject', 'Test water temperature', { ins: 0 }), t2 = NODE(f, 330, 340, 'function', 'Create four test measurements');
    WIRE(f, t1.outPt(), t2.inPt);
    const o = t2.outPt();
    f.add(`<path d="M${o[0] + 5} ${o[1]} H${o[0] + 70}" stroke="${C.warn}" stroke-width="3" stroke-dasharray="6 4" marker-end="url(#m${C.warn.slice(1)})"/>`);
    note(f, o[0] + 82, o[1], 'wired into "Build InfluxDB write"', { size: 11, fill: C.warn });
    note(f, 44, 392, 'It sends four fake readings (device simulator-01). Not needed when real readings arrive.', { size: 10.5, italic: true });
    return f.svg();
}

function figLLEval() {
    const f = new Fig(900, 440);
    TAB(f, 8, 8, 884, 424, 'Tab: LeafLimits  (sections 1 and 2)');
    GROUP(f, 24, 44, 852, 130, '1. Evaluate readings against the limits', C.ok);
    const a = NODE(f, 44, 112, 'mqtt', 'Validated readings', { status: ['connected'] }), b = NODE(f, 300, 112, 'function', 'Evaluate against limits'), c = NODE(f, 640, 112, 'mqtt', 'Publish limit alert', { outs: 0 });
    WIRE(f, a.outPt(), b.inPt); WIRE(f, b.outPt(), c.inPt);
    L(f, 583, 146, 'only when the state changes', { size: 11, fill: C.bad });
    GROUP(f, 24, 196, 852, 130, '2. Limits storage (retained MQTT message)', C.purple);
    const d = NODE(f, 44, 264, 'mqtt', 'Limits profile (retained)', { status: ['connected'] }), e = NODE(f, 330, 264, 'function', 'Store profile in memory', { outs: 0 });
    WIRE(f, d.outPt(), e.inPt);
    // shared memory
    f.add(`<rect x="610" y="222" width="250" height="90" rx="10" fill="#fff" stroke="${C.blue}" stroke-width="2.4"/>`);
    T(f, 735, 242, 'Flow context (shared memory)', { size: 12, bold: true, fill: C.blue });
    T(f, 735, 279, 'll_profiles: the limits per device\nll_state: latest value + state', { size: 11.5, fill: '#222', lh: 18 });
    f.add(`<path d="M${e.x + e.w + 8} 264 H604" stroke="${C.blue}" stroke-width="2.6" stroke-dasharray="6 4" marker-end="url(#m${C.blue.slice(1)})"/>`); L(f, 545, 298, 'writes limits', { size: 11, fill: C.blue });
    f.add(`<path d="M440 132 C440 190 700 160 720 222" fill="none" stroke="${C.blue}" stroke-width="2.6" stroke-dasharray="6 4" marker-end="url(#m${C.blue.slice(1)})"/>`); L(f, 600, 178, 'reads limits, writes state', { size: 11, fill: C.blue });
    T(f, 450, 356, 'The two function nodes are not wired together. They share information through the flow context.', { size: 13.5, bold: true, fill: C.accent });
    T(f, 450, 384, 'The broker stores the limits (retained message). After a restart the mqtt in node receives them again,', { size: 12.5, fill: C.gray });
    T(f, 450, 404, 'and the second function refills the memory. Nothing else has to be reloaded.', { size: 12.5, fill: C.gray });
    return f.svg();
}

function figApi() {
    const f = new Fig(900, 600);
    TAB(f, 8, 8, 884, 584, 'Tab: LeafLimits  (section 3, the HTTP API)');
    GROUP(f, 24, 44, 852, 196, 'The pattern every route follows (GET limits, GET status)', C.ok);
    const a = NODE(f, 44, 118, 'http', 'GET limits', { ins: 0 }), b = NODE(f, 234, 118, 'function', 'Check token', { outs: 2 }), c = NODE(f, 444, 96, 'function', 'Read profile'), d = NODE(f, 654, 96, 'http', 'Reply', { outs: 0 });
    const d2 = NODE(f, 444, 192, 'http', 'Reply', { outs: 0, dash: true });
    WIRE(f, a.outPt(), b.inPt); WIRE(f, b.outPt(0), c.inPt); WIRE(f, c.outPt(), d.inPt); WIRE(f, b.outPt(1), d2.inPt, { color: C.bad });
    L(f, 395, 78, 'token ok', { size: 11, fill: C.ok }); L(f, 335, 200, 'wrong token → 401', { size: 11, fill: C.bad });
    note(f, 44, 156, 'a request arrives', { size: 10.5 }); note(f, 234, 160, 'output 1 continues,\noutput 2 answers 401', { size: 10.5 }); note(f, 444, 128, 'looks up the answer', { size: 10.5 }); note(f, 654, 128, 'sends it back', { size: 10.5 });
    GROUP(f, 24, 262, 852, 320, 'PUT limits: two outputs', C.purple);
    const e = NODE(f, 40, 350, 'http', 'PUT limits', { ins: 0 }), g = NODE(f, 200, 350, 'function', 'Check token', { outs: 2 }), h = NODE(f, 380, 350, 'function', 'Validate and save profile', { outs: 2 });
    const i = NODE(f, 665, 318, 'mqtt', 'Publish retained limits', { outs: 0, w: 200 }), j = NODE(f, 665, 392, 'http', 'Reply', { outs: 0 }), k = NODE(f, 380, 440, 'http', 'Reply', { outs: 0, dash: true });
    WIRE(f, e.outPt(), g.inPt); WIRE(f, g.outPt(0), h.inPt); WIRE(f, h.outPt(0), i.inPt); WIRE(f, h.outPt(1), j.inPt); WIRE(f, g.outPt(1), k.inPt, { color: C.bad });
    badge(f, 665, 296, 1, C.purple); badge(f, 665, 370, 2, C.purple); badge(f, 380, 328, 3, C.purple);
    L(f, 305, 412, 'wrong token → 401', { size: 11, fill: C.bad });
    note(f, 44, 496, '① output 1: the retained MQTT message (the durable copy of the limits)', { size: 11 });
    note(f, 44, 518, '② output 2: the HTTP answer, 200 with the saved profile (or 400 with a message)', { size: 11 });
    note(f, 44, 540, '③ this node checks min < max, the allowed ranges and the sensor names', { size: 11 });
    note(f, 560, 440, 'Every route is built like this:\nhttp in, Check token, a handler,\nhttp response.', { size: 11.5, italic: true });
    return f.svg();
}

function figSuggest() {
    const f = new Fig(900, 660);
    TAB(f, 8, 8, 884, 644, 'Tab: LeafLimits  (sections 3 and 4)');
    GROUP(f, 24, 44, 852, 300, 'POST suggest: the AI chain (all answers leave through ONE Reply node)', C.purple);
    const a = NODE(f, 30, 110, 'http', 'POST suggest', { ins: 0 }), b = NODE(f, 200, 110, 'function', 'Check token', { outs: 2 }), c = NODE(f, 400, 110, 'function', 'Prepare AI request', { outs: 2 }), d = NODE(f, 660, 110, 'http', 'Claude API');
    const e = NODE(f, 660, 190, 'function', 'Clean AI answer'), r = NODE(f, 660, 270, 'http', 'Reply', { outs: 0 });
    WIRE(f, a.outPt(), b.inPt); WIRE(f, b.outPt(0), c.inPt); WIRE(f, c.outPt(0), d.inPt); WIRE(f, d.outPt(), e.inPt); WIRE(f, e.outPt(), r.inPt);
    WIRE(f, b.outPt(1), r.inPt, { color: C.bad }); WIRE(f, c.outPt(1), r.inPt, { color: C.bad });
    const g = NODE(f, 40, 290, 'catch', 'AI request failed', { ins: 0 }), h = NODE(f, 280, 290, 'function', 'AI unreachable');
    WIRE(f, g.outPt(), h.inPt, { color: C.bad }); WIRE(f, h.outPt(), r.inPt, { color: C.bad });
    badge(f, 400, 88, 1, C.purple); badge(f, 660, 88, 2, C.purple); badge(f, 660, 168, 3, C.purple);
    note(f, 40, 322, 'red wires = error paths (401, 503, 400, 429, 502)', { size: 10.5, fill: C.bad });
    GROUP(f, 24, 364, 852, 276, 'The app files: /leaflimits and /leaflimits/:file', C.ok);
    const k1 = NODE(f, 40, 430, 'http', 'GET app', { ins: 0 }), k2 = NODE(f, 40, 490, 'http', 'GET app file', { ins: 0 }), l = NODE(f, 230, 460, 'function', 'Pick file', { outs: 2 });
    const m = NODE(f, 430, 430, 'file', 'Read file'), n = NODE(f, 640, 430, 'function', 'Set headers'), o = NODE(f, 640, 530, 'http', 'Reply', { outs: 0 });
    WIRE(f, k1.outPt(), l.inPt); WIRE(f, k2.outPt(), l.inPt); WIRE(f, l.outPt(0), m.inPt); WIRE(f, m.outPt(), n.inPt); WIRE(f, n.outPt(), o.inPt); WIRE(f, l.outPt(1), o.inPt, { color: C.bad });
    const q = NODE(f, 430, 590, 'catch', 'File missing', { ins: 0 }), s = NODE(f, 640, 590, 'function', 'Not found');
    WIRE(f, q.outPt(), s.inPt, { color: C.bad }); WIRE(f, s.outPt(), o.inPt, { color: C.bad });
    badge(f, 230, 438, 4, C.ok); badge(f, 430, 408, 5, C.ok); badge(f, 640, 408, 6, C.ok);
    note(f, 430, 462, 'reads the file from /data/leaflimits-app', { size: 10.5 }); note(f, 640, 462, 'content type + caching', { size: 10.5 });
    note(f, 230, 522, 'output 2: bad file name → 400', { size: 10.5, fill: C.bad });
    return f.svg();
}

function figLifecycle() {
    const f = new Fig(900, 470);
    B(f, 15, 105, 130, 70, 'Phone', 'browser or app', { fill: C.okFill, stroke: C.ok, tsize: 14, ssize: 11.5 });
    const a = NODE(f, 200, 140, 'http', 'http in', { w: 120, ins: 0 }), b = NODE(f, 360, 140, 'function', 'your nodes', { w: 140 }), c = NODE(f, 540, 140, 'http', 'http response', { w: 160, outs: 0 });
    WIRE(f, a.outPt(), b.inPt); WIRE(f, b.outPt(), c.inPt);
    f.add(`<path d="M145 140 L190 140" fill="none" stroke="${C.ok}" stroke-width="3" marker-end="url(#m${C.ok.slice(1)})"/>`); L(f, 168, 112, '1. request', { size: 12, fill: C.ok });
    f.add(`<path d="M700 140 C745 140 745 225 700 225 L80 225 L80 178" fill="none" stroke="${C.ok}" stroke-width="3" marker-end="url(#m${C.ok.slice(1)})"/>`); L(f, 400, 212, '4. answer', { size: 12, fill: C.ok });
    B(f, 200, 290, 300, 84, '', '2. http in creates the message and puts the\nrequest and the reply channel in it:\nmsg.req  and  msg.res', { fill: '#fff', stroke: C.accent, ssize: 12, sfill: '#222' });
    B(f, 520, 290, 360, 84, '', '3. http response uses msg.res to send msg.payload\nand msg.statusCode. If NOTHING sends a reply,\nthe phone waits until it gives up (a "hang").', { fill: C.warnFill, stroke: C.warn, ssize: 12, sfill: '#222' });
    const d = NODE(f, 200, 414, 'catch', 'catch', { w: 110, ins: 0 }); note(f, 330, 414, '← catches errors, so an error can still answer 502 or 404', { size: 12, fill: C.bad });
    T(f, 450, 458, '', {});
    return f.svg();
}

function figBuild() {
    const f = new Fig(900, 520);
    B(f, 15, 30, 230, 100, 'src/common.js', 'shared code: rules, limits,\nvalidation, helpers', { fill: C.fill, tsize: 14, ssize: 11.5 });
    B(f, 15, 160, 230, 130, 'src/*.fn.js', '12 small files, one per\nfunction node (evaluate,\nauth, put-limits, suggest ...)', { fill: C.fill, tsize: 14, ssize: 11.5 });
    B(f, 320, 60, 240, 190, 'build.js', 'for every function node:\n1. paste common.js on top\n2. wrap in try / catch\n3. check the syntax\nthen wire the nodes, check\nevery wire, write the file', { fill: C.warnFill, stroke: C.warn, tsize: 16, ssize: 12 });
    B(f, 640, 60, 245, 100, 'flows/leaflimits.json', 'the importable tab\n(39 items, disabled)', { fill: C.okFill, stroke: C.ok, tsize: 14, ssize: 11.5 });
    B(f, 640, 200, 245, 90, 'Import into Node-RED', 'editor Import, or\nlive-import.js', { fill: '#fff', stroke: C.accent, tsize: 14, ssize: 11.5 });
    B(f, 320, 330, 240, 84, 'Unit tests (54)', 'run the SAME function text\nwith fake msg and context', { fill: '#fff', stroke: C.blue, tsize: 14, ssize: 11.5 });
    B(f, 640, 330, 245, 84, 'Integration tests (13)', 'a real Node-RED, a real\nMQTT broker, a fake Claude', { fill: '#fff', stroke: C.blue, tsize: 14, ssize: 11.5 });
    const AR = (pts, col = C.accent) => f.add(`<path d="M${pts.map((p) => p.join(' ')).join(' L')}" fill="none" stroke="${col}" stroke-width="2.6" marker-end="url(#m${col.slice(1)})"/>`);
    AR([[245, 80], [320, 110]]); AR([[245, 225], [320, 200]]); AR([[560, 110], [640, 110]], C.ok); AR([[762, 160], [762, 200]], C.ok); AR([[440, 250], [440, 330]], C.blue); AR([[762, 290], [762, 330]], C.blue);
    T(f, 450, 460, 'You edit the small files in src/. You never edit the generated JSON by hand.', { size: 14, bold: true, fill: C.accent });
    T(f, 450, 488, 'That way the code you test is exactly the code that runs inside Node-RED.', { size: 13, fill: C.gray, italic: true });
    return f.svg();
}

function figEnv() {
    const f = new Fig(900, 500);
    const layers = [
        ['1. The node itself', 'a property of one node', C.okFill, C.ok], ['2. The group', 'variables set on a group of nodes', C.okFill, C.ok],
        ['3. The tab (flow)', 'LeafLimits: LEAFLIMITS_TOKEN, ANTHROPIC_API_KEY, ...', C.warnFill, C.warn], ['4. Global config', 'set once for all tabs', C.fill, C.accent],
        ['5. The process environment', 'Docker: INFLUXDB_URL, INFLUXDB_TOKEN, ...', C.purpleFill, C.purple]
    ];
    layers.forEach((l, i) => { B(f, 20 + i * 14, 20 + i * 76, 500 - i * 28, 66, l[0], l[1], { fill: l[2], stroke: l[3], tsize: 14, ssize: 11.5 }); });
    f.add(`<path d="M560 40 V400" stroke="${C.gray}" stroke-width="3" marker-end="url(#m${C.gray.slice(1)})"/>`); T(f, 600, 220, 'env.get("NAME")\nlooks from the top\ndown. The first\nmatch wins.', { size: 13, fill: C.accent, bold: true, anchor: 'start' });
    T(f, 450, 434, 'Storage tab: reads INFLUXDB_* from the process environment (set in the compose file).', { size: 12.5, fill: C.gray });
    T(f, 450, 456, 'LeafLimits tab: reads its secrets from the tab. Type "credential" stores them ENCRYPTED in flows_cred.json,', { size: 12.5, fill: C.gray });
    T(f, 450, 476, 'so they never appear in flows.json or in an export of the flow.', { size: 12.5, fill: C.gray });
    return f.svg();
}

function figInflux() {
    const f = new Fig(1000, 400);
    const xs = [10, 207, 404, 601, 798], W = 185, NW = 172;
    const nodes = [
        NODE(f, xs[0], 40, 'mqtt', 'Validated telemetry', { w: NW, ins: 0 }), NODE(f, xs[1], 40, 'json', 'Parse validated JSON', { w: NW }),
        NODE(f, xs[2], 40, 'function', 'Build InfluxDB write', { w: NW }), NODE(f, xs[3], 40, 'http', 'InfluxDB write', { w: NW }),
        NODE(f, xs[4], 40, 'debug', 'debug 1', { w: NW, outs: 0 })
    ];
    for (let i = 0; i < 4; i++) WIRE(f, nodes[i].outPt(0), nodes[i + 1].inPt);
    const cards = [
        ['1. text arrives', 'topic:\n.../validated/\nwater_temperature\n\npayload = TEXT\n{"device_id":\n"esp32s3-01",\n"value":24.7, ...}', C.purple, C.purpleFill],
        ['2. now an object', 'payload = OBJECT\n\n.device_id\n.measurement\n.value  (24.7)\n.unit, .sensor_id\n.timestamp\n.sequence, .boot_id', C.warn, C.warnFill],
        ['3. request built', 'method = "POST"\nurl = INFLUXDB_URL\n/api/v2/write?org=..\n&bucket=..&precision=ms\nheaders = Token ...\n\npayload = ONE LINE\nof text', C.accent, C.fill],
        ['4. sent', 'POST to InfluxDB\n\nanswer:\nstatusCode 204\npayload "" (empty)\n\n204 = "stored,\nnothing to say"', C.blue, C.fill],
        ['5. visible', 'the sidebar shows\nthe answer\n\nempty = success\n\nan error text =\nsomething is wrong', C.ok, C.okFill]
    ];
    cards.forEach((c, i) => {
        B(f, xs[i], 100, W, 200, c[0], c[1], { fill: c[3], stroke: c[2], tsize: 11.5, ssize: 10.5, sfill: '#222' });
    });
    T(f, 500, 335, 'The same message travels the whole way. Each node changes or adds fields.', { size: 13.5, bold: true, fill: C.accent });
    T(f, 500, 364, 'Only node 3 knows about InfluxDB. Node 4 just sends whatever node 3 prepared.', { size: 12.5, fill: C.gray, italic: true });
    return f.svg();
}

function figMemory() {
    const f = new Fig(900, 512);
    const rows = [
        ['Validation tab: flow context', 'last_seq_<device>: last sequence\nnumber seen (to drop duplicates)', 'Lost on restart', C.bad, C.badFill],
        ['LeafLimits tab: ll_profiles', 'the limits per device,\nkept in the memory of the tab', 'Restored: the retained MQTT\nmessage is delivered again', C.ok, C.okFill],
        ['LeafLimits tab: ll_state', 'latest value, unit and state per sensor', 'Empty for a few seconds,\nrefilled by the next readings', C.warn, C.warnFill],
        ['LeafLimits tab: ll_ai_hits', 'times of recent AI requests\n(the 20 per hour limit)', 'Reset on restart', C.bad, C.badFill],
        ['Mosquitto: retained message', 'microhydros/v1/devices/{id}/limits/config', 'Kept on the broker (its own storage)', C.ok, C.okFill],
        ['InfluxDB: bucket microhydros', 'every stored reading, with time stamp', 'Kept in the database volume', C.ok, C.okFill]
    ];
    T(f, 30, 24, 'Where it lives', { size: 13, bold: true, fill: C.accent, anchor: 'start' }); T(f, 320, 24, 'What it holds', { size: 13, bold: true, fill: C.accent, anchor: 'start' }); T(f, 640, 24, 'After a restart', { size: 13, bold: true, fill: C.accent, anchor: 'start' });
    rows.forEach((r, i) => {
        const y = 44 + i * 74;
        B(f, 15, y, 290, 62, r[0], '', { fill: '#fff', stroke: C.accent, tsize: 12.5 });
        B(f, 315, y, 310, 62, '', r[1], { fill: C.grayFill, stroke: C.gray, ssize: 11.5, sfill: '#222' });
        B(f, 635, y, 250, 62, '', r[2], { fill: r[4], stroke: r[3], ssize: 11.5, sfill: r[3] });
    });
    T(f, 450, 494, 'Flow context is fast memory inside Node-RED. It does not survive a restart, so anything important is stored elsewhere.', { size: 12.5, fill: C.gray, italic: true });
    return f.svg();
}

function figLife() {
    const f = new Fig(900, 600);
    const step = (y, n, title, code, col, fill, h = 74) => {
        f.add(`<rect x="38" y="${y}" width="842" height="${h}" rx="10" fill="${fill}" stroke="${col}" stroke-width="2"/>`);
        badge(f, 64, y + h / 2, n, col); T(f, 92, y + 20, title, { size: 13.5, bold: true, fill: col, anchor: 'start' });
        T(f, 92, y + 20 + 8 + (h - 30) / 2, code, { size: 11, fill: '#222', anchor: 'start', lh: 15 });
    };
    step(14, 1, 'ESP32 publishes (every 5 s)', 'topic .../telemetry/raw     {"device_id":"esp32s3-01","sequence":1042,\n"measurements":{"water_temperature_c":24.7,"internal_humidity_percent":58.0, ...}}', C.warn, C.warnFill);
    step(104, 2, 'Tab 1 (Validation) checks it and splits it into one message per sensor', 'topic .../telemetry/validated/water_temperature     {"measurement":"water_temperature","value":24.7,"unit":"celsius"}', C.accent, C.fill);
    f.add(`<path d="M38 141 H16 V238 H36" fill="none" stroke="${C.accent}" stroke-width="2.4" marker-end="url(#m${C.accent.slice(1)})"/><path d="M16 238 V318 H36" fill="none" stroke="${C.accent}" stroke-width="2.4" marker-end="url(#m${C.accent.slice(1)})"/>`);
    step(206, 3, 'Tab 2 (Storage) writes it to InfluxDB', 'sensor_reading,device_id=esp32s3-01,measurement_type=water_temperature,unit=celsius value=24.7 1789887848000', C.blue, C.fill, 64);
    step(286, 4, 'Tab 3 (LeafLimits) classifies it against the plant limits (18 to 24)', 'water 24.7 is above max: streak 1 of 3 ... streak 3 of 3  →  state high  →  alert on .../limits/alert', C.ok, C.okFill, 64);
    step(366, 5, 'Grafana draws it (from InfluxDB)', 'the "Current water temperature" panel and the history graph', C.gray, C.grayFill, 58);
    step(440, 6, 'The app asks for it every 5 s', 'GET /leaflimits/api/status/esp32s3-01  →  {"water_temperature":{"value":24.7,"state":"high","age_seconds":3}}', C.ok, C.okFill, 64);
    T(f, 450, 545, 'One reading, three different destinations: the database, the plant limits, and the phone.', { size: 14, bold: true, fill: C.accent });
    T(f, 450, 573, 'They all start from the same "validated" message, and none of them depends on the others.', { size: 13, fill: C.gray, italic: true });
    T(f, 450, 640, '', {});
    return f.svg();
}

const FIGS = {
    'nr-editor': figEditor, 'nr-msg': figMsg, 'nr-tabs': figTabs, 'nr-tab1': figTab1, 'nr-tab2': figTab2, 'nr-lleval': figLLEval, 'nr-api': figApi,
    'nr-suggest': figSuggest, 'nr-lifecycle': figLifecycle, 'nr-build': figBuild, 'nr-env': figEnv, 'nr-memory': figMemory, 'nr-influx': figInflux, 'nr-life': figLife
};
renderAll(FIGS, OUT, 1600, process.argv.slice(2));
