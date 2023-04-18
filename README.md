# Motrix WebExtension

This WebExtension allows you to automatically download all the files via [Motrix Download Manager](https://motrix.app/) instead of your browser's native download manager.

You must download and install the Motrix download manager first to use this extension: [Releases](https://github.com/agalwood/Motrix/releases/latest)

![motrix-extension](https://user-images.githubusercontent.com/8397274/71557256-bed84a80-2a69-11ea-98d9-f2f20d2a0065.gif)

![motrix-webextension-googledrive-demo](https://user-images.githubusercontent.com/76680670/232788367-f8386aa9-eaa6-45f7-8caa-a44dfdd3ec71.gif)


## How to use
### Demo video:
- [Chrome](https://youtu.be/L0cEu-2LpOE)

### Text introduction:
1. Open the Motrix download manager installed on your computer, and go to `Preferences > Advanced > Security > RPC secret` and create a random secret key and copy it.

<img src="https://user-images.githubusercontent.com/8397274/211193332-bc815b60-60a3-445c-bb0b-7547d1974de8.png" alt="how to use motrix step 1" valign="middle">

2. Go to chrome extensions, go to Motrix WebExtension settings, paste the key and click on "SET KEY" button.
You are ready to go!
<img src="https://user-images.githubusercontent.com/8397274/211193337-96f7fa11-e660-48a7-b323-b800a7d64084.png"  alt="how to use motrix step 2" valign="middle">


Note: **You should keep Motrix always running in the background for this extension to work. We cant launch motrix programmatically.**

## Installing

### Chrome / Opera / Edge
[link-chrome]: https://chrome.google.com/webstore/detail/motrix-webextension/djlkbfdlljbachafjmfomhaciglnmkgj 'Version published on Chrome Web Store'

[<img src="https://raw.githubusercontent.com/alrra/browser-logos/90fdf03c/src/chrome/chrome.svg" width="48" alt="Chrome" valign="middle">][link-chrome] [<img valign="middle" src="https://img.shields.io/chrome-web-store/v/djlkbfdlljbachafjmfomhaciglnmkgj.svg?label=%20">][link-chrome] also compatible with [<img src="https://raw.githubusercontent.com/alrra/browser-logos/90fdf03c/src/edge/edge.svg" width="24" alt="Edge" valign="middle">][link-chrome] [<img src="https://raw.githubusercontent.com/alrra/browser-logos/90fdf03c/src/opera/opera.svg" width="24" alt="Opera" valign="middle">][link-chrome]

### Firefox
[link-firefox]: https://addons.mozilla.org/en-US/firefox/addon/motrixwebextension/ 'Version published on Mozilla Add-ons'

[<img src="https://raw.githubusercontent.com/alrra/browser-logos/90fdf03c/src/firefox/firefox.svg" width="48" alt="Firefox" valign="middle">][link-firefox] [<img valign="middle" src="https://img.shields.io/amo/v/motrixwebextension.svg?label=%20">][link-firefox]

### Building from sources
More info [here](installing-via-releases.md)



## Development

### Install
```shell
yarn install
```

### Starting the development server
```shell
yarn run dev chrome
yarn run dev firefox
yarn run dev opera
yarn run dev edge
```

### Build
```shell
yarn run build chrome
yarn run build firefox
yarn run build opera
yarn run build edge
```

### Environment

The build tool also defines a variable named `process.env.NODE_ENV` in your scripts.

### Toolkit Docs
* [webextension-toolbox](https://github.com/HaNdTriX/webextension-toolbox)

### License
This project is licensed under the GPL License - see the [LICENSE](LICENSE) file for details

### Bugs
If you are experiencing any bugs, don’t forget to open a [new issue](https://github.com/gautamkrishnar/motrix-webextension/issues/new).

### Maintainers
- [@gautamkrishnar](https://github.com/gautamkrishnar)
- [@JaroslawPokropinski](https://github.com/JaroslawPokropinski)

### Contributors
Special thanks to these amazing people

<a href="https://github.com/gautamkrishnar/motrix-webextension/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=gautamkrishnar/motrix-webextension" />
</a>

### Liked it?
Hope you liked this project, don't forget to give it a star ⭐
