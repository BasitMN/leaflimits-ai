// Bearer token check in front of every API route. Output 1 continues, output 2 is the error reply.
const denied = LL.auth(msg, env);
return denied ? [null, denied] : [msg, null];
