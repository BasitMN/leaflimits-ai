const device = LL.device(msg);
if (!device) return LL.reply(msg, 400, { message: 'Invalid device id.' });
const states = flow.get('ll_state') || {};
const now = Date.now();
const out = {};
for (const key of Object.keys(LL.MEASUREMENTS)) {
    const e = LL.own(states, device + '/' + key);
    if (e && e.value !== undefined) {
        const age = Math.round((now - Date.parse(e.timestamp)) / 1000);
        out[key] = { value: e.value, unit: e.unit, state: e.state, timestamp: e.timestamp, age_seconds: Number.isFinite(age) ? Math.max(0, age) : null };
    }
}
return LL.reply(msg, 200, out);
