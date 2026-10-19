import type { AgentRun, ToolActivity } from '@peaper/shared';
import { BookOpen, Boxes, Terminal } from 'lucide-react';
import { activityOutput, activityStatus } from '../agent/tool-output';
import { cn } from '../../components/ui/cn';
import { skillTraces } from './skill-activity';

const outputClass =
  'max-h-65 overflow-auto rounded-sm bg-surface-inset p-2 font-mono text-caption leading-relaxed wrap-anywhere whitespace-pre-wrap';
function eventLabel(activity: ToolActivity) {
  const path = typeof activity.input.path === 'string' ? activity.input.path : 'Unknown path';
  return activity.name === 'load_skill'
    ? 'Load instructions'
    : `${activity.name === 'run_skill_script' ? 'Run' : 'Read'} · ${path}`;
}
function eventColor(activity: ToolActivity) {
  const status = activityStatus(activity);
  if (status === 'exit 0' || (activity.name !== 'run_skill_script' && status === 'completed'))
    return 'text-success';
  if (status === 'running' || status === 'waiting') return 'text-warning';
  if (status === 'cancelled') return 'text-subtle';
  return 'text-danger';
}
export function SkillActivity({ run }: { run: AgentRun }) {
  const traces = skillTraces(run),
    discoveries = run.activities.filter((a) => a.name === 'find_skills');
  if (!traces.length && !discoveries.length) return null;
  return (
    <section aria-label="Skill Activity" className="my-4 rounded-sm border border-border">
      <div className="flex items-center gap-2 border-b border-border bg-surface-inset px-3 py-2 text-caption font-medium text-strong">
        <Boxes size={13} />
        Skill Activity
        <span className="ml-auto text-micro font-normal text-subtle">
          {traces.length} {traces.length === 1 ? 'skill' : 'skills'}
        </span>
      </div>
      <div className="divide-y divide-border-subtle">
        {traces.map((trace) => {
          const skill = trace.versions.at(-1);
          return (
            <details key={trace.id} open className="p-3 text-caption text-muted">
              <summary className="cursor-pointer font-medium wrap-anywhere text-strong">
                {skill?.name ?? trace.id}
                <span className="ml-2 text-micro font-normal text-subtle">
                  {skill ? `${skill.scope} · ${skill.invocation}` : 'Activation not recorded'}
                </span>
              </summary>
              <p className="mt-2 leading-relaxed">
                {skill?.activationReason ??
                  (skill?.invocation === 'manual'
                    ? 'Manually selected for this task. Selection details were not recorded.'
                    : skill
                      ? 'Activated by the agent. No selection reason was recorded.'
                      : 'An attempt was recorded; no loaded instruction snapshot is available.')}
              </p>
              {trace.versions.map((version) => (
                <details key={version.digest} className="mt-2 border-l border-border pl-3">
                  <summary className="cursor-pointer text-micro text-subtle">
                    Instructions used · {version.digest.slice(0, 12)}
                  </summary>
                  <p className="my-2 text-micro wrap-anywhere text-subtle">{version.path}</p>
                  <pre className={outputClass}>{version.instructions}</pre>
                </details>
              ))}
              {skill && (
                <p className="mt-2 text-micro text-subtle">
                  Instruction snapshot captured. Resource reads and script attempts are listed below
                  when recorded.
                </p>
              )}
              <ol className="mt-3 space-y-2" aria-label={`Activity for ${trace.id}`}>
                {trace.events.map(({ activity, step, permission }) => (
                  <li key={activity.id}>
                    <details className="rounded-sm border border-border-subtle">
                      <summary className="flex cursor-pointer items-start gap-2 p-2">
                        {activity.name === 'run_skill_script' ? (
                          <Terminal size={12} className="mt-0.5 shrink-0" />
                        ) : (
                          <BookOpen size={12} className="mt-0.5 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1 wrap-anywhere">
                          {eventLabel(activity)}
                          <span className="mt-1 block text-micro text-subtle">
                            Step {step}
                            {permission ? ` · Approval ${permission.status}` : ''}
                          </span>
                        </span>
                        <span className={cn('shrink-0 text-micro', eventColor(activity))}>
                          {activityStatus(activity)}
                        </span>
                      </summary>
                      <div className="space-y-2 border-t border-border-subtle p-2">
                        {activity.name === 'load_skill' &&
                          typeof activity.input.reason === 'string' && (
                            <p className="leading-relaxed">
                              Agent’s stated match: {activity.input.reason}
                            </p>
                          )}
                        {permission && (
                          <p className="text-micro text-subtle">Approval: {permission.status}</p>
                        )}
                        {activity.output && (
                          <pre
                            className={outputClass}
                            aria-label={`${eventLabel(activity)} result`}
                          >
                            {activityOutput(activity)}
                          </pre>
                        )}
                        {activity.name === 'run_skill_script' && !activity.output && (
                          <p className="text-subtle">No execution result recorded.</p>
                        )}
                        <details className="text-micro text-subtle">
                          <summary className="cursor-pointer">Invocation details</summary>
                          <pre className={cn(outputClass, 'mt-2')}>
                            {JSON.stringify(activity.input, null, 2)}
                          </pre>
                          {permission?.command && (
                            <pre className={cn(outputClass, 'mt-2')}>{permission.command}</pre>
                          )}
                        </details>
                      </div>
                    </details>
                  </li>
                ))}
              </ol>
            </details>
          );
        })}
        {discoveries.length > 0 && (
          <details className="p-3 text-caption text-muted">
            <summary className="cursor-pointer">
              Skill discovery · {discoveries.length}{' '}
              {discoveries.length === 1 ? 'search' : 'searches'}
            </summary>
            <p className="my-2 text-micro text-subtle">
              Discovery searches metadata; a search result does not mean a skill was activated.
            </p>
            {discoveries.map((activity) => (
              <div key={activity.id} className="mt-2">
                <p className="mb-1 wrap-anywhere">
                  {String(activity.input.query ?? 'All automatic skills')} ·{' '}
                  {activityStatus(activity)}
                </p>
                {activity.output && <pre className={outputClass}>{activityOutput(activity)}</pre>}
              </div>
            ))}
          </details>
        )}
      </div>
    </section>
  );
}
