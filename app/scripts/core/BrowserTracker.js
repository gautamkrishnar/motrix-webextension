import * as browser from 'webextension-polyfill';
import { parsePath } from '../utils';

export function trackWithBrowser(downloadItem, store) {
  const path = downloadItem.filename ? parsePath(downloadItem.filename) : { out: null, dir: null };

  store.upsert(downloadItem.id, {
    gid: downloadItem.id,
    downloader: 'browser',
    startTime: downloadItem.startTime,
    icon: '',
    name: path.out,
    path: path.dir,
    status: 'downloading',
    size: downloadItem.fileSize,
    downloaded: 0,
  });

  const listener = async (delta) => {
    if (delta.id !== downloadItem.id) return;

    if (delta.state?.current === 'complete') {
      browser.downloads.onChanged.removeListener(listener);
      await store.upsert(downloadItem.id, { status: 'completed' });
    } else if (delta.state?.current === 'interrupted') {
      browser.downloads.onChanged.removeListener(listener);
      await store.upsert(downloadItem.id, { status: 'error' });
    } else if (delta.bytesReceived) {
      const update = { downloaded: delta.bytesReceived.current };
      if (delta.totalBytes?.current > 0) {
        update.size = delta.totalBytes.current;
      }
      await store.upsert(downloadItem.id, update);
    } else if (delta.totalBytes?.current > 0) {
      await store.upsert(downloadItem.id, { size: delta.totalBytes.current });
    } else if (delta.filename?.current && !path.out) {
      const resolved = parsePath(delta.filename.current);
      await store.upsert(downloadItem.id, { name: resolved.out, path: resolved.dir });
    }
  };

  browser.downloads.onChanged.addListener(listener);
}
