import { Box } from 'lucide-react';
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <Box size={22} strokeWidth={1.4} />
      {!compact && <span>Peaper</span>}
    </span>
  );
}
