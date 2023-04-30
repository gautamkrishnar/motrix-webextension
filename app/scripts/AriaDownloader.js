import Aria2 from 'aria2';
import { historyToArray, parsePath } from './utils';
import * as browser from 'webextension-polyfill';

function validateUrl(value) {
  return /^(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff_-]{0,62})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,}\.?))(?::\d{2,5})?(?:[/?#]\S*)?$/i.test(
    value
  );
}

const pass = () => null;
const handleError = (error) => console.error(`Error: ${error}`);

async function removeFromHistory(id) {
  await browser.downloads.removeFile(id).then(pass).catch(pass);
  await browser.downloads.cancel(id).then(pass).catch(handleError);
  await browser.downloads.erase({ id }).then(pass).catch(handleError);
}

async function onGot(result, downloadItem, history) {
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
  if (downloadItem.cookies) {
    params = {
      ...params,
      header: `Cookie: ${downloadItem.cookies}`,
    };
  }
  if (result.enableDownloadPrompt) {
    const newPath = prompt(`Do you want to download:`, downloadItem.filename);
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
        const status = null;
        try {
          status = await aria2.call('tellStatus', gid);
        } catch {
          return;
        }
        history.set(gid, {
          gid: gid,
          downloader: 'aria',
          startTime: downloadItem.startTime,
          icon: downloadItem.icon,
          name: params.out ?? null,
          path: params.dir ?? null,
          status: 'downloading',
          size: downloadItem.totalBytes,
          downloaded: parseInt(status.completedLength),
        });
        browser.storage.local.set({ history: historyToArray(history) });
      }, 1000);

      aria2.on('onDownloadStart', ([guid]) => {
        browser.action.setIcon({
          path: '../images/dwld.png',
        });
        history.set(guid.gid, {
          gid: guid.gid,
          downloader: 'aria',
          startTime: downloadItem.startTime,
          icon: downloadItem.icon,
          name: params.out ?? null,
          path: params.dir ?? null,
          status: 'downloading',
          size: downloadItem.totalBytes,
          downloaded: 0,
        });
        browser.storage.local.set({ history: historyToArray(history) });
      });

      aria2.on('onDownloadStop', async ([guid]) => {
        const status = null;
        try {
          status = await aria2.call('tellStatus', guid.gid);
        } catch {
          
        }
        history.set(guid.gid, {
          gid: guid.gid,
          downloader: 'aria',
          startTime: downloadItem.startTime,
          icon: downloadItem.icon,
          name: params.out ?? null,
          path: params.dir ?? null,
          status: 'stop',
          size: downloadItem.totalBytes,
          downloaded: status ? parseInt(status.completedLength) : 0,
        });
        browser.storage.local.set({ history: historyToArray(history) });
        clearInterval(inter);
      });

      aria2.on('onDownloadError', async ([guid]) => {
        const status = null;
        try {
          status = await aria2.call('tellStatus', guid.gid);
        } catch {
          
        }
        history.set(guid.gid, {
          gid: guid.gid,
          downloader: 'aria',
          startTime: downloadItem.startTime,
          icon: downloadItem.icon,
          name: params.out ?? null,
          path: params.dir ?? null,
          status: 'error',
          size: downloadItem.totalBytes,
          downloaded: status ? parseInt(status.completedLength) : 0,
        });
        browser.storage.local.set({ history: historyToArray(history) });
        clearInterval(inter);
      });

      aria2.on('onDownloadComplete', ([guid]) => {
        history.set(guid.gid, {
          gid: guid.gid,
          downloader: 'aria',
          startTime: downloadItem.startTime,
          icon: downloadItem.icon,
          name: params.out ?? null,
          path: params.dir ?? null,
          status: 'completed',
          size: downloadItem.totalBytes,
          downloaded: downloadItem.totalBytes,
        });
        browser.storage.local.set({ history: historyToArray(history) });
        clearInterval(inter);

        // If no other file is being downloaded then change icon back
        if (
          [...history.values()].filter((x) => x.status === 'downloading')
            .length === 0
        ) {
          // Show downloading icon for minimum 1 second
          setTimeout(() => {
            if (
              [...history.values()].filter((x) => x.status === 'downloading')
                .length === 0
            ) {
              browser.action.setIcon({
                path: '../images/32.png',
              });
            }
          }, 1000);
        }
      });

      // Shows notification
      if (result.enableNotifications) {
        const notificationOptions = {
          type: 'basic',
          iconUrl: '../images/icon-large.png',
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
      const notificationOptions = {
        type: 'basic',
        iconUrl: '../images/icon-large.png',
        title: 'Motrix not installed or configured properly',
        message:
          'Open Motrix set a API Key by visiting Preferences > Advanced > RPC Secret',
      };
      const notificationId = Math.round(new Date().getTime() / 1000).toString();
      browser.notifications.create(notificationId, notificationOptions);
      browser.notifications.onClicked.addListener((id) => {
        if (id === notificationId) {
          browser.tabs.create({ url: 'motrix://' });
        }
      });
    });
  await removeFromHistory(downloadItem.id);
}

export default class AriaDownloader {
  constructor() {
    this.name = 'AriaDownloader';
  }

  async handleStart(options, downloadItem, history) {
    const result = options;
    // remove file from browsers history
    await browser.downloads.pause(downloadItem.id);
    await onGot(result, downloadItem, history);
  }
}
