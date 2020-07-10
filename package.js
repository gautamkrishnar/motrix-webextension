const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const filePath = path.resolve(__dirname, 'dist', 'manifest.json');
const packagePath = path.resolve(__dirname, 'packaged');
const file = require(filePath);
let args = process.argv.slice(2);
let settings = file['browser_specific_settings'];

function archive(folder) {
    let output = fs.createWriteStream(folder);
    let archived = archiver('zip');
    output.on('close', function () {
        console.log(archived.pointer() + ' total bytes');
        console.log('archiver has been finalized and the output file descriptor has closed.');
    });
    output.on('end', function () {
        console.log('Data has been drained');
    });
    archived.on('warning', function (err) {
        if (err.code === 'ENOENT') {
            console.log(err);
        } else {
            throw err;
        }
    });
    archived.on('error', function (err) {
        throw err;
    });
    archived.pipe(output);
    archived.directory('dist/', false, null);
    archived.finalize();
}

args.forEach(function (val) {
    let zip = val + '.zip';
    let zipPath = path.resolve(packagePath, zip);
    if (fs.existsSync(zipPath)) {
        fs.unlinkSync(zipPath);
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
        archive(zipPath);
        console.log('Restoring Browser Specific Settings in the manifest ...');
        file['browser_specific_settings'] = settings;
        fs.writeFileSync(filePath, JSON.stringify(file), function writeJSON(err) {
            if (err) {
                return console.error(err);
            }
        })
    } else {
        console.log('Creating ' + zip + ' ...');
        archive(zipPath);
    }
});
