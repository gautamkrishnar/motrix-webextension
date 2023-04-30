import { historyToArray, parsePath } from './utils';
import * as browser from 'webextension-polyfill';

export default class BrowserDownloader {
  constructor() {
    this.name = 'BrowserDownloader';
  }
  async handleStart(_options, downloadItem, history) {
    console.log(_options, downloadItem, history);
    const path = parsePath(downloadItem.filename);
    let inter = null;

    inter = setInterval(async () => {
      const statuses = await browser.downloads.search({ id: downloadItem.id });
      const status = statuses[0];

      console.log(status);
      if (statuses.length !== 1) {
        clearInterval(inter);
        history.set(downloadItem.id, {
          manager: 'browser',
          gid: downloadItem.id,
          startTime: downloadItem.startTime,
          icon: downloadItem.icon,
          name: path.out ?? null,
          path: path.dir ?? null,
          status: 'unknown',
          size: downloadItem.totalBytes,
          downloaded: status.bytesReceived,
        });
      } else if (status.endTime != null) {
        clearInterval(inter);
        history.set(downloadItem.id, {
          manager: 'browser',
          gid: downloadItem.id,
          startTime: downloadItem.startTime,
          icon: downloadItem.icon,
          name: path.out ?? null,
          path: path.dir ?? null,
          status: 'completed',
          size: downloadItem.totalBytes,
          downloaded: status.bytesReceived,
        });
        browser.storage.local.set({ history: historyToArray(history) });
      } else if (status.state !== 'in_progress') {
        clearInterval(inter);
        history.set(downloadItem.id, {
          manager: 'browser',
          gid: downloadItem.id,
          startTime: downloadItem.startTime,
          icon: downloadItem.icon,
          name: path.out ?? null,
          path: path.dir ?? null,
          status: 'stop',
          size: downloadItem.totalBytes,
          downloaded: status.bytesReceived,
        });
        browser.storage.local.set({ history: historyToArray(history) });
      } else {
        history.set(downloadItem.id, {
          manager: 'browser',
          gid: downloadItem.id,
          startTime: downloadItem.startTime,
          icon: downloadItem.icon,
          name: path.out ?? null,
          path: path.dir ?? null,
          status: 'downloading',
          size: downloadItem.totalBytes,
          downloaded: status.bytesReceived,
        });
        browser.storage.local.set({ history: historyToArray(history) });
      }
    }, 1000);

    history.set(downloadItem.id, {
      manager: 'browser',
      gid: downloadItem.id,
      startTime: downloadItem.startTime,
      icon: downloadItem.icon,
      name: path.out ?? null,
      path: path.dir ?? null,
      status: 'downloading',
      size: downloadItem.totalBytes,
      downloaded: 0,
    });
    browser.storage.local.set({ history: historyToArray(history) });
  }
}
