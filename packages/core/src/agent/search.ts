import { Worker } from 'node:worker_threads';
import type { WorkspaceFiles } from '../workspace/files.js';

export async function searchWorkspace(
  files: WorkspaceFiles,
  query: string,
  regex: boolean,
  filename: string | undefined,
  signal: AbortSignal,
) {
  const documents: { path: string; content: string }[] = [];
  const queue = [''];
  let visited = 0;
  let bytes = 0;
  let budgetSkipped = false;
  while (queue.length && visited < 500 && bytes < 4 * 1024 * 1024) {
    signal.throwIfAborted();
    let directory;
    try {
      directory = await files.list(queue.shift()!);
    } catch {
      continue;
    }
    for (const entry of directory.entries) {
      if (++visited > 500) break;
      if (entry.kind === 'directory') {
        queue.push(entry.path);
        continue;
      }
      if (filename && !entry.path.toLowerCase().includes(filename.toLowerCase())) continue;
      if (!query) {
        documents.push({ path: entry.path, content: '' });
        continue;
      }
      try {
        const file = await files.read(entry.path);
        if (bytes + file.bytes > 4 * 1024 * 1024) {
          budgetSkipped = true;
          continue;
        }
        bytes += file.bytes;
        documents.push({ path: entry.path, content: file.content });
      } catch {
        /* Binary, large, and protected files are not search candidates. */
      }
    }
  }
  if (!query)
    return {
      files: documents.map((file) => file.path).slice(0, 100),
      truncated: visited >= 500 || queue.length > 0,
    };
  // User/model regex executes off the server thread and has a hard time limit.
  return new Promise<unknown>((done, reject) => {
    const worker = new Worker(
      `
      const { parentPort, workerData } = require('node:worker_threads');
      try {
        const { documents, query, regex, incomplete } = workerData;
        const pattern = regex ? new RegExp(query, 'i') : null;
        const matches = [];
        outer: for (const file of documents) {
          const lines = file.content.split(/\\r?\\n/);
          for (let i = 0; i < lines.length; i++) {
            if (pattern ? pattern.test(lines[i]) : lines[i].toLowerCase().includes(query.toLowerCase())) {
              matches.push({ path: file.path, line: i + 1, text: lines[i].slice(0, 300) });
              if (matches.length >= 60) break outer;
            }
          }
        }
        parentPort.postMessage({ matches, truncated: incomplete || matches.length >= 60, searchedFiles: documents.length });
      } catch { parentPort.postMessage({ error: 'Invalid regular expression.' }); }
    `,
      {
        eval: true,
        resourceLimits: { maxOldGenerationSizeMb: 64 },
        workerData: {
          documents,
          query,
          regex,
          incomplete: budgetSkipped || visited >= 500 || queue.length > 0,
        },
      },
    );
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      void worker.terminate();
    };
    const cancel = () => {
      finish();
      reject(new Error('Search cancelled.'));
    };
    const timer = setTimeout(() => {
      finish();
      reject(new Error('Search exceeded its time limit. Use a simpler pattern.'));
    }, 1500);
    worker.once('message', (value: { error?: string }) => {
      finish();
      if (value.error) reject(new Error(value.error));
      else done(value);
    });
    worker.once('error', (error) => {
      finish();
      reject(error);
    });
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
  });
}
