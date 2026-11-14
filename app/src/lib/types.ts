// What the core tells the screen. These mirror snapshot() in core/src/node.js
// and core/src/session.js.

export type TierName = 'thumbnail' | 'preview' | 'original';

export interface Person {
  /** The name to show: the one they chose, or else their nickname. */
  name: string;
  hue: number;
}

export interface Member extends Person {
  key: string;
  /** The random name this group gave them, shown beside a chosen name. */
  nickname: string;
  me: boolean;
  /** Connected to this phone right now. Always true for yourself. */
  online: boolean;
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
  /** Saved to this phone's camera roll. */
  saved: boolean;
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

/** A group this phone is still trying to get into. */
export interface JoiningGroup {
  id: string;
  joining: true;
  /** Why a member refused the invite, or empty while still looking. */
  joinError: string;
  joinedAt: number;
  peers: number;
}

export interface Group {
  id: string;
  joining: false;
  key: string;
  name: string;
  createdAt: number;
  joinedAt: number;
  /** False for a moment after joining, until a member has let us in. */
  writable: boolean;
  /** How many phones this one is connected to in this group. */
  peers: number;
  me: Member;
  members: Member[];
  items: Item[];
  invites: InviteInfo[];
}

export interface NodeState {
  profile: { name: string };
  groups: (Group | JoiningGroup)[];
}

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
  createGroup: { params: { name: string }; result: { group: string } };
  joinGroup: { params: { code: string }; result: { group: string } };
  createInvite: { params: { group: string; kind: 'open' }; result: { code: string } };
  revokeInvite: { params: { group: string; id: string }; result: object };
  shareItem: { params: ShareParams & { group: string }; result: { id: string } };
  unshareItems: { params: { group: string; ids: string[] }; result: object };
  getTier: { params: { group: string; id: string; tier: TierName }; result: { path: string } };
  markSaved: { params: { group: string; ids: string[] }; result: object };
  leaveGroup: { params: { group: string }; result: object };
  setProfile: { params: { name: string }; result: object };
}
