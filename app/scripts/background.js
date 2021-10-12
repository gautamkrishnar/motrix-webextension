import Aria2 from 'aria2';
import { filter, Observable, take } from 'rxjs';

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

function downloadAgent() {
  const subscribers = [];
  const observable = new Observable((s) => subscribers.push(s));

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
        };
      }

      await aria2
        .call('addUri', [downloadUrl], params)
        .then(async () => {
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
    ]);

    getResult.then(async (result) => {
      if (!result.extensionStatus) {
        // Extension is disabled
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
      observable
        .pipe(
          filter((delta) => delta.id === downloadItem.id && delta.filename),
          take(1)
        )
        .subscribe(async (delta) => {
          // remove file from browsers history
          await removeFromHistory(downloadItem.id);
          // update file name and path
          downloadItem.filename = delta.filename.current;
          // handle download
          onGot(result);
        });
    }, onError);
  });
}

browser.runtime.onInstalled.addListener(() => {
  // Migration script to migrate user data from old version
  browser.storage.sync
    .get([
      'motrixapikey',
      'extensionstatus',
      'enablenotifications',
      'enabledownloadprompt',
      'migrationDone',
    ])
    .then((result) => {
      if (typeof result.migrationDone === 'undefined') {
        if (typeof result.motrixapikey !== 'undefined' && result.motrixapikey) {
          browser.storage.sync.set({ motrixAPIkey: result.motrixapikey });
        }
        if (
          typeof result.extensionstatus !== 'undefined' &&
          result.extensionstatus
        ) {
          browser.storage.sync.set({ extensionStatus: result.extensionstatus });
        }
        if (
          typeof result.enablenotifications !== 'undefined' &&
          result.enablenotifications
        ) {
          browser.storage.sync.set({
            enableNotifications: result.enablenotifications,
          });
        }
        if (
          typeof result.enabledownloadprompt !== 'undefined' &&
          result.enabledownloadprompt
        ) {
          browser.storage.sync.set({
            enableDownloadPrompt: result.enabledownloadprompt,
          });
        }
        browser.storage.sync
          .remove([
            'motrixapikey',
            'extensionstatus',
            'enablenotifications',
            'enabledownloadprompt',
          ])
          .then(() => {
            browser.storage.sync.set({ migrationDone: 'v1' });
          })
          .catch(console.log);
      }
    })
    .catch(console.log);
});

browser.runtime.onStartup.addListener(function () {
  downloadAgent();
});

browser.runtime.onInstalled.addListener(function () {
  downloadAgent();
});
