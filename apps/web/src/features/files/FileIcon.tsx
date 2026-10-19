import { Braces, File, FileCode2, FileText, Hash, type LucideIcon } from 'lucide-react';
export function FileIcon({ name, size = 15 }: { name: string; size?: number }) {
  const extension = name.split('.').pop()?.toLowerCase();
  const types: Record<string, { icon: LucideIcon; color: string; label?: string }> = {
    ts: { icon: FileCode2, color: 'blue', label: 'TS' },
    tsx: { icon: FileCode2, color: 'blue', label: 'TS' },
    js: { icon: FileCode2, color: 'yellow', label: 'JS' },
    jsx: { icon: FileCode2, color: 'yellow', label: 'JS' },
    json: { icon: Braces, color: 'yellow' },
    md: { icon: FileText, color: 'muted' },
    css: { icon: Hash, color: 'violet' },
    yaml: { icon: FileCode2, color: 'pink' },
    yml: { icon: FileCode2, color: 'pink' },
  };
  const type = types[extension || ''] || { icon: File, color: 'muted' };
  const Icon = type.icon;
  return type.label ? (
    <span
      aria-hidden="true"
      className={`file-type file-${type.color}`}
      style={{ width: size, height: size }}
    >
      {type.label}
    </span>
  ) : (
    <Icon className={`file-${type.color}`} size={size} strokeWidth={1.5} />
  );
}
