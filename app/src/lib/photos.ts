// Choosing photos and getting them ready to share.
//
// Every photo is re-encoded before it leaves the phone. That gives the three
// sizes the gallery needs, and it drops the metadata a camera writes into a
// photo: where it was taken, when, and on what device.

import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { toPath } from '../store/node';
import type { ShareParams } from './types';

export interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
  name: string;
}

const MAX_AT_ONCE = 30;
const PREVIEW_SIDE = 1600;
const THUMBNAIL_SIDE = 400;
const ICON_SIDE = 192;

/** Opens the phone's photo picker. Returns an empty list if nothing was chosen. */
export async function pickPhotos(): Promise<PickedPhoto[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: MAX_AT_ONCE,
    quality: 1,
    exif: false,
  });
  if (result.canceled) return [];
  return result.assets.map((asset, index) => ({
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    name: asset.fileName ?? `photo-${index + 1}.jpg`,
  }));
}

/**
 * Picks a picture for an identity and makes it a small square JPEG, stripped
 * of metadata. Returns its path, or null if nothing was chosen.
 */
export async function pickIcon(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
    exif: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  // The phone's own cropper is not on every device: take the middle square.
  const side = Math.min(asset.width, asset.height);
  const context = ImageManipulator.manipulate(asset.uri);
  context.crop({
    originX: Math.floor((asset.width - side) / 2),
    originY: Math.floor((asset.height - side) / 2),
    width: side,
    height: side,
  });
  context.resize({ width: ICON_SIDE });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
  return toPath(saved.uri);
}

/** Re-encodes a photo as JPEG, no wider or taller than `side` if given. */
async function encode(photo: PickedPhoto, side: number | null, quality: number) {
  const context = ImageManipulator.manipulate(photo.uri);
  if (side !== null && Math.max(photo.width, photo.height) > side) {
    context.resize(photo.width >= photo.height ? { width: side } : { height: side });
  }
  const rendered = await context.renderAsync();
  return rendered.saveAsync({ format: SaveFormat.JPEG, compress: quality });
}

/** Makes the original, preview and thumbnail of one photo, stripped of metadata. */
export async function prepare(photo: PickedPhoto): Promise<ShareParams> {
  const original = await encode(photo, null, 0.92);
  const preview = await encode(photo, PREVIEW_SIDE, 0.8);
  const thumbnail = await encode(photo, THUMBNAIL_SIDE, 0.7);
  return {
    type: 'photo',
    name: photo.name.replace(/\.[^.]+$/, '') + '.jpg',
    mime: 'image/jpeg',
    width: original.width,
    height: original.height,
    files: {
      original: toPath(original.uri),
      preview: toPath(preview.uri),
      thumbnail: toPath(thumbnail.uri),
    },
  };
}
