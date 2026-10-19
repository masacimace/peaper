ALTER TABLE agent_runs ADD COLUMN visible INTEGER NOT NULL DEFAULT 1;
CREATE TABLE session_continuity (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  state TEXT NOT NULL
);
CREATE TABLE file_checkpoints (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  run_id TEXT NOT NULL REFERENCES agent_runs(id),
  path TEXT NOT NULL,
  before_content TEXT,
  after_content TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','applied','failed','restored')),
  created_at TEXT NOT NULL
);
INSERT INTO file_checkpoints
SELECT json_extract(c.value,'$.id'), r.workspace_id, r.session_id, r.id,
 json_extract(c.value,'$.path'), json_extract(c.value,'$.before'), json_extract(c.value,'$.after'), 'applied', r.created_at
FROM agent_runs r, json_each(r.state,'$.changes') c;
CREATE INDEX checkpoint_session ON file_checkpoints(session_id,created_at);
CREATE UNIQUE INDEX resume_once ON agent_runs(json_extract(state,'$.resumeOf')) WHERE json_extract(state,'$.resumeOf') IS NOT NULL;
CREATE VIRTUAL TABLE run_search USING fts5(run_id UNINDEXED, body);
INSERT INTO run_search SELECT id, json_extract(state,'$.prompt') || char(10) || json_extract(state,'$.text') FROM agent_runs;
CREATE TRIGGER run_search_insert AFTER INSERT ON agent_runs
WHEN json_extract(new.state,'$.status') NOT IN ('running','waiting') BEGIN
 INSERT INTO run_search VALUES(new.id,json_extract(new.state,'$.prompt') || char(10) || json_extract(new.state,'$.text'));
END;
CREATE TRIGGER run_search_update AFTER UPDATE OF state ON agent_runs
WHEN json_extract(new.state,'$.status') NOT IN ('running','waiting') BEGIN
 DELETE FROM run_search WHERE run_id=new.id;
 INSERT INTO run_search VALUES(new.id,json_extract(new.state,'$.prompt') || char(10) || json_extract(new.state,'$.text'));
END;
CREATE TRIGGER run_search_delete AFTER DELETE ON agent_runs BEGIN
 DELETE FROM run_search WHERE run_id=old.id;
END;
