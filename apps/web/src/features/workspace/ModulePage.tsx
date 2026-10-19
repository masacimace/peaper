import { ArrowLeft, BookOpen, Boxes, Layers3 } from 'lucide-react';

const modules = {
  skills: {
    title: 'Skills',
    kicker: 'AGENT CAPABILITIES',
    description: 'Reusable ways of working, close to your code.',
    icon: Boxes,
    empty: 'Your skills will live here',
    detail:
      'Skill discovery, local imports, and personal or project procedures will use this workspace manager.',
  },
  memory: {
    title: 'Memory',
    kicker: 'PROJECT KNOWLEDGE',
    description: 'Keep the decisions that matter.',
    icon: BookOpen,
    empty: 'A place for lasting context',
    detail:
      'Global notes, project decisions, and session recaps will be managed here with clear sources and scope.',
  },
  integrations: {
    title: 'Integrations',
    kicker: 'CONNECTED TOOLS',
    description: 'Bring your tools into the workspace.',
    icon: Layers3,
    empty: 'Connect your workflow',
    detail:
      'MCP connections and lifecycle hooks will use this space for configuration, status, and activity.',
  },
};
export function ModulePage({
  section,
  onWorkspace,
}: {
  section: keyof typeof modules;
  onWorkspace: () => void;
}) {
  const module = modules[section];
  const Icon = module.icon;
  return (
    <div className="manager-page">
      <div className="manager-heading">
        <div>
          <span className="section-kicker">{module.kicker}</span>
          <h1>{module.title}</h1>
          <p>{module.description}</p>
        </div>
        <span className="small-badge">Not available yet</span>
      </div>
      <div className="manager-empty module-empty">
        <Icon size={32} strokeWidth={1.2} />
        <h2>{module.empty}</h2>
        <p>{module.detail}</p>
        <button className="secondary-button" onClick={onWorkspace}>
          <ArrowLeft size={14} />
          Back to workspace
        </button>
      </div>
    </div>
  );
}
