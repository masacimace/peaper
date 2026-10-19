import type { KnowledgeSnapshot, MemoryProposal } from '@peaper/shared';

const block = (text: string) => `\n\n\`\`\`text\n${text.replaceAll('```', '~~~')}\n\`\`\`\n`;
export function knowledgeMarkdown(context: KnowledgeSnapshot, suggestions: MemoryProposal[]) {
  const parts: string[] = [];
  if (context.persona)
    parts.push(
      `### Profile used\n${context.persona.name} · ${context.persona.scope} · revision ${context.persona.revision}${block(context.persona.instructions)}`,
    );
  for (const skill of context.skills)
    parts.push(
      `### Skill used\n${skill.name} · ${skill.scope} · ${skill.invocation}\n\nSource: ${skill.path}\n\nDigest: ${skill.digest}${skill.activationReason ? `\n\nActivation: ${skill.activationReason}` : ''}${block(skill.instructions)}`,
    );
  for (const memory of context.memories) {
    const selection = context.memoryContext?.find(
      (entry) => entry.id === memory.id && entry.revision === memory.revision && entry.selected,
    );
    parts.push(
      `### Memory used\n${memory.title} · ${memory.scope} · revision ${memory.revision}${selection ? `\n\nSelection: ${selection.reason} · ${selection.stage}` : ''}${memory.sessionId ? `\n\nSource session: ${memory.sessionId}` : ''}${block(memory.body)}`,
    );
    for (const evidence of memory.evidence)
      parts.push(
        `Evidence: ${evidence.label} · ${evidence.capturedAt}${evidence.outcome ? ` · ${evidence.outcome}` : ''}\n\nDigest: ${evidence.digest}${block(evidence.excerpt)}`,
      );
  }
  for (const suggestion of suggestions)
    parts.push(
      `### Memory suggestion\n${suggestion.title} · ${suggestion.scope} · ${suggestion.status}${suggestion.memoryId ? `\n\nSaved memory: ${suggestion.memoryId}` : ''}${block(suggestion.body)}`,
    );
  for (const warning of context.warnings) parts.push(`Context notice: ${warning}`);
  return parts.length ? `\n${parts.join('\n')}\n` : '';
}
