const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const distDir = path.resolve(__dirname, 'dist');
const filePath = path.resolve(distDir, 'manifest.json');
const packagePath = path.resolve(__dirname, 'packaged');
const file = require(filePath);
let args = process.argv.slice(2);
let settings = file['browser_specific_settings'];

/**
 * Promisified implementation of Archiver
 * @param {string} source - directory to zip
 * @param {string} out - output zip file path
 * @returns {Promise<string>}
 */
function zipUtil(source, out) {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const stream = fs.createWriteStream(out);

    return new Promise((resolve, reject) => {
        archive
            .directory(source, false, {})
            .on("error", (err) => reject(err))
            .pipe(stream);
        stream.on("close", () => resolve(out));
        archive.finalize();
    });
}

args.forEach(function (val) {
    let zip = val + '.zip';
    let zipPath = path.resolve(packagePath, zip);
    if (fs.existsSync(packagePath)) {
        if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
        }
    } else {
        fs.mkdirSync(packagePath);
    }
    console.log('\n\'' + val + '\' target detected ...');
    if (val === 'chrome') {
        console.log('Removing Browser Specific Settings from the manifest ...');
        delete file['browser_specific_settings'];
        fs.writeFileSync(filePath, JSON.stringify(file), function writeJSON(err) {
            if (err) {
                return console.error(err);
            }
        });
        console.log('Creating ' + zip + ' ...');
        zipUtil(distDir,zipPath).then(()=> {
            console.log('Created ', zipPath);
            console.log('Restoring Browser Specific Settings in the manifest ...');
            file['browser_specific_settings'] = settings;
            fs.writeFileSync(filePath, JSON.stringify(file), function writeJSON(err) {
                if (err) {
                    return console.error(err);
                }
            });
        }).catch((err)=> console.log(err));
    } else {
        console.log('Creating ' + zip + ' ...');
        zipUtil(distDir, zipPath).then(() => console.log('Created ', zipPath));
    }
});
