import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// expo-secure-store caps each key at ~2KB on Android (Keystore-backed), which a
// Supabase session (access token + refresh token + user metadata) regularly
// exceeds. We split the serialized value into fixed-size slices stored under
// `${key}_0`, `${key}_1`, ... and reassemble on read by incrementing the index
// until a slice comes back null. `${key}_len` records the slice count so we
// only ever ask SecureStore for keys we actually wrote.
const CHUNK_SIZE = 1800;

// SecureStore has no web implementation and this adapter also runs during
// Expo Router's web SSR pass (where there's no window at all) — both cases
// fall back to AsyncStorage, matching the ssrSafeStorage behavior already
// used for the non-chunked client.
const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

function lenKey(key: string) {
  return `${key}_len`;
}

function chunkKey(key: string, index: number) {
  return `${key}_${index}`;
}

async function chunkedGetItem(key: string): Promise<string | null> {
  const lenRaw = await SecureStore.getItemAsync(lenKey(key));
  if (lenRaw === null) return null;
  const len = parseInt(lenRaw, 10);
  if (!Number.isFinite(len) || len <= 0) return null;

  const parts: string[] = [];
  for (let i = 0; i < len; i++) {
    const part = await SecureStore.getItemAsync(chunkKey(key, i));
    if (part === null) return null; // corrupted/partial write — treat as a miss
    parts.push(part);
  }
  return parts.join('');
}

async function chunkedSetItem(key: string, value: string): Promise<void> {
  // Clear any previous slices first so a shrinking value doesn't leave stale
  // trailing chunks behind for the next read to pick up.
  await chunkedRemoveItem(key);

  const slices: string[] = [];
  for (let i = 0; i < value.length; i += CHUNK_SIZE) {
    slices.push(value.slice(i, i + CHUNK_SIZE));
  }
  // Guarantee at least one (possibly empty) slice so length metadata is coherent.
  if (slices.length === 0) slices.push('');

  await Promise.all(slices.map((slice, i) => SecureStore.setItemAsync(chunkKey(key, i), slice)));
  await SecureStore.setItemAsync(lenKey(key), String(slices.length));
}

async function chunkedRemoveItem(key: string): Promise<void> {
  const lenRaw = await SecureStore.getItemAsync(lenKey(key));
  const len = lenRaw !== null ? parseInt(lenRaw, 10) : 0;
  const removals: Promise<void>[] = [];
  for (let i = 0; i < len; i++) removals.push(SecureStore.deleteItemAsync(chunkKey(key, i)));
  removals.push(SecureStore.deleteItemAsync(lenKey(key)));
  await Promise.all(removals);
}

/** Supabase-compatible storage adapter backed by chunked expo-secure-store on native, AsyncStorage elsewhere. */
export function createChunkedSecureStoreAdapter() {
  if (!isNative) return AsyncStorage;
  return {
    getItem: chunkedGetItem,
    setItem: chunkedSetItem,
    removeItem: chunkedRemoveItem,
  };
}
