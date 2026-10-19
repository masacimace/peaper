CREATE TABLE skill_preferences (
 workspace_id TEXT NOT NULL REFERENCES workspaces(id), skill_id TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1, automatic INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(workspace_id,skill_id)
);
CREATE TABLE personas (
 id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id), name TEXT NOT NULL,
 description TEXT NOT NULL, instructions TEXT NOT NULL, scope TEXT NOT NULL CHECK(scope IN ('personal','project')),
 enabled INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE TABLE knowledge_defaults (workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id), profile_id TEXT);
CREATE TABLE context_selections (session_id TEXT PRIMARY KEY REFERENCES sessions(id), selection TEXT NOT NULL);
CREATE TABLE memories (
 id TEXT PRIMARY KEY, workspace_id TEXT REFERENCES workspaces(id), title TEXT NOT NULL, body TEXT NOT NULL,
 scope TEXT NOT NULL CHECK(scope IN ('global','project','recap')), session_id TEXT REFERENCES sessions(id),
 source_run_id TEXT REFERENCES agent_runs(id), pinned INTEGER NOT NULL DEFAULT 0,
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX memories_scope ON memories(workspace_id,scope,session_id);
CREATE VIRTUAL TABLE memory_search USING fts5(id UNINDEXED,title,body);
CREATE TRIGGER memory_search_insert AFTER INSERT ON memories BEGIN
 INSERT INTO memory_search VALUES(new.id,new.title,new.body);
END;
CREATE TRIGGER memory_search_update AFTER UPDATE OF title,body ON memories BEGIN
 DELETE FROM memory_search WHERE id=old.id;
 INSERT INTO memory_search VALUES(new.id,new.title,new.body);
END;
CREATE TRIGGER memory_search_delete AFTER DELETE ON memories BEGIN
 DELETE FROM memory_search WHERE id=old.id;
END;
CREATE TABLE memory_proposals (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 session_id TEXT NOT NULL REFERENCES sessions(id), run_id TEXT NOT NULL REFERENCES agent_runs(id),
 state TEXT NOT NULL
);
