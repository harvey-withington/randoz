// What the core tells the screen. These mirror snapshot() in core/src/node.js
// and core/src/session.js.

export type TierName = 'thumbnail' | 'preview' | 'original';

export interface Person {
  /** The name to show: the one they chose, or else their nickname. */
  name: string;
  hue: number;
  /** Connected to this phone right now, where that is known. */
  online?: boolean;
  /** The path of their picture, if they have one. Initials are shown otherwise. */
  icon?: string | null;
}

/** One of the ways this phone's owner can appear in a group. */
export interface Identity {
  id: string;
  name: string;
  /** A short line about them; may be empty. */
  about: string;
  icon: string | null;
}

/** The colour of an identity's avatar outside any group: the accent's hue. */
export const IDENTITY_HUE = 245;

export interface Member extends Person {
  key: string;
  /** The random name this group gave them, shown beside a chosen name. */
  nickname: string;
  /** A short line about them; may be empty. */
  about: string;
  icon: string | null;
  me: boolean;
  /** Connected to this phone right now. For yourself: connected to the network. */
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
  /** The identity used here; null is the random one. */
  identity: string | null;
}

export interface Group {
  id: string;
  joining: false;
  key: string;
  name: string;
  createdAt: number;
  joinedAt: number;
  /** The identity used here; null is the random one. */
  identity: string | null;
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
  /** This phone has found the network. Says nothing about who else is online. */
  online: boolean;
  identities: Identity[];
  /** The identity chosen last, offered first next time. */
  lastIdentity: string | null;
  /** shareReminder: ask before each share who will see the photos. */
  settings: {
    shareReminder: boolean;
    /** Keep the connection while the app is off the screen. */
    stayConnected: boolean;
  };
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
  createGroup: { params: { name: string; identity: string | null }; result: { group: string } };
  joinGroup: { params: { code: string; identity: string | null }; result: { group: string } };
  createInvite: { params: { group: string; kind: 'open' }; result: { code: string } };
  revokeInvite: { params: { group: string; id: string }; result: object };
  shareItem: { params: ShareParams & { group: string }; result: { id: string } };
  unshareItems: { params: { group: string; ids: string[] }; result: object };
  getTier: { params: { group: string; id: string; tier: TierName }; result: { path: string } };
  markSaved: { params: { group: string; ids: string[] }; result: object };
  leaveGroup: { params: { group: string }; result: object };
  /** `icon`: a path to use, null to remove the picture, left out to keep it. */
  saveIdentity: {
    params: { id?: string; name: string; about: string; icon?: string | null };
    result: { id: string };
  };
  deleteIdentity: { params: { id: string }; result: object };
  setGroupIdentity: { params: { group: string; identity: string | null }; result: object };
  setSettings: { params: { shareReminder?: boolean; stayConnected?: boolean }; result: object };
}
