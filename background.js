'use strict';

function downloadAgent() {
    chrome.downloads.onCreated.addListener(function (downloadItem) {
        if (downloadItem.state !== "in_progress"){
            return;
        }
        // Triggered whenever a new download event fires
        chrome.storage.sync.get(['motrixapikey', 'extensionstatus'], async function (result) {
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
                const options = {
                    host: '127.0.0.1',
                    port: 16800,
                    secure: false,
                    secret: result.motrixapikey,
                    path: '/jsonrpc'
                };
                const aria2 = new Aria2(options);
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

                let params = {};
                // If the download have a specified path, ie user selected via file manager
                if (downloadItem.filename) {
                    var directory, filename;
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
                    params = {
                        dir: directory,
                        out: filename
                    };
                }
                await aria2.call("addUri", [downloadUrl], params).then(async ()=> {
                    // Added successfully: Cancels and removes the download from chrome download manager
                    chrome.downloads.erase({id: downloadItem.id});
                    // Shows notification
                    const notificationOptions = {
                        type: "basic",
                        iconUrl: "assets/images/icon-large.png",
                        title: "Motrix Chrome Extension",
                        message: "Download started on motrix download manger",
                        buttons: [
                            {
                                title: "Ok"
                            }
                        ]
                    };
                    chrome.notifications.create( Math.round((new Date()).getTime() / 1000).toString(), notificationOptions);
                    setTimeout(() => chrome.runtime.reload(), 1000);
                }).catch((err) => {
                    console.log(err);
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
