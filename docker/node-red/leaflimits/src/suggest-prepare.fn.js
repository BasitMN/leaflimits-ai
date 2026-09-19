// POST /leaflimits/api/suggest. Output 1: the request for the Claude API. Output 2: an early reply.
// The key comes from the tab's credential variable ANTHROPIC_API_KEY, never from the flow file.
const key = env.get('ANTHROPIC_API_KEY');
if (!key) {
    return [null, LL.reply(msg, 503, { message: 'AI suggestions are not configured on the server. Enter the limits by hand.' })];
}

const body = msg.payload;
if (!body || typeof body !== 'object' || body.media_type !== 'image/jpeg' || typeof body.image !== 'string'
    || body.image.length < 100 || body.image.length > 4000000 || !/^[A-Za-z0-9+/=]+$/.test(body.image)) {
    return [null, LL.reply(msg, 400, { message: 'Send a JPEG photo as base64 in "image", with "media_type": "image/jpeg".' })];
}

// At most SUGGEST_MAX_PER_HOUR requests per hour for the whole server, to protect the API bill.
const max = Number(env.get('SUGGEST_MAX_PER_HOUR')) || 20;
const now = Date.now();
const hits = (flow.get('ll_ai_hits') || []).filter((t) => now - t < 3600000);
if (hits.length >= max) {
    return [null, LL.reply(msg, 429, { message: 'Too many AI requests this hour. Try again later or enter the limits by hand.' })];
}
hits.push(now);
flow.set('ll_ai_hits', hits);

const range = (key2) => {
    const m = LL.MEASUREMENTS[key2];
    return {
        type: 'object',
        description: m.label + ' in ' + (key2 === 'internal_humidity' ? '% relative humidity' : 'degrees Celsius') +
            '. Allowed values ' + m.hardMin + ' to ' + m.hardMax + '.',
        properties: { min: { type: 'number' }, max: { type: 'number' } },
        required: ['min', 'max']
    };
};
const limitProps = {};
for (const k of Object.keys(LL.MEASUREMENTS)) limitProps[k] = range(k);

msg.method = 'POST';
msg.url = env.get('ANTHROPIC_API_URL') || 'https://api.anthropic.com/v1/messages';
msg.headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
msg.payload = {
    model: env.get('ANTHROPIC_MODEL') || 'claude-sonnet-5',
    max_tokens: 1024,
    system: 'You help a hobby grower set operating limits for a small indoor hydroponic system. You get one photo of a plant. ' +
        'Identify the plant as well as you can and recommend comfortable operating ranges for the sensors in the tool. ' +
        'Rules: temperatures are in degrees Celsius and humidity is relative humidity in percent. Stay inside the allowed range given for each sensor. ' +
        'A range describes healthy conditions for this plant in a hydroponic setup, not the extremes it can survive. ' +
        'Only include external_temperature if the outside air matters for this plant, otherwise leave it out. ' +
        'If the photo does not show a plant or you cannot tell what it is, set confidence to 0, leave limits empty and explain in notes. ' +
        'Set confidence honestly between 0 and 1. Keep notes under 300 characters. Answer only by calling the tool.',
    messages: [{
        role: 'user',
        content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: body.image } },
            { type: 'text', text: 'Recommend limits for this plant.' }
        ]
    }],
    tools: [{
        name: 'recommend_limits',
        description: 'Report the identified plant and the recommended operating limits.',
        input_schema: {
            type: 'object',
            properties: {
                plant: { type: 'string', description: 'Common name of the plant, for example Basil' },
                confidence: { type: 'number', description: 'How sure you are about the plant, 0 to 1' },
                notes: { type: 'string', description: 'Short reasoning or caveats' },
                limits: { type: 'object', properties: limitProps }
            },
            required: ['plant', 'confidence', 'notes', 'limits']
        }
    }],
    tool_choice: { type: 'tool', name: 'recommend_limits' }
};
return [msg, null];
