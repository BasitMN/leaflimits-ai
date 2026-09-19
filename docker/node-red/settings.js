// Portable Node-RED settings, driven by environment variables (see .env.example).
// docker/node-red/settings.hetzner.js is kept unchanged for the running Hetzner deployment.
const adminHash = process.env.NODERED_ADMIN_HASH;

module.exports = {
    flowFile: 'flows.json',

    // Encrypts flows_cred.json. Set it before adding MQTT or other credentials to flows.
    credentialSecret: process.env.NODERED_CREDENTIAL_SECRET || undefined,

    // Editor login. Without NODERED_ADMIN_HASH the editor is open, which scripts/deploy.sh
    // only allows when Node-RED is bound to 127.0.0.1.
    adminAuth: adminHash ? {
        type: 'credentials',
        users: [{
            username: process.env.NODERED_ADMIN_USER || 'admin',
            password: adminHash,
            permissions: '*'
        }]
    } : undefined,

    functionGlobalContext: {}
};
