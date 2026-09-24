// Reads the tool call out of the Claude response and cleans it. The AI is never trusted:
// every range is checked against the sensor's plausible range and invalid ones are dropped.
if (msg.statusCode !== 200) {
    // Log Anthropic's own error type and message (they never contain the key), and tell the app the real reason.
    const e = msg.payload && typeof msg.payload === 'object' && msg.payload.error && typeof msg.payload.error === 'object' ? msg.payload.error : {};
    const detail = String(e.message || '').slice(0, 200);
    node.warn('Anthropic API answered with status ' + msg.statusCode + (e.type ? ' (' + e.type + ')' : '') + (detail ? ': ' + detail : ''));
    const s = msg.statusCode;
    if (s === 401 || s === 403) {
        return LL.reply(msg, 502, { message: "The AI key on the server was rejected. The server owner needs to check the key." });
    }
    if (s === 400 && /credit balance/i.test(detail)) {
        return LL.reply(msg, 502, { message: 'The AI account has no credit left. The server owner needs to add credit.' });
    }
    if (s === 404) {
        return LL.reply(msg, 502, { message: "The AI model is not available for the server's key." });
    }
    if (s === 429 || s === 503 || s === 529) {
        return LL.reply(msg, 503, { message: 'The AI service is busy right now. Try again in a minute.' });
    }
    return LL.reply(msg, 502, { message: 'The AI service refused the request or is not available. Enter the limits by hand.' });
}
const blocks = msg.payload && Array.isArray(msg.payload.content) ? msg.payload.content : [];
const call = blocks.find((b) => b && b.type === 'tool_use' && b.name === 'recommend_limits');
if (!call || !call.input || typeof call.input !== 'object') {
    return LL.reply(msg, 502, { message: 'The AI did not return a usable answer. Enter the limits by hand.' });
}
const input = call.input;
const round1 = (n) => Math.round(n * 10) / 10;

const limits = {};
const source = input.limits && typeof input.limits === 'object' ? input.limits : {};
for (const key of Object.keys(LL.MEASUREMENTS)) {
    const r = LL.own(source, key);
    if (!r || typeof r.min !== 'number' || typeof r.max !== 'number' || !Number.isFinite(r.min) || !Number.isFinite(r.max)) continue;
    const m = LL.MEASUREMENTS[key];
    const min = round1(Math.max(m.hardMin, r.min));
    const max = round1(Math.min(m.hardMax, r.max));
    if (LL.checkRange(key, { min, max }) === null) limits[key] = { min, max };
}

const conf = typeof input.confidence === 'number' && Number.isFinite(input.confidence) ? input.confidence : 0;
const text = (v, n, fallback) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : fallback);
return LL.reply(msg, 200, {
    plant: text(input.plant, 80, 'Unknown plant'),
    confidence: Math.min(1, Math.max(0, conf)),
    notes: text(input.notes, 400, ''),
    limits
});
