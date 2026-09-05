/**
 * Storage object paths for anonymous uploads.
 *
 * Payment screenshots are uploaded by people who are not signed in, so the
 * rules have to allow an unauthenticated create — and `getDownloadURL()` on
 * the way back out needs a matching read. That leaves the object path itself
 * as the only thing standing between a screenshot and anyone who asks for it.
 *
 * `Date.now()_original-filename.jpg` is not that. A millisecond stamp inside a
 * known window plus a phone-camera filename (`IMG_20260823_101215.jpg`) is a
 * small enough space to walk. A random id per object closes it: there is
 * nothing to derive the path from, so the only way to reach an object is to
 * have been handed its URL.
 *
 * The extension is preserved (Storage serves by contentType, but a readable
 * suffix helps whoever is looking at the bucket); the rest of the user's
 * filename is dropped, since it carries no value here and occasionally
 * carries a name.
 */

function randomId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Older WebViews: getRandomValues is far more widely supported than
  // randomUUID, and 16 random bytes is the same amount of entropy.
  if (c?.getRandomValues) {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  }
  // Last resort. Weak, but still better than a bare timestamp, and only
  // reached on a browser that has no crypto at all.
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** `fee-screenshots/DAD/2026-08-23_9f86d0…-.jpg` */
export function uploadObjectPath(prefix: string, centreId: string, fileName: string): string {
  const ext = /\.([a-zA-Z0-9]{1,5})$/.exec(fileName)?.[1]?.toLowerCase() ?? 'jpg';
  const day = new Date().toISOString().slice(0, 10);
  return `${prefix}/${centreId}/${day}_${randomId()}.${ext}`;
}
