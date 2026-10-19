import { createServer, type ServerResponse } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';

export type FixtureMessage = {
  role: string;
  content: string | null;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
};
export type FixtureRequest = {
  messages: FixtureMessage[];
  model: string;
  stream: boolean;
  tool_choice?: { function?: { name?: string } };
  tools?: unknown[];
  reasoning?: { effort?: string; max_tokens?: number };
  reasoning_effort?: string;
};
export type FixtureReply =
  | { tool: string; input: Record<string, unknown> }
  | { text: string }
  | { status: number; error: string };
export async function modelFixture(
  respond: (request: FixtureRequest) => FixtureReply,
  connectionReply?: FixtureReply,
  catalog?: unknown,
) {
  const requests: FixtureRequest[] = [];
  const authorizations: (string | undefined)[] = [];
  const server = createServer(async (request, response) => {
    if (request.url === '/v1/models' && request.method === 'GET' && catalog !== undefined) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(catalog));
      return;
    }
    if (request.url !== '/v1/chat/completions') {
      response.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()) as FixtureRequest;
    requests.push(body);
    authorizations.push(request.headers.authorization);
    const reply: FixtureReply =
      body.tool_choice?.function?.name === 'peaper_connection_check'
        ? (connectionReply ?? { tool: 'peaper_connection_check', input: { ok: true } })
        : respond(body);
    if (!body.stream && 'text' in reply) {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(
        JSON.stringify({
          id: randomUUID(),
          object: 'chat.completion',
          created: 1,
          model: body.model,
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: reply.text },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
        }),
      );
    } else sendFixtureReply(response, reply);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing fixture address');
  return {
    url: `http://127.0.0.1:${address.port}/v1`,
    requests,
    authorizations,
    close: () =>
      new Promise<void>((done, reject) => {
        if (!server.listening) {
          done();
          return;
        }
        server.close((error) => (error ? reject(error) : done()));
        server.closeAllConnections();
      }),
  };
}
function sendFixtureReply(response: ServerResponse, reply: FixtureReply) {
  if ('status' in reply) {
    response.writeHead(reply.status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: { message: reply.error } }));
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const id = randomUUID();
  const send = (delta: object, finish_reason: string | null) =>
    response.write(
      `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: 1, model: 'fixture-model', choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
    );
  if ('tool' in reply) {
    send(
      {
        role: 'assistant',
        tool_calls: [
          {
            index: 0,
            id: `call_${id}`,
            type: 'function',
            function: { name: reply.tool, arguments: JSON.stringify(reply.input) },
          },
        ],
      },
      null,
    );
    send({}, 'tool_calls');
  } else {
    send({ role: 'assistant', content: reply.text }, null);
    send({}, 'stop');
  }
  response.end('data: [DONE]\n\n');
}
export function codingScenario(request: FixtureRequest): FixtureReply {
  const lastUser = request.messages.findLastIndex((message) => message.role === 'user');
  const completed = request.messages
    .slice(lastUser + 1)
    .filter((message) => message.role === 'tool');
  const steps: FixtureReply[] = [
    {
      tool: 'update_todos',
      input: {
        todos: [
          { text: 'Read the implementation and run its test', status: 'in_progress' },
          { text: 'Fix addition and verify', status: 'pending' },
        ],
      },
    },
    { tool: 'read_file', input: { path: 'math.mjs' } },
    { tool: 'run_command', input: { command: 'node check.mjs' } },
    { tool: 'edit_file', input: { path: 'math.mjs', oldText: 'a - b', newText: 'a + b' } },
    { tool: 'run_command', input: { command: 'node check.mjs' } },
    {
      tool: 'update_todos',
      input: {
        todos: [
          { text: 'Read the implementation and run its test', status: 'completed' },
          { text: 'Fix addition and verify', status: 'completed' },
        ],
      },
    },
    {
      text: 'Changed math.mjs to add the two inputs. The first test failed; after the edit, node check.mjs printed ADDITION_OK and exited with code 0.',
    },
  ];
  return steps[completed.length] ?? { text: 'Fixture sequence complete.' };
}
