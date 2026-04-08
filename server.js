'use strict';

const crypto = require('crypto');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

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
  const { decision_id, signature, repo, branch, aeo } = req.body || {};

  if (!decision_id || decision_id !== 'MS-DEMO-DEPLOY-001') {
    return res.json({ status: 'NULL', reason: 'Invalid or missing decision_id' });
  }

  if (!repo || repo !== 'mindshift-demo') {
    return res.json({ status: 'NULL', reason: 'Invalid or missing repo' });
  }

  if (!branch || branch !== 'main') {
    return res.json({ status: 'NULL', reason: 'Invalid or missing branch' });
  }

  if (!aeo || typeof aeo !== 'object' || Array.isArray(aeo)) {
    return res.json({ status: 'NULL', reason: 'Missing or invalid aeo' });
  }

  if (!signature) {
    return res.json({ status: 'NULL', reason: 'Missing signature' });
  }

  const expectedSignature = crypto
    .createHash('sha256')
    .update(decision_id + canonicalJson(aeo))
    .digest('hex');

  if (signature !== expectedSignature) {
    return res.json({ status: 'NULL', reason: 'Signature verification failed' });
  }

  for (const field of REQUIRED_AEO_FIELDS) {
    if (aeo[field] == null || aeo[field] === '') {
      return res.json({ status: 'NULL', reason: `Missing aeo field: ${field}` });
    }
  }

  if (typeof aeo.expires_at !== 'string') {
    return res.json({ status: 'NULL', reason: 'Invalid expires_at: must be a string' });
  }

  const expiresAt = new Date(aeo.expires_at);
  if (isNaN(expiresAt.getTime())) {
    return res.json({ status: 'NULL', reason: 'Invalid expires_at: not a valid ISO 8601 date' });
  }

  if (Date.now() >= expiresAt.getTime()) {
    return res.json({ status: 'NULL', reason: 'AEO has expired' });
  }

  return res.json({ status: 'VALID' });
});

app.listen(PORT, () => {
  console.log(`Validator API running on port ${PORT}`);
});
