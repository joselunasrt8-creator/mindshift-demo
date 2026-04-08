'use strict';

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

const REQUIRED_AEO_FIELDS = ['intent', 'scope', 'validation', 'target', 'finality', 'expires_at'];

app.post('/validate', (req, res) => {
  const { decision_id, signature, repo, branch, aeo } = req.body || {};

  if (!decision_id || decision_id !== 'MS-DEMO-DEPLOY-001') {
    return res.json({ status: 'NULL', reason: 'Invalid or missing decision_id' });
  }

  if (!signature || signature !== 'demo-signature-v1') {
    return res.json({ status: 'NULL', reason: 'Invalid or missing signature' });
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
