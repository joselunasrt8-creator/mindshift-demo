const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.VALIDATOR_TOKEN || "dev-token";

function canonicalJson(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return JSON.stringify(v);
  }
  return '{' + Object.keys(v).sort().map(k =>
    JSON.stringify(k) + ':' + canonicalJson(v[k])
  ).join(',') + '}';
}

app.get('/health', (req, res) => {
  res.json({ status: "ok" });
});

app.post('/validate', (req, res) => {
  const auth = req.headers.authorization || "";

  if (auth !== `Bearer ${TOKEN}`) {
    return res.status(401).json({ status: "NULL", reason: "Invalid token" });
  }

  const { decision_id, signature, aeo } = req.body;

  if (!decision_id) {
    return res.json({ status: "NULL", reason: "Missing decision_id" });
  }

  if (!aeo) {
    return res.json({ status: "NULL", reason: "Missing AEO" });
  }

  if (!aeo.expires_at) {
    return res.json({ status: "NULL", reason: "Missing aeo field: expires_at" });
  }

  const computed = crypto
    .createHash('sha256')
    .update(decision_id + canonicalJson(aeo))
    .digest('hex');

  if (signature !== computed) {
    return res.json({ status: "NULL", reason: "Invalid signature" });
  }

  return res.json({ status: "VALID" });
});

app.listen(PORT, () => {
  console.log(`Validator running on port ${PORT}`);
});