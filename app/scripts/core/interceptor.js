import * as browser from 'webextension-polyfill';

export function shouldIntercept(downloadItem, settings) {
  if (!downloadItem.url || downloadItem.url === 'about:blank' || downloadItem.url.startsWith('blob:') || downloadItem.url.startsWith('data:')) return false;
  if (downloadItem.state && downloadItem.state !== 'in_progress') return false;
  // Always intercept downloads explicitly triggered via the context menu ("Download with Motrix").
  // These bypass size/blacklist checks — the user made a deliberate choice.
  if (downloadItem.byExtensionName === browser.i18n.getMessage('appName')) return true;
  // Extension is disabled
  if (!settings.extensionStatus) return false;
  // File is smaller than the configured minimum (only when size is known)
  const minBytes = (settings.minFileSize ?? 0) * 1024 * 1024;
  if (minBytes > 0 && downloadItem.fileSize > 0 && downloadItem.fileSize < minBytes) return false;
  // URL is on the blacklist
  const blacklist = settings.blacklist ?? [];
  if (blacklist.some((entry) => entry && downloadItem.url.includes(entry))) return false;
  return true;
}

export async function waitForFilename(downloadId, timeoutMs = 30000) {
  const [existing] = await browser.downloads.search({ id: downloadId });
  if (!existing) throw new Error(`Download ${downloadId} not found`);
  if (existing.filename) return existing.filename;
  if (existing.state === 'interrupted') throw new Error(`Download ${downloadId} was already cancelled`);

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      browser.downloads.onChanged.removeListener(changedListener);
      browser.downloads.onErased.removeListener(erasedListener);
    };
    const changedListener = (delta) => {
      if (delta.id !== downloadId) return;
      if (delta.filename?.current) {
        cleanup();
        resolve(delta.filename.current);
        return;
      }
      if (delta.state?.current === 'interrupted') {
        cleanup();
        reject(new Error(`Download ${downloadId} was cancelled before filename was resolved`));
      }
    };
    const erasedListener = (id) => {
      if (id === downloadId) {
        cleanup();
        reject(new Error(`Download ${downloadId} was erased before filename was resolved`));
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for filename of download ${downloadId}`));
    }, timeoutMs);
    browser.downloads.onChanged.addListener(changedListener);
    browser.downloads.onErased.addListener(erasedListener);
  });
}
