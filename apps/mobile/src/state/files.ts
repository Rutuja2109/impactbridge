// Photos for posts. The phone's photo picker (no storage permission needed) gives one picture, which is shrunk to 900 px wide
// and compressed so it fits in a Firestore document (under 1 MB), then saved with the post. Photos of documents (ID, bills,
// hospital papers) use the same path and are only readable by the author and admins.
import { collection, doc, onSnapshot, setDoc } from '@react-native-firebase/firestore';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { db } from '../firebase';
import { useLive } from './communities';
import type { Attach } from './post';

const LIMIT = 700_000; // characters of base64 per photo

/** Opens the photo picker and returns the chosen picture ready to attach, or null if cancelled. Throws 'big' if it cannot be made small enough. */
export async function pickPhoto(label: string): Promise<Attach | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 1 });
  if (res.canceled || !res.assets[0]) return null;
  for (const [width, compress] of [[900, 0.5], [700, 0.35], [500, 0.25]] as const) {
    const out = await ImageManipulator.manipulateAsync(res.assets[0].uri, [{ resize: { width } }], { compress, format: ImageManipulator.SaveFormat.JPEG, base64: true });
    if (out.base64 && out.base64.length <= LIMIT) return { name: label, size: Math.round(out.base64.length * 0.75), b64: out.base64 };
  }
  throw new Error('big');
}

/** Saves a post's photos as posts/{id}/files/{n}. `field` says where the photo belongs (files, cover or docs). */
export async function savePhotos(postId: string, groups: Record<string, Attach[]>) {
  let n = 0;
  const jobs: Promise<void>[] = [];
  for (const [field, list] of Object.entries(groups)) {
    for (const a of list) if (a.b64) jobs.push(setDoc(doc(db!, 'posts', postId, 'files', String(n++)), { field, name: a.name, b64: a.b64, at: Date.now() }));
  }
  await Promise.all(jobs);
}

export type PostPhoto = { id: string; field: string; b64: string };
/** The photos of one post, newest first as stored. Photos of documents only come back for the author or an admin (rules). */
export const usePostPhotos = (postId: string | null) => useLive<PostPhoto[]>(db && postId ? () => (cb) => onSnapshot(
  collection(db!, 'posts', postId, 'files'),
  (s) => cb(s.docs.map((d) => ({ id: d.id, field: String(d.data().field), b64: String(d.data().b64) })).filter((p) => p.b64)),
  () => cb([]),
) : null, [], [postId]);
