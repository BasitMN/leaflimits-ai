// LeafLimits shared code. build.js inlines this block at the top of every function node,
// because Node-RED function nodes cannot import modules. The unit tests run the same text.
const LL = {
    SCHEMA_VERSION: 1,

    // Same plausible ranges as PLAUSIBLE_RANGES in the MQTT Validation flow. Limits must stay inside them.
    MEASUREMENTS: {
        water_temperature: { label: 'Water temperature', hardMin: 0, hardMax: 50 },
        internal_temperature: { label: 'Air temperature, inside', hardMin: -10, hardMax: 60 },
        internal_humidity: { label: 'Humidity, inside', hardMin: 0, hardMax: 100 },
        external_temperature: { label: 'Air temperature, outside', hardMin: -40, hardMax: 60 }
    },
    // Must start with a letter or digit, so names like __proto__ are never valid device ids.
    DEVICE_RE: /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/,

    ENTER_COUNT: 3,   // consecutive out-of-range readings before low/high is raised (15 s at a 5 s interval)
    EXIT_COUNT: 2,    // consecutive in-range readings before low/high is cleared
    HYSTERESIS: 0.02, // share of (max - min) a value must move back inside before it counts as in range

    known(key) {
        return Object.prototype.hasOwnProperty.call(LL.MEASUREMENTS, key);
    },

    own(obj, key) {
        return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
    },

    // MQTT payloads arrive as string or Buffer. Returns the parsed value, or undefined when it is not JSON.
    parseJson(payload) {
        let raw = payload;
        if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
        if (typeof raw !== 'string') return raw;
        try { return JSON.parse(raw); } catch (e) { return undefined; }
    },

    // After a profile change every sensor starts over from "unknown". The latest values are kept.
    resetStates(states, device) {
        for (const key of Object.keys(LL.MEASUREMENTS)) {
            const e = LL.own(states, device + '/' + key);
            if (e) states[device + '/' + key] = { state: 'unknown', streak: 0, value: e.value, unit: e.unit, timestamp: e.timestamp };
        }
    },

    reply(msg, status, body, extraHeaders) {
        msg.statusCode = status;
        msg.payload = body;
        msg.headers = Object.assign({
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        }, extraHeaders || {});
        return msg;
    },

    // Constant-time comparison, so the response time does not reveal how much of a token matched.
    sameToken(a, b) {
        if (typeof a !== 'string' || typeof b !== 'string') return false;
        let diff = a.length ^ b.length;
        const n = Math.max(a.length, b.length);
        for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
        return diff === 0;
    },

    // Returns null when the request may continue, otherwise the reply to send.
    auth(msg, env) {
        const expected = env.get('LEAFLIMITS_TOKEN');
        if (!expected) return LL.reply(msg, 503, { message: 'The access token is not configured on the server.' });
        const header = (msg.req && msg.req.headers && msg.req.headers.authorization) || '';
        const m = /^Bearer\s+(.+)$/i.exec(header);
        if (!m || !LL.sameToken(m[1].trim(), String(expected))) {
            return LL.reply(msg, 401, { message: 'Wrong or missing access token.' });
        }
        return null;
    },

    device(msg) {
        const d = msg.req && msg.req.params && msg.req.params.device;
        return typeof d === 'string' && LL.DEVICE_RE.test(d) ? d : null;
    },

    defaultProfile(device) {
        return { device_id: device, plant: '', source: 'default', updated_at: null, limits: {} };
    },

    // Returns a problem description, or null when the range is fine.
    checkRange(key, r) {
        const m = LL.MEASUREMENTS[key];
        if (!r || typeof r !== 'object' || Array.isArray(r)) return 'must be an object with min and max';
        if (typeof r.min !== 'number' || typeof r.max !== 'number' || !Number.isFinite(r.min) || !Number.isFinite(r.max)) {
            return 'min and max must be numbers';
        }
        if (r.min >= r.max) return 'min must be lower than max';
        if (r.min < m.hardMin || r.max > m.hardMax) return 'must stay between ' + m.hardMin + ' and ' + m.hardMax;
        return null;
    },

    // Strict: any problem rejects the whole profile. Returns { error } or { profile }.
    parseProfile(body, device) {
        if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'The body must be a JSON object.' };
        const problems = [];
        const plant = body.plant === undefined ? '' : body.plant;
        if (typeof plant !== 'string' || plant.length > 60) problems.push('plant must be text of at most 60 characters');
        const input = body.limits === undefined ? {} : body.limits;
        const limits = {};
        if (!input || typeof input !== 'object' || Array.isArray(input)) {
            problems.push('limits must be an object');
        } else {
            for (const key of Object.keys(input)) {
                if (!LL.known(key)) { problems.push('unknown measurement "' + key + '"'); continue; }
                const p = LL.checkRange(key, input[key]);
                if (p) problems.push(key + ': ' + p);
                else limits[key] = { min: input[key].min, max: input[key].max };
            }
        }
        if (problems.length) return { error: problems.join('; ') };
        return {
            profile: {
                device_id: device,
                plant: String(plant).trim(),
                source: body.source === 'ai' ? 'ai' : 'manual',
                updated_at: new Date().toISOString(),
                limits
            }
        };
    },

    classify(value, range) {
        if (!range) return 'unknown';
        if (value < range.min) return 'low';
        if (value > range.max) return 'high';
        return 'ok';
    },

    // One step of the per-sensor state machine. Returns the new entry (without value fields) and
    // whether an alert should be published (entering or leaving low/high).
    step(prev, value, range) {
        const isAlert = (s) => s === 'low' || s === 'high';
        if (!range) return { entry: { state: 'unknown', streak: 0 }, changed: isAlert(prev.state) };

        // No history, or the limits were just changed: start from "ok" so that a single odd reading
        // does not raise an alert.
        const before = prev.state === 'unknown' ? 'ok' : prev.state;
        let target = LL.classify(value, range);
        if (target === 'ok') {
            const band = (range.max - range.min) * LL.HYSTERESIS;
            if (before === 'low' && value < range.min + band) target = 'low';
            if (before === 'high' && value > range.max - band) target = 'high';
        }
        if (target === before) return { entry: { state: before, streak: 0 }, changed: false };

        const need = target === 'ok' ? LL.EXIT_COUNT : LL.ENTER_COUNT;
        const streak = (prev.candidate === target ? prev.streak : 0) + 1;
        if (streak >= need) {
            return { entry: { state: target, streak: 0 }, changed: isAlert(target) || isAlert(before) };
        }
        return { entry: { state: before, streak, candidate: target }, changed: false };
    }
};
