// A member's name in a group, such as "Blue Otter". It comes from their key
// for that group, so it is the same on every device and means nothing
// outside the group.

import { unhex } from './crypto.js'

const COLOURS = [
  'Amber', 'Blue', 'Coral', 'Crimson', 'Golden', 'Green', 'Indigo', 'Jade',
  'Lilac', 'Olive', 'Orange', 'Pink', 'Purple', 'Scarlet', 'Silver', 'Teal'
]

const ANIMALS = [
  'Badger', 'Bear', 'Crane', 'Dolphin', 'Falcon', 'Fox', 'Gecko', 'Heron',
  'Koala', 'Lynx', 'Moose', 'Otter', 'Owl', 'Panda', 'Robin', 'Seal',
  'Tiger', 'Turtle', 'Walrus', 'Wolf', 'Wombat', 'Yak', 'Zebra', 'Hare',
  'Ibis', 'Jay', 'Kiwi', 'Lemur', 'Newt', 'Puffin', 'Quail', 'Stoat'
]

/**
 * @param {string} writerKey the member's key in this group, as hex
 * @returns {{ name: string, hue: number }} the name, and a hue (0-359) for their colour
 */
export function nicknameFor(writerKey) {
  const bytes = unhex(writerKey)
  const colour = COLOURS[bytes[0] % COLOURS.length]
  const animal = ANIMALS[bytes[1] % ANIMALS.length]
  const hue = Math.round((((bytes[2] << 8) | bytes[3]) / 65536) * 360) % 360
  return { name: `${colour} ${animal}`, hue }
}
