import type { SkillDetail } from '@peaper/shared';

export type FileNode = { name: string; path: string; children: FileNode[]; bytes?: number };
export function skillFileTree(resources: SkillDetail['resources']): FileNode[] {
  const roots: FileNode[] = [];
  for (const resource of [{ path: 'SKILL.md', bytes: undefined }, ...resources]) {
    let children = roots,
      path = '';
    const parts = resource.path.split('/');
    parts.forEach((name, index) => {
      path += `${path ? '/' : ''}${name}`;
      let node = children.find((item) => item.name === name);
      if (!node) {
        node = { name, path, children: [] };
        children.push(node);
      }
      if (index === parts.length - 1) node.bytes = resource.bytes;
      children = node.children;
    });
  }
  const sort = (nodes: FileNode[]): FileNode[] =>
    nodes
      .sort(
        (a, b) =>
          Number(Boolean(b.children.length)) - Number(Boolean(a.children.length)) ||
          a.name.localeCompare(b.name),
      )
      .map((node) => ({ ...node, children: sort(node.children) }));
  return sort(roots);
}
