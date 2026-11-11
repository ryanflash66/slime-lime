// Signs PayPal subscription IDs created by this server, so later calls (status, manage) can tell
// a subscription we priced from one a buyer started on their own with the public plan ID.
//   sig = base64url(HMAC-SHA256(SUB_SIGNING_SECRET, subscriptionId))
// The secret comes only from the SUB_SIGNING_SECRET environment variable.

const crypto = require('crypto');

function secret() {
  const s = process.env.SUB_SIGNING_SECRET;
  return typeof s === 'string' && s.length > 0 ? s : null;
}

// Returns the secret, or throws a 503 error when SUB_SIGNING_SECRET is missing.
function assertConfigured() {
  const key = secret();
  if (!key) {
    const err = new Error('Subscriptions are not configured on the server.');
    err.status = 503;
    throw err;
  }
  return key;
}

function hmac(key, id) {
  return crypto.createHmac('sha256', key).update(id, 'utf8').digest('base64url');
}

// Returns the signature for a subscription ID. Throws a 503 error when the secret is missing.
function sign(id) {
  const key = assertConfigured();
  if (typeof id !== 'string' || id.length === 0) throw new TypeError('sign() needs a subscription ID.');
  return hmac(key, id);
}

// True only when `sig` is the signature of `id`. Never throws: a missing secret, a non-string,
// or a signature of the wrong length is simply false.
function verify(id, sig) {
  try {
    const key = secret();
    if (!key || typeof id !== 'string' || id.length === 0 || typeof sig !== 'string') return false;
    const expected = Buffer.from(hmac(key, id), 'utf8');
    const given = Buffer.from(sig, 'utf8');
    if (given.length !== expected.length) return false;
    return crypto.timingSafeEqual(given, expected);
  } catch (e) {
    return false;
  }
}

module.exports = { sign, verify, assertConfigured };
