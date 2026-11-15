// How a group's photos are searched, filtered, grouped and sorted. Pure
// logic: no React, no strings of its own.

import type { GroupBy, Item, Sort } from './types';

export interface Arrangement {
  /** Free text, matched against titles, descriptions, file names and tags. */
  search: string;
  /** Only photos shared by this member (their key), or null for everyone's. */
  person: string | null;
  /** Only photos with one of these tags, the sharer's or your own; none means all. */
  tags: string[];
  sort: Sort;
  /** The other way from the sort's own: oldest first, Z to A, smallest first. */
  reverse: boolean;
  groupBy: GroupBy;
}

export interface Section {
  /** Unique among the sections; empty when the photos are not grouped. */
  key: string;
  /** The heading to show; empty when the photos are not grouped. */
  title: string;
  items: Item[];
}

/** What to call a photo: its title, or else the file's name. */
export const labelOf = (item: Item): string => item.title || item.name;

/** Every tag on a photo: the sharer's, then your own, without repeats. */
export function tagsOf(item: Item): string[] {
  const seen = new Set(item.tags.map((tag) => tag.toLowerCase()));
  return [...item.tags, ...item.myTags.filter((tag) => !seen.has(tag.toLowerCase()))];
}

/** The tags in use in a group, each list sorted: those sharers gave, and your own. */
export function tagsIn(items: Item[]): { shared: string[]; mine: string[] } {
  const collect = (pick: (item: Item) => string[]) => {
    const byKey = new Map<string, string>();
    for (const item of items) for (const tag of pick(item)) if (!byKey.has(tag.toLowerCase())) byKey.set(tag.toLowerCase(), tag);
    return [...byKey.values()].sort((a, b) => a.localeCompare(b));
  };
  const shared = collect((item) => item.tags);
  const taken = new Set(shared.map((tag) => tag.toLowerCase()));
  return { shared, mine: collect((item) => item.myTags).filter((tag) => !taken.has(tag.toLowerCase())) };
}

function matches(item: Item, { search, person, tags }: Arrangement): boolean {
  if (person !== null && item.sharedBy !== person) return false;
  if (tags.length > 0) {
    const wanted = new Set(tags.map((tag) => tag.toLowerCase()));
    if (!tagsOf(item).some((one) => wanted.has(one.toLowerCase()))) return false;
  }
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = [item.title, item.sharedTitle, item.description, item.sharedDescription, item.name, ...tagsOf(item)]
    .join(' ')
    .toLowerCase();
  return words.every((word) => text.includes(word));
}

/** Each sort's own direction: newest first, A to Z, largest first. */
function compare(sort: Sort, reverse: boolean): (a: Item, b: Item) => number {
  const newest = (a: Item, b: Item) => b.createdAt - a.createdAt;
  const own: Record<Sort, (a: Item, b: Item) => number> = {
    date: newest,
    title: (a, b) => labelOf(a).localeCompare(labelOf(b)) || newest(a, b),
    person: (a, b) => (a.by?.name ?? '').localeCompare(b.by?.name ?? '') || newest(a, b),
    size: (a, b) => b.size - a.size || newest(a, b),
  };
  return reverse ? (a, b) => own[sort](b, a) : own[sort];
}

/**
 * The photos to show, in order, in the sections to show them in. Grouped by
 * tag, a photo with several tags is in each of their sections; `untagged`
 * names the section for photos with none.
 */
export function arrange(items: Item[], arrangement: Arrangement, untagged: string): Section[] {
  const shown = items.filter((item) => matches(item, arrangement)).sort(compare(arrangement.sort, arrangement.reverse));
  if (arrangement.groupBy === 'none') return shown.length > 0 ? [{ key: '', title: '', items: shown }] : [];

  const sections = new Map<string, Section>();
  const add = (key: string, title: string, item: Item) => {
    const section = sections.get(key) ?? { key, title, items: [] };
    section.items.push(item);
    sections.set(key, section);
  };
  for (const item of shown) {
    if (arrangement.groupBy === 'person') add('p:' + item.sharedBy, item.by?.name ?? '', item);
    else if (tagsOf(item).length === 0) add('none', untagged, item);
    else for (const tag of tagsOf(item)) add('t:' + tag.toLowerCase(), tag, item);
  }
  // Sections by name, with the photos that have no tag last. Sorting by
  // person while grouped by person orders the groups themselves, so its
  // direction turns them round too.
  const turned = arrangement.reverse && arrangement.groupBy === 'person' && arrangement.sort === 'person' ? -1 : 1;
  return [...sections.values()].sort(
    (a, b) => Number(a.key === 'none') - Number(b.key === 'none') || turned * a.title.localeCompare(b.title),
  );
}

/**
 * A tag's colour: a hue worked out from its letters, so the same tag is the
 * same colour everywhere and for everyone. Drawn fully saturated by the theme.
 */
export function tagHue(tag: string): number {
  let hash = 0;
  for (const letter of tag.toLowerCase()) hash = (hash * 31 + letter.codePointAt(0)!) % 360;
  return hash;
}

/** Every photo in the sections, once each, in the order shown. */
export function flatten(sections: Section[]): Item[] {
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const section of sections) {
    for (const item of section.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

/** A file size as people read it: "640 KB", "3.2 MB". */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
