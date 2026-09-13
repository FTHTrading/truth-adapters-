-- truth-gateway ledger. Append-only by construction AND by trigger.
CREATE TABLE IF NOT EXISTS ledger (
  seq       INTEGER PRIMARY KEY,
  prev      TEXT    NOT NULL,
  hash      TEXT    NOT NULL UNIQUE,
  ts        INTEGER NOT NULL,
  record    TEXT    NOT NULL,
  event_id  TEXT,
  kind      TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_event_id ON ledger(event_id);
CREATE INDEX IF NOT EXISTS ledger_kind ON ledger(kind);

-- SPECIFICATION.md Invariant 3: no edits, no deletes, ever.
CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON ledger
BEGIN
  SELECT RAISE(ABORT, 'ledger is append-only');
END;
CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON ledger
BEGIN
  SELECT RAISE(ABORT, 'ledger is append-only');
END;
