// Thin PayPal REST client (Orders v2, Catalog Products, Billing Plans) for Vercel serverless functions.
// Credentials come only from Vercel environment variables, never from code:
//   PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, and optional PAYPAL_ENV ("sandbox" default, or "live").

const crypto = require('crypto');

function paypalEnv() {
  return process.env.PAYPAL_ENV === 'live' ? 'live' : 'sandbox';
}

function apiBase() {
  return paypalEnv() === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
}

function credentials() {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) {
    const err = new Error('PayPal is not configured on the server.');
    err.status = 503;
    throw err;
  }
  return { id, secret };
}

// Access tokens last hours; cache one per warm function instance.
let cached = null; // { token, expiresAt }

async function getAccessToken() {
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  const { id, secret } = credentials();
  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw upstreamError('Could not get a PayPal access token.', res.status, data);
  }
  // Refresh a minute early.
  cached = { token: data.access_token, expiresAt: Date.now() + Math.max(0, (data.expires_in || 0) - 60) * 1000 };
  return cached.token;
}

// POST to PayPal. Pass a stable `requestId` to make the call idempotent across instances
// (PayPal returns the original result for a replayed PayPal-Request-Id instead of acting twice);
// by default every call gets a fresh one.
async function paypalFetch(path, body, requestId) {
  return paypalRequest('POST', path, body, requestId || crypto.randomUUID());
}

async function paypalGet(path) {
  return paypalRequest('GET', path);
}

async function paypalRequest(method, path, body, requestId) {
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    headers['PayPal-Request-Id'] = requestId;
  }
  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  // Some calls (e.g. plan activate) answer 204 with no body.
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw upstreamError(`PayPal request failed (${method} ${path.split('?')[0]}).`, res.status, data);
  return data;
}

async function createOrder({ items, total }) {
  return paypalFetch('/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      description: 'Slime Lime order',
      items,
      amount: {
        currency_code: 'USD',
        value: total,
        breakdown: { item_total: { currency_code: 'USD', value: total } },
      },
    }],
  });
}

async function captureOrder(orderId) {
  return paypalFetch(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`);
}

function upstreamError(message, status, data) {
  const err = new Error(message);
  // Pass PayPal's 4xx through (e.g. order already captured); anything else is a 502.
  err.status = status >= 400 && status < 500 && status !== 401 ? status : 502;
  err.paypal = { name: data && data.name, issue: data && data.details && data.details[0] && data.details[0].issue, debug_id: data && data.debug_id };
  return err;
}

// Shared JSON responder for the functions.
function sendError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error('[paypal]', err.message, err.paypal || '');
  res.status(status).json({ error: status >= 500 && !err.paypal ? 'Checkout is unavailable right now.' : err.message, paypal: err.paypal });
}

function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return {};
}

module.exports = { paypalEnv, paypalFetch, paypalGet, createOrder, captureOrder, sendError, readJson };
