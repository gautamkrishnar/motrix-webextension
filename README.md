# Motrix WebExtension

This WebExtension allows you to automatically download all the files via [Motrix Download Manager](https://motrix.app/) instead of your browser's native download manager.

You must download and install the Motrix download manager first to use this extension: [Releases](https://github.com/agalwood/Motrix/releases/latest)

![motrix-extension](https://user-images.githubusercontent.com/8397274/71557256-bed84a80-2a69-11ea-98d9-f2f20d2a0065.gif)

## Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. See deployment for notes on how to deploy the project on a live system.

### Prerequisites

```
Node.js >= 12
Firefox Developer Edition ( Optional for Firefox development ) 
Chromium-based Browser ( Optional for Chromium development )
```

### Installing

A step by step series of examples that tell you how to get a development env running

Clone the Repo

```
git clone https://github.com/gautamkrishnar/motrix-chrome-extension.git
cd motrix-chrome-extension
```

Install dependecies

```
npm install
```

Check [package.json](package.json) for browser dependent scripts.

## Deployment

### Chrome

*  Open `chrome://extensions` in chrome
*  Toggle the developer mode by clicking on the toggle button on the top right corner
*  Download the latest release from the [releases page](https://github.com/gautamkrishnar/motrix-chrome-extension/releases/latest) 
*  Extract the release file
*  Load extension in the browser using the **Load Unpacked** button. Point to the extracted release folder.
*  Once the extension is loaded you can see its icon in the toolbar, Set an API Key by clicking on the extension icon set any value you like
*  Open Motrix app, select **Preferences** > **Advanced**. Type in the same key you used previously on the **RPC Secret** field.
*  Click **Save & Apply**

For more info see the video: [Motrix Download Manager chrome extension demo](https://youtu.be/L0cEu-2LpOE)

#### Why it is not available in the chrome web store
Will publish it once it is stable. Requires a lots of testing.

## Built With

*  [Webpack](http://www.webpack.js.org/) - The Bundler used
*  [Babel.js](https://babeljs.io/) - Javascript Compiler
*  [Web-Ext](https://github.com/mozilla/web-ext) - Used to test the extension
*  [WebExtension-Polyfill](https://github.com/mozilla/webextension-polyfill) - Used to make extension cross-browser

## Contributing

Please note that this extension is still in the initial version of its release. There may be bugs, please open an issue 
if you encounter any. Feel free to modify the code and open a PR. This is my first chrome extension :smile:
any suggestions are always welcome.

## Authors

*  **Gautam Krishna R** - *Initial work* - [gautamkrishnar](https://github.com/gautamkrishnar)
*  **149segolte** - *WebExtensions Migration* - [149segolte](https://github.com/149segolte)

See also the list of [contributors](https://github.com/your/project/contributors) who participated in this project.

## License

This project is licensed under the GPL License - see the [LICENSE](LICENSE) file for details

## Releases
Please see the [releases](https://github.com/gautamkrishnar/motrix-chrome-extension/releases/latest) page.
