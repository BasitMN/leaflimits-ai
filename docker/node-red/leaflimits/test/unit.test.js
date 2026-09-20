'use strict';
// Unit tests for the LeafLimits tab. They run the exact function texts that build.js puts in the flow.
//   node --test docker/node-red/leaflimits/test/unit.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { sources } = require('../build.js');

const store = () => { const m = new Map(); return { get: (k) => m.get(k), set: (k, v) => m.set(k, v) }; };
const fakeNode = () => { const logs = { warn: [], error: [] }; return { logs, warn: (m) => logs.warn.push(m), error: (e) => logs.error.push(e) }; };

function run(name, msg, { flow = store(), env = {}, node = fakeNode() } = {}) {
    assert.ok(sources[name], 'unknown function node: ' + name);
    const fn = new Function('msg', 'node', 'flow', 'global', 'env', 'context', sources[name]);
    const result = fn(msg, node, flow, store(), { get: (k) => env[k] }, store());
    return { result, flow, node };
}
const http = (over = {}) => Object.assign({ req: { headers: { authorization: 'Bearer secret' }, params: { device: 'esp32s3-01' } }, payload: null }, over);
const reading = (device, measurement, value, extra = {}) =>
    ({ payload: JSON.stringify(Object.assign({ device_id: device, measurement, value, unit: 'celsius', timestamp: '2026-09-19T10:00:00.000Z' }, extra)) });
const put = (flow, body, device = 'esp32s3-01') =>
    run('Validate and save profile', http({ req: { headers: {}, params: { device } }, payload: body }), { flow });
const WATER = { water_temperature: { min: 18, max: 24 } };
const feed = (flow, device, key, value) => run('Evaluate against limits', reading(device, key, value), { flow }).result;

test('build: every function node compiles and the names used here exist', () => {
    for (const n of ['Check token', 'Evaluate against limits', 'Store profile in memory', 'Read profile', 'Validate and save profile',
        'Latest values and state', 'Prepare AI request', 'Clean AI answer', 'AI unreachable', 'Pick file', 'Set headers', 'Not found']) {
        assert.ok(sources[n], n);
    }
});

// ---- auth ----
test('auth: 503 without a configured token', () => {
    const { result } = run('Check token', http(), { env: {} });
    assert.equal(result[1].statusCode, 503);
    assert.equal(result[0], null);
});
test('auth: 401 for missing, malformed and wrong tokens', () => {
    for (const authorization of [undefined, '', 'secret', 'Bearer', 'Bearer wrong', 'Basic secret', 'Bearer secre', 'Bearer secrett']) {
        const msg = http({ req: { headers: { authorization }, params: {} } });
        const { result } = run('Check token', msg, { env: { LEAFLIMITS_TOKEN: 'secret' } });
        assert.equal(result[1].statusCode, 401, String(authorization));
        assert.equal(result[0], null);
    }
});
test('auth: the right token passes, "bearer" is case-insensitive', () => {
    for (const authorization of ['Bearer secret', 'bearer secret', 'BEARER   secret']) {
        const { result } = run('Check token', http({ req: { headers: { authorization }, params: {} } }), { env: { LEAFLIMITS_TOKEN: 'secret' } });
        assert.ok(result[0], authorization);
        assert.equal(result[1], null);
    }
});
test('auth: a numeric token in the env still works', () => {
    const { result } = run('Check token', http({ req: { headers: { authorization: 'Bearer 12345' }, params: {} } }), { env: { LEAFLIMITS_TOKEN: 12345 } });
    assert.ok(result[0]);
});

// ---- profile API ----
test('GET limits returns a default profile when nothing is saved', () => {
    const { result } = run('Read profile', http());
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.payload, { device_id: 'esp32s3-01', plant: '', source: 'default', updated_at: null, limits: {} });
    assert.equal(result.headers['Cache-Control'], 'no-store');
});
test('PUT limits saves, returns the profile and emits a retained MQTT message', () => {
    const flow = store();
    const { result } = put(flow, { plant: ' Basil ', source: 'ai', limits: WATER });
    const [mqtt, reply] = result;
    assert.equal(reply.statusCode, 200);
    assert.equal(reply.payload.plant, 'Basil');
    assert.equal(reply.payload.source, 'ai');
    assert.equal(mqtt.topic, 'microhydros/v1/devices/esp32s3-01/limits/config');
    assert.equal(mqtt.retain, true);
    assert.equal(mqtt.qos, 1);
    const stored = JSON.parse(mqtt.payload);
    assert.equal(stored.schema_version, 1);
    assert.deepEqual(stored.limits, WATER);
    // a following GET sees it immediately
    assert.deepEqual(run('Read profile', http(), { flow }).result.payload.limits, WATER);
});
test('PUT limits: source other than "ai" becomes "manual"', () => {
    assert.equal(put(store(), { source: 'hacker', limits: WATER }).result[1].payload.source, 'manual');
});
test('PUT limits rejects bad input with a readable message and saves nothing', () => {
    const bad = [
        [{ limits: { water_temperature: { min: 30, max: 10 } } }, /min must be lower than max/],
        [{ limits: { water_temperature: { min: 20, max: 20 } } }, /min must be lower than max/],
        [{ limits: { water_temperature: { min: -5, max: 20 } } }, /must stay between 0 and 50/],
        [{ limits: { internal_humidity: { min: 40, max: 101 } } }, /must stay between 0 and 100/],
        [{ limits: { water_temperature: { min: '18', max: 24 } } }, /must be numbers/],
        [{ limits: { water_temperature: { min: null, max: 24 } } }, /must be numbers/],
        [{ limits: { water_temperature: { min: NaN, max: 24 } } }, /must be numbers/],
        [{ limits: { water_temperature: 5 } }, /must be an object/],
        [{ limits: { nope: { min: 1, max: 2 } } }, /unknown measurement "nope"/],
        [JSON.parse('{"limits":{"__proto__":{"min":1,"max":2}}}'), /unknown measurement "__proto__"/],
        [{ limits: { constructor: { min: 1, max: 2 } } }, /unknown measurement "constructor"/],
        [{ limits: [] }, /limits must be an object/],
        [{ limits: 'x' }, /limits must be an object/],
        [{ plant: 'x'.repeat(61), limits: {} }, /plant must be text/],
        [{ plant: 42, limits: {} }, /plant must be text/],
        ['text', /JSON object/],
        [null, /JSON object/],
        [[1, 2], /JSON object/]
    ];
    for (const [body, pattern] of bad) {
        const flow = store();
        const { result } = put(flow, body);
        assert.equal(result[0], null, JSON.stringify(body));
        assert.equal(result[1].statusCode, 400, JSON.stringify(body));
        assert.match(result[1].payload.message, pattern, JSON.stringify(body));
        assert.equal(flow.get('ll_profiles'), undefined, 'nothing saved');
    }
});
test('PUT limits accepts an empty profile (clears all limits) and values exactly on the bounds', () => {
    assert.equal(put(store(), { plant: '', limits: {} }).result[1].statusCode, 200);
    assert.equal(put(store(), { limits: { water_temperature: { min: 0, max: 50 } } }).result[1].statusCode, 200);
});
test('device ids: invalid ones are refused on every route', () => {
    for (const device of ['__proto__', '../etc', 'a b', '', 'x'.repeat(65), '-abc']) {
        const msg = http({ req: { headers: {}, params: { device } } });
        assert.equal(run('Read profile', msg).result.statusCode, 400, device);
        assert.equal(run('Latest values and state', msg).result.statusCode, 400, device);
        assert.equal(run('Validate and save profile', { ...msg, payload: { limits: {} } }).result[1].statusCode, 400, device);
    }
});
test('profiles of different devices do not mix', () => {
    const flow = store();
    put(flow, { limits: WATER }, 'dev-a');
    assert.deepEqual(run('Read profile', http({ req: { headers: {}, params: { device: 'dev-b' } } }), { flow }).result.payload.limits, {});
});

// ---- retained profile handling ----
const cfg = (device, payload) => ({ topic: 'microhydros/v1/devices/' + device + '/limits/config', payload });
test('config-store: loads a valid retained profile and keeps its updated_at', () => {
    const flow = store();
    const body = JSON.stringify({ schema_version: 1, plant: 'Basil', source: 'ai', updated_at: '2026-01-01T00:00:00.000Z', limits: WATER });
    run('Store profile in memory', cfg('esp32s3-01', body), { flow });
    const p = flow.get('ll_profiles')['esp32s3-01'];
    assert.equal(p.updated_at, '2026-01-01T00:00:00.000Z');
    assert.deepEqual(p.limits, WATER);
});
test('config-store: accepts a Buffer payload', () => {
    const flow = store();
    run('Store profile in memory', cfg('esp32s3-01', Buffer.from(JSON.stringify({ limits: WATER }))), { flow });
    assert.deepEqual(flow.get('ll_profiles')['esp32s3-01'].limits, WATER);
});
test('config-store: invalid or non-JSON messages are ignored with a warning', () => {
    for (const payload of ['not json', JSON.stringify({ limits: { water_temperature: { min: 30, max: 10 } } })]) {
        const flow = store();
        const { node } = run('Store profile in memory', cfg('esp32s3-01', payload), { flow });
        assert.equal(flow.get('ll_profiles'), undefined);
        assert.equal(node.logs.warn.length, 1);
    }
});
test('config-store: an empty retained message clears the profile', () => {
    const flow = store();
    put(flow, { limits: WATER });
    run('Store profile in memory', cfg('esp32s3-01', ''), { flow });
    assert.equal(flow.get('ll_profiles')['esp32s3-01'], undefined);
    run('Store profile in memory', cfg('esp32s3-01', Buffer.alloc(0)), { flow });   // and again with a Buffer
});
test('config-store: ignores topics without a valid device id', () => {
    const flow = store();
    run('Store profile in memory', { topic: 'microhydros/v1/devices/__proto__/limits/config', payload: JSON.stringify({ limits: WATER }) }, { flow });
    run('Store profile in memory', { topic: 'x', payload: '{}' }, { flow });
    assert.equal(flow.get('ll_profiles'), undefined);
});

// ---- evaluation ----
function setup() { const flow = store(); put(flow, { limits: WATER }); return flow; }
test('evaluate: in-range readings never alert', () => {
    const flow = setup();
    for (let i = 0; i < 10; i++) assert.equal(feed(flow, 'esp32s3-01', 'water_temperature', 20 + (i % 3)), null);
    assert.equal(flow.get('ll_state')['esp32s3-01/water_temperature'].state, 'ok');
});
test('evaluate: alert only after 3 consecutive out-of-range readings, and only once', () => {
    const flow = setup();
    assert.equal(feed(flow, 'esp32s3-01', 'water_temperature', 20), null);
    assert.equal(feed(flow, 'esp32s3-01', 'water_temperature', 25), null);
    assert.equal(feed(flow, 'esp32s3-01', 'water_temperature', 25), null);
    assert.equal(flow.get('ll_state')['esp32s3-01/water_temperature'].state, 'ok', 'still ok after two');
    const alert = feed(flow, 'esp32s3-01', 'water_temperature', 26);
    assert.equal(alert.topic, 'microhydros/v1/devices/esp32s3-01/limits/alert');
    assert.equal(alert.qos, 1);
    assert.equal(alert.retain, false);
    assert.equal(alert.payload.state, 'high');
    assert.equal(alert.payload.previous_state, 'ok');
    assert.equal(alert.payload.value, 26);
    assert.deepEqual(alert.payload.limit, { min: 18, max: 24 });
    assert.equal(alert.payload.schema_version, 1);
    assert.equal(feed(flow, 'esp32s3-01', 'water_temperature', 27), null, 'no repeat while it stays high');
    assert.equal(feed(flow, 'esp32s3-01', 'water_temperature', 27), null);
});
test('evaluate: an interrupted streak does not alert', () => {
    const flow = setup();
    for (const v of [25, 25, 20, 25, 25, 20, 25]) assert.equal(feed(flow, 'esp32s3-01', 'water_temperature', v), null);
});
test('evaluate: low works the same way', () => {
    const flow = setup();
    feed(flow, 'esp32s3-01', 'water_temperature', 17); feed(flow, 'esp32s3-01', 'water_temperature', 17);
    assert.equal(feed(flow, 'esp32s3-01', 'water_temperature', 16).payload.state, 'low');
});
test('evaluate: hysteresis keeps the alert until the value is well back inside, then clears after 2 readings', () => {
    const flow = setup();
    for (let i = 0; i < 3; i++) feed(flow, 'esp32s3-01', 'water_temperature', 25);
    // 23.95 is inside the limit but within the 2% band (0.12) of the max: still high, no alert
    for (let i = 0; i < 5; i++) assert.equal(feed(flow, 'esp32s3-01', 'water_temperature', 23.95), null);
    assert.equal(flow.get('ll_state')['esp32s3-01/water_temperature'].state, 'high');
    assert.equal(feed(flow, 'esp32s3-01', 'water_temperature', 23), null, 'first good reading');
    const cleared = feed(flow, 'esp32s3-01', 'water_temperature', 23);
    assert.equal(cleared.payload.state, 'ok');
    assert.equal(cleared.payload.previous_state, 'high');
});
test('evaluate: going from low to high needs 3 readings and alerts with the new state', () => {
    const flow = setup();
    for (let i = 0; i < 3; i++) feed(flow, 'esp32s3-01', 'water_temperature', 10);
    feed(flow, 'esp32s3-01', 'water_temperature', 30); feed(flow, 'esp32s3-01', 'water_temperature', 30);
    const a = feed(flow, 'esp32s3-01', 'water_temperature', 30);
    assert.equal(a.payload.state, 'high');
    assert.equal(a.payload.previous_state, 'low');
});
test('evaluate: no limits means state unknown and no alerts', () => {
    const flow = store();
    for (const v of [5, 50, 20]) assert.equal(feed(flow, 'esp32s3-01', 'water_temperature', v), null);
    assert.equal(flow.get('ll_state')['esp32s3-01/water_temperature'].state, 'unknown');
});
test('evaluate: removing the limits while high sends a final alert with state unknown', () => {
    const flow = setup();
    for (let i = 0; i < 3; i++) feed(flow, 'esp32s3-01', 'water_temperature', 25);
    put(flow, { limits: {} });
    const a = feed(flow, 'esp32s3-01', 'water_temperature', 25);
    assert.equal(a, null, 'after the reset the state is unknown, so there is nothing to clear');
    assert.equal(flow.get('ll_state')['esp32s3-01/water_temperature'].state, 'unknown');
});
test('evaluate: saving new limits resets the state but keeps the latest value', () => {
    const flow = setup();
    for (let i = 0; i < 3; i++) feed(flow, 'esp32s3-01', 'water_temperature', 25);
    put(flow, { limits: { water_temperature: { min: 20, max: 30 } } });
    const e = flow.get('ll_state')['esp32s3-01/water_temperature'];
    assert.equal(e.state, 'unknown');
    assert.equal(e.value, 25);
    assert.equal(feed(flow, 'esp32s3-01', 'water_temperature', 25), null, 'in range under the new limits');
    assert.equal(flow.get('ll_state')['esp32s3-01/water_temperature'].state, 'ok');
});
test('evaluate: a reading that is out of range right after saving still needs 3 readings', () => {
    const flow = setup();
    assert.equal(feed(flow, 'esp32s3-01', 'water_temperature', 30), null);
    assert.equal(feed(flow, 'esp32s3-01', 'water_temperature', 30), null);
    assert.equal(feed(flow, 'esp32s3-01', 'water_temperature', 30).payload.state, 'high');
});
test('evaluate: sensors and devices are independent', () => {
    const flow = store();
    put(flow, { limits: { water_temperature: { min: 18, max: 24 }, internal_humidity: { min: 40, max: 70 } } }, 'dev-a');
    put(flow, { limits: WATER }, 'dev-b');
    for (let i = 0; i < 3; i++) feed(flow, 'dev-a', 'water_temperature', 30);
    assert.equal(flow.get('ll_state')['dev-a/water_temperature'].state, 'high');
    assert.equal(feed(flow, 'dev-a', 'internal_humidity', 50), null);
    assert.equal(flow.get('ll_state')['dev-a/internal_humidity'].state, 'ok');
    assert.equal(feed(flow, 'dev-b', 'water_temperature', 20), null);
    assert.equal(flow.get('ll_state')['dev-b/water_temperature'].state, 'ok');
});
test('evaluate: ignores unusable input', () => {
    const flow = setup();
    const junk = [
        { payload: 'not json' }, { payload: '' }, { payload: '42' }, { payload: 'null' }, { payload: undefined },
        reading('esp32s3-01', 'water_temperature', 'hot'), reading('esp32s3-01', 'water_temperature', null),
        reading('esp32s3-01', 'water_temperature', NaN), reading('esp32s3-01', 'unknown_thing', 20),
        reading('esp32s3-01', '__proto__', 20), reading('__proto__', 'water_temperature', 20),
        reading('', 'water_temperature', 20), { payload: JSON.stringify({ device_id: 5, measurement: 'water_temperature', value: 20 }) }
    ];
    for (const msg of junk) assert.equal(run('Evaluate against limits', msg, { flow }).result, null);
    assert.deepEqual(flow.get('ll_state'), {}, 'nothing recorded');
});
test('evaluate: accepts a Buffer payload and an object payload', () => {
    const flow = setup();
    run('Evaluate against limits', { payload: Buffer.from(JSON.stringify({ device_id: 'esp32s3-01', measurement: 'water_temperature', value: 21, unit: 'celsius' })) }, { flow });
    run('Evaluate against limits', { payload: { device_id: 'esp32s3-01', measurement: 'water_temperature', value: 22, unit: 'celsius' } }, { flow });
    assert.equal(flow.get('ll_state')['esp32s3-01/water_temperature'].value, 22);
});

// ---- status ----
test('status: returns the latest value, unit, state and age per sensor', () => {
    const flow = setup();
    run('Evaluate against limits', reading('esp32s3-01', 'water_temperature', 21.4, { timestamp: new Date(Date.now() - 7000).toISOString() }), { flow });
    const s = run('Latest values and state', http(), { flow }).result;
    assert.equal(s.statusCode, 200);
    assert.equal(s.payload.water_temperature.value, 21.4);
    assert.equal(s.payload.water_temperature.unit, 'celsius');
    assert.equal(s.payload.water_temperature.state, 'ok');
    assert.ok(s.payload.water_temperature.age_seconds >= 6 && s.payload.water_temperature.age_seconds <= 9);
    assert.equal(s.payload.internal_humidity, undefined);
});
test('status: empty object before any reading', () => {
    assert.deepEqual(run('Latest values and state', http()).result.payload, {});
});

// ---- AI suggestion ----
const B64 = 'A'.repeat(400);
const suggestMsg = (over = {}) => http({ payload: { image: B64, media_type: 'image/jpeg', ...over } });
test('suggest: 503 without an API key, and no request is built', () => {
    const { result } = run('Prepare AI request', suggestMsg(), { env: {} });
    assert.equal(result[0], null);
    assert.equal(result[1].statusCode, 503);
    assert.match(result[1].payload.message, /not configured/);
});
test('suggest: 400 for bad bodies', () => {
    const env = { ANTHROPIC_API_KEY: 'k' };
    for (const payload of [null, 'x', {}, { image: B64 }, { image: B64, media_type: 'image/png' }, { image: 'short', media_type: 'image/jpeg' },
        { image: 'not base64!'.repeat(20), media_type: 'image/jpeg' }, { image: 'A'.repeat(4000001), media_type: 'image/jpeg' }, { image: 5, media_type: 'image/jpeg' }]) {
        const { result } = run('Prepare AI request', http({ payload }), { env });
        assert.equal(result[1].statusCode, 400, JSON.stringify(payload).slice(0, 60));
    }
});
test('suggest: builds a Claude request with a forced tool call and never leaks the key into the body', () => {
    const { result } = run('Prepare AI request', suggestMsg(), { env: { ANTHROPIC_API_KEY: 'sk-test' } });
    const m = result[0];
    assert.equal(result[1], null);
    assert.equal(m.method, 'POST');
    assert.equal(m.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(m.headers['x-api-key'], 'sk-test');
    assert.equal(m.headers['anthropic-version'], '2023-06-01');
    assert.equal(m.payload.model, 'claude-sonnet-5');
    assert.deepEqual(m.payload.tool_choice, { type: 'tool', name: 'recommend_limits' });
    assert.equal(m.payload.messages[0].content[0].source.data, B64);
    assert.equal(m.payload.messages[0].content[0].source.media_type, 'image/jpeg');
    assert.deepEqual(Object.keys(m.payload.tools[0].input_schema.properties.limits.properties).sort(),
        ['external_temperature', 'internal_humidity', 'internal_temperature', 'water_temperature']);
    assert.ok(!JSON.stringify(m.payload).includes('sk-test'));
});
test('suggest: model and URL can be overridden by the tab variables', () => {
    const { result } = run('Prepare AI request', suggestMsg(), { env: { ANTHROPIC_API_KEY: 'k', ANTHROPIC_MODEL: 'm', ANTHROPIC_API_URL: 'http://127.0.0.1:9/x' } });
    assert.equal(result[0].payload.model, 'm');
    assert.equal(result[0].url, 'http://127.0.0.1:9/x');
});
test('suggest: rate limit answers 429 after the hourly maximum', () => {
    const flow = store();
    const env = { ANTHROPIC_API_KEY: 'k', SUGGEST_MAX_PER_HOUR: 2 };
    assert.ok(run('Prepare AI request', suggestMsg(), { flow, env }).result[0]);
    assert.ok(run('Prepare AI request', suggestMsg(), { flow, env }).result[0]);
    const third = run('Prepare AI request', suggestMsg(), { flow, env }).result;
    assert.equal(third[0], null);
    assert.equal(third[1].statusCode, 429);
    // requests older than an hour no longer count
    flow.set('ll_ai_hits', [Date.now() - 3700000, Date.now() - 3700000]);
    assert.ok(run('Prepare AI request', suggestMsg(), { flow, env }).result[0]);
});
test('suggest: bad requests do not use up the rate limit', () => {
    const flow = store();
    const env = { ANTHROPIC_API_KEY: 'k', SUGGEST_MAX_PER_HOUR: 1 };
    run('Prepare AI request', http({ payload: {} }), { flow, env });
    assert.ok(run('Prepare AI request', suggestMsg(), { flow, env }).result[0]);
});
const aiAnswer = (input, status = 200) => ({ statusCode: status, payload: { content: [{ type: 'text', text: 'hi' }, { type: 'tool_use', name: 'recommend_limits', input }] }, req: {}, res: {} });
test('suggest-parse: a good answer is cleaned and returned', () => {
    const { result } = run('Clean AI answer', aiAnswer({ plant: ' Basil ', confidence: 0.82, notes: 'Warm.', limits: { water_temperature: { min: 18.04, max: 24.06 }, internal_humidity: { min: 40, max: 70 } } }));
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.payload, { plant: 'Basil', confidence: 0.82, notes: 'Warm.', limits: { water_temperature: { min: 18, max: 24.1 }, internal_humidity: { min: 40, max: 70 } } });
});
test('suggest-parse: the AI is not trusted (clamping, dropping, coercion)', () => {
    const { result } = run('Clean AI answer', aiAnswer({
        plant: '', confidence: 7, notes: 'n'.repeat(1000),
        limits: {
            water_temperature: { min: -20, max: 80 },        // clamped to 0..50
            internal_temperature: { min: 30, max: 20 },      // dropped: min >= max
            internal_humidity: { min: '40', max: 70 },       // dropped: not numbers
            external_temperature: { min: 90, max: 100 },     // dropped: nothing left after clamping (60..60)
            nope: { min: 1, max: 2 },                        // unknown measurement is ignored
            __proto__: { min: 1, max: 2 }
        }
    }));
    assert.equal(result.statusCode, 200);
    assert.equal(result.payload.plant, 'Unknown plant');
    assert.equal(result.payload.confidence, 1);
    assert.equal(result.payload.notes.length, 400);
    assert.deepEqual(result.payload.limits, { water_temperature: { min: 0, max: 50 } });
});
test('suggest-parse: not-a-plant answer (confidence 0, no limits) is passed on', () => {
    const { result } = run('Clean AI answer', aiAnswer({ plant: 'Not a plant', confidence: 0, notes: 'Looks like a mug.', limits: {} }));
    assert.equal(result.statusCode, 200);
    assert.deepEqual(result.payload.limits, {});
    assert.equal(result.payload.confidence, 0);
});
test('suggest-parse: negative or non-numeric confidence becomes 0..1', () => {
    assert.equal(run('Clean AI answer', aiAnswer({ plant: 'x', confidence: -3, limits: {} })).result.payload.confidence, 0);
    assert.equal(run('Clean AI answer', aiAnswer({ plant: 'x', confidence: 'high', limits: {} })).result.payload.confidence, 0);
});
const upstream = (status, type, message) => ({ statusCode: status, payload: { type: 'error', error: { type, message } }, req: {}, res: {} });
test('suggest-parse: upstream errors are explained in plain words and logged with their type and message', () => {
    const cases = [
        [upstream(401, 'authentication_error', 'API key is invalid.'), 502, /key on the server was rejected/],
        [upstream(403, 'permission_error', 'Not allowed.'), 502, /key on the server was rejected/],
        [upstream(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.'), 502, /no credit left/],
        [upstream(404, 'not_found_error', 'model: claude-x'), 502, /model is not available/],
        [upstream(429, 'rate_limit_error', 'slow down'), 503, /busy/],
        [upstream(529, 'overloaded_error', 'Overloaded'), 503, /busy/],
        [upstream(503, 'api_error', 'x'), 503, /busy/],
        [upstream(400, 'invalid_request_error', 'messages: something else'), 502, /refused the request or is not available/],
        [upstream(500, 'api_error', 'Internal server error'), 502, /refused the request or is not available/]
    ];
    for (const [msg, status, pattern] of cases) {
        const { type, message } = msg.payload.error;   // the function reuses msg for its reply, so read these first
        const upstreamStatus = msg.statusCode;
        const { result, node } = run('Clean AI answer', msg);
        assert.equal(result.statusCode, status, message);
        assert.match(result.payload.message, pattern);
        assert.equal(node.logs.warn.length, 1);
        assert.match(node.logs.warn[0], new RegExp('status ' + upstreamStatus + ' \\(' + type + '\\)'), 'the log keeps the type Anthropic sent');
        assert.ok(!/sk-/.test(JSON.stringify(result.payload)), 'no key material in the answer');
    }
});
test('suggest-parse: an upstream error without a readable body is still handled', () => {
    for (const payload of [undefined, null, 'oops', {}, { error: 'text' }, { error: null }]) {
        const { result, node } = run('Clean AI answer', { statusCode: 500, payload });
        assert.equal(result.statusCode, 502);
        assert.equal(node.logs.warn.length, 1);
    }
});
test('suggest-parse: a very long upstream message is cut in the log', () => {
    const { node } = run('Clean AI answer', upstream(400, 'invalid_request_error', 'x'.repeat(5000)));
    assert.ok(node.logs.warn[0].length < 320);
});
test('suggest-parse: unusable 200 answers become 502', () => {
    assert.equal(run('Clean AI answer', { statusCode: 200, payload: { content: [{ type: 'text', text: 'no tool' }] } }).result.statusCode, 502);
    assert.equal(run('Clean AI answer', { statusCode: 200, payload: 'html' }).result.statusCode, 502);
    assert.equal(run('Clean AI answer', { statusCode: 200, payload: { content: [{ type: 'tool_use', name: 'other', input: {} }] } }).result.statusCode, 502);
});
test('suggest: a network failure reaches the caller as 502', () => {
    const { result } = run('AI unreachable', { error: { message: 'ECONNREFUSED' } });
    assert.equal(result.statusCode, 502);
});

// ---- static files ----
test('static: default file, folder handling and file names', () => {
    const ok = run('Pick file', { req: { params: {} } }, { env: {} }).result;
    assert.equal(ok[0].filename, '/data/leaflimits-app/index.html');
    assert.equal(run('Pick file', { req: { params: { file: 'main-ABCD1234.js' } } }, { env: { LEAFLIMITS_APP_DIR: '/x/app///' } }).result[0].filename, '/x/app/main-ABCD1234.js');
});
test('static: path traversal and odd names are refused', () => {
    for (const file of ['..', '../x', '..%2fx', 'a/b', '.env', '.hidden', 'a..b', 'x'.repeat(200), 'a b', 'a\\b', '~root', 'a\0b']) {
        const { result } = run('Pick file', { req: { params: { file } } }, { env: {} });
        assert.equal(result[0], null, JSON.stringify(file));
        assert.equal(result[1].statusCode, 400, JSON.stringify(file));
    }
});
test('static: content types and caching', () => {
    const h = (filename) => run('Set headers', { filename, payload: Buffer.from('x') }).result;
    assert.equal(h('/d/index.html').headers['Content-Type'], 'text/html; charset=utf-8');
    assert.equal(h('/d/index.html').headers['Cache-Control'], 'no-cache');
    assert.equal(h('/d/main-2XLXTAIA.js').headers['Cache-Control'], 'public, max-age=31536000, immutable');
    assert.equal(h('/d/styles-KAVM3CVH.css').headers['Content-Type'], 'text/css; charset=utf-8');
    assert.equal(h('/d/favicon.ico').headers['Cache-Control'], 'public, max-age=3600');
    assert.equal(h('/d/favicon.ico').statusCode, 200);
    assert.equal(h('/d/index.html').headers['X-Content-Type-Options'], 'nosniff');
});
test('static: unknown file types are not served', () => {
    for (const f of ['/d/secret.sh', '/d/x.php', '/d/noext', '/d/x.constructor']) assert.equal(run('Set headers', { filename: f }).result.statusCode, 404, f);
});
test('static: not-found reply', () => assert.equal(run('Not found', {}).result.statusCode, 404));

// ---- error handling ----
test('api functions answer 500 instead of throwing, and log the error', () => {
    const boom = { get() { throw new Error('boom'); }, set() {} };
    const { result, node } = run('Read profile', http(), { flow: boom });
    assert.equal(result.statusCode, 500);
    assert.deepEqual(result.payload, { message: 'Internal error.' });
    assert.equal(node.logs.error.length, 1);
    const two = run('Validate and save profile', http({ payload: { limits: {} } }), { flow: boom });
    assert.equal(two.result[0], null);
    assert.equal(two.result[1].statusCode, 500);
});
test('internal functions swallow errors and log them', () => {
    const boom = { get() { throw new Error('boom'); }, set() {} };
    const { result, node } = run('Evaluate against limits', reading('esp32s3-01', 'water_temperature', 20), { flow: boom });
    assert.equal(result, null);
    assert.equal(node.logs.error.length, 1);
});
