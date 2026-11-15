// Searching, filtering, grouping and sorting a group's photos.

import test from 'node:test';
import assert from 'node:assert/strict';
import { arrange, flatten, sizeLabel, tagHue, tagsIn, tagsOf, type Arrangement } from '../src/lib/gallery.ts';
import type { Item } from '../src/lib/types.ts';

const photo = (id: string, over: Partial<Item>): Item => ({
  id,
  type: 'photo',
  name: id + '.jpg',
  mime: 'image/jpeg',
  width: 10,
  height: 10,
  createdAt: 0,
  size: 1000,
  sharedBy: 'alice',
  by: { name: 'Alice', hue: 0 },
  mine: false,
  saved: false,
  files: { thumbnail: null, preview: null, original: null },
  title: '',
  sharedTitle: '',
  description: '',
  sharedDescription: '',
  tags: [],
  myTags: [],
  ...over,
});

const items = [
  photo('a', { createdAt: 1, title: 'Breach', tags: ['Whale', 'sea'], size: 5000 }),
  photo('b', { createdAt: 2, sharedBy: 'bob', by: { name: 'Bob', hue: 0 }, description: 'Lunch on the pier', myTags: ['food'] }),
  photo('c', { createdAt: 3, title: 'Tail', tags: ['whale'], myTags: ['Favourites'], size: 9000 }),
];

const all: Arrangement = { search: '', person: null, tags: [], sort: 'date', reverse: false, groupBy: 'none' };
const ids = (arrangement: Partial<Arrangement>) =>
  flatten(arrange(items, { ...all, ...arrangement }, 'No tags')).map((item) => item.id);

test('photos sort by date, title, person and size, each either way', () => {
  assert.deepEqual(ids({}), ['c', 'b', 'a']);
  assert.deepEqual(ids({ reverse: true }), ['a', 'b', 'c']);
  assert.deepEqual(ids({ sort: 'title' }), ['b', 'a', 'c']); // b.jpg, Breach, Tail
  assert.deepEqual(ids({ sort: 'title', reverse: true }), ['c', 'a', 'b']);
  assert.deepEqual(ids({ sort: 'person' }), ['c', 'a', 'b']);
  assert.deepEqual(ids({ sort: 'size' }), ['c', 'a', 'b']);
  assert.deepEqual(ids({ sort: 'size', reverse: true }), ['b', 'a', 'c']);
});

test('search looks in titles, descriptions, file names and tags, and needs every word', () => {
  assert.deepEqual(ids({ search: 'pier' }), ['b']);
  assert.deepEqual(ids({ search: 'WHALE' }), ['c', 'a']);
  assert.deepEqual(ids({ search: 'whale tail' }), ['c']);
  assert.deepEqual(ids({ search: 'favour' }), ['c']);
  assert.deepEqual(ids({ search: 'nothing here' }), []);
});

test('filters by who shared and by tag, shared or private, whatever the capitals', () => {
  assert.deepEqual(ids({ person: 'bob' }), ['b']);
  assert.deepEqual(ids({ tags: ['whale'] }), ['c', 'a']);
  assert.deepEqual(ids({ tags: ['Food'] }), ['b']);
  // Several tags: a photo with any one of them.
  assert.deepEqual(ids({ tags: ['food', 'sea'] }), ['b', 'a']);
  assert.deepEqual(ids({ tags: ['whale'], person: 'bob' }), []);
});

test('grouped by person or tag, each section is named and untagged photos come last', () => {
  const byPerson = arrange(items, { ...all, groupBy: 'person' }, 'No tags');
  assert.deepEqual(byPerson.map((section) => [section.title, section.items.map((item) => item.id)]), [
    ['Alice', ['c', 'a']],
    ['Bob', ['b']],
  ]);

  const byTag = arrange([...items, photo('d', { createdAt: 4 })], { ...all, groupBy: 'tag' }, 'No tags');
  assert.deepEqual(byTag.map((section) => [section.title, section.items.map((item) => item.id)]), [
    ['Favourites', ['c']],
    ['food', ['b']],
    ['sea', ['a']],
    ['whale', ['c', 'a']],
    ['No tags', ['d']],
  ]);
  // A photo in two sections is still one photo.
  assert.deepEqual(flatten(byTag).map((item) => item.id).sort(), ['a', 'b', 'c', 'd']);
});

test('tags are listed once, the sharer\'s apart from your own', () => {
  assert.deepEqual(tagsOf(items[2]), ['whale', 'Favourites']);
  assert.deepEqual(tagsIn(items), { shared: ['sea', 'Whale'], mine: ['Favourites', 'food'] });
});

test('a tag has one colour, whatever its capitals, and tags differ', () => {
  assert.equal(tagHue('whale'), tagHue('Whale'));
  assert.ok(tagHue('whale') >= 0 && tagHue('whale') < 360);
  assert.notEqual(tagHue('whale'), tagHue('sea'));
});

test('sizes read as KB or MB', () => {
  assert.equal(sizeLabel(300), '1 KB');
  assert.equal(sizeLabel(640 * 1024), '640 KB');
  assert.equal(sizeLabel(3.2 * 1024 * 1024), '3.2 MB');
});
