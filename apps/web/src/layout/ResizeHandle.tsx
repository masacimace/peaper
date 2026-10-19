import { useRef } from 'react';

export function ResizeHandle({
  axis = 'x',
  label,
  value,
  min,
  max,
  onResize,
  inverted = false,
}: {
  axis?: 'x' | 'y';
  label: string;
  value: number;
  min: number;
  max: number;
  onResize: (delta: number) => void;
  inverted?: boolean;
}) {
  const last = useRef<number | null>(null);
  return (
    <div
      className={`resize-handle resize-${axis}`}
      role="separator"
      tabIndex={0}
      aria-label={label}
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        last.current = axis === 'x' ? event.clientX : event.clientY;
        event.currentTarget.setPointerCapture(event.pointerId);
        document.body.classList.add('is-resizing');
      }}
      onPointerMove={(event) => {
        if (last.current === null) return;
        const next = axis === 'x' ? event.clientX : event.clientY;
        onResize((next - last.current) * (inverted ? -1 : 1));
        last.current = next;
      }}
      onPointerUp={() => {
        last.current = null;
        document.body.classList.remove('is-resizing');
      }}
      onLostPointerCapture={() => {
        last.current = null;
        document.body.classList.remove('is-resizing');
      }}
      onKeyDown={(event) => {
        const negative = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
        const positive = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
        if (event.key === negative || event.key === positive) {
          event.preventDefault();
          onResize((event.key === negative ? -20 : 20) * (inverted ? -1 : 1));
        }
      }}
    />
  );
}
