// Input: one validated reading from microhydros/v1/devices/+/telemetry/validated/+
// Updates the per-sensor state and sends an alert message only when the state changes.
const r = LL.parseJson(msg.payload);
if (!r || typeof r !== 'object') return null;
const device = r.device_id;
const key = r.measurement;
const value = r.value;
if (typeof device !== 'string' || !LL.DEVICE_RE.test(device) || typeof key !== 'string' || !LL.known(key)
    || typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
}

const profile = LL.own(flow.get('ll_profiles') || {}, device);
const range = profile && profile.limits ? LL.own(profile.limits, key) : undefined;
const states = flow.get('ll_state') || {};
const id = device + '/' + key;
const prev = LL.own(states, id) || { state: 'unknown', streak: 0 };
const timestamp = typeof r.timestamp === 'string' ? r.timestamp : new Date().toISOString();

const result = LL.step(prev, value, range);
states[id] = Object.assign({}, result.entry, { value, unit: r.unit, timestamp });
flow.set('ll_state', states);

if (!result.changed) return null;
return {
    topic: 'microhydros/v1/devices/' + device + '/limits/alert',
    qos: 1,
    retain: false,
    payload: {
        schema_version: LL.SCHEMA_VERSION,
        device_id: device,
        measurement: key,
        state: result.entry.state,
        previous_state: prev.state,
        value,
        unit: r.unit,
        limit: range ? { min: range.min, max: range.max } : null,
        timestamp
    }
};
