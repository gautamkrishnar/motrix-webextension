const path = require('path');
const { zip } = require('zip-a-folder');
const fs = require('fs');
const fileName = path.resolve(__dirname, 'dist', 'manifest.json');
const file = require(fileName);

chromePath = path.resolve(__dirname, 'packaged', 'chrome', 'chrome.zip');
firefoxPath = path.resolve(__dirname, 'packaged', 'firefox', 'firefox.zip');

zip('./dist', firefoxPath);
setTimeout(zipChrome, 5000);
function zipChrome() {
    delete file['browser_specific_settings'];
    fs.writeFile(fileName, JSON.stringify(file), function writeJSON(err) {
        if (err) return console.log(err);
        console.log(JSON.stringify(file));
        console.log('writing to ' + fileName);
        zip('./dist', chromePath);
    });
}
