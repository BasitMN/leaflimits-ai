// Input: the retained profile on microhydros/v1/devices/{device}/limits/config.
// The broker is the source of truth, so limits survive a Node-RED restart: the retained message
// is delivered again as soon as this flow subscribes.
const device = String(msg.topic || '').split('/')[3];
if (!LL.DEVICE_RE.test(device || '')) return null;

const profiles = flow.get('ll_profiles') || {};
const states = flow.get('ll_state') || {};
const text = Buffer.isBuffer(msg.payload) ? msg.payload.toString('utf8') : msg.payload;

if (text === undefined || text === null || (typeof text === 'string' && text.trim() === '')) {
    // An empty retained message clears the profile.
    delete profiles[device];
} else {
    const raw = LL.parseJson(text);
    if (raw === undefined) { node.warn('Ignoring limits for ' + device + ': not valid JSON'); return null; }
    const parsed = LL.parseProfile(raw, device);
    if (parsed.error) { node.warn('Ignoring invalid limits for ' + device + ': ' + parsed.error); return null; }
    if (typeof raw.updated_at === 'string') parsed.profile.updated_at = raw.updated_at;
    profiles[device] = parsed.profile;
}
LL.resetStates(states, device);
flow.set('ll_profiles', profiles);
flow.set('ll_state', states);
return null;
