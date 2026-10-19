import { Braces, File, FileCode2, FileText, Hash, type LucideIcon } from 'lucide-react';
import { cn } from '../../components/ui/cn';
const colors: Record<string, string> = {
  blue: 'text-syntax-type',
  yellow: 'text-syntax-number',
  muted: 'text-subtle',
  violet: 'text-syntax-keyword',
  pink: 'text-syntax-keyword',
};
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
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[2px] border border-current font-mono text-mini leading-none font-[550] tracking-[-0.6px]',
        colors[type.color],
      )}
      style={{ width: size, height: size }}
    >
      {type.label}
    </span>
  ) : (
    <Icon className={colors[type.color]} size={size} strokeWidth={1.5} />
  );
}
