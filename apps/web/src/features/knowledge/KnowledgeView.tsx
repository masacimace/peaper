import type { KnowledgeSnapshot } from '@peaper/shared';

export function KnowledgeView({
  snapshot,
  showSkills = true,
  showMemory = true,
}: {
  snapshot: KnowledgeSnapshot;
  showSkills?: boolean;
  showMemory?: boolean;
}) {
  const { persona, skills, memories, warnings } = snapshot;
  if (!persona && !skills.length && !memories.length && !warnings.length) return null;
  return (
    <div className="mt-3 space-y-2 text-caption text-muted">
      {persona && (
        <details className="rounded-sm border border-border p-2">
          <summary>
            Profile · {persona.name} · {persona.scope}
          </summary>
          <pre className="mt-2 max-h-50 overflow-auto wrap-anywhere whitespace-pre-wrap">
            {persona.instructions}
          </pre>
        </details>
      )}
      {showSkills &&
        skills.map((skill) => (
          <details
            key={`${skill.id}:${skill.digest}`}
            className="rounded-sm border border-border p-2"
          >
            <summary>
              Skill · {skill.name} · {skill.scope} · {skill.invocation}
            </summary>
            <p className="mt-2 text-micro wrap-anywhere text-subtle">{skill.path}</p>
            <pre className="mt-2 max-h-60 overflow-auto wrap-anywhere whitespace-pre-wrap">
              {skill.instructions}
            </pre>
          </details>
        ))}
      {showMemory &&
        memories.map((memory) => (
          <details
            key={`${memory.id}:${memory.revision}`}
            className="rounded-sm border border-border p-2"
          >
            <summary>
              Memory · {memory.title} · {memory.scope}
              {memory.pinned ? ' · pinned' : ''}
            </summary>
            <pre className="mt-2 max-h-50 overflow-auto wrap-anywhere whitespace-pre-wrap">
              {memory.body}
            </pre>
            <p className="mt-2 text-micro text-subtle">
              Revision {memory.revision} · {new Date(memory.updatedAt).toLocaleString()}
              {memory.sessionId ? ` · Source session ${memory.sessionId.slice(0, 8)}` : ''}
            </p>
          </details>
        ))}
      {warnings.map((warning) => (
        <p role="status" className="text-warning" key={warning}>
          {warning}
        </p>
      ))}
    </div>
  );
}
