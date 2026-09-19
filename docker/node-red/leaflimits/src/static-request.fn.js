// GET /leaflimits and GET /leaflimits/:file. Output 1 goes to the file-in node, output 2 is an error reply.
// Only plain file names are accepted, so nothing outside the app folder can be read.
const file = (msg.req && msg.req.params && msg.req.params.file) || 'index.html';
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(file) || file.indexOf('..') !== -1) {
    return [null, LL.reply(msg, 400, { message: 'Bad file name.' })];
}
const dir = String(env.get('LEAFLIMITS_APP_DIR') || '/data/leaflimits-app').replace(/\/+$/, '');
msg.filename = dir + '/' + file;
return [msg, null];
