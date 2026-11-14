// Saving photos from a group to the phone's camera roll.

import { File, Paths } from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import type { NodeStore } from '../store/node';
import { toUri } from '../store/node';
import type { Item } from './types';

/**
 * Fetches each photo's original, saves it to the camera roll and marks it
 * saved. Returns false if the user refused permission. Throws if a photo
 * can't be fetched or saved; the ones before it stay saved.
 */
export async function saveToCameraRoll(
  node: NodeStore,
  group: string,
  items: Item[],
  onProgress?: (done: number, total: number) => void,
): Promise<boolean> {
  const permission = await MediaLibrary.requestPermissionsAsync(true);
  if (!permission.granted) return false;

  for (let done = 0; done < items.length; done++) {
    onProgress?.(done, items.length);
    const { id } = items[done];
    const { path } = await node.call('getTier', { group, id, tier: 'original' });
    // The camera roll needs a real file name with its extension.
    const copy = new File(Paths.cache, `randoz-${id.slice(0, 8)}.jpg`);
    if (copy.exists) copy.delete();
    new File(toUri(path)).copy(copy);
    await MediaLibrary.Asset.create(copy.uri);
    // Saving may move the copy into the camera roll, so it may already be gone.
    if (copy.exists) copy.delete();
    await node.call('markSaved', { group, ids: [id] });
  }
  return true;
}
