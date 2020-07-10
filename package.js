const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const filePath = path.resolve(__dirname, 'dist', 'manifest.json');
const file = require(filePath);
const packagePath = path.resolve(__dirname, 'packaged');
var args = process.argv.slice(2);
var settings = file['browser_specific_settings'];

function archive(folder) {
    var output = fs.createWriteStream(folder);
    var archived = archiver('zip');
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
    archived.directory('dist/', false);
    archived.finalize();
}

if (!fs.existsSync(packagePath)) {
    console.log('Creating Folder ...');
    fs.mkdirSync(packagePath);
} else {
    console.log('Deleting Folder ...');
    fs.rmdirSync(packagePath, { recursive: true }, (err) => {
        if (err) {
            throw err;
        }
    });
    console.log('Creating Folder ...');
    fs.mkdirSync(packagePath);
}

args.forEach(function (val) {
    var zip = val + '.zip';
    var zipPath = path.resolve(packagePath, zip);
    console.log('\n\'' + val + '\' target detected ...');
    if (val == 'chrome') {
        console.log('Removing Browser Specific Settings from the manifest ...');
        delete file['browser_specific_settings'];
        fs.writeFileSync(filePath, JSON.stringify(file), function writeJSON(err) {
            if (err) {
                return console.error(err);
            }
        })
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
