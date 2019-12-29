'use strict';

function downloadAgent() {
    chrome.downloads.onCreated.addListener(function (downloadItem) {
        // Triggered whenever a new download event fires
        chrome.storage.sync.get(['motrixapikey'], function (result) {
            if (!result.motrixapikey) {
                // API KEY is not set, triggers an alert to the user
                alert('API key not set, please set a random API key by clicking on the extension icon. Open Motrix ' +
                    'set the same API Key by visiting Preferences > Advanced > RPC Secret');
            } else {
                // API Key is set, Proceed with download

                const Motrix_RPC_URL = 'http://127.0.0.1:16800/jsonrpc'; // Motrix RPC URL
                const PARAMS = {
                    jsonrpc: '2.0',
                    id: downloadItem.id + 'extensionChrome',
                    method: 'aria2.addUri',
                    params: [[downloadItem.url], {}]
                };

                // If the download have a specified path, ie user selected via file manager
                if (downloadItem.filename) {
                    var directory = '', filename = '';
                    if (downloadItem.filename.indexOf('/')) {
                        // Mac or linux
                        filename = downloadItem.filename.split('/')[downloadItem.filename.split('/').length - 1];
                        directory = downloadItem.filename.split('/').slice(0, downloadItem.filename.split('/').length - 1).join("/");
                    } else {
                        // Windows
                        filename = downloadItem.filename.split('\\')[downloadItem.filename.split('\\').length - 1];
                        directory = downloadItem.filename.split('\\').slice(0, downloadItem.filename.split('\\').length - 1).join("\\");
                    }

                    // Appends path to the options
                    PARAMS.params[1] = {
                        dir: directory,
                        out: filename
                    };
                }

                // RPC Call to Motrix aria2c instance
                fetch(Motrix_RPC_URL, {
                    method: 'POST',
                    mode: 'no-cors',
                    cache: 'no-cache',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    redirect: 'follow',
                    referrerPolicy: 'no-referrer',
                    body: JSON.stringify(PARAMS)
                }).then(() => {
                    // Added successfully: Cancels and removes the download from chrome download manager
                    chrome.downloads.erase({query: [downloadItem.url]});
                }).catch(() => {
                    // Failed: Show alert, Allows download to continue in chrome
                    alert("Motrix not installed or configured properly, Open Motrix set a API Key by visiting Preferences" +
                        " > Advanced > RPC Secret");
                });
            }
        });
    });
}

chrome.runtime.onStartup.addListener(function () {
    downloadAgent();
});


chrome.runtime.onInstalled.addListener(function () {
    downloadAgent();
});
