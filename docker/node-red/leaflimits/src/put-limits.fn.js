// Output 1: the profile as a retained MQTT message (the durable copy). Output 2: the HTTP reply.
const device = LL.device(msg);
if (!device) return [null, LL.reply(msg, 400, { message: 'Invalid device id.' })];
const parsed = LL.parseProfile(msg.payload, device);
if (parsed.error) return [null, LL.reply(msg, 400, { message: parsed.error })];
const profile = parsed.profile;

// Apply immediately, so a read right after the save already sees the new limits.
const profiles = flow.get('ll_profiles') || {};
const states = flow.get('ll_state') || {};
profiles[device] = profile;
LL.resetStates(states, device);
flow.set('ll_profiles', profiles);
flow.set('ll_state', states);

return [
    {
        topic: 'microhydros/v1/devices/' + device + '/limits/config',
        payload: JSON.stringify(Object.assign({ schema_version: LL.SCHEMA_VERSION }, profile)),
        retain: true,
        qos: 1
    },
    LL.reply(msg, 200, profile)
];
