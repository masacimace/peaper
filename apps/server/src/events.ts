import type { ServerResponse } from 'node:http';
import type { PeaperDatabase } from '@peaper/core';

/** The database is the source of truth; notifications only prompt subscribers to drain it. */
export class EventStream {
  private readonly clients = new Set<() => void>();
  constructor(
    private readonly database: PeaperDatabase,
    private readonly workspaceId: string,
  ) {}

  attach(response: ServerResponse, after: number) {
    let cursor = after;
    let blocked = false;
    const drain = () => {
      if (blocked || response.destroyed) return;
      let events;
      do {
        events = this.database.eventsAfter(this.workspaceId, cursor);
        for (const event of events) {
          cursor = event.id;
          if (
            !response.write(`id: ${event.id}\nevent: runtime\ndata: ${JSON.stringify(event)}\n\n`)
          ) {
            blocked = true;
            return;
          }
        }
      } while (events.length === 250);
    };
    const resume = () => {
      blocked = false;
      drain();
    };
    const heartbeat = setInterval(() => {
      if (!blocked) response.write(': heartbeat\n\n');
    }, 15_000);
    heartbeat.unref();
    this.clients.add(drain);
    response.on('drain', resume);
    response.on('close', () => {
      clearInterval(heartbeat);
      this.clients.delete(drain);
    });
    this.closers.add(response);
    response.on('close', () => this.closers.delete(response));
    response.write(': connected\n\n');
    drain();
  }

  private readonly closers = new Set<ServerResponse>();
  publish() {
    for (const drain of this.clients) drain();
  }
  close() {
    for (const response of this.closers) response.end();
    this.clients.clear();
  }
}
