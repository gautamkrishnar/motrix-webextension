import * as browser from 'webextension-polyfill';

// send a message every 20 sec to service worker
setInterval(() => {
  browser.runtime.sendMessage({ keepAlive: true });
}, 20000);
