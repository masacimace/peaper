import { Boxes, BookmarkPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { useKnowledge } from './useKnowledge';
import { Button, IconButton } from '../../components/ui/Button';

export function ContextPicker({
  controller,
  onManage,
  onRemember,
}: {
  controller: ReturnType<typeof useKnowledge>;
  onManage: () => void;
  onRemember: () => void;
}) {
  const { state, selection } = controller;
  const root = useRef<HTMLDetailsElement>(null);
  const [position, setPosition] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
    above: boolean;
  } | null>(null);
  useEffect(() => {
    const close = () => root.current?.removeAttribute('open');
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && root.current?.open) {
        close();
        root.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', close);
    };
  }, []);
  const profiles = state?.personas.filter((profile) => profile.enabled) ?? [];
  const skills = state?.catalog.skills.filter((skill) => skill.enabled) ?? [];
  return (
    <>
      <select
        aria-label="Agent profile"
        title="Profile for the next task"
        disabled={!controller.loaded}
        value={selection.profileId}
        className="h-7 max-w-28 truncate rounded-sm border-0 bg-transparent px-1 text-caption text-muted"
        onChange={(e) => void controller.select({ ...selection, profileId: e.target.value })}
      >
        <option value="default">Default profile</option>
        <option value="none">No profile</option>
        {!['default', 'none', ...profiles.map((p) => p.id)].includes(selection.profileId) && (
          <option value={selection.profileId}>Unavailable profile</option>
        )}
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name} · {profile.scope}
          </option>
        ))}
      </select>
      <details
        ref={root}
        className="relative shrink-0"
        onToggle={(event) => {
          if (!event.currentTarget.open) return;
          const rect = event.currentTarget.querySelector('summary')!.getBoundingClientRect(),
            panel = event.currentTarget.closest('section')!.getBoundingClientRect();
          const width = Math.min(240, panel.width - 24, window.innerWidth - 24),
            above = rect.top > window.innerHeight - rect.bottom;
          setPosition({
            width,
            left: Math.max(panel.left + 12, Math.min(rect.right - width, panel.right - width - 12)),
            top: above ? rect.top - 8 : rect.bottom + 8,
            above,
            maxHeight: Math.max(
              80,
              Math.min(288, (above ? rect.top : window.innerHeight - rect.bottom) - 24),
            ),
          });
        }}
      >
        <summary
          aria-label="Choose skills for next task"
          className="flex h-7 list-none items-center gap-1 rounded-sm px-1 text-caption text-muted hover:bg-surface-hover [&::-webkit-details-marker]:hidden"
        >
          <Boxes size={12} />
          Skills{selection.skillIds.length ? ` ${selection.skillIds.length}` : ''}
        </summary>
        <div
          className="fixed z-(--layer-menu) overflow-y-auto rounded-md border border-border-strong bg-surface-overlay p-2 shadow-menu"
          style={
            position
              ? {
                  left: position.left,
                  top: position.top,
                  width: position.width,
                  maxHeight: position.maxHeight,
                  transform: position.above ? 'translateY(-100%)' : undefined,
                }
              : { visibility: 'hidden' }
          }
        >
          <p className="mb-2 px-1 text-micro leading-relaxed text-subtle">
            Choose up to three manual skills. Automatic discovery remains available for enabled
            skills.
          </p>
          {skills.map((skill) => (
            <label
              key={skill.id}
              className="flex items-start gap-2 rounded-sm p-2 text-caption text-muted hover:bg-surface-hover"
            >
              <input
                type="checkbox"
                aria-label={`Use ${skill.id}`}
                checked={selection.skillIds.includes(skill.id)}
                disabled={
                  !controller.loaded ||
                  (!selection.skillIds.includes(skill.id) && selection.skillIds.length >= 3)
                }
                onChange={(e) =>
                  void controller.select({
                    ...selection,
                    skillIds: e.target.checked
                      ? [...selection.skillIds, skill.id]
                      : selection.skillIds.filter((id) => id !== skill.id),
                  })
                }
              />
              <span className="min-w-0 flex-1">
                <span className="block text-foreground">{skill.name}</span>
                <span className="mt-1 block text-micro text-subtle">
                  {skill.scope}
                  {!skill.automatic ? ' · manual only' : ''}
                </span>
              </span>
            </label>
          ))}
          {selection.skillIds
            .filter((id) => !skills.some((skill) => skill.id === id))
            .map((id) => (
              <label key={id} className="flex items-center gap-2 p-2 text-caption text-warning">
                <input
                  type="checkbox"
                  checked
                  onChange={() =>
                    void controller.select({
                      ...selection,
                      skillIds: selection.skillIds.filter((key) => key !== id),
                    })
                  }
                />
                Unavailable · {id}
              </label>
            ))}
          <Button
            variant="text"
            className="mt-2 w-full text-caption"
            onClick={(e) => {
              e.currentTarget.closest('details')?.removeAttribute('open');
              onManage();
            }}
          >
            Manage skills & profiles
          </Button>
        </div>
      </details>
      <IconButton
        aria-label="Remember a note"
        title="Save a note to Memory · /remember"
        onClick={onRemember}
      >
        <BookmarkPlus size={13} />
      </IconButton>
    </>
  );
}
