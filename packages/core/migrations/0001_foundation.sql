CREATE TABLE workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('idle', 'running', 'interrupted')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX sessions_workspace_updated ON sessions(workspace_id, updated_at);
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  session_id TEXT REFERENCES sessions(id),
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX events_workspace_cursor ON events(workspace_id, id);
CREATE VIRTUAL TABLE sessions_fts USING fts5(title, content='sessions', content_rowid='rowid');
CREATE TRIGGER sessions_insert AFTER INSERT ON sessions BEGIN
  INSERT INTO sessions_fts(rowid, title) VALUES (new.rowid, new.title);
END;
CREATE TRIGGER sessions_delete AFTER DELETE ON sessions BEGIN
  INSERT INTO sessions_fts(sessions_fts, rowid, title) VALUES ('delete', old.rowid, old.title);
END;
CREATE TRIGGER sessions_update AFTER UPDATE OF title ON sessions BEGIN
  INSERT INTO sessions_fts(sessions_fts, rowid, title) VALUES ('delete', old.rowid, old.title);
  INSERT INTO sessions_fts(rowid, title) VALUES (new.rowid, new.title);
END;
