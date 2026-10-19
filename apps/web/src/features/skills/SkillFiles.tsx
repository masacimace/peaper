import { useEffect, useState } from 'react';
import { FileCode2, Folder } from 'lucide-react';
import type { SkillDetail } from '@peaper/shared';
import { api } from '../../lib/api';
import { cn } from '../../components/ui/cn';
import { ErrorNotice } from '../../components/ui/Notice';

import { skillFileTree, type FileNode } from './skill-files';

function FileTree({
  nodes,
  selected,
  onSelect,
}: {
  nodes: FileNode[];
  selected: string;
  onSelect: (path: string) => void;
}) {
  return (
    <ul className="space-y-1">
      {nodes.map((node) => (
        <li key={node.path}>
          {node.children.length ? (
            <details open className="text-caption text-muted">
              <summary className="cursor-pointer py-1">
                <Folder size={12} className="mr-1 inline" />
                {node.name}
              </summary>
              <div className="ml-2 border-l border-border pl-2">
                <FileTree nodes={node.children} selected={selected} onSelect={onSelect} />
              </div>
            </details>
          ) : (
            <button
              type="button"
              aria-pressed={selected === node.path}
              onClick={() => onSelect(node.path)}
              className={cn(
                'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-caption wrap-anywhere hover:bg-surface-hover',
                selected === node.path && 'bg-surface-selected text-strong',
              )}
            >
              <FileCode2 size={12} className="shrink-0" />
              <span className="min-w-0 flex-1">{node.name}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
export function SkillFiles({
  skill,
  initialPath = 'SKILL.md',
}: {
  skill: SkillDetail;
  initialPath?: string;
}) {
  const [selected, setSelected] = useState(initialPath),
    [content, setContent] = useState<{ path: string; content: string } | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (selected === 'SKILL.md') return;
    let live = true;
    void api
      .skillResource(skill.id, selected)
      .then((value) => {
        if (live) setContent(value);
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [skill.id, selected]);
  const text =
    selected === 'SKILL.md' ? skill.document : content?.path === selected ? content.content : null;
  return (
    <div className="grid min-h-70 grid-cols-[190px_minmax(0,1fr)] gap-4 max-compact:grid-cols-1">
      <nav
        aria-label="Skill files"
        className="max-h-100 overflow-auto rounded-sm border border-border p-2 max-compact:max-h-45"
      >
        <FileTree
          nodes={skillFileTree(skill.resources)}
          selected={selected}
          onSelect={(path) => {
            if (path === selected) return;
            setError('');
            setContent(null);
            setSelected(path);
          }}
        />
      </nav>
      <div className="min-w-0">
        <p className="mb-2 text-caption wrap-anywhere text-accent">{selected}</p>
        {error ? (
          <ErrorNotice>{error}</ErrorNotice>
        ) : (
          <pre
            aria-label={`Contents of ${selected}`}
            className="max-h-100 min-h-60 overflow-auto rounded-sm border border-border bg-surface-inset p-3 font-mono text-caption leading-relaxed wrap-anywhere whitespace-pre-wrap"
          >
            {text ?? 'Reading resource…'}
          </pre>
        )}
        <p className="mt-2 text-micro text-subtle">
          Read-only preview. UTF-8 resources up to 64 KB can be viewed. Opening a script does not
          execute it.
        </p>
      </div>
    </div>
  );
}
