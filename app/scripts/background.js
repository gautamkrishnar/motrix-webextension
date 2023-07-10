import { filter, lastValueFrom, Observable, take } from 'rxjs';
import AriaDownloader from './AriaDownloader';
import BrowserDownloader from './BrowserDownloader';
import { historyToArray } from './utils';
import * as browser from 'webextension-polyfill';

async function downloadAgent() {
  const subscribers = [];
  const observable = new Observable((s) => subscribers.push(s));
  const history = new Map();
  // Hide bottom bar
  browser.storage.sync.get(['hideChromeBar']).then(({ hideChromeBar }) => {
    browser.downloads.setShelfEnabled?.(!hideChromeBar);
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
  });

  browser.downloads.onCreated.addListener(async function (downloadItem) {
    const cookies = await browser.cookies.getAll({ url: downloadItem.url });
    downloadItem.cookies = cookies
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ');

    if (downloadItem.state !== 'in_progress') {
      return;
    }

    async function onError(error) {
      console.log(`Error: ${error}`);
    }

    // Triggered whenever a new download event fires
    let getResult = browser.storage.sync.get([
      'motrixAPIkey',
      'extensionStatus',
      'enableNotifications',
      'enableDownloadPrompt',
      'minFileSize',
      'blacklist',
      'motrixPort',
      'downloadFallback',
    ]);

    const getAriaDownloader = async (options) => {
      const result = options;
      // this will find item with by extension name set
      const statuses = await browser.downloads.search({
        id: downloadItem.id,
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
      let downloader = await getDownloader(result);

      // wait for filename to be set
      if (!downloadItem.filename) {
        const obs = observable.pipe(
          filter((d) => d.id === downloadItem.id && d.filename),
          take(1)
        );

        const delta = await lastValueFrom(obs);
        downloadItem.filename = delta.filename.current;
      }

      // get icon of the file
      downloadItem.icon = await browser.downloads.getFileIcon(downloadItem.id);

      try {
        await downloader.handleStart(result, downloadItem, history);
      } catch {
        if (downloader instanceof AriaDownloader) {
          if (
            typeof result.downloadFallback === 'undefined' ||
            result?.downloadFallback
          ) {
            await browser.downloads.resume(downloadItem.id);
            downloader = new BrowserDownloader();
            await downloader.handleStart(result, downloadItem, history);
          } else {
            await browser?.downloads
              ?.removeFile(downloadItem.id)
              .then()
              .catch(onError);
            await browser?.downloads
              ?.cancel(downloadItem.id)
              .then()
              .catch(onError);
            await browser?.downloads
              ?.erase({ id: downloadItem.id })
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
  });
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
        browser.contextMenus.removeAll();
        browser.contextMenus.onClicked.removeListener(clickHandler);
        browser.contextMenus.create({
          id: menuId,
          title: browser.i18n.getMessage('downloadWithMotrix'),
          visible: showContextOption,
          contexts: ['link'],
        });
        browser.contextMenus.onClicked.addListener(clickHandler);
      } else {
        browser.contextMenus.onClicked.removeListener(clickHandler);
        browser.contextMenus.removeAll();
      }
    });
}
browser.runtime.onStartup.addListener(function () {
  downloadAgent();
  createMenuItem();
  createOffscreen();
});

browser.runtime.onInstalled.addListener(function () {
  downloadAgent();
  createMenuItem();
  createOffscreen();
});

// create the offscreen document if it doesn't already exist
async function createOffscreen() {
  if (await browser.offscreen === undefined || await browser.offscreen.hasDocument?.()) return;
  await browser.offscreen.createDocument({
    url: 'pages/offscreen.html',
    reasons: ['BLOBS'],
    justification: 'keep service worker running',
  });
}
// a message from an offscreen document every 20 second resets the inactivity timer
browser.runtime.onMessage.addListener((msg) => {
  if (msg.keepAlive) console.log('keepAlive');
});
