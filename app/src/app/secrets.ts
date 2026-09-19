/**
 * The app only ever holds the LeafLimits access token. An Anthropic API key (sk-ant-...) belongs on the server
 * and must never be typed into the app, stored in the browser or sent over the network from here.
 */
const API_KEY_LIKE = /^sk-[A-Za-z0-9_-]{16,}$/;

export function looksLikeApiKey(value: string | null | undefined): boolean {
  return API_KEY_LIKE.test((value ?? '').trim());
}

export const API_KEY_WARNING =
  'That looks like an Anthropic API key. Do not enter it here. The key stays on the server (in the Node-RED tab or the key file). ' +
  'Enter the LeafLimits access token instead.';
