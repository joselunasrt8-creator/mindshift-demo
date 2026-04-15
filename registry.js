'use strict';

const sqlite3 = require('sqlite3');
const path = require('path');

const DB_PATH = process.env.REGISTRY_DB || path.join(__dirname, 'registry.db');

let db;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH);
    db.serialize(() => {

      db.run(`CREATE TABLE IF NOT EXISTS decisions (
        decision_id TEXT PRIMARY KEY,
        aeo_hash    TEXT NOT NULL,
        created_at  TEXT NOT NULL
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS validation_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        decision_id TEXT NOT NULL,
        result      TEXT NOT NULL,
        reason      TEXT,
        timestamp   TEXT NOT NULL
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS execution_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        decision_id TEXT NOT NULL,
        surface     TEXT NOT NULL,
        run_id      TEXT,
        commit_sha  TEXT,
        aeo_hash    TEXT NOT NULL,
        proof_type  TEXT,
        status      TEXT DEFAULT 'EXECUTED',
        timestamp   TEXT NOT NULL
      )`);

      db.run(`CREATE TABLE IF NOT EXISTS proof_records (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        decision_id  TEXT NOT NULL,
        execution_id INTEGER NOT NULL,
        surface      TEXT NOT NULL,
        proof_type   TEXT NOT NULL,
        proof_hash   TEXT NOT NULL,
        status       TEXT DEFAULT 'CONFIRMED',
        timestamp    TEXT NOT NULL
      )`);
    });
  }
  return db;
}

function recordDecision(decision_id, aeo_hash, timestamp) {
  getDb().run(
    'INSERT OR IGNORE INTO decisions (decision_id, aeo_hash, created_at) VALUES (?, ?, ?)',
    [decision_id, aeo_hash, timestamp]
  );
}

function recordValidation(decision_id, result, reason, timestamp) {
  getDb().run(
    'INSERT INTO validation_events (decision_id, result, reason, timestamp) VALUES (?, ?, ?, ?)',
    [decision_id, result, reason || null, timestamp]
  );
}

function recordExecution(decision_id, surface, run_id, commit_sha, aeo_hash, proof_type, timestamp) {
  getDb().run(
    `INSERT INTO execution_events 
      (decision_id, surface, run_id, commit_sha, aeo_hash, proof_type, status, timestamp) 
     VALUES (?, ?, ?, ?, ?, ?, 'EXECUTED', ?)`,
    [decision_id, surface, run_id || null, commit_sha || null, aeo_hash, proof_type || null, timestamp]
  );
}

function recordProof(decision_id, execution_id, surface, proof_type, proof_hash, timestamp) {
  getDb().run(
    `INSERT INTO proof_records 
      (decision_id, execution_id, surface, proof_type, proof_hash, status, timestamp) 
     VALUES (?, ?, ?, ?, ?, 'CONFIRMED', ?)`,
    [decision_id, execution_id, surface, proof_type, proof_hash, timestamp]
  );
}

// NEW: get latest execution for a decision
function getLatestExecutionByDecision(decision_id, callback) {
  getDb().get(
    `SELECT id, decision_id, surface, run_id, commit_sha, aeo_hash, proof_type, status, timestamp
     FROM execution_events
     WHERE decision_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [decision_id],
    callback
  );
}

// NEW: check if proof already exists (replay protection)
function getProofByExecutionId(execution_id, callback) {
  getDb().get(
    `SELECT id, decision_id, execution_id, surface, proof_type, proof_hash, status, timestamp
     FROM proof_records
     WHERE execution_id = ?
     ORDER BY id DESC
     LIMIT 1`,
    [execution_id],
    callback
  );
}

module.exports = {
  getDb,
  recordDecision,
  recordValidation,
  recordExecution,
  recordProof,
  getLatestExecutionByDecision,
  getProofByExecutionId
};