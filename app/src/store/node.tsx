// The app's one source of truth: the core's state, and the way to call it.
// Components read it with useNode().

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Paths } from 'expo-file-system';
import { startCore, type Core } from '../lib/core';
import type { CoreMethods, NodeState } from '../lib/types';

export interface NodeStore {
  /** null until the core has started. */
  state: NodeState | null;
  /** Why the core failed to start, if it did. */
  startError: string;
  call<M extends keyof CoreMethods>(method: M, params: CoreMethods[M]['params']): Promise<CoreMethods[M]['result']>;
  /** What the core has said lately, as text to copy. */
  log(): string;
}

const NodeContext = createContext<NodeStore | null>(null);

/** A file:// address as a plain path, which is what the core's file calls take. */
export const toPath = (uri: string): string => decodeURI(uri).replace(/^file:\/\//, '');

/** A plain path as an address an <Image> can show. */
export const toUri = (path: string): string => (path.startsWith('file://') ? path : 'file://' + path);

interface Props {
  children: ReactNode;
}

export function NodeProvider({ children }: Props) {
  const core = useRef<Core | null>(null);
  const [state, setState] = useState<NodeState | null>(null);
  const [startError, setStartError] = useState('');

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const started = await startCore();
      if (cancelled) {
        await started.stop();
        return;
      }
      core.current = started;
      stop = started.onState(setState);
      const storage = toPath(Paths.document.uri) + '/randoz';
      const { state: first } = await started.call('init', { storage });
      if (!cancelled) setState(first);
    })().catch((err: Error) => setStartError(err.message));
    return () => {
      cancelled = true;
      stop?.();
      // Free the core's storage for whichever screen starts next.
      core.current?.stop().catch(() => {});
      core.current = null;
    };
  }, []);

  const store: NodeStore = {
    state,
    startError,
    call(method, params) {
      if (!core.current) return Promise.reject(new Error('RANDOZ is still starting'));
      return core.current.call(method, params);
    },
    log: () => core.current?.log() ?? '',
  };
  return <NodeContext.Provider value={store}>{children}</NodeContext.Provider>;
}

export function useNode(): NodeStore {
  const store = useContext(NodeContext);
  if (!store) throw new Error('useNode needs a NodeProvider above it');
  return store;
}
