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

/** How a group's photos are laid out. */
export type ViewType = 'large' | 'small' | 'details';
/** What photos are ordered by. Each has a natural direction, which `sortReverse` turns round. */
export type Sort = 'date' | 'title' | 'person' | 'size';
/** How much the top of a group's screen shows. */
export type GroupHeader = 'full' | 'line';
export type GroupBy = 'none' | 'person' | 'tag';
/** How much the photo viewer says about a photo. */
export type ViewerInfo = 'full' | 'line' | 'hidden';

/** Light, dark, or whatever the phone is set to. */
export type ThemeChoice = 'system' | 'light' | 'dark';

/** How the app behaves on this phone. Nothing here is told to anyone. */
export interface Settings {
  /** Ask before each share who will see the photos. */
  shareReminder: boolean;
  /** Keep the connection while the app is off the screen. */
  stayConnected: boolean;
  view: ViewType;
  sort: Sort;
  /** Oldest first, Z to A, smallest first: the other way from each sort's own. */
  sortReverse: boolean;
  groupBy: GroupBy;
  viewerInfo: ViewerInfo;
  groupHeader: GroupHeader;
  /** The group list's width on a wide screen. */
  panelWidth: number;
  theme: ThemeChoice;
}

export interface Item {
  id: string;
  /** The title to show: your own if you wrote one, else the sharer's. May be empty. */
  title: string;
  /** The sharer's title, whatever yours is. */
  sharedTitle: string;
  /** As for the title. */
  description: string;
  sharedDescription: string;
  /** The sharer's tags, which the whole group sees. */
  tags: string[];
  /** Your own tags, which nobody else sees. */
  myTags: string[];
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
  /** The name to show: your own for the group if you gave it one, else the creator's. */
  name: string;
  sharedName: string;
  /** As for the name. May be empty. */
  description: string;
  sharedDescription: string;
  /** You created this group, so its name and description are yours to set for everyone. */
  creator: boolean;
  createdAt: number;
  joinedAt: number;
  /** The identity used here; null is the random one. */
  identity: string | null;
  /** False for a moment after joining, until a member has let us in. */
  writable: boolean;
  /** How many phones this one is connected to in this group. */
  peers: number;
  me: Member;
  /** Everyone in the group except those this phone has blocked. */
  members: Member[];
  /** Members blocked on this phone: their key, the name they went by when blocked, and their nickname. */
  blocked: { key: string; name: string; nickname: string }[];
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
  settings: Settings;
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
  setSettings: { params: Partial<Settings>; result: object };
  /** On your own photo this is for the group; on someone else's it is private. */
  setItemDetails: {
    params: { group: string; id: string; title: string; description: string; tags: string[] };
    result: object;
  };
  /** For everyone if you created the group, else private. */
  setGroupDetails: { params: { group: string; name: string; description: string }; result: object };
  setGroupOrder: { params: { ids: string[] }; result: object };
  /** On this phone alone; the member is not told. */
  setBlocked: { params: { group: string; member: string; blocked: boolean }; result: object };
}
