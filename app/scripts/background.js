import { filter, lastValueFrom, Observable, take } from 'rxjs';
import AriaDownloader from './AriaDownloader';
import BrowserDownloader from './BrowserDownloader';
import { historyToArray } from './utils';

function downloadAgent() {
  const subscribers = [];
  const observable = new Observable((s) => subscribers.push(s));
  const history = new Map();

  // Hide bottom bar
  browser.downloads.setShelfEnabled?.(false);

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

    const getAriaDownloader = (options) => {
      const result = options;
      console.log(result);
      console.log(downloadItem);

      // Extension is disabled
      if (!result.extensionStatus) return;
      // File size is known and it is smaller than the minimum file size (in mb)
      if (
        downloadItem.fileSize > 0 &&
        downloadItem.fileSize < result.minFileSize * 1024 * 1024
      )
        return;
      // If url is on the blacklist then skip
      if (
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

    const getDownloader = (options) => {
      return getAriaDownloader(options) ?? new BrowserDownloader();
    };

    getResult.then(async (result) => {
      const downloader = getDownloader(result);
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

browser.runtime.onStartup.addListener(function () {
  downloadAgent();
});

browser.runtime.onInstalled.addListener(function () {
  downloadAgent();
});
