import Aria2 from 'aria2';
import { filter, lastValueFrom, Observable, take } from 'rxjs';

function validateUrl(value) {
  return /^(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff_-]{0,62})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,}\.?))(?::\d{2,5})?(?:[/?#]\S*)?$/i.test(
    value
  );
}

const pass = () => {};
const handleError = (error) => console.error(`Error: ${error}`);

async function removeFromHistory(id) {
  await browser.downloads.removeFile(id).then(pass).catch(pass);
  await browser.downloads.cancel(id).then(pass).catch(handleError);
  await browser.downloads.erase({ id }).then(pass).catch(handleError);
}

function parsePath(path) {
  const filename = path.replace(/^.*[\\/]/, '');
  const directory = path.match(/(.*)[/\\]/)?.[1] ?? '';

  return {
    dir: directory,
    out: filename,
  };
}

// Function to save history as a string
// Sorts by date from the latest and trunctates to 100 elements
function historyToArray(historyMap) {
  return JSON.stringify(
    [...historyMap.values()]
      .sort((a, b) => b.startTime.localeCompare(a.startTime))
      .slice(0, 100)
  );
}

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

    async function onGot(result) {
      // API Key is set, Proceed with download
      const options = {
        host: '127.0.0.1',
        port: 16800,
        secure: false,
        secret: result.motrixAPIkey,
        path: '/jsonrpc',
      };
      const aria2 = new Aria2(options);
      await aria2.open();

      let downloadUrl = '';
      // To support JS Downloads
      if (validateUrl(downloadItem.finalUrl)) {
        downloadUrl = downloadItem.finalUrl;
      } else if (validateUrl(downloadItem.url)) {
        downloadUrl = downloadItem.url;
      } else {
        // Not a valid url: skip download
        return;
      }

      let params = {};
      // If the download have a specified path, ie user selected via file manager
      if (downloadItem.filename) {
        // Appends path to the options
        params = {
          ...parsePath(downloadItem.filename),
        };
      }
      if (downloadItem.referrer) {
        params = {
          ...params,
          referer: downloadItem.referrer,
        };
      }
      if (result.enableDownloadPrompt) {
        const newPath = prompt(
          `Do you want to download:`,
          downloadItem.filename
        );
        if (newPath == null) {
          return;
        }

        params = {
          ...params,
          ...parsePath(newPath),
          'summary-interval': 1,
        };
      }
      let inter = null;

      await aria2
        .call('addUri', [downloadUrl], params)
        .then(async (gid) => {
          inter = setInterval(async () => {
            const status = await aria2.call('tellStatus', gid);
            history.set(gid, {
              gid: gid,
              startTime: downloadItem.startTime,
              icon: downloadItem.icon,
              name: params.out ?? null,
              path: params.dir ?? null,
              status: 'downloading',
              size: downloadItem.totalBytes,
              downloaded: parseInt(status.completedLength),
            });
            // browser.storage.sync.set({ history: historyToArray(history) });
            localStorage.setItem('history', historyToArray(history));
          }, 1000);

          aria2.on('onDownloadStart', ([guid]) => {
            browser.browserAction.setIcon({
              path: 'images/baseline_file_download_black_24dp.png',
            });
            history.set(guid.gid, {
              gid: guid.gid,
              startTime: downloadItem.startTime,
              icon: downloadItem.icon,
              name: params.out ?? null,
              path: params.dir ?? null,
              status: 'downloading',
              size: downloadItem.totalBytes,
              downloaded: 0,
            });
            // browser.storage.sync.set({ history: historyToArray(history) });
            localStorage.setItem('history', historyToArray(history));
          });

          aria2.on('onDownloadComplete', ([guid]) => {
            history.set(guid.gid, {
              gid: guid.gid,
              startTime: downloadItem.startTime,
              icon: downloadItem.icon,
              name: params.out ?? null,
              path: params.dir ?? null,
              status: 'completed',
              size: downloadItem.totalBytes,
              downloaded: downloadItem.totalBytes,
            });
            // browser.storage.sync.set({ history: historyToArray(history) });
            localStorage.setItem('history', historyToArray(history));
            clearInterval(inter);

            // If no other file is being downloaded then change icon back
            if (
              [...history.values()].filter((x) => x.status === 'downloading')
                .length === 0
            ) {
              // Show downloading icon for minimum 1 second
              setTimeout(() => {
                if (
                  [...history.values()].filter(
                    (x) => x.status === 'downloading'
                  ).length === 0
                ) {
                  browser.browserAction.setIcon({
                    path: 'images/32.png',
                  });
                }
              }, 1000);
            }
          });

          // Shows notification
          if (result.enableNotifications) {
            const notificationOptions = {
              type: 'basic',
              iconUrl: 'images/icon-large.png',
              title: 'Motrix WebExtension',
              message: 'Download started in Motrix download manger',
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
          }
        })
        .catch((err) => {
          console.error(err);
          // Failed: Show alert
          alert(
            'Motrix not installed or configured properly, Open Motrix set a API Key by visiting Preferences' +
              ' > Advanced > RPC Secret'
          );
        });
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
    ]);

    getResult.then(async (result) => {
      if (!result.extensionStatus) {
        // Extension is disabled
        return;
      }
      if (
        downloadItem.fileSize > 0 &&
        downloadItem.fileSize < result.minFileSize * 1024 * 1024
      ) {
        // File size is known and it is smaller than the minimum file size (in mb)
        return;
      }
      if (!result.motrixAPIkey) {
        // API KEY is not set, triggers an alert to the user
        alert(
          'API key not set, please set a random API key by clicking on the extension icon. Open Motrix ' +
            'set the same API Key by visiting Preferences > Advanced > RPC Secret'
        );
        return;
      }

      // wait for filename to be set
      if (!downloadItem.filename) {
        const obs = observable.pipe(
          filter((delta) => delta.id === downloadItem.id && delta.filename),
          take(1)
        );

        const delta = await lastValueFrom(obs);
        downloadItem.filename = delta.filename.current;
      }

      // get icon of the file
      const icon = await browser.downloads.getFileIcon(downloadItem.id);
      downloadItem.icon = icon;

      // remove file from browsers history
      await removeFromHistory(downloadItem.id);
      onGot(result);
    }, onError);
  });
}

browser.runtime.onStartup.addListener(function () {
  downloadAgent();
});

browser.runtime.onInstalled.addListener(function () {
  downloadAgent();
});
