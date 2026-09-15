/**
 * DataCache utility — fetch files with progress tracking + Cache API storage.
 * On subsequent visits, files are served from the browser cache.
 */

const CACHE_VERSION = 'geoint-data-v2';

/**
 * Load a URL with download progress. Returns an object URL (blob://).
 * Caches the response in CacheStorage for offline/fast reload.
 *
 * @param {string} url
 * @param {(ratio: number) => void} onProgress  0‒1, or -1 if length unknown
 * @returns {Promise<string>} blob URL
 */
export async function loadWithProgress(url, onProgress = () => {}) {
  // 1. Try cache first
  try {
    const cache = await caches.open(CACHE_VERSION);
    const cached = await cache.match(url);
    if (cached) {
      onProgress(1);
      const blob = await cached.blob();
      return URL.createObjectURL(blob);
    }
  } catch (e) {
    console.warn('[DataCache] Cache read error:', e);
  }

  // 2. Fetch with stream-based progress
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} — ${url}`);

  const contentLength = parseInt(response.headers.get('Content-Length') || '0');
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(contentLength > 0 ? loaded / contentLength : -1);
  }

  const contentType = response.headers.get('Content-Type') || 'application/octet-stream';
  const blob = new Blob(chunks, { type: contentType });

  // 3. Persist to cache for next visit
  try {
    const cache = await caches.open(CACHE_VERSION);
    await cache.put(url, new Response(blob.slice(), { headers: { 'Content-Type': contentType } }));
  } catch (e) {
    console.warn('[DataCache] Cache write error:', e);
  }

  onProgress(1);
  return URL.createObjectURL(blob);
}

/**
 * Load all layers in parallel with aggregate progress.
 *
 * @param {Array<{id, url}>} items
 * @param {(layerProgress: Record<string, number>) => void} onProgress
 * @returns {Promise<Record<string, string>>}  id → blob URL map
 */
export async function loadAllLayers(items, onProgress = () => {}) {
  const progress = {};
  items.forEach(({ id }) => { progress[id] = 0; });

  const results = await Promise.all(
    items.map(({ id, url }) =>
      loadWithProgress(url, (ratio) => {
        progress[id] = ratio < 0 ? null : ratio; // null = indeterminate
        onProgress({ ...progress });
      }).then(blobUrl => ({ id, blobUrl }))
    )
  );

  const urlMap = {};
  results.forEach(({ id, blobUrl }) => { urlMap[id] = blobUrl; });
  return urlMap;
}
