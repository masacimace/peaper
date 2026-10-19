import { Box } from 'lucide-react';
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.25 text-brand font-[570] tracking-[-0.35px] text-strong">
      <Box size={22} strokeWidth={1.4} />
      {!compact && <span>Peaper</span>}
    </span>
  );
}
