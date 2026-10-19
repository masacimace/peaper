import type { MemoryLens, MemoryNote, MemorySelection } from '@peaper/shared';

export const memoryWords = (text: string) => [
  ...new Set(text.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []),
];
const queryStopWords = new Set(
  'a an the and or of to in on for is are be this that with from as it its at by use using di ke dan atau yang untuk ini itu dengan dari pada adalah gunakan menggunakan sebuah sebagai'.split(
    ' ',
  ),
);
export const memoryQueryWords = (text: string) =>
  memoryWords(text)
    .filter((word) => !queryStopWords.has(word))
    .slice(0, 20);
export function planMemory(
  eligible: MemoryNote[],
  matches: MemoryNote[],
  includes: MemoryNote[],
  query: string,
  selection: MemorySelection,
  includePins = true,
): MemoryLens {
  const words = memoryQueryWords(query),
    matchIds = new Set(matches.map((m) => m.id));
  const excluded = new Set(selection.excludeIds),
    manual = new Set(includes.map((m) => m.id));
  const ordered = [
    ...includes,
    ...(includePins ? eligible.filter((m) => m.pinned) : []),
    ...matches,
    ...eligible,
  ];
  const seen = new Set<string>(),
    entries: MemoryLens['entries'] = [],
    memories: MemoryNote[] = [],
    warnings: string[] = [];
  let size = 0,
    omittedPins = 0,
    overBudget = false;
  for (const memory of ordered) {
    if (seen.has(memory.id)) continue;
    seen.add(memory.id);
    const tokens = memoryWords(`${memory.title} ${memory.body}`);
    const terms = words.filter((word) => tokens.some((term) => term.startsWith(word)));
    let reason: MemoryLens['entries'][number]['context']['reason'] = excluded.has(memory.id)
      ? 'excluded'
      : manual.has(memory.id)
        ? 'manual'
        : includePins && memory.pinned
          ? 'pinned'
          : matchIds.has(memory.id)
            ? 'match'
            : 'unmatched';
    let selected = !['excluded', 'unmatched'].includes(reason);
    if (selected) {
      const bytes = Buffer.byteLength(JSON.stringify(memory));
      if (memories.length >= 12 || size + bytes > 32000) {
        if (manual.has(memory.id)) overBudget = true;
        if (memory.pinned) omittedPins++;
        reason = 'budget';
        selected = false;
      } else {
        size += bytes;
        memories.push(memory);
      }
    }
    entries.push({
      memory,
      context: {
        id: memory.id,
        revision: memory.revision,
        title: memory.title,
        scope: memory.scope,
        selected,
        reason,
        stage: 'initial',
        matchedTerms: terms,
      },
    });
  }
  if (omittedPins)
    warnings.push(
      `${omittedPins} pinned notes did not fit the 32 KB memory context limit. Review pins or use search_memory.`,
    );
  if (overBudget)
    warnings.push(
      'Manually included notes exceed the memory context limit. Include fewer or shorter notes.',
    );
  if (eligible.length === 100 || matches.length === 100)
    warnings.push(
      'Preview considers up to 100 recent notes and 100 keyword matches within scope. Refine the task text to find other notes.',
    );
  return { entries, memories, warnings, overBudget };
}
