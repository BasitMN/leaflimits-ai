'use strict';
// Integration test: a real Node-RED with the MQTT Validation flow and the LeafLimits tab, an in-process
// MQTT broker (aedes) and a fake Claude API. Nothing here touches a real server or a real API key.
//
//   LL_TEST_MODULES=/path/with/node_modules   (needs node-red 5.0.7, aedes and mqtt)
//   LL_TEST_APP_DIR=/path/to/built/app        (optional; a tiny fake app is used otherwise)
//   LL_TEST_TMP=/path/for/temp/files          (optional; default os.tmpdir())
//   node --test docker/node-red/leaflimits/test/integration.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');

const MODS = process.env.LL_TEST_MODULES;
if (!MODS) {
    test('integration test skipped: set LL_TEST_MODULES', { skip: true }, () => {});
    return;
}
const req = createRequire(path.join(MODS, 'x.js'));
const { Aedes } = req('aedes');
const mqtt = req('mqtt');
const { flows: leafFlows } = require('../build.js');

const MQTT_PORT = 18830, RED_PORT = 18800, AI_PORT = 18801;
const TOKEN = 'it-token';
const BASE = 'http://127.0.0.1:' + RED_PORT;
const T = 'microhydros/v1/devices/';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 15000, step = 100) {
    const end = Date.now() + ms;
    for (;;) {
        const v = await fn();
        if (v) return v;
        if (Date.now() > end) throw new Error('timed out waiting for condition: ' + fn.toString().slice(0, 120));
        await sleep(step);
    }
}

let tmp, appDir, userDir, broker, brokerServer, client, red, redLog = [], ai, aiMode = 'ok', aiLast = null;
const alerts = [], validated = [];

// ---- fake Claude API -------------------------------------------------------------------------
function startAi() {
    ai = http.createServer((rq, rs) => {
        let body = '';
        rq.on('data', (c) => (body += c));
        rq.on('end', () => {
            aiLast = { headers: rq.headers, body: body ? JSON.parse(body) : null, url: rq.url };
            if (aiMode === 'error500') { rs.writeHead(500, { 'content-type': 'application/json' }); return rs.end('{"error":"boom sk-leak"}'); }
            if (aiMode === 'garbage') { rs.writeHead(200, { 'content-type': 'application/json' }); return rs.end('{"content":[{"type":"text","text":"no tool"}]}'); }
            rs.writeHead(200, { 'content-type': 'application/json' });
            rs.end(JSON.stringify({ content: [{ type: 'tool_use', name: 'recommend_limits', input: {
                plant: 'Basil', confidence: 0.9, notes: 'Warm and humid.',
                limits: { water_temperature: { min: 18, max: 24 }, internal_humidity: { min: 40, max: 70 }, internal_temperature: { min: 30, max: 20 } }
            } }] }));
        });
    });
    return new Promise((r) => ai.listen(AI_PORT, '127.0.0.1', r));
}

// ---- Node-RED --------------------------------------------------------------------------------
function buildFlows() {
    const validation = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'flows', 'mqtt-validation.json'), 'utf8'));
    for (const n of validation) if (n.type === 'mqtt-broker') { n.broker = '127.0.0.1'; n.port = String(MQTT_PORT); }
    const leaf = JSON.parse(JSON.stringify(leafFlows));
    const tab = leaf.find((n) => n.type === 'tab');
    tab.disabled = false;
    tab.env = [
        { name: 'LEAFLIMITS_TOKEN', value: TOKEN, type: 'str' },
        { name: 'ANTHROPIC_API_KEY', value: 'sk-test-key', type: 'str' },
        { name: 'ANTHROPIC_MODEL', value: 'claude-sonnet-5', type: 'str' },
        { name: 'ANTHROPIC_API_URL', value: 'http://127.0.0.1:' + AI_PORT + '/v1/messages', type: 'str' },
        { name: 'SUGGEST_MAX_PER_HOUR', value: '5', type: 'num' },
        { name: 'LEAFLIMITS_APP_DIR', value: appDir, type: 'str' }
    ];
    return [...validation, ...leaf];
}

function startRed() {
    redLog = [];
    red = spawn(process.execPath, [path.join(MODS, 'node_modules', 'node-red', 'red.js'), '-u', userDir, '-s', path.join(userDir, 'settings.js')],
        { stdio: ['ignore', 'pipe', 'pipe'], cwd: userDir });
    for (const s of [red.stdout, red.stderr]) s.on('data', (d) => { for (const l of String(d).split('\n')) if (l.trim()) redLog.push(l); if (redLog.length > 300) redLog.shift(); });
}
async function waitRed() {
    await until(async () => {
        try { return (await fetch(BASE + '/leaflimits/api/limits/probe')).status === 401; } catch { return false; }
    }, 60000, 300);
    await until(() => redLog.some((l) => /Connected to broker/.test(l)), 30000, 200);
    await sleep(500);   // let the subscriptions settle
}
async function stopRed() {
    if (!red || red.exitCode !== null) return;
    const done = new Promise((r) => red.once('exit', r));
    red.kill('SIGTERM');
    await Promise.race([done, sleep(10000)]);
    if (red.exitCode === null) red.kill('SIGKILL');
}

// ---- helpers ---------------------------------------------------------------------------------
async function api(method, url, { token = TOKEN, body, raw, headers = {} } = {}) {
    const h = Object.assign({}, headers);
    if (token) h.Authorization = 'Bearer ' + token;
    let payload = raw;
    if (body !== undefined) { payload = JSON.stringify(body); h['Content-Type'] = 'application/json'; }
    const res = await fetch(BASE + url, { method, headers: h, body: payload });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: res.headers, text, json };
}
const seq = {};
function rawMsg(device, water) {
    seq[device] = (seq[device] || 0) + 1;
    return { schema_version: 1, device_id: device, boot_id: 'it-boot', sequence: seq[device], uptime_ms: seq[device] * 5000,
        measurements: { internal_temperature_c: 23.5, internal_humidity_percent: 55.2, external_temperature_c: 18.4, water_temperature_c: water },
        sensor_status: { internal_sht31: 'ok', external_ds18b20: 'ok', water_ds18b20: 'ok' } };
}
async function send(device, water) {
    await client.publishAsync(T + device + '/telemetry/raw', JSON.stringify(rawMsg(device, water)), { qos: 1 });
}
const status = async (device) => (await api('GET', '/leaflimits/api/status/' + device)).json;
const alertsFor = (device) => alerts.filter((a) => a.payload.device_id === device);

// ---- lifecycle -------------------------------------------------------------------------------
test.before(async () => {
    tmp = fs.mkdtempSync(path.join(process.env.LL_TEST_TMP || os.tmpdir(), 'llit-'));
    userDir = path.join(tmp, 'nr'); appDir = path.join(tmp, 'app');
    fs.mkdirSync(userDir); fs.mkdirSync(appDir);
    if (process.env.LL_TEST_APP_DIR) for (const f of fs.readdirSync(process.env.LL_TEST_APP_DIR)) fs.copyFileSync(path.join(process.env.LL_TEST_APP_DIR, f), path.join(appDir, f));
    else {
        fs.writeFileSync(path.join(appDir, 'index.html'), '<!doctype html><base href="/leaflimits/"><app-root></app-root>');
        fs.writeFileSync(path.join(appDir, 'main-ABCD1234.js'), 'console.log(1)');
    }
    fs.writeFileSync(path.join(userDir, 'flows.json'), JSON.stringify(buildFlows()));
    fs.writeFileSync(path.join(userDir, 'settings.js'),
        `module.exports = { uiPort: ${RED_PORT}, uiHost: '127.0.0.1', flowFile: 'flows.json', functionGlobalContext: {}, logging: { console: { level: 'info', metrics: false, audit: false } } };`);

    broker = await Aedes.createBroker();
    brokerServer = net.createServer(broker.handle);
    await new Promise((r) => brokerServer.listen(MQTT_PORT, '127.0.0.1', r));
    await startAi();

    client = await mqtt.connectAsync('mqtt://127.0.0.1:' + MQTT_PORT, { clientId: 'it-client' });
    client.on('message', (topic, buf, packet) => {
        const m = { topic, payload: JSON.parse(buf.toString()), retain: packet.retain };
        if (topic.endsWith('/limits/alert')) alerts.push(m); else validated.push(m);
    });
    await client.subscribeAsync([T + '+/limits/alert', T + '+/telemetry/validated/+'], { qos: 1 });

    startRed();
    await waitRed();
});
test.after(async () => {
    if (client) await client.endAsync(true).catch(() => {});
    await stopRed();
    if (ai && ai.listening) await new Promise((r) => ai.close(r));
    if (brokerServer) await new Promise((r) => brokerServer.close(r));
    if (broker) await new Promise((r) => broker.close(r));
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});
test.afterEach((t) => { if (t.passed === false) console.log('--- Node-RED log tail ---\n' + redLog.slice(-25).join('\n')); });

// ---- tests -----------------------------------------------------------------------------------
test('every API route needs the token', async () => {
    for (const [m, u] of [['GET', '/leaflimits/api/limits/d1'], ['PUT', '/leaflimits/api/limits/d1'], ['GET', '/leaflimits/api/status/d1'], ['POST', '/leaflimits/api/suggest']]) {
        assert.equal((await api(m, u, { token: null })).status, 401, m + ' ' + u + ' without token');
        assert.equal((await api(m, u, { token: 'wrong' })).status, 401, m + ' ' + u + ' with wrong token');
    }
    const ok = await api('GET', '/leaflimits/api/limits/d1');
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.json, { device_id: 'd1', plant: '', source: 'default', updated_at: null, limits: {} });
    assert.match(ok.headers.get('cache-control'), /no-store/);
});

test('the app is served under /leaflimits/', async () => {
    for (const p of ['/leaflimits', '/leaflimits/', '/leaflimits/index.html']) {
        const r = await api('GET', p, { token: null });
        assert.equal(r.status, 200, p);
        assert.match(r.headers.get('content-type'), /text\/html/);
        assert.match(r.text, /<base href="\/leaflimits\/"/);
        assert.equal(r.headers.get('cache-control'), 'no-cache');
    }
    const js = fs.readdirSync(appDir).find((f) => /^main-.*\.js$/.test(f));
    const r = await api('GET', '/leaflimits/' + js, { token: null });
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /javascript/);
    assert.match(r.headers.get('cache-control'), /immutable/);
});

test('missing files and path tricks never leak anything', async () => {
    for (const p of ['/leaflimits/nope.js', '/leaflimits/.env', '/leaflimits/..%2f..%2f..%2fetc%2fpasswd', '/leaflimits/%2e%2e%2fnr%2fsettings.js', '/leaflimits/index.html%00.js']) {
        const r = await api('GET', p, { token: null });
        assert.ok([400, 404].includes(r.status), p + ' -> ' + r.status);
        assert.ok(!/root:|uiPort|module\.exports/.test(r.text), p);
    }
});

test('saving bad limits is refused', async () => {
    const put = (body, opts) => api('PUT', '/leaflimits/api/limits/it-bad', { body, ...opts });
    assert.equal((await put({ limits: { water_temperature: { min: 30, max: 10 } } })).status, 400);
    assert.equal((await put({ limits: { water_temperature: { min: -5, max: 60 } } })).status, 400);
    assert.equal((await put({ limits: { nope: { min: 1, max: 2 } } })).status, 400);
    assert.equal((await put(undefined, { raw: '{not json', headers: { 'Content-Type': 'application/json' } })).status, 400);
    const text = await put(undefined, { raw: 'plain text', headers: { 'Content-Type': 'text/plain' } });
    assert.equal(text.status, 400);
    assert.equal((await api('PUT', '/leaflimits/api/limits/bad%20id', { body: { limits: {} } })).status, 400);
    assert.deepEqual((await api('GET', '/leaflimits/api/limits/it-bad')).json.limits, {}, 'nothing was saved');
});

test('saving limits stores them and publishes a retained MQTT message', async () => {
    const r = await api('PUT', '/leaflimits/api/limits/it-a', { body: { plant: 'Basil', source: 'ai', limits: { water_temperature: { min: 18, max: 24 } } } });
    assert.equal(r.status, 200);
    assert.equal(r.json.plant, 'Basil');
    assert.deepEqual((await api('GET', '/leaflimits/api/limits/it-a')).json.limits, { water_temperature: { min: 18, max: 24 } });

    // A brand-new client gets the retained profile the moment it subscribes.
    const late = await mqtt.connectAsync('mqtt://127.0.0.1:' + MQTT_PORT, { clientId: 'it-late' });
    const got = new Promise((res) => late.on('message', (t, b, p) => res({ t, p, body: JSON.parse(b.toString()) })));
    await late.subscribeAsync(T + 'it-a/limits/config');
    const m = await Promise.race([got, sleep(5000).then(() => null)]);
    await late.endAsync(true);
    assert.ok(m, 'no retained message');
    assert.equal(m.p.retain, true);
    assert.equal(m.body.schema_version, 1);
    assert.equal(m.body.plant, 'Basil');
});

test('the original validation flow keeps working next to the new tab, and readings are classified', async () => {
    await api('PUT', '/leaflimits/api/limits/it-b', { body: { limits: { water_temperature: { min: 18, max: 24 } } } });
    const before = validated.filter((v) => v.topic.includes('/it-b/')).length;
    await send('it-b', 21.0);
    await until(() => validated.filter((v) => v.topic.includes('/it-b/')).length === before + 4);   // 4 validated topics, as before
    const s = await until(async () => { const j = await status('it-b'); return j.water_temperature && j; });
    assert.equal(s.water_temperature.value, 21);
    assert.equal(s.water_temperature.state, 'ok');
    assert.equal(s.water_temperature.unit, 'celsius');
    assert.equal(s.internal_humidity.state, 'unknown', 'no limit set for humidity');
    assert.ok(s.water_temperature.age_seconds < 10);
});

test('an alert is sent after 3 readings above the limit and cleared after 2 good ones', async () => {
    const d = 'it-c';
    await api('PUT', '/leaflimits/api/limits/' + d, { body: { limits: { water_temperature: { min: 18, max: 24 } } } });
    await send(d, 21); await send(d, 30); await send(d, 30);
    await sleep(700);
    assert.equal(alertsFor(d).length, 0, 'two high readings are not enough');
    assert.equal((await status(d)).water_temperature.state, 'ok');
    await send(d, 30);
    const a = await until(() => alertsFor(d)[0]);
    assert.equal(a.payload.state, 'high');
    assert.equal(a.payload.previous_state, 'ok');
    assert.equal(a.payload.value, 30);
    assert.deepEqual(a.payload.limit, { min: 18, max: 24 });
    assert.equal(a.retain, false);
    assert.equal((await status(d)).water_temperature.state, 'high');
    await send(d, 31); await sleep(500);
    assert.equal(alertsFor(d).length, 1, 'no repeat while it stays high');
    await send(d, 22); await send(d, 22);
    const c = await until(() => alertsFor(d)[1]);
    assert.equal(c.payload.state, 'ok');
    assert.equal(c.payload.previous_state, 'high');
});

test('a rejected measurement does not reach the limit logic', async () => {
    const d = 'it-d';
    await api('PUT', '/leaflimits/api/limits/' + d, { body: { limits: { water_temperature: { min: 18, max: 24 } } } });
    for (let i = 0; i < 4; i++) await send(d, 99);   // 99 C is out of the plausible range, so the validation flow rejects it
    await sleep(800);
    assert.equal(alertsFor(d).length, 0);
    assert.equal((await status(d)).water_temperature, undefined);
    assert.ok((await status(d)).internal_humidity, 'the other sensors still arrive');
});

test('limits survive a Node-RED restart because the broker keeps the retained message', async () => {
    const before = (await api('GET', '/leaflimits/api/limits/it-a')).json;
    await stopRed(); startRed(); await waitRed();
    const after = await until(async () => { const j = (await api('GET', '/leaflimits/api/limits/it-a')).json; return j.source !== 'default' && j; });
    assert.deepEqual(after.limits, before.limits);
    assert.equal(after.plant, 'Basil');
    assert.equal(after.updated_at, before.updated_at);
    assert.deepEqual(await status('it-a'), {}, 'live values start empty until the next reading');
});

test('AI suggestion: a good answer comes back cleaned, and the key is sent only to the API', async () => {
    aiMode = 'ok';
    const r = await api('POST', '/leaflimits/api/suggest', { body: { image: 'A'.repeat(400), media_type: 'image/jpeg' } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.plant, 'Basil');
    assert.equal(r.json.confidence, 0.9);
    assert.deepEqual(Object.keys(r.json.limits).sort(), ['internal_humidity', 'water_temperature'], 'the invalid temperature range was dropped');
    assert.equal(aiLast.headers['x-api-key'], 'sk-test-key');
    assert.equal(aiLast.headers['anthropic-version'], '2023-06-01');
    assert.equal(aiLast.body.model, 'claude-sonnet-5');
    assert.equal(aiLast.body.tool_choice.name, 'recommend_limits');
    assert.ok(!r.text.includes('sk-test-key'));
});

test('AI suggestion: upstream failures become clean 502 answers', async () => {
    const call = () => api('POST', '/leaflimits/api/suggest', { body: { image: 'A'.repeat(400), media_type: 'image/jpeg' } });
    aiMode = 'error500';
    let r = await call();
    assert.equal(r.status, 502);
    assert.ok(!/boom|sk-leak/.test(r.text), 'upstream error text is not passed on');
    aiMode = 'garbage';
    r = await call();
    assert.equal(r.status, 502);
    aiMode = 'ok';
    await new Promise((res) => ai.close(res));           // the API is unreachable now
    r = await call();
    assert.equal(r.status, 502, 'a connection error is answered, not left hanging');
    assert.match(r.json.message, /Could not reach/);
    await startAi();
});

test('AI suggestion: bad bodies and the hourly limit', async () => {
    aiMode = 'ok';
    assert.equal((await api('POST', '/leaflimits/api/suggest', { body: { image: 'x', media_type: 'image/jpeg' } })).status, 400);
    assert.equal((await api('POST', '/leaflimits/api/suggest', { body: { image: 'A'.repeat(400), media_type: 'image/png' } })).status, 400);
    // 5 per hour: two were used by the failure tests (the 502s count too) plus the good one earlier = 4
    const ok = await api('POST', '/leaflimits/api/suggest', { body: { image: 'A'.repeat(400), media_type: 'image/jpeg' } });
    assert.equal(ok.status, 200, 'the 5th request is allowed');
    const limited = await api('POST', '/leaflimits/api/suggest', { body: { image: 'A'.repeat(400), media_type: 'image/jpeg' } });
    assert.equal(limited.status, 429);
});

test('a huge upload is rejected and the server stays healthy', async () => {
    const r = await api('POST', '/leaflimits/api/suggest', { raw: JSON.stringify({ image: 'A'.repeat(6 * 1024 * 1024), media_type: 'image/jpeg' }), headers: { 'Content-Type': 'application/json' } });
    assert.ok(r.status >= 400 && r.status < 500, 'status ' + r.status);
    assert.equal((await api('GET', '/leaflimits/api/limits/it-a')).status, 200);
});
