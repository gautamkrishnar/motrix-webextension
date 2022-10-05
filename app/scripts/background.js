import { filter, lastValueFrom, Observable, take } from 'rxjs';
import AriaDownloader from './AriaDownloader';
import BrowserDownloader from './BrowserDownloader';
import { historyToArray } from './utils';

function downloadAgent() {
  const subscribers = [];
  const observable = new Observable((s) => subscribers.push(s));
  const history = new Map();

  // Hide bottom bar
  browser.storage.sync.get('hideChromeBar').then(({ hideChromeBar }) => {
    browser.downloads.setShelfEnabled?.(!hideChromeBar);
  });

  // Setup history
  const oldHistory = JSON.parse(localStorage.getItem('history'));
  (oldHistory ?? []).forEach((x) => {
    if (x.status !== 'completed') {
      x.status = 'unknown';
    }
    history.set(x.gid, x);
  });
  localStorage.setItem('history', historyToArray(history));

  browser.downloads.onChanged.addListener((delta) => {
    subscribers.forEach((s) => s.next(delta));
  });

  browser.downloads.onCreated.addListener(function (downloadItem) {
    if (downloadItem.state !== 'in_progress') {
      return;
    }

    async function onError(error) {
      console.error(`Error: ${error}`);
    }

    // Triggered whenever a new download event fires
    let getResult = browser.storage.sync.get([
      'motrixAPIkey',
      'extensionStatus',
      'enableNotifications',
      'enableDownloadPrompt',
      'minFileSize',
      'blacklist',
    ]);

    const getAriaDownloader = async (options) => {
      const result = options;
      // this will find item with by extension name set
      const statuses = await browser.downloads.search({
        id: downloadItem.id,
      });

      const shouldCheck =
        statuses[0]?.byExtensionName !== 'Motrix WebExtension';

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
        alert(
          'API key not set, please set a random API key by clicking on the extension icon. Open Motrix ' +
            'set the same API Key by visiting Preferences > Advanced > RPC Secret'
        );
        return;
      }

      return new AriaDownloader();
    };

    const getDownloader = async (options) => {
      return (await getAriaDownloader(options)) ?? new BrowserDownloader();
    };

    getResult.then(async (result) => {
      const downloader = await getDownloader(result);
      console.log(downloader);

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
      const icon = await browser.downloads.getFileIcon(downloadItem.id);
      downloadItem.icon = icon;

      await downloader.handleStart(result, downloadItem, history);
    }, onError);
  });
}

function createMenuItem() {
  browser.storage.sync
    .get('showContextOption')
    .then(({ showContextOption }) => {
      console.log(showContextOption);
      browser.contextMenus.create({
        id: 'motrix-webextension-download-context-menu-option',
        title: browser.i18n.getMessage('downloadWithMotrix'),
        visible: showContextOption,
        contexts: ['link'],
        onclick: async (link) => {
          browser.downloads.download({ url: link.linkUrl });
        },
      });
    });
}

browser.runtime.onStartup.addListener(function () {
  downloadAgent();
  createMenuItem();
});

browser.runtime.onInstalled.addListener(function () {
  downloadAgent();
  createMenuItem();
});
