import type { AgentRun, ToolActivity, ToolPermission, UsedSkill } from '@peaper/shared';

export const isSkillActivity = (activity: ToolActivity) =>
  ['find_skills', 'load_skill', 'read_skill_resource', 'run_skill_script'].includes(activity.name);
export type SkillTrace = {
  id: string;
  versions: UsedSkill[];
  events: { activity: ToolActivity; step: number; permission?: ToolPermission }[];
};
export function skillTraces(run: AgentRun) {
  const traces = new Map<string, SkillTrace>();
  const ensure = (id: string) => {
    if (!traces.has(id)) traces.set(id, { id, versions: [], events: [] });
    return traces.get(id)!;
  };
  for (const skill of run.knowledge.skills) ensure(skill.id).versions.push(skill);
  run.activities.forEach((activity, index) => {
    if (!isSkillActivity(activity) || activity.name === 'find_skills') return;
    const id = typeof activity.input.id === 'string' ? activity.input.id : 'Unknown skill';
    ensure(id).events.push({
      activity,
      step: index + 1,
      permission: run.permissions.find((p) => p.activityId === activity.id),
    });
  });
  return [...traces.values()];
}
