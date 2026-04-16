export function validate(aeo) {

  // required fields check
  if (
    !aeo.intent ||
    !aeo.scope ||
    !aeo.validation ||
    !aeo.target ||
    !aeo.finality
  ) {
    return "NULL";
  }

  // authority check
  if (aeo.validation.decision_id !== "MS-DEMO-001") {
    return "NULL";
  }

  if (aeo.validation.signature !== "demo-signature-v1") {
    return "NULL";
  }

  return "VALID";
}