'use strict';

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const REQUIRED_AEO_FIELDS = ['intent', 'scope', 'validation', 'target', 'finality'];

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

  return res.json({ status: 'VALID' });
});

app.listen(PORT, () => {
  console.log(`Validator API running on port ${PORT}`);
});
