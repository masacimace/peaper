CREATE TABLE session_models (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  selection TEXT NOT NULL
);
