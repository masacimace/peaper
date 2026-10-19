import type { ToolActivity } from '@peaper/shared';

function result(activity: ToolActivity): Record<string, unknown> | null {
  if (activity.status !== 'completed' || !activity.output) return null;
  try {
    const value: unknown = JSON.parse(activity.output);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
export function activityStatus(activity: ToolActivity) {
  const value = activity.name === 'run_command' ? result(activity) : null;
  if (value?.cancelled) return 'cancelled';
  if (value?.timedOut) return 'timed out';
  if (value && (typeof value.exitCode === 'number' || value.exitCode === null))
    return `exit ${value.exitCode ?? 'unknown'}`;
  return activity.status;
}
export function activityOutput(activity: ToolActivity): string {
  const value = result(activity);
  if (!value) return activity.output ?? '';
  if (typeof value.error === 'string') return value.error;
  if (activity.name === 'run_command' && typeof value.output === 'string') {
    return `${value.output}\nExit code: ${value.exitCode ?? 'unknown'}${value.timedOut ? '\nTimed out' : ''}${value.cancelled ? '\nCancelled' : ''}${value.truncated ? '\nOutput truncated at the configured limit' : ''}`;
  }
  if (activity.name === 'read_file' && typeof value.content === 'string')
    return `${value.path} · lines ${value.startLine}–${value.endLine} of ${value.totalLines}\n\n${value.content}`;
  if (activity.name === 'list_directory' && Array.isArray(value.entries))
    return (
      (value.entries as { name: string; kind: string }[])
        .map((entry) => `${entry.name}${entry.kind === 'directory' ? '/' : ''}`)
        .join('\n') || 'Empty directory'
    );
  if (value.applied && typeof value.path === 'string')
    return `Updated ${value.path} · ${value.bytes} bytes`;
  if (activity.name === 'update_todos') return 'Checklist updated';
  if (typeof value.answer === 'string') return `Answer: ${value.answer}`;
  return JSON.stringify(value, null, 2);
}
