// The screen's side of the conversation with the core, which runs in a Bare
// worklet (worklet/worker.js). One JSON message per line, each way.

import worker from 'expo-bare-kit/workers/worklet/worker';
import b4a from 'b4a';
import type { CoreMethods, NodeState } from './types';

type Listener = (state: NodeState) => void;

interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

type Reply =
  | { id: number; result: unknown }
  | { id: number; error: string }
  | { event: 'state'; state: NodeState }
  | { event: 'log'; text: string };

const NEWLINE = String.fromCharCode(10);
const LOG_LINES = 400;

export interface Core {
  call<M extends keyof CoreMethods>(method: M, params: CoreMethods[M]['params']): Promise<CoreMethods[M]['result']>;
  /** Hears every new state. Returns a function that stops listening. */
  onState(listener: Listener): () => void;
  /** What the core has said lately, oldest first: for working out what went wrong. */
  log(): string;
  /** Stops the worklet, letting the core close its storage first. */
  stop(): Promise<void>;
}

/** Starts the worklet and returns the way to talk to it. */
export async function startCore(): Promise<Core> {
  const { ipc } = await worker.start();
  const pending = new Map<number, Pending>();
  const listeners = new Set<Listener>();
  let nextId = 1;
  let buffer = '';
  const lines: string[] = [];
  const note = (text: string) => {
    lines.push(new Date().toISOString().slice(11, 23) + ' ' + text);
    if (lines.length > LOG_LINES) lines.shift();
  };

  const handle = (reply: Reply) => {
    if ('event' in reply) {
      if (reply.event === 'state') listeners.forEach((listener) => listener(reply.state));
      else note(reply.text);
      return;
    }
    const waiting = pending.get(reply.id);
    if (!waiting) return;
    pending.delete(reply.id);
    if ('error' in reply) waiting.reject(new Error(reply.error));
    else waiting.resolve(reply.result);
  };

  // The stream can split or join messages, so collect text and cut at newlines.
  ipc.on('data', (data: unknown) => {
    buffer += b4a.toString(data as Uint8Array);
    let end = buffer.indexOf(NEWLINE);
    while (end !== -1) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      try {
        handle(JSON.parse(line) as Reply);
      } catch {
        // A line that isn't JSON is not ours to act on.
      }
      end = buffer.indexOf(NEWLINE);
    }
  });

  return {
    call(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
        ipc.write(b4a.from(JSON.stringify({ id, method, params }) + NEWLINE));
      });
    },
    onState(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    log: () => lines.join(NEWLINE),
    async stop() {
      listeners.clear();
      await ipc.terminate();
    },
  };
}
