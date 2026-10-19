import { ArrowLeft, BookOpen, Boxes, Layers3 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Page, PageHeader } from '../../components/ui/Page';
import { Badge } from '../../components/ui/Status';

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
  return (
    <Page>
      <PageHeader kicker={module.kicker} title={module.title} description={module.description}>
        <Badge className="max-compact:text-mini">Not available yet</Badge>
      </PageHeader>
      <EmptyState
        variant="page"
        className="pt-20 max-compact:pt-16.25"
        icon={module.icon}
        iconSize={32}
        title={module.empty}
        description={module.detail}
      >
        <Button onClick={onWorkspace}>
          <ArrowLeft size={14} />
          Back to workspace
        </Button>
      </EmptyState>
    </Page>
  );
}
