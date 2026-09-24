const device = LL.device(msg);
if (!device) return LL.reply(msg, 400, { message: 'Invalid device id.' });
const profile = LL.own(flow.get('ll_profiles') || {}, device);
return LL.reply(msg, 200, profile || LL.defaultProfile(device));
