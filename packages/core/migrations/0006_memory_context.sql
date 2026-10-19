ALTER TABLE memories ADD COLUMN evidence TEXT NOT NULL DEFAULT '[]';
CREATE TABLE memory_revisions (
 memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL, workspace_id TEXT, scope TEXT NOT NULL,
 state TEXT NOT NULL, action TEXT NOT NULL, recorded_at TEXT NOT NULL,
 PRIMARY KEY(memory_id,revision)
);
INSERT INTO memory_revisions
 SELECT id,revision,workspace_id,scope,
 json_object('id',id,'title',title,'body',body,'scope',scope,'sessionId',session_id,
 'sourceRunId',source_run_id,'pinned',json(CASE WHEN pinned=1 THEN 'true' ELSE 'false' END),
 'revision',revision,'createdAt',created_at,'updatedAt',updated_at,'evidence',json('[]')),
 'imported',updated_at FROM memories;
