## Building from sources

Download the latest source code from [Github Releases](https://github.com/gautamkrishnar/motrix-webextension/releases/latest)

### Install the dependencies
- Install Node JS and yarn
- To install dependancies, run the following command in the extension's directory:
```sh
yarn install
```

#### Chrome / Edge / Opera
> For Edge and Opera, use the same Chrome build since they are Chromium-based browsers.

* Open `chrome://extensions` in chrome (or `edge://extensions` in Edge, `opera://extensions` in Opera)
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
* Add the following code to `dist/firefox/manifest.json`
  ```yaml
  "browser_specific_settings": {
    "gecko": {
      "id": "addon@example.com"
    }
  }
  ```
* Select the `dist/firefox/manifest.json` file
* Once the extension is loaded you can see its icon in the toolbar
* Click on the extension icon and use it

For more info see the video: [Motrix Download Manager firefox extension demo](https://www.youtube.com/watch?v=SjpE840wms4)
