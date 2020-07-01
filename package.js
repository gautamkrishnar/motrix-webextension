const path = require('path');
const { zipFolder } = require('zip-a-folder');
const fs = require('fs');
const filePath = path.resolve(__dirname, 'dist', 'manifest.json');
const file = require(filePath);
const packagePath = path.resolve(__dirname, 'packaged');
var args = process.argv.slice(2);
var settings = file['browser_specific_settings'];

if (!fs.existsSync(packagePath)) {
    fs.mkdirSync(packagePath);
}

delete file['browser_specific_settings'];
fs.writeFileSync(filePath, JSON.stringify(file), function writeJSON(err) {
    if (err) {
        return console.error(err);
    }
})

args.forEach(function (val) {
    if (val != 'chrome') {
        file['browser_specific_settings'] = settings;
        fs.writeFileSync(filePath, JSON.stringify(file), function writeJSON(err) {
            if (err) {
                return console.error(err);
            }
        })
    }
    var zip = val + '.zip';
    var zipPath = path.resolve(packagePath, zip);
    zipFolder('./dist', zipPath);
});
