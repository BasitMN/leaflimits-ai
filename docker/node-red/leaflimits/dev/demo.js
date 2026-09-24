#!/usr/bin/env node
'use strict';
// Demo runner: a private copy of the MicroHydros pipeline plus the LeafLimits tab, running only on this machine.
//   - an in-process MQTT broker (no connection to any real server)
//   - Node-RED with the MQTT Validation flow and the LeafLimits tab (enabled)
//   - the Angular app at http://localhost:1880/leaflimits/  (token: demo)
//   - a fake device that publishes a reading every 5 s
//   - the real Claude API when the key file exists, otherwise a fake Claude answer
//
//   bash docker/node-red/leaflimits/dev/setup-demo.sh     # once
//   node docker/node-red/leaflimits/dev/demo.js            # Ctrl+C to stop
//
// The API key is read from LL_DEMO_KEY_FILE (default /root/ws/.anthropic_key) and handed to Node-RED only through
// its process environment. It is never written to a file or printed.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { createRequire } = require('node:module');

const HOME = process.env.LL_DEMO_HOME || path.join(os.tmpdir(), 'leaflimits-demo');
const MODS = process.env.LL_DEMO_MODULES || path.join(HOME, 'modules');
const APP_DIR = process.env.LL_DEMO_APP_DIR || path.join(HOME, 'app-dist', 'browser');
// Default: <ws folder>/.anthropic_key, next to the repository (five folders up from dev/).
const KEY_FILE = process.env.LL_DEMO_KEY_FILE || path.resolve(__dirname, '..', '..', '..', '..', '..', '.anthropic_key');
const TOKEN = process.env.LL_DEMO_TOKEN || 'demo';
const DEVICE = process.env.LL_DEMO_DEVICE || 'esp32s3-01';
const PORT = Number(process.env.LL_DEMO_PORT || 1880);
const MQTT_PORT = Number(process.env.LL_DEMO_MQTT_PORT || 18830);
const AI_PORT = Number(process.env.LL_DEMO_AI_PORT || 18801);
const INTERVAL_MS = Number(process.env.LL_DEMO_INTERVAL_MS || 5000);
const PERIOD_S = Number(process.env.LL_DEMO_PERIOD_S || 120);

function fail(msg) { console.error('demo: ' + msg); process.exit(1); }
if (!fs.existsSync(path.join(MODS, 'node_modules', 'node-red'))) fail('node-red not found in ' + MODS + '. Run setup-demo.sh first (or set LL_DEMO_MODULES).');
if (!fs.existsSync(path.join(APP_DIR, 'index.html'))) fail('built app not found in ' + APP_DIR + '. Run setup-demo.sh first (or set LL_DEMO_APP_DIR).');

let key = '';
try { key = fs.readFileSync(KEY_FILE, 'utf8').trim(); } catch { /* no key file: fake AI */ }
if (/\s/.test(key)) fail('the key file ' + KEY_FILE + ' contains whitespace inside the key. Save it again.');
const realAi = key.length > 0;

const req = createRequire(path.join(MODS, 'x.js'));
const { Aedes } = req('aedes');
const mqtt = req('mqtt');
const { flows: leafFlows } = require('../build.js');

const T = 'microhydros/v1/devices/';
const RED = path.join(MODS, 'node_modules', 'node-red', 'red.js');
const USER_DIR = path.join(HOME, 'nr-data');
let broker, brokerServer, aiServer, red, client, timer;

function buildFlows() {
    const validation = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'flows', 'mqtt-validation.json'), 'utf8'));
    for (const n of validation) if (n.type === 'mqtt-broker') { n.broker = '127.0.0.1'; n.port = String(MQTT_PORT); }
    const leaf = JSON.parse(JSON.stringify(leafFlows));
    const tab = leaf.find((n) => n.type === 'tab');
    tab.disabled = false;
    // The token and the key are NOT defined on the tab: Node-RED then reads them from the process environment,
    // so no secret ends up in flows.json.
    tab.env = tab.env.filter((e) => e.name !== 'LEAFLIMITS_TOKEN' && e.name !== 'ANTHROPIC_API_KEY');
    for (const e of tab.env) {
        if (e.name === 'LEAFLIMITS_APP_DIR') e.value = APP_DIR;
        if (e.name === 'ANTHROPIC_API_URL' && !realAi) e.value = 'http://127.0.0.1:' + AI_PORT + '/v1/messages';
    }
    return [...validation, ...leaf];
}

function startFakeAi() {
    aiServer = http.createServer((rq, rs) => {
        rq.resume();
        rq.on('end', () => {
            rs.writeHead(200, { 'content-type': 'application/json' });
            rs.end(JSON.stringify({ content: [{ type: 'tool_use', name: 'recommend_limits', input: {
                plant: 'Basil (fake AI answer)', confidence: 0.82,
                notes: 'This is the fake AI of the demo runner. Basil likes warm, moderately humid air and water around 18 to 24 C.',
                limits: { water_temperature: { min: 18, max: 24 }, internal_temperature: { min: 18, max: 30 }, internal_humidity: { min: 40, max: 70 } }
            } }] }));
        });
    });
    return new Promise((r) => aiServer.listen(AI_PORT, '127.0.0.1', r));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, step = 300) {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (await fn()) return true; await sleep(step); }
    return false;
}

let seq = 0;
const boot = 'demo-' + Date.now();
function reading() {
    seq += 1;
    const t = (seq * INTERVAL_MS) / 1000;
    const wave = (base, amp, period) => Math.round((base + amp * Math.sin((2 * Math.PI * t) / period)) * 10) / 10;
    return {
        schema_version: 1, device_id: DEVICE, boot_id: boot, sequence: seq, uptime_ms: seq * INTERVAL_MS,
        measurements: {
            water_temperature_c: wave(22, 5, PERIOD_S),
            internal_temperature_c: wave(25, 4, PERIOD_S * 1.5),
            internal_humidity_percent: wave(55, 15, PERIOD_S * 2),
            external_temperature_c: wave(18, 2, PERIOD_S * 3)
        },
        sensor_status: { internal_sht31: 'ok', external_ds18b20: 'ok', water_ds18b20: 'ok' }
    };
}

async function stop(code) {
    clearInterval(timer);
    try { if (client) await client.endAsync(true); } catch { /* ignore */ }
    if (red && red.exitCode === null) { red.kill('SIGTERM'); await Promise.race([new Promise((r) => red.once('exit', r)), sleep(8000)]); if (red.exitCode === null) red.kill('SIGKILL'); }
    if (aiServer) aiServer.close();
    if (brokerServer) brokerServer.close();
    if (broker) broker.close();
    try { fs.rmSync(path.join(HOME, 'demo.pid')); } catch { /* ignore */ }
    process.exit(code);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

(async () => {
    fs.mkdirSync(USER_DIR, { recursive: true });
    fs.writeFileSync(path.join(USER_DIR, 'flows.json'), JSON.stringify(buildFlows()));
    fs.writeFileSync(path.join(USER_DIR, 'settings.js'),
        `module.exports = { uiPort: ${PORT}, uiHost: '127.0.0.1', flowFile: 'flows.json', functionGlobalContext: {}, logging: { console: { level: 'info', metrics: false, audit: false } } };`);
    fs.writeFileSync(path.join(HOME, 'demo.pid'), String(process.pid));

    broker = await Aedes.createBroker();
    brokerServer = net.createServer(broker.handle);
    await new Promise((r) => brokerServer.listen(MQTT_PORT, '127.0.0.1', r));
    if (!realAi) await startFakeAi();

    const logFile = fs.createWriteStream(path.join(HOME, 'node-red.log'));
    red = spawn(process.execPath, [RED, '-u', USER_DIR, '-s', path.join(USER_DIR, 'settings.js')], {
        stdio: ['ignore', 'pipe', 'pipe'], cwd: USER_DIR,
        env: Object.assign({}, process.env, { LEAFLIMITS_TOKEN: TOKEN, ANTHROPIC_API_KEY: realAi ? key : 'fake-key-for-demo' })
    });
    red.stdout.pipe(logFile); red.stderr.pipe(logFile);
    let connected = false;
    red.stdout.on('data', (d) => { if (/Connected to broker/.test(String(d))) connected = true; });
    red.on('exit', (c) => { if (c !== null && c !== 0) { console.error('demo: Node-RED stopped with code ' + c + '. See ' + path.join(HOME, 'node-red.log')); stop(1); } });

    const up = await until(async () => { try { return (await fetch(`http://127.0.0.1:${PORT}/leaflimits/api/limits/probe`)).status === 401; } catch { return false; } }, 90000);
    if (!up || !(await until(() => connected, 30000))) { console.error('demo: Node-RED did not start. See ' + path.join(HOME, 'node-red.log')); return stop(1); }

    client = await mqtt.connectAsync('mqtt://127.0.0.1:' + MQTT_PORT, { clientId: 'demo-device' });
    client.on('message', (topic, buf) => {
        try {
            const a = JSON.parse(buf.toString());
            console.log(`[alert] ${a.device_id} ${a.measurement} is now ${a.state.toUpperCase()} (was ${a.previous_state}), value ${a.value}` +
                (a.limit ? `, limit ${a.limit.min} to ${a.limit.max}` : ''));
        } catch { /* ignore */ }
    });
    await client.subscribeAsync(T + '+/limits/alert', { qos: 1 });
    timer = setInterval(() => client.publish(T + DEVICE + '/telemetry/raw', JSON.stringify(reading()), { qos: 1 }), INTERVAL_MS);

    console.log('');
    console.log('LeafLimits demo is running.');
    console.log('  App:     http://localhost:' + PORT + '/leaflimits/');
    console.log('  Token:   ' + TOKEN + '   (enter it under Settings in the app)');
    console.log('  Device:  ' + DEVICE + '   (a fake device sends a reading every ' + INTERVAL_MS / 1000 + ' s)');
    console.log('  AI:      ' + (realAi ? 'REAL Claude API (key from ' + KEY_FILE + ')' : 'fake answer (no key file at ' + KEY_FILE + ')'));
    console.log('  Limits you save live only while this runner is running.');
    console.log('  Stop:    Ctrl+C, or kill ' + process.pid);
    console.log('');
})().catch((e) => { console.error('demo: ' + (e && e.message)); stop(1); });
