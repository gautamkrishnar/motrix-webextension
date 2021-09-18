## Building from sources

Download the latest source code from [Github Releases](https://github.com/gautamkrishnar/motrix-webextension/releases/latest)

### Install the dependencies
- Install Node JS and yarn
- To install dependancies, run the following command in the extension's directory:
```sh
yarn install
```

#### Chrome
* Open `chrome://extensions` in chrome
* Toggle the developer mode by clicking on the toggle button on the top right corner
* Run `yarn run build chrome` in the extension's source code directory
* Load extension in the browser using the **Load Unpacked** button. Point it to the `dist/chrome` folder
* Click on the extension icon and use it 

For more info see the video: [Motrix Download Manager chrome extension demo](https://youtu.be/L0cEu-2LpOE)

#### Firefox
* Open `about:debugging` in firefox
* Click on This firefox option on left
* Run `yarn run build firefox` in the extension's source code directory
* Zip the contents of `dist/firefox` by running `cd dist/firefox && zip -r ../firefox.zip *` command
* Click on **Load Temporary add-on...** button
* Select the `dist/firefox.zip` zip file
* Once the extension is loaded you can see its icon in the toolbar
* Click on the extension icon and use it

For more info see the video: [Motrix Download Manager firefox extension demo](https://www.youtube.com/watch?v=SjpE840wms4)

#### Edge

* Open `edge://extensions` in edge
* Toggle the developer mode by clicking on the toggle button on the left bottom corner
* Run `yarn run build edge` in the extension's source code directory
* Load extension in the browser using the **Load Unpacked** button. Point it to the `dist/edge` folder
* Click on the extension icon and use it

#### Opera

* Open `opera://extensions` in opera
* Toggle the developer mode by clicking on the toggle button on the top right corner
* Run `yarn run build opera` in the extension's source code directory
* Load extension in the browser using the **Load Unpacked** button. Point it to the `dist/edge` folder
* Click on the extension icon and use it