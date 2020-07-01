const path = require('path');
const { zip } = require('zip-a-folder');
const fs = require('fs');
const file = require(path.resolve(__dirname, 'dist', 'manifest.json'));

const chromePath = path.resolve(__dirname, 'packaged', 'chrome', 'chrome.zip');
const firefoxPath = path.resolve(__dirname, 'packaged', 'firefox', 'firefox.zip');

zip('./dist', firefoxPath);
function zipChrome() {
    delete file['browser_specific_settings'];
    fs.writeFile(path.resolve(__dirname, 'dist', 'manifest.json'), JSON.stringify(file), function writeJSON(err) {
        if (err) {
            return console.error(err)
        }
        zip('./dist', chromePath);
    });
}
setTimeout(zipChrome, 5000);
