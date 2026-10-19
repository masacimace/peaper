import type { FastifyInstance } from 'fastify';
import type { TerminalManager } from '@peaper/core';
import { terminalClientMessageSchema, type TerminalServerMessage } from '@peaper/shared';

export function terminalRoute(
  app: FastifyInstance,
  manager: TerminalManager,
  authenticate: (token: string) => boolean,
) {
  app.get('/api/terminal', { websocket: true }, (socket) => {
    let connection: Awaited<ReturnType<TerminalManager['create']>> | undefined;
    let authenticating = false;
    const timeout = setTimeout(() => socket.close(1008, 'Authentication required'), 5_000);
    const send = (message: TerminalServerMessage) => {
      if (socket.readyState !== 1) return;
      if (socket.bufferedAmount > 2 * 1024 * 1024) {
        socket.close(1013, 'Terminal consumer too slow');
        return;
      }
      socket.send(JSON.stringify(message));
    };
    socket.on('message', (raw) => {
      void (async () => {
        try {
          const message = terminalClientMessageSchema.parse(JSON.parse(raw.toString()));
          if (!connection) {
            if (authenticating) return;
            if (message.type !== 'auth' || !authenticate(message.token)) {
              socket.close(1008, 'Authentication failed');
              return;
            }
            authenticating = true;
            clearTimeout(timeout);
            connection = await manager.create(message.cols, message.rows);
            if (socket.readyState !== 1) {
              await manager.stop(connection.id);
              return;
            }
            connection.terminal.onData((data) => send({ type: 'output', data }));
            connection.terminal.onExit(({ exitCode }) => {
              send({ type: 'exit', exitCode });
              socket.close(1000, 'Shell exited');
            });
            send({ type: 'ready', id: connection.id, shell: manager.shell });
            return;
          }
          if (message.type === 'input') connection.terminal.write(message.data);
          if (message.type === 'resize') connection.terminal.resize(message.cols, message.rows);
        } catch {
          send({
            type: 'error',
            message: 'Could not open terminal. Run peaper doctor for native diagnostics.',
          });
          socket.close(1011, 'Terminal unavailable');
        }
      })();
    });
    socket.on('close', () => {
      clearTimeout(timeout);
      if (connection) void manager.stop(connection.id);
    });
    socket.on('error', () => {
      if (connection) void manager.stop(connection.id);
    });
  });
}
