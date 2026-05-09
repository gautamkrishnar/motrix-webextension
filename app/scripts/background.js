import * as browser from 'webextension-polyfill';
import { settingsCache } from './services/SettingsCache';
import { downloadStore } from './services/DownloadStore';
import { aria2Service } from './services/Aria2Service';
import { notify } from './services/NotificationService';
import { shouldIntercept, waitForFilename } from './core/interceptor';
import { trackWithAria2 } from './core/AriaTracker';
import { trackWithBrowser } from './core/BrowserTracker';
import { parsePath } from './utils';

// Defined at module level so removeListener works correctly across createMenuItem() calls
async function menuClickHandler(data) {
  await browser.downloads.download({ url: data.linkUrl });
}

// IDs of browser downloads we intentionally erased after redirecting to aria2.
const redirectedToAria = new Set();

// Prevents processing the same download twice if onCreated fires more than once.
const processingDownloads = new Set();

// Lazy init: shared promise so concurrent wake-ups only initialise once per SW lifecycle.
let initPromise = null;

function ensureInitialized() {
  if (!initPromise) initPromise = init();
  return initPromise;
}

function syncAria2Config() {
  aria2Service.configure({
    host: '127.0.0.1',
    port: settingsCache.get('motrixPort') ?? 16800,
    secure: false,
    secret: settingsCache.get('motrixAPIkey') ?? '',
    path: '/jsonrpc',
  });
}

async function handleDownload(downloadItem) {
  await ensureInitialized();

  if (processingDownloads.has(downloadItem.id)) return;
  processingDownloads.add(downloadItem.id);

  try {
    const settings = settingsCache.getAll();

    if (!shouldIntercept(downloadItem, settings)) {
      trackWithBrowser(downloadItem, downloadStore);
      return;
    }

    // When the browser's 'Prompt before download' (Save As dialog) is enabled, Chrome
    // creates the download item with an empty filename and blocks until the user confirms.
    // pause() fails silently in that state, so we detect it and defer the call.
    const promptBeforeDownload = !downloadItem.filename;
    if (!promptBeforeDownload) {
      await browser.downloads.pause(downloadItem.id).catch(() => {});
    }

    if (!settings.motrixAPIkey) {
      await notify('API key not set', 'Set a random API key in the extension and in Motrix Preferences > Advanced > RPC Secret', () => browser.tabs.create({ url: 'motrix://' }));
      await browser.downloads.resume(downloadItem.id).catch(() => {});
      trackWithBrowser(downloadItem, downloadStore);
      return;
    }

    await downloadStore.upsert(downloadItem.id, {
      gid: String(downloadItem.id),
      url: downloadItem.url,
      status: 'intercepting',
      startTime: downloadItem.startTime,
      downloader: 'aria',
    });

    try {
      const [filename, cookies] = await Promise.all([waitForFilename(downloadItem.id), browser.cookies.getAll({ url: downloadItem.url })]);

      if (promptBeforeDownload) {
        await browser.downloads.pause(downloadItem.id).catch(() => {});
      }

      const path = parsePath(filename);
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      const params = {
        ...path,
        'remote-time': 'false',
        ...(downloadItem.referrer ? { referer: downloadItem.referrer } : {}),
        ...(cookieHeader ? { header: `Cookie: ${cookieHeader}` } : {}),
      };

      const downloadUrl = downloadItem.finalUrl || downloadItem.url;
      const [gid, icon] = await Promise.all([aria2Service.addUri(downloadUrl, params), browser.downloads.getFileIcon(downloadItem.id).catch(() => '')]);
      browser.storage.local.set({ motrixReachable: true }).catch(() => {});

      // Mark before erasing so onErased doesn't delete the store entry
      redirectedToAria.add(downloadItem.id);
      await browser.downloads.cancel(downloadItem.id).catch(() => {});
      await browser.downloads.erase({ id: downloadItem.id }).catch(() => {});

      await downloadStore.upsert(downloadItem.id, {
        ariaGid: gid,
        icon,
        name: path.out,
        path: path.dir,
        status: 'downloading',
      });

      trackWithAria2(gid, downloadItem.id, downloadStore, aria2Service);

      if (settings.enableNotifications) {
        await notify('Motrix WebExtension', 'Download started in Motrix', () => browser.tabs.create({ url: 'motrix://' }));
      }
    } catch (error) {
      console.error('Motrix WebExtension: failed to send to Motrix:', error);
      browser.storage.local.set({ motrixReachable: false }).catch(() => {});

      if (settings.downloadFallback !== false) {
        await browser.downloads.resume(downloadItem.id).catch(() => {});
        trackWithBrowser(downloadItem, downloadStore);
      } else {
        redirectedToAria.add(downloadItem.id);
        await browser.downloads.cancel(downloadItem.id).catch(() => {});
        await browser.downloads.erase({ id: downloadItem.id }).catch(() => {});
        await downloadStore.delete(downloadItem.id);
      }
    }
  } finally {
    processingDownloads.delete(downloadItem.id);
  }
}

export async function createMenuItem() {
  const menuId = 'motrix-webextension-download-context-menu-option';
  const showContextOption = settingsCache.get('showContextOption') ?? true;

  await browser.contextMenus.removeAll();
  if (showContextOption) {
    browser.contextMenus.create({
      id: menuId,
      title: browser.i18n.getMessage('downloadWithMotrix'),
      visible: true,
      contexts: ['link'],
    });
  }
}

async function init() {
  await settingsCache.init();
  await downloadStore.init();

  syncAria2Config();

  // Apply shelf visibility from persisted settings on startup
  const enabled = settingsCache.get('extensionStatus') ?? false;
  const hide = settingsCache.get('hideChromeBar') ?? true;
  browser.downloads.setShelfEnabled?.(!hide && enabled);

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if ('motrixPort' in changes || 'motrixAPIkey' in changes) {
      syncAria2Config();
    }
    if ('hideChromeBar' in changes || 'extensionStatus' in changes) {
      const isEnabled = settingsCache.get('extensionStatus');
      const shouldHide = settingsCache.get('hideChromeBar');
      browser.downloads.setShelfEnabled?.(!shouldHide && !!isEnabled);
    }
    if ('showContextOption' in changes) {
      createMenuItem();
    }
  });

  createMenuItem();
}

async function checkMotrixStatus() {
  try {
    await ensureInitialized();
    await aria2Service.ping();
    await browser.storage.local.set({ motrixReachable: true });
  } catch {
    await browser.storage.local.set({ motrixReachable: false });
  }
}

// ─── TOP-LEVEL LISTENER REGISTRATION ────────────────────────────────────────
// In MV3, the service worker wakes up fresh for every event. Listeners MUST be
// registered synchronously at the top level so Chrome can dispatch events to
// them. Putting them inside onInstalled/onStartup meant they were never
// registered in subsequent wake cycles, silently dropping all downloads.

browser.contextMenus.onClicked.addListener(menuClickHandler);
browser.downloads.onCreated.addListener(handleDownload);

browser.downloads.onErased.addListener(async (id) => {
  await ensureInitialized();
  if (redirectedToAria.has(id)) {
    redirectedToAria.delete(id);
    return;
  }
  downloadStore.delete(id);
});

// onInstalled / onStartup pre-warm init so the first download is snappier
browser.runtime.onInstalled.addListener(ensureInitialized);
browser.runtime.onStartup.addListener(ensureInitialized);

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === 'checkMotrixStatus') {
    return checkMotrixStatus();
  }
});
