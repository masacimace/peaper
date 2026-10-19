import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import 'monaco-editor/languages/definitions/typescript/register.js';
import 'monaco-editor/languages/definitions/javascript/register.js';
import 'monaco-editor/languages/definitions/css/register.js';
import 'monaco-editor/languages/definitions/html/register.js';
import 'monaco-editor/languages/definitions/markdown/register.js';
import 'monaco-editor/languages/definitions/yaml/register.js';
import 'monaco-editor/languages/definitions/python/register.js';
import 'monaco-editor/languages/definitions/rust/register.js';
import 'monaco-editor/languages/definitions/shell/register.js';
import 'monaco-editor/languages/definitions/powershell/register.js';
import 'monaco-editor/languages/definitions/sql/register.js';
import 'monaco-editor/languages/definitions/ini/register.js';
import 'monaco-editor/editor/contrib/find/browser/findController.js';
import type { WorkspaceFile } from '@peaper/shared';
import { readEditorTheme } from '../../theme/editor-themes';
import { useTheme } from '../../theme/useTheme';

(self as typeof self & { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};
monaco.languages.register({ id: 'json' });
monaco.languages.setMonarchTokensProvider('json', {
  tokenizer: {
    root: [
      [/"(?:[^"\\]|\\.)*"\s*(?=:)/, 'type'],
      [/"(?:[^"\\]|\\.)*"/, 'string'],
      [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
      [/\b(?:true|false|null)\b/, 'keyword'],
      [/[{}[\],:]/, 'delimiter'],
    ],
  },
});
function applyEditorTheme() {
  monaco.editor.defineTheme('peaper', readEditorTheme());
  monaco.editor.setTheme('peaper');
}
export default function CodeEditor({
  file,
  wrap,
  onPosition,
}: {
  file: WorkspaceFile;
  wrap: boolean;
  onPosition: (line: number, column: number) => void;
}) {
  const theme = useTheme();
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const models = useRef(new Map<string, monaco.editor.ITextModel>());
  const views = useRef(new Map<string, monaco.editor.ICodeEditorViewState>());
  const position = useRef(onPosition);
  useEffect(() => {
    position.current = onPosition;
  }, [onPosition]);
  useEffect(() => {
    if (!host.current) return;
    applyEditorTheme();
    const instance = monaco.editor.create(host.current, {
      theme: 'peaper',
      model: null,
      readOnly: true,
      domReadOnly: true,
      minimap: { enabled: false },
      fontFamily: 'JetBrains Mono Variable, monospace',
      fontSize: 12,
      lineHeight: 21,
      padding: { top: 14, bottom: 14 },
      lineNumbersMinChars: 4,
      scrollBeyondLastLine: false,
      renderLineHighlight: 'line',
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      folding: true,
      stickyScroll: { enabled: false },
      contextmenu: false,
      renderValidationDecorations: 'off',
      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      automaticLayout: false,
    });
    editor.current = instance;
    const observer = new ResizeObserver(() => instance.layout());
    observer.observe(host.current);
    const cursor = instance.onDidChangeCursorPosition((event) =>
      position.current(event.position.lineNumber, event.position.column),
    );
    const cached = models.current;
    return () => {
      observer.disconnect();
      cursor.dispose();
      instance.dispose();
      for (const model of cached.values()) model.dispose();
      cached.clear();
      editor.current = null;
    };
  }, []);
  useEffect(() => {
    applyEditorTheme();
  }, [theme]);
  useEffect(() => {
    const instance = editor.current;
    if (!instance) return;
    const previous = instance.getModel();
    if (previous) {
      const view = instance.saveViewState();
      if (view) views.current.set(previous.uri.path, view);
    }
    let model = models.current.get(file.path);
    if (!model) {
      model = monaco.editor.createModel(
        file.content,
        file.language,
        monaco.Uri.from({ scheme: 'peaper', path: `/${file.path}` }),
      );
      models.current.set(file.path, model);
    } else if (model.getValue() !== file.content) model.setValue(file.content);
    instance.setModel(model);
    if (models.current.size > 12) {
      const oldest = [...models.current.entries()].find(([path]) => path !== file.path);
      if (oldest) {
        views.current.delete(oldest[1].uri.path);
        oldest[1].dispose();
        models.current.delete(oldest[0]);
      }
    }
    const view = views.current.get(model.uri.path);
    if (view) instance.restoreViewState(view);
    const cursor = instance.getPosition();
    if (cursor) position.current(cursor.lineNumber, cursor.column);
  }, [file]);
  useEffect(() => {
    editor.current?.updateOptions({ wordWrap: wrap ? 'on' : 'off' });
  }, [wrap]);
  return <div className="code-editor" ref={host} aria-label={`Read-only editor: ${file.path}`} />;
}
