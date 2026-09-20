#!/usr/bin/env node
'use strict';
// Adds, configures, enables, disables or removes the LeafLimits tab in a running Node-RED through its admin API,
// like pressing Import and Deploy in the editor, but with checks and a proof afterwards.
//
//   NR_URL=http://host:1881 NR_PASSWORD_FILE=/path/to/file node live-import.js <mode> [--dry-run]
//
// Modes (exactly one):
//   --status      read-only: is the tab there, is it enabled
//   (no mode)     import the tab DISABLED, using the existing MQTT broker node
//   --configure   set the tab's credential variables from files (see below). Does not enable it
//   --enable      enable the tab, then probe the API
//   --disable     disable the tab again (back to the original behaviour, tab stays imported)
//   --remove      rollback: delete the tab and its nodes
// Environment:
//   NR_USER            editor user (default: microhydros)
//   NR_PASSWORD_FILE   file with the editor password. Never printed, never on a command line
//   LL_TOKEN_FILE      file with the LeafLimits access token (for --configure; also used to probe after --enable)
//   LL_KEY_FILE        file with the Anthropic API key (optional, for --configure)
// Safety: every change uses the revision it read (409 instead of overwriting a concurrent change), deploys with the
// smallest scope, and afterwards proves that every node outside the LeafLimits tab is unchanged.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const BASE = (process.env.NR_URL || '').replace(/\/+$/, '');
const USER = process.env.NR_USER || 'microhydros';
const PW_FILE = process.env.NR_PASSWORD_FILE;
const DRY = process.argv.includes('--dry-run');
const MODES = ['--status', '--configure', '--enable', '--disable', '--remove'].filter((m) => process.argv.includes(m));
const MODE = MODES[0] || '--import';
const FLOW_FILE = path.join(__dirname, '..', '..', 'flows', 'leaflimits.json');
const LABEL = 'LeafLimits';

const say = (m) => console.log(m);
function die(m) { console.error('live-import: ' + m); process.exit(1); }
if (MODES.length > 1) die('choose only one mode: ' + MODES.join(', '));
if (!BASE) die('set NR_URL, for example NR_URL=http://127.0.0.1:1881');
if (!PW_FILE || !fs.existsSync(PW_FILE)) die('set NR_PASSWORD_FILE to a file containing the editor password');
const readSecret = (file) => fs.readFileSync(file, 'utf8').replace(/[\r\n]+$/, '');
const password = readSecret(PW_FILE);
if (!password) die('the password file is empty');

let token = '';
async function call(method, url, { body, headers = {}, auth = true } = {}) {
    const h = Object.assign({ 'Node-RED-API-Version': 'v2' }, headers);
    if (body !== undefined) h['Content-Type'] = 'application/json';
    if (auth && token) h.Authorization = 'Bearer ' + token;
    const res = await fetch(BASE + url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json; try { json = text ? JSON.parse(text) : undefined; } catch { /* not JSON */ }
    return { status: res.status, json, text };
}
async function login() {
    const r = await call('POST', '/auth/token', { auth: false, body: { client_id: 'node-red-admin', grant_type: 'password', scope: '*', username: USER, password } });
    if (r.status === 401 || r.status === 403) die('login refused: wrong user or password');
    if (r.status !== 200 || !r.json || !r.json.access_token) die('login failed, HTTP ' + r.status + ' ' + r.text.slice(0, 120));
    token = r.json.access_token;
}
async function logout() { if (token) await call('POST', '/auth/revoke', { body: { token } }).catch(() => {}); token = ''; }
async function readFlows() {
    const r = await call('GET', '/flows');
    if (r.status !== 200 || !r.json || !Array.isArray(r.json.flows)) die('could not read the flows, HTTP ' + r.status);
    return r.json;
}
async function deploy(rev, flows, type) {
    const r = await call('POST', '/flows', { headers: { 'Node-RED-Deployment-Type': type }, body: { rev, flows } });
    if (r.status === 409) { await logout(); die('the flows changed while this ran (revision conflict). Nothing was overwritten. Run it again.'); }
    if (r.status !== 200) { await logout(); die('deploy failed, HTTP ' + r.status + ' ' + r.text.slice(0, 200)); }
}
const summary = (flows) => flows.filter((n) => n.type === 'tab')
    .map((t) => `${t.label}${t.disabled ? ' (disabled)' : ''}: ${flows.filter((n) => n.z === t.id).length} nodes`).join(' | ');
const isLeaf = (n) => String(n.id).startsWith('ll_') || (n.type === 'tab' && n.label === LABEL);
const findTab = (flows) => flows.find((n) => n.type === 'tab' && n.label === LABEL);

function proveOthersUnchanged(before, after) {
    for (const n of before.filter((x) => !isLeaf(x))) assert.deepStrictEqual(after.find((x) => x.id === n.id), n, 'node ' + n.id + ' outside LeafLimits was changed');
}

async function probeApi() {
    const file = process.env.LL_TOKEN_FILE;
    if (!file) return say('(set LL_TOKEN_FILE to also probe the API)');
    const t = readSecret(file);
    const get = (u, tok) => fetch(BASE + u, { headers: tok ? { Authorization: 'Bearer ' + tok } : {} }).then((r) => r.status).catch(() => 0);
    say('Probe: API with the token -> HTTP ' + (await get('/leaflimits/api/limits/probe', t)) + ' (200 expected); with a wrong token -> HTTP ' +
        (await get('/leaflimits/api/limits/probe', 'wrong-' + t)) + ' (401 expected)');
    const bad = await fetch(BASE + '/leaflimits/api/suggest', { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.status).catch(() => 0);
    say('Probe: AI endpoint with an empty body -> HTTP ' + bad + ' (400 = AI key present, 503 = AI key missing; no AI request was made)');
}

(async () => {
    await login();
    say('Logged in as ' + USER + ' (' + BASE + ')');
    const before = await readFlows();
    say('Before: ' + before.flows.length + ' nodes. ' + summary(before.flows));
    const tab = findTab(before.flows);
    const present = before.flows.filter(isLeaf);

    if (MODE === '--status') {
        await logout();
        return say(tab ? `LeafLimits: imported (${present.length} items), ${tab.disabled ? 'DISABLED' : 'ENABLED'}.` : 'LeafLimits: not imported.');
    }

    if (MODE === '--remove') {
        if (!present.length) { await logout(); return say('Nothing to remove: LeafLimits is not in this Node-RED.'); }
        if (!tab) die('found LeafLimits nodes but no LeafLimits tab. Check the editor by hand.');
        if (DRY) { await logout(); return say('DRY RUN: would delete the tab "' + tab.label + '" and its ' + present.length + ' items.'); }
        const r = await call('DELETE', '/flow/' + encodeURIComponent(tab.id));
        if (r.status !== 204 && r.status !== 200) die('delete failed, HTTP ' + r.status + ' ' + r.text.slice(0, 160));
        const after = await readFlows();
        proveOthersUnchanged(before.flows, after.flows);
        assert.equal(after.flows.length, before.flows.filter((n) => !isLeaf(n)).length, 'unexpected leftovers');
        await logout();
        return say('Removed. After: ' + after.flows.length + ' nodes. ' + summary(after.flows) + '\nAll other nodes are unchanged.');
    }

    if (MODE === '--configure' || MODE === '--enable' || MODE === '--disable') {
        if (!tab) { await logout(); die('LeafLimits is not imported yet. Run without a mode first.'); }
        let next;
        if (MODE === '--configure') {
            const tf = process.env.LL_TOKEN_FILE, kf = process.env.LL_KEY_FILE;
            if (!tf || !fs.existsSync(tf)) { await logout(); die('set LL_TOKEN_FILE to a file with the access token'); }
            const credentials = { LEAFLIMITS_TOKEN: readSecret(tf) };
            if (credentials.LEAFLIMITS_TOKEN.length < 12) { await logout(); die('the access token is too short (use at least 12 characters)'); }
            if (kf) {
                if (!fs.existsSync(kf)) { await logout(); die('LL_KEY_FILE does not exist: ' + kf); }
                credentials.ANTHROPIC_API_KEY = readSecret(kf);
                if (!/^sk-ant-\S+$/.test(credentials.ANTHROPIC_API_KEY)) { await logout(); die('the key file does not hold an sk-ant- key'); }
            }
            say('Will set ' + Object.keys(credentials).join(' and ') + ' on the tab (values are never printed).');
            next = before.flows.map((n) => (n.id === tab.id ? Object.assign({}, n, { credentials }) : n));
        } else {
            const disabled = MODE === '--disable';
            if (Boolean(tab.disabled) === disabled) { await logout(); return say('The tab is already ' + (disabled ? 'disabled' : 'enabled') + '. Nothing to do.'); }
            say('Will ' + (disabled ? 'DISABLE' : 'ENABLE') + ' the LeafLimits tab.');
            next = before.flows.map((n) => (n.id === tab.id ? Object.assign({}, n, { disabled }) : n));
        }
        if (DRY) { await logout(); return say('DRY RUN: nothing was changed.'); }
        await deploy(before.rev, next, MODE === '--configure' ? 'nodes' : 'flows');
        const after = await readFlows();
        proveOthersUnchanged(before.flows, after.flows);
        assert.equal(after.flows.length, before.flows.length, 'unexpected node count');
        const t2 = findTab(after.flows);
        if (MODE === '--enable') assert.ok(!t2.disabled, 'the tab is still disabled');
        if (MODE === '--disable') assert.ok(t2.disabled === true, 'the tab is not disabled');
        await logout();
        say('Done. After: ' + summary(after.flows));
        say('Checked: every node outside the LeafLimits tab is unchanged.');
        if (MODE === '--enable') { await new Promise((r) => setTimeout(r, 2500)); await probeApi(); }
        return;
    }

    // ---- import ----
    if (present.length) { await logout(); die('LeafLimits is already in this Node-RED (' + present.length + ' items). Use --remove first if you want to redo it.'); }
    const incoming = JSON.parse(fs.readFileSync(FLOW_FILE, 'utf8'));
    const newTab = incoming.find((n) => n.type === 'tab');
    if (!newTab) die('the flow file has no tab');
    if (newTab.disabled !== true) die('the flow file must be disabled by default. Rebuild it with build.js.');
    const known = new Set(before.flows.map((n) => n.id));
    for (const n of incoming) known.add(n.id);
    const missing = new Set();
    for (const n of incoming) if (n.broker && !known.has(n.broker)) missing.add(n.broker);
    if (missing.size) { await logout(); die('the tab needs an MQTT broker node that does not exist here: ' + [...missing].join(', ')); }
    const ids = new Set(before.flows.map((n) => n.id));
    const clash = incoming.filter((n) => ids.has(n.id));
    if (clash.length) { await logout(); die('node ids already in use: ' + clash.slice(0, 3).map((n) => n.id).join(', ')); }
    say('Will add tab "' + newTab.label + '" (disabled) with ' + (incoming.length - 1) + ' nodes, using the existing broker node.');
    if (DRY) { await logout(); return say('DRY RUN: all checks passed. Nothing was changed.'); }

    await deploy(before.rev, [...before.flows, ...incoming], 'nodes');
    const after = await readFlows();
    for (const n of before.flows) assert.deepStrictEqual(after.flows.find((x) => x.id === n.id), n, 'EXISTING node ' + n.id + ' was changed');
    assert.equal(after.flows.length, before.flows.length + incoming.length, 'unexpected node count');
    const t = findTab(after.flows);
    assert.ok(t && t.disabled === true, 'the new tab is not disabled');
    assert.ok(t.env && t.env.some((e) => e.name === 'LEAFLIMITS_TOKEN' && e.type === 'cred'), 'the credential variables are missing');
    await logout();
    say('Imported. After: ' + after.flows.length + ' nodes. ' + summary(after.flows));
    say('Checked: all ' + before.flows.length + ' existing nodes are unchanged; the LeafLimits tab is disabled. Next: --configure, then --enable.');
})().catch((e) => { console.error('live-import: ' + (e && e.message)); process.exit(1); });
