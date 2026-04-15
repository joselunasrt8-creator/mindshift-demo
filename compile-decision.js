const fs = require('fs');
const crypto = require('crypto');

function canonicalJson(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return JSON.stringify(v);
  }
  return '{' + Object.keys(v).sort().map(k =>
    JSON.stringify(k) + ':' + canonicalJson(v[k])
  ).join(',') + '}';
}

const decision = JSON.parse(fs.readFileSync('./decision.json', 'utf8'));

const aeo = {
  intent: decision.intent,
  scope: decision.scope,
  validation: {
    decision_id: decision.decision_id,
    signature: ""
  },
  target: decision.target,
  finality: decision.finality,
  expires_at: decision.expires_at
};

const signature = crypto
  .createHash('sha256')
  .update(decision.decision_id + canonicalJson(aeo))
  .digest('hex');

aeo.validation.signature = signature;

fs.writeFileSync('./aeo.json', JSON.stringify(aeo, null, 2));
fs.writeFileSync('./signature.txt', signature + '\n');

console.log('AEO compiled');
console.log(signature);