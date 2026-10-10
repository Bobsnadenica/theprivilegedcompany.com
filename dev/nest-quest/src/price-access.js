// Release gate: enable a source only after written permission / an appropriate
// public-display licence. Public HTTP access and CORS are not a data licence.
// Keep provider API keys in the licensed gateway, never in browser saves.
export const PRICE_ACCESS = Object.freeze({
  crypto: false,
  stockEndpoint: '',
});
