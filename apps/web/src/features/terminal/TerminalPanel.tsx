import type { TerminalClientMessage, TerminalServerMessage } from '@peaper/shared';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { Play, RotateCcw, Square, TerminalSquare } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, IconButton } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { Panel } from '../../layout/Panel';
import { accessToken } from '../../lib/api';
import { readTerminalTheme } from '../../theme/editor-themes';
import { useTheme } from '../../theme/useTheme';

export default function TerminalPanel({
  hidden,
  maximized,
  onMaximize,
  onClose,
}: {
  hidden: boolean;
  maximized: boolean;
  onMaximize: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const instance = useRef<Terminal | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const [connection, setConnection] = useState('Connecting');
  const [generation, setGeneration] = useState(0);
  const [stopped, setStopped] = useState(false);
  useEffect(() => {
    if (!host.current || stopped) return;
    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: 'JetBrains Mono Variable, monospace',
      fontSize: 11,
      lineHeight: 1.55,
      scrollback: 3000,
      theme: readTerminalTheme(),
    });
    instance.current = terminal;
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host.current);
    if (host.current.clientWidth > 0) fit.fit();
    const socket = new WebSocket(
      `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/terminal`,
    );
    let ready = false;
    let disposed = false;
    const send = (message: TerminalClientMessage) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    };
    const size = () => ({
      cols: Math.min(500, Math.max(20, terminal.cols)),
      rows: Math.min(200, Math.max(5, terminal.rows)),
    });
    socket.onopen = () => send({ type: 'auth', token: accessToken, ...size() });
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as TerminalServerMessage;
      if (message.type === 'ready') {
        ready = true;
        setConnection('Connected');
      }
      if (message.type === 'output') terminal.write(message.data);
      if (message.type === 'exit') {
        ready = false;
        setConnection(`Exited (${message.exitCode})`);
        terminal.writeln(`\r\n[Shell exited with code ${message.exitCode}]`);
      }
      if (message.type === 'error') {
        setConnection('Unavailable');
        terminal.writeln(`\r\n${message.message}`);
      }
    };
    socket.onclose = () => {
      if (!disposed) {
        ready = false;
        setConnection((current) => (current.startsWith('Exited') ? current : 'Disconnected'));
      }
    };
    socket.onerror = () => {
      if (!disposed) setConnection('Disconnected');
    };
    const data = terminal.onData((value) => {
      if (ready) send({ type: 'input', data: value });
    });
    const observer = new ResizeObserver(() => {
      if (!host.current?.clientWidth || !host.current.clientHeight) return;
      fit.fit();
      if (ready) send({ type: 'resize', ...size() });
    });
    observer.observe(host.current);
    return () => {
      disposed = true;
      observer.disconnect();
      data.dispose();
      socket.close();
      terminal.dispose();
      instance.current = null;
    };
  }, [generation, stopped]);
  useEffect(() => {
    if (instance.current) instance.current.options.theme = readTerminalTheme();
  }, [theme]);
  function start() {
    setConnection('Connecting');
    setStopped(false);
    setGeneration((value) => value + 1);
  }
  return (
    <Panel
      title="Terminal"
      icon={TerminalSquare}
      className="h-full bg-terminal"
      hidden={hidden}
      maximized={maximized}
      onMaximize={onMaximize}
      onClose={onClose}
      actions={
        <>
          <span className="mr-1.75 text-mini whitespace-nowrap text-subtle max-compact:mr-0.75 max-compact:text-tiny">
            {connection}
          </span>
          <IconButton aria-label="Restart terminal" title="Restart shell" onClick={start}>
            <RotateCcw size={13} />
          </IconButton>
          <IconButton
            aria-label="Stop terminal shell"
            title="Stop shell"
            disabled={stopped}
            onClick={() => {
              setStopped(true);
              setConnection('Stopped');
            }}
          >
            <Square size={11} />
          </IconButton>
        </>
      }
    >
      <div
        data-slot="terminal-host"
        className="h-full min-h-0 pt-2 pr-1.25 pb-1 pl-2.5"
        ref={host}
        hidden={stopped}
      />
      {stopped && (
        <EmptyState icon={TerminalSquare} iconSize={24} title="Shell stopped">
          <Button className="mt-3.75" onClick={start}>
            <Play size={13} />
            Start shell
          </Button>
        </EmptyState>
      )}
    </Panel>
  );
}
