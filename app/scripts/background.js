import { filter, lastValueFrom, Observable, take } from 'rxjs';
import AriaDownloader from './AriaDownloader';
import BrowserDownloader from './BrowserDownloader';
import { historyToArray } from './utils';
import * as browser from 'webextension-polyfill';

// Track active downloads to keep service worker alive
// Use storage to persist active downloads across service worker suspensions
let activeDownloads = new Set();

async function downloadAgent() {
  const subscribers = [];
  const observable = new Observable((s) => subscribers.push(s));
  const history = new Map();
  
  console.log('Motrix WebExtension: Service worker started - event-based system active');
  
  // Load active downloads from storage
  const { activeDownloadsList = [] } = await browser.storage.local.get(['activeDownloadsList']);
  activeDownloads = new Set(activeDownloadsList);
  console.log(`Loaded ${activeDownloads.size} active downloads from storage`);
  
  // Clean up stale downloads from storage
  if (activeDownloads.size > 0) {
    console.log('Checking for stale downloads...');
    const currentDownloads = await browser.dxownloads.search({});
    const currentDownloadIds = new Set(currentDownloads.map(d => d.id));
    
    for (const downloadId of activeDownloads) {
      if (!currentDownloadIds.has(downloadId)) {
        console.log(`Removing stale download ${downloadId} from active list`);
        activeDownloads.delete(downloadId);
      }
    }
    
    await saveActiveDownloads();
    console.log(`Cleaned up - ${activeDownloads.size} active downloads remaining`);
  }
  
  // Helper function to save active downloads to storage
  const saveActiveDownloads = async () => {
    await browser.storage.local.set({ 
      activeDownloadsList: Array.from(activeDownloads) 
    });
  };
  
  // Helper function to add download to active list
  const addActiveDownload = async (downloadId) => {
    activeDownloads.add(downloadId);
    await saveActiveDownloads();
    console.log(`Download ${downloadId} added to active downloads - total: ${activeDownloads.size}`);
  };
  
  // Helper function to remove download from active list
  const removeActiveDownload = async (downloadId) => {
    activeDownloads.delete(downloadId);
    await saveActiveDownloads();
    console.log(`Download ${downloadId} removed from active downloads - total: ${activeDownloads.size}`);
  };
  
  // Hide bottom bar
  browser.storage.sync.get(['hideChromeBar', 'extensionStatus']).then(({ hideChromeBar, extensionStatus }) => {
    if (extensionStatus) browser.downloads.setShelfEnabled?.(!hideChromeBar);
  }); 
  
  // Setup history
  const { oldHistory = [] } = await browser.storage.local.get(['history']);
  oldHistory.forEach((x) => {
    if (x.status !== 'completed') {
      x.status = 'unknown';
    }
    history.set(x.gid, x);
  });
  browser.storage.local.set({ history: historyToArray(history) });

  browser.downloads.onChanged.addListener((delta) => {
    subscribers.forEach((s) => s.next(delta));
    // Track download state changes
    if (delta.state) {
      if (delta.state.current === 'in_progress') {
        addActiveDownload(delta.id);
        console.log(`Download ${delta.id} started - keeping service worker alive`);
        // Process download when it becomes in_progress
        processDownload(delta.id);
      } else if (delta.state.current === 'complete' || delta.state.current === 'interrupted') {
        removeActiveDownload(delta.id);
        console.log(`Download ${delta.id} finished - active downloads: ${activeDownloads.size}`);
      }
    }
  });

  // Clean up when downloads are removed
  browser.downloads.onErased.addListener((downloadId) => {
    removeActiveDownload(downloadId);
    console.log(`Download ${downloadId} removed - active downloads: ${activeDownloads.size}`);
  });

  // Track downloads that need processing
  const pendingDownloads = new Map();

  browser.downloads.onCreated.addListener(async function (downloadItem) {
    console.log(`New download detected: ${downloadItem.id} - ${downloadItem.url} - State: ${downloadItem.state}`);
    
    // Store download info for processing
    pendingDownloads.set(downloadItem.id, downloadItem);
    
    // If download is already in progress, process it immediately
    if (downloadItem.state === 'in_progress') {
      processDownload(downloadItem.id);
    }
  });

  async function processDownload(downloadId) {
    const downloadItem = pendingDownloads.get(downloadId);
    if (!downloadItem) {
      console.log(`Download ${downloadId} not found in pending downloads`);
      return;
    }

    console.log(`Processing download: ${downloadId} - ${downloadItem.url}`);
    
    // Remove from pending to avoid double processing
    pendingDownloads.delete(downloadId);
    
    // Add to active downloads to keep service worker alive
    addActiveDownload(downloadId);
    
    const cookies = await browser.cookies.getAll({ url: downloadItem.url });
    downloadItem.cookies = cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');

    async function onError(error) {
      console.log(`Error: ${error}`);
      removeActiveDownload(downloadId);
    }

    // Triggered whenever a new download event fires
    let getResult = browser.storage.sync.get([
      'motrixAPIkey',
      'extensionStatus',
      'enableNotifications',
      'minFileSize',
      'blacklist',
      'motrixPort',
      'downloadFallback',
    ]);

    const getAriaDownloader = async (options) => {
      const result = options;
      // this will find item with by extension name set
      const statuses = await browser.downloads.search({
        id: downloadId,
      });

      const shouldCheck =
        statuses[0]?.byExtensionName !== browser.i18n.getMessage('appName');

      // Extension is disabled
      if (shouldCheck && !result.extensionStatus) return;
      // File size is known and it is smaller than the minimum file size (in mb)
      if (
        shouldCheck &&
        downloadItem.fileSize > 0 &&
        downloadItem.fileSize < result.minFileSize * 1024 * 1024
      )
        return;
      // If url is on the blacklist then skip
      if (
        shouldCheck &&
        result.blacklist
          .map((x) => downloadItem.url.includes(x))
          .reduce((prev, curr) => prev || curr, false)
      ) {
        return;
      }
      // If API KEY is not set, triggers an alert to the user
      if (!result.motrixAPIkey) {
        const notificationOptions = {
          type: 'basic',
          iconUrl: '../images/icon-large.png',
          title: 'API key not set',
          message:
            'Please set a random API key by clicking on the extension icon. Open Motrix set the same API Key by visiting Preferences > Advanced > RPC Secret',
        };
        const notificationId = Math.round(
          new Date().getTime() / 1000
        ).toString();
        browser.notifications.create(notificationId, notificationOptions);
        browser.notifications.onClicked.addListener((id) => {
          if (id === notificationId) {
            browser.tabs.create({ url: 'motrix://' });
          }
        });
        return;
      }

      return new AriaDownloader();
    };

    const getDownloader = async (options) => {
      return (await getAriaDownloader(options)) ?? new BrowserDownloader();
    };

    getResult.then(async (result) => {
      console.log('Extension configuration:', {
        extensionStatus: result.extensionStatus,
        hasAPIKey: !!result.motrixAPIkey,
        motrixPort: result.motrixPort,
        downloadFallback: result.downloadFallback,
        minFileSize: result.minFileSize,
        blacklist: result.blacklist
      });
      
      let downloader = await getDownloader(result);
      
      if (!downloader) {
        console.log('No downloader available - skipping download');
        removeActiveDownload(downloadId);
        return;
      }

      console.log(`Using downloader: ${downloader.name}`);

      // wait for filename to be set
      if (!downloadItem.filename) {
        console.log('Waiting for filename to be set...');
        const obs = observable.pipe(
          filter((d) => d.id === downloadId && d.filename),
          take(1)
        );

        const delta = await lastValueFrom(obs);
        downloadItem.filename = delta.filename.current;
        console.log('Filename set:', downloadItem.filename);
      }

      // get icon of the file
      downloadItem.icon = await browser.downloads.getFileIcon(downloadId);

      try {
        console.log('Starting download with Motrix...');
        await downloader.handleStart(result, downloadItem, history);
        console.log('Download successfully sent to Motrix');
      } catch (error) {
        console.error('Error sending to Motrix:', error);
        if (downloader instanceof AriaDownloader) {
          if (
            typeof result.downloadFallback === 'undefined' ||
            result?.downloadFallback
          ) {
            console.log('Falling back to browser download');
            await browser.downloads.resume(downloadId);
            downloader = new BrowserDownloader();
            await downloader.handleStart(result, downloadItem, history);
          } else {
            console.log('No fallback enabled - cancelling download');
            await browser?.downloads
              ?.removeFile(downloadId)
              .then()
              .catch(onError);
            await browser?.downloads
              ?.cancel(downloadId)
              .then()
              .catch(onError);
            await browser?.downloads
              ?.erase({ id: downloadId })
              .then()
              .catch(onError);
            const notificationOptions = {
              type: 'basic',
              iconUrl: '../images/icon-large.png',
              title: 'Connection to motrix is not working',
              message:
                'Browser download fallback is also not enabled. Your download will be cancelled.',
            };
            const notificationId = Math.round(
              new Date().getTime() / 1000
            ).toString();
            browser.notifications.create(notificationId, notificationOptions);
          }
        }
      }
    }, onError);
  }
}

export function createMenuItem() {
  browser.storage.sync
    .get('showContextOption')
    .then(({ showContextOption }) => {
      const menuId = 'motrix-webextension-download-context-menu-option';
      const clickHandler = async (data) => {
        browser.downloads.download({ url: data.linkUrl });
      };
      if (showContextOption) {
        browser.contextMenus.removeAll().then(() => {
          browser.contextMenus.onClicked.removeListener(clickHandler);
          browser.contextMenus.create({
            id: menuId,
            title: browser.i18n.getMessage('downloadWithMotrix'),
            visible: showContextOption,
            contexts: ['link'],
          });
          browser.contextMenus.onClicked.addListener(clickHandler);
        });
      } else {
        browser.contextMenus.onClicked.removeListener(clickHandler);
        browser.contextMenus.removeAll();
      }
    });
}

const loadExtension = () => {
  downloadAgent();
  createMenuItem();
}

browser.runtime.onInstalled.addListener(function () {
  loadExtension();
});

// Log service worker lifecycle events
browser.runtime.onSuspend.addListener(() => {
  console.log('Motrix WebExtension: Service worker being suspended');
});

browser.runtime.onStartup.addListener(() => {
  console.log('Motrix WebExtension: Service worker started on browser startup');
  loadExtension();
});
