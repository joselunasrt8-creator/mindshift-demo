'use strict';

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const registry = require('./registry');

const app = express();
const PORT = process.env.GATEWAY_PORT || 4000;
const VALIDATOR_URL = process.env.VALIDATOR_URL;
const REPO_NAME = process.env.REPO_NAME;
const BRANCH_NAME = process.env.BRANCH_NAME;

if (!VALIDATOR_URL) {
  console.error('Fatal: VALIDATOR_URL environment variable is not set');
  process.exit(1);
}
if (!REPO_NAME) {
  console.error('Fatal: REPO_NAME environment variable is not set');
  process.exit(1);
}
if (!BRANCH_NAME) {
  console.error('Fatal: BRANCH_NAME environment variable is not set');
  process.exit(1);
}

const ALLOWED_TARGETS = {
  'api-production': 'https://api.example.com/execute',
  'api-staging': 'https://staging.api.example.com/execute',
};

app.use(express.json());

app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

function canonicalJson(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return JSON.stringify(v);
  }
  return '{' + Object.keys(v).sort().map(k =>
    JSON.stringify(k) + ':' + canonicalJson(v[k])
  ).join(',') + '}';
}

const REQUIRED_TOP_FIELDS = ['decision_id', 'signature', 'target_key', 'aeo', 'run_id', 'commit_sha'];
const REQUIRED_AEO_FIELDS = ['intent', 'scope', 'validation', 'target', 'finality'];

app.post('/execute', async (req, res) => {
  const body = req.body || {};

  for (const field of REQUIRED_TOP_FIELDS) {
    if (body[field] == null) {
      return res.status(400).json({ error: `Missing required field: ${field}` });
    }
  }

  const aeo = body.aeo;
  if (typeof aeo !== 'object' || Array.isArray(aeo)) {
    return res.status(400).json({ error: 'Invalid aeo: must be an object' });
  }

  for (const field of REQUIRED_AEO_FIELDS) {
    if (aeo[field] == null) {
      return res.status(400).json({ error: `Missing required aeo field: ${field}` });
    }
  }

  const targetUrl = ALLOWED_TARGETS[body.target_key];
  if (!targetUrl) {
    return res.status(400).json({ error: `Unknown target_key: ${body.target_key}` });
  }

  let validatorStatus;
  try {
    const validatorResponse = await axios.post(`${VALIDATOR_URL}/validate`, {
      decision_id: body.decision_id,
      signature: body.signature,
      repo: REPO_NAME,
      branch: BRANCH_NAME,
      aeo: body.aeo,
    });
    validatorStatus = validatorResponse.data && validatorResponse.data.status;
  } catch (err) {
    console.error(JSON.stringify({
      event: 'validator_error',
      error: err.message,
      timestamp: new Date().toISOString()
    }));
    return res.status(502).json({ error: 'Validator request failed' });
  }

  if (validatorStatus !== 'VALID') {
    return res.status(403).json({
      error: 'Request not authorized by validator',
      validator_status: validatorStatus
    });
  }

  const aeoHash = crypto
    .createHash('sha256')
    .update(body.decision_id + canonicalJson(body.aeo))
    .digest('hex');

  const timestamp = new Date().toISOString();

  registry.recordExecution(
    body.decision_id,
    body.target_key,
    body.run_id,
    body.commit_sha,
    aeoHash,
    body.aeo.finality && body.aeo.finality.proof_type
      ? body.aeo.finality.proof_type
      : null,
    timestamp
  );

  try {
    const targetResponse = await axios.post(targetUrl, body);

    if (targetResponse.status >= 200 && targetResponse.status < 300) {
      return res.status(200).json({
        executed: true,
        result: "VALID",
        decision_id: body.decision_id,
        surface: body.target_key,
        run_id: body.run_id,
        commit_sha: body.commit_sha,
        aeo_hash: aeoHash,
        status: "EXECUTED",
        timestamp
      });
    }

    return res.status(502).json({
      error: 'Target returned an unexpected response'
    });
  } catch (err) {
    console.error(JSON.stringify({
      event: 'target_error',
      error: err.message,
      timestamp: new Date().toISOString()
    }));
    return res.status(502).json({
      error: 'Target request failed'
    });
  }
});

app.post('/proof', async (req, res) => {
  const body = req.body || {};
  const { decision_id, surface, proof } = body;

  if (!decision_id) {
    return res.status(400).json({
      recorded: false,
      result: 'NULL',
      reason: 'missing_decision_id'
    });
  }

  if (!surface) {
    return res.status(400).json({
      recorded: false,
      result: 'NULL',
      reason: 'missing_surface'
    });
  }

  if (!proof || typeof proof !== 'object') {
    return res.status(400).json({
      recorded: false,
      result: 'NULL',
      reason: 'missing_proof'
    });
  }

  if (!proof.proof_type) {
    return res.status(400).json({
      recorded: false,
      result: 'NULL',
      reason: 'missing_proof_type'
    });
  }

  if (!proof.proof_reference) {
    return res.status(400).json({
      recorded: false,
      result: 'NULL',
      reason: 'missing_proof_reference'
    });
  }

  if (!proof.observed_at) {
    return res.status(400).json({
      recorded: false,
      result: 'NULL',
      reason: 'missing_observed_at'
    });
  }

  // Requires registry helper
  registry.getLatestExecutionByDecision(decision_id, (err, execution) => {
    if (err) {
      console.error(JSON.stringify({
        event: 'proof_lookup_error',
        error: err.message,
        timestamp: new Date().toISOString()
      }));
      return res.status(500).json({
        recorded: false,
        result: 'NULL',
        reason: 'execution_lookup_failed'
      });
    }

    if (!execution) {
      return res.status(404).json({
        recorded: false,
        result: 'NULL',
        reason: 'missing_execution'
      });
    }

    if (surface !== execution.surface) {
      return res.status(409).json({
        recorded: false,
        result: 'NULL',
        reason: 'surface_mismatch'
      });
    }

    if (proof.proof_type !== execution.proof_type) {
      return res.status(409).json({
        recorded: false,
        result: 'NULL',
        reason: 'proof_type_mismatch'
      });
    }

    // Requires registry helper
    registry.getProofByExecutionId(execution.id, (dupErr, existingProof) => {
      if (dupErr) {
        console.error(JSON.stringify({
          event: 'proof_replay_check_error',
          error: dupErr.message,
          timestamp: new Date().toISOString()
        }));
        return res.status(500).json({
          recorded: false,
          result: 'NULL',
          reason: 'proof_replay_check_failed'
        });
      }

      if (existingProof) {
        return res.status(409).json({
          recorded: false,
          result: 'NULL',
          reason: 'duplicate_proof'
        });
      }

      const proofHash = crypto
        .createHash('sha256')
        .update(
          decision_id +
          execution.aeo_hash +
          surface +
          proof.proof_type +
          proof.proof_reference +
          proof.observed_at
        )
        .digest('hex');

      const timestamp = new Date().toISOString();

      registry.recordProof(
        decision_id,
        execution.id,
        surface,
        proof.proof_type,
        proofHash,
        timestamp
      );

      return res.status(200).json({
        recorded: true,
        result: 'VALID',
        decision_id,
        execution_id: execution.id,
        surface,
        proof_type: proof.proof_type,
        proof_hash: proofHash,
        status: 'CONFIRMED',
        finality: 'CLOSED',
        recorded_at: timestamp
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`MindShift Gateway running on port ${PORT}`);
});

module.exports = app;