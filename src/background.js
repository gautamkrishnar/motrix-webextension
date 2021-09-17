import Aria2 from 'aria2';

function validateUrl(value) {
    return /^(?:(?:(?:https?|ftp):)?\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff_-]{0,62})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,}\.?))(?::\d{2,5})?(?:[/?#]\S*)?$/i.test(value);
}

function downloadAgent() {
    browser.downloads.onCreated.addListener(function (downloadItem) {
        if (downloadItem.state !== 'in_progress') {
            return;
        }

        async function onGot(result) {
            if (!result.extensionstatus) {
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
                    var directory, filename;
                    filename = downloadItem.filename.replace(/^.*[\\\/]/, '');
                    directory = downloadItem.filename.match(/(.*)[\/\\]/)[1] || '';
                    // Appends path to the options
                    params = {
                        dir: directory,
                        out: filename
                    };
                }
                if (downloadItem.referrer) {
                    params = {
                        ...params,
                        referer: downloadItem.referrer,
                    }
                }
                await aria2.call("addUri", [downloadUrl], params).then(async () => {
                    // Added successfully: Cancels and removes the download from browser download manager
                    function onFinished() { }

                    function onError(error) {
                        console.error(`Error: ${error}`);
                    }

                    var removing = browser.downloads.removeFile(downloadItem.id);
                    removing.then(onFinished).catch(onError);
                    var canceling = browser.downloads.cancel(downloadItem.id);
                    canceling.then(onFinished).catch(onError);
                    var erasing = browser.downloads.erase({ id: downloadItem.id });
                    erasing.then(onFinished).catch(onError);

                    // Shows notification
                    if (result.enablenotifications) {
                            const notificationOptions = {
                            type: 'basic',
                            iconUrl: 'assets/images/icon-large.png',
                            title: 'Motrix WebExtension',
                            message: 'Download started in Motrix download manger'
                        };
                        var notificationId = Math.round((new Date()).getTime() / 1000).toString();
                        browser.notifications.create(notificationId, notificationOptions);
                        browser.notifications.onClicked.addListener((id) => {
                            if (id == notificationId) {
                                browser.tabs.create({url:'motrix://'});
                            }
                        });
                    }
                    setTimeout(() => browser.runtime.reload(), 1000);
                }).catch((err) => {
                    console.error(err);
                    // Failed: Show alert, Allows download to continue in browser
                    alert('Motrix not installed or configured properly, Open Motrix set a API Key by visiting Preferences' +
                        ' > Advanced > RPC Secret');
                });
            }
        }

        async function onError(error) {
            console.error(`Error: ${error}`);
        }

        // Triggered whenever a new download event fires
        let getResult = browser.storage.sync.get(['motrixapikey', 'extensionstatus', 'enablenotifications']);
        getResult.then(onGot, onError);

    });
}

browser.runtime.onStartup.addListener(function () {
    downloadAgent();
});


browser.runtime.onInstalled.addListener(function () {
    downloadAgent();
});
