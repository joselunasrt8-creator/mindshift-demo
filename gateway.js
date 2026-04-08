'use strict';

const express = require('express');
const axios = require('axios');

const app = express();
const PORT = process.env.GATEWAY_PORT || 4000;
const VALIDATOR_URL = process.env.VALIDATOR_URL;

if (!VALIDATOR_URL) {
  console.error('Fatal: VALIDATOR_URL environment variable is not set');
  process.exit(1);
}

// Internal allowlist: target_key -> actual target URL
const ALLOWED_TARGETS = {
  'api-production': 'https://api.example.com/execute',
  'api-staging': 'https://staging.api.example.com/execute',
};

app.use(express.json());

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

const REQUIRED_TOP_FIELDS = ['decision_id', 'signature', 'target_key', 'aeo', 'run_id', 'commit_sha'];
const REQUIRED_AEO_FIELDS = ['intent', 'scope', 'validation', 'target', 'finality'];

app.post('/execute', async (req, res) => {
  const body = req.body || {};

  // Validate required top-level fields
  for (const field of REQUIRED_TOP_FIELDS) {
    if (body[field] == null) {
      return res.status(400).json({ error: `Missing required field: ${field}` });
    }
  }

  // Validate required aeo sub-fields
  const aeo = body.aeo;
  if (typeof aeo !== 'object' || Array.isArray(aeo)) {
    return res.status(400).json({ error: 'Invalid aeo: must be an object' });
  }
  for (const field of REQUIRED_AEO_FIELDS) {
    if (aeo[field] == null) {
      return res.status(400).json({ error: `Missing required aeo field: ${field}` });
    }
  }

  // Resolve target URL from allowlist
  const targetUrl = ALLOWED_TARGETS[body.target_key];
  if (!targetUrl) {
    return res.status(400).json({ error: `Unknown target_key: ${body.target_key}` });
  }

  // Call the validator
  let validatorStatus;
  try {
    const validatorResponse = await axios.post(VALIDATOR_URL, {
      decision_id: body.decision_id,
      signature: body.signature,
      aeo: body.aeo,
      run_id: body.run_id,
      commit_sha: body.commit_sha,
    });
    validatorStatus = validatorResponse.data && validatorResponse.data.status;
  } catch (err) {
    console.error(JSON.stringify({ event: 'validator_error', error: err.message, timestamp: new Date().toISOString() }));
    return res.status(502).json({ error: 'Validator request failed' });
  }

  // Log the execution record
  const record = {
    event: 'execution_attempt',
    run_id: body.run_id,
    commit_sha: body.commit_sha,
    decision_id: body.decision_id,
    target_key: body.target_key,
    validator_status: validatorStatus,
    timestamp: new Date().toISOString(),
  };
  console.log(JSON.stringify(record));

  // Fail closed on non-VALID response
  if (validatorStatus !== 'VALID') {
    return res.status(403).json({ error: 'Request not authorized by validator', validator_status: validatorStatus });
  }

  // Forward to the allowlisted target
  try {
    const targetResponse = await axios.post(targetUrl, body);
    if (targetResponse.status >= 200 && targetResponse.status < 300) {
      return res.status(targetResponse.status).json(targetResponse.data);
    }
    return res.status(502).json({ error: 'Target returned an unexpected response' });
  } catch (err) {
    console.error(JSON.stringify({ event: 'target_error', error: err.message, timestamp: new Date().toISOString() }));
    return res.status(502).json({ error: 'Target request failed' });
  }
});

app.listen(PORT, () => {
  console.log(`MindShift Gateway running on port ${PORT}`);
});

module.exports = app;
