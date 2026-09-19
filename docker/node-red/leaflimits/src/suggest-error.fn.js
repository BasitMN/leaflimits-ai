// Reached from a catch node when the request to the Claude API fails (network, timeout).
node.warn('Request to the AI service failed: ' + (msg.error && msg.error.message));
return LL.reply(msg, 502, { message: 'Could not reach the AI service. Enter the limits by hand.' });
