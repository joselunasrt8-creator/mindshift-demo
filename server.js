'use strict';

const crypto = require('crypto');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
const VALIDATOR_TOKEN = process.env.VALIDATOR_TOKEN;

app.use(express.json());

const healthHandler = (req, res) => res.status(200).json({ status: 'ok' });

app.get('/', healthHandler);
app.get('/health', healthHandler);

const REQUIRED_AEO_FIELDS = ['intent', 'scope', 'validation', 'target', 'finality', 'expires_at'];

/**
 * Produce a canonical JSON string with keys sorted alphabetically at every
 * level of nesting. This eliminates any dependency on key-insertion order so
 * the same logical object always produces the same byte sequence.
 * Whitespace is intentionally omitted to keep the representation compact and
 * byte-for-byte deterministic across all JSON serializers.
 */
function canonicalJson(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}

app.post('/validate', (req, res) => {
  const requestTimestamp = new Date().toISOString();

  const authHeader = req.headers['authorization'] || '';
  const bearerMatch = authHeader.match(/^\s*Bearer\s+(.+?)\s*$/i);
  const token = bearerMatch ? bearerMatch[1].trim() : null;
  if (!VALIDATOR_TOKEN || token !== VALIDATOR_TOKEN) {
    console.log(JSON.stringify({ event: 'validate_request', timestamp: requestTimestamp, status: 'UNAUTHORIZED', reason: 'Missing or invalid Authorization token' }));
    return res.status(401).json({ status: 'UNAUTHORIZED', reason: 'Missing or invalid Authorization token' });
  }

  const { decision_id, signature, repo, branch, aeo } = req.body || {};

  const logAndRespond = (httpStatus, body) => {
    console.log(JSON.stringify({
      event: 'validate_request',
      timestamp: requestTimestamp,
      decision_id: decision_id || null,
      repo: repo || null,
      branch: branch || null,
      status: body.status,
      reason: body.reason || null,
    }));
    return res.status(httpStatus).json(body);
  };

  if (!decision_id || decision_id !== 'MS-DEMO-DEPLOY-001') {
    return logAndRespond(200, { status: 'NULL', reason: 'Invalid or missing decision_id' });
  }

  if (!repo || repo !== 'mindshift-demo') {
    return logAndRespond(200, { status: 'NULL', reason: 'Invalid or missing repo' });
  }

  if (!branch || branch !== 'main') {
    return logAndRespond(200, { status: 'NULL', reason: 'Invalid or missing branch' });
  }

  if (!aeo || typeof aeo !== 'object' || Array.isArray(aeo)) {
    return logAndRespond(200, { status: 'NULL', reason: 'Missing or invalid aeo' });
  }

  if (!signature) {
    return logAndRespond(200, { status: 'NULL', reason: 'Missing signature' });
  }

  const expectedSignature = crypto
    .createHash('sha256')
    .update(decision_id + canonicalJson(aeo))
    .digest('hex');

  if (signature !== expectedSignature) {
    return logAndRespond(200, { status: 'NULL', reason: 'Signature verification failed' });
  }

  for (const field of REQUIRED_AEO_FIELDS) {
    if (aeo[field] == null || aeo[field] === '') {
      return logAndRespond(200, { status: 'NULL', reason: `Missing aeo field: ${field}` });
    }
  }

  if (typeof aeo.expires_at !== 'string') {
    return logAndRespond(200, { status: 'NULL', reason: 'Invalid expires_at: must be a string' });
  }

  const expiresAt = new Date(aeo.expires_at);
  if (isNaN(expiresAt.getTime())) {
    return logAndRespond(200, { status: 'NULL', reason: 'Invalid expires_at: not a valid ISO 8601 date' });
  }

  if (Date.now() >= expiresAt.getTime()) {
    return logAndRespond(200, { status: 'NULL', reason: 'AEO has expired' });
  }

  return logAndRespond(200, { status: 'VALID' });
});

app.listen(PORT, () => {
  if (!VALIDATOR_TOKEN) {
    console.warn('WARNING: VALIDATOR_TOKEN is not set — all /validate requests will be rejected with 401');
  }
  console.log(`Validator API running on port ${PORT}`);
});
