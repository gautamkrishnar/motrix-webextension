'use strict';

function downloadAgent() {
    chrome.downloads.onCreated.addListener(function (downloadItem) {
        if (downloadItem.state !== "in_progress"){
            return;
        }
        // Triggered whenever a new download event fires
        chrome.storage.sync.get(['motrixapikey', 'extensionstatus'], function (result) {
            if (!result.extensionstatus){
                // Extension is disabled
                return;
            }
            if (!result.motrixapikey) {
                // API KEY is not set, triggers an alert to the user
                alert('API key not set, please set a random API key by clicking on the extension icon. Open Motrix ' +
                    'set the same API Key by visiting Preferences > Advanced > RPC Secret');
            } else {
                // API Key is set, Proceed with download
                const Motrix_RPC_URL = 'http://127.0.0.1:16800/jsonrpc'; // Motrix RPC URL
                let downloadUrl = '';
                // To support JS Downloads
                if (validateUrl(downloadItem.url)){
                    downloadUrl = downloadItem.url;
                } else if(validateUrl(downloadItem.finalUrl)) {
                    downloadUrl = downloadItem.finalUrl;
                } else {
                    // Not a valid url: skip download
                    return;
                }
                const PARAMS = {
                    jsonrpc: '2.0',
                    id: downloadItem.id + 'extensionChrome',
                    method: 'aria2.addUri',
                    params: [[downloadUrl], {}] // To support js download
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
                    chrome.downloads.erase({id: downloadItem.id});
                }).catch(() => {
                    // Failed: Show alert, Allows download to continue in chrome
                    alert("Motrix not installed or configured properly, Open Motrix set a API Key by visiting Preferences" +
                        " > Advanced > RPC Secret");
                });
            }
        });
    });
}

function validateUrl(value) {
    return /^(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)(?:\.(?:[a-z\u00a1-\uffff0-9]-*)*[a-z\u00a1-\uffff0-9]+)*(?:\.(?:[a-z\u00a1-\uffff]{2,})))(?::\d{2,5})?(?:[/?#]\S*)?$/i.test(value);
}

chrome.runtime.onStartup.addListener(function () {
    downloadAgent();
});


chrome.runtime.onInstalled.addListener(function () {
    downloadAgent();
});
