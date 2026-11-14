// What the core tells the screen. These mirror snapshot() in core/src/node.js.

export type TierName = 'thumbnail' | 'preview' | 'original';

export interface Person {
  name: string;
  hue: number;
}

export interface Member extends Person {
  key: string;
  me: boolean;
}

export interface Item {
  id: string;
  type: 'photo' | 'video' | 'file';
  name: string;
  mime: string;
  width: number;
  height: number;
  createdAt: number;
  size: number;
  sharedBy: string;
  by: Person | null;
  mine: boolean;
  /** Paths of the tiers already on this phone; null for those that aren't. */
  files: Record<TierName, string | null>;
}

export interface InviteInfo {
  id: string;
  kind: 'open';
  code: string;
  createdAt: number;
  mine: boolean;
}

export interface GroupInfo {
  key: string;
  name: string;
  createdAt: number;
  /** False for a moment after joining, until a member has let us in. */
  writable: boolean;
}

export interface NoGroupState {
  group: null;
  joining: boolean;
  joinError: string;
  peers: number;
}

export interface InGroupState {
  group: GroupInfo;
  joining: false;
  joinError: '';
  peers: number;
  me: Person & { key: string };
  members: Member[];
  items: Item[];
  invites: InviteInfo[];
}

export type NodeState = NoGroupState | InGroupState;

export interface ShareParams {
  type: 'photo';
  name: string;
  mime: string;
  width: number;
  height: number;
  files: Partial<Record<TierName, string>>;
}

/** The core's methods, as the screen calls them. */
export interface CoreMethods {
  init: { params: { storage: string }; result: { state: NodeState } };
  createGroup: { params: { name: string }; result: object };
  joinGroup: { params: { code: string }; result: object };
  cancelJoin: { params: object; result: object };
  createInvite: { params: { kind: 'open' }; result: { code: string } };
  revokeInvite: { params: { id: string }; result: object };
  shareItem: { params: ShareParams; result: { id: string } };
  unshareItem: { params: { id: string }; result: object };
  getTier: { params: { id: string; tier: TierName }; result: { path: string } };
  leaveGroup: { params: object; result: object };
}
