import type { MemoryInput, MemoryNote, MemoryProposal } from '@peaper/shared';
export function memoryInput(note: MemoryNote | MemoryProposal): MemoryInput {
  return { ...note, evidence: note.evidence.map((e) => e.reference) };
}
