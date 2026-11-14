// A member's name in a group, such as "Blue Otter". It comes from their key
// for that group, so it is the same on every device and means nothing
// outside the group.

import { unhex } from './crypto.js'

// Each colour word with its hue (0-359), so "Green Otter" is drawn in green.
/** @type {[string, number][]} */
const COLOURS = [
  ['Amber', 40], ['Blue', 220], ['Coral', 12], ['Crimson', 348], ['Golden', 48], ['Green', 130],
  ['Indigo', 245], ['Jade', 160], ['Lilac', 275], ['Olive', 70], ['Orange', 28], ['Pink', 325],
  ['Purple', 285], ['Scarlet', 4], ['Cyan', 188], ['Teal', 175]
]

const ANIMALS = [
  'Badger', 'Bear', 'Crane', 'Dolphin', 'Falcon', 'Fox', 'Gecko', 'Heron',
  'Koala', 'Lynx', 'Moose', 'Otter', 'Owl', 'Panda', 'Robin', 'Seal',
  'Tiger', 'Turtle', 'Walrus', 'Wolf', 'Wombat', 'Yak', 'Zebra', 'Hare',
  'Ibis', 'Jay', 'Kiwi', 'Lemur', 'Newt', 'Puffin', 'Quail', 'Stoat'
]

/**
 * @param {string} writerKey the member's key in this group, as hex
 * @returns {{ name: string, hue: number }} the name, and the hue (0-359) of its colour word
 */
export function nicknameFor(writerKey) {
  const bytes = unhex(writerKey)
  const [colour, hue] = COLOURS[bytes[0] % COLOURS.length]
  const animal = ANIMALS[bytes[1] % ANIMALS.length]
  return { name: `${colour} ${animal}`, hue }
}
