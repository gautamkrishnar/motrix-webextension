# Motrix Chrome Extension
Chrome integration for [Motrix download manager](https://motrix.app/) will automatically downloads all files via Motrix download 
manager instead of chrome's native download manager.

You must download and install the Motrix download manager first to use this extension: [Releases](https://github.com/agalwood/Motrix/releases/latest)

![motrix-extension](https://user-images.githubusercontent.com/8397274/71557256-bed84a80-2a69-11ea-98d9-f2f20d2a0065.gif)

### Setup
* Open `chrome://extensions` in chrome
* Toggle the developer mode by clicking on the toggle button on the top right corner
* Clone the repository locally using `git clone https://github.com/gautamkrishnar/motrix-chrome-extension.git`
* Load extension in the browser using **Load Unpacked** button
* Set an API Key by clicking on the extension icon set any value you like
* Open Motrix app, select **Preferences** > **Advanced**. Type in the same key you used previously on the **RPC Secret** field.
* Click **Save & Apply**

For more info see the video: https://youtu.be/L0cEu-2LpOE

### How it works
This extension intercepts all the downloads triggered by chrome and do the RPC call to the aria2c daemon provided by the
Motrix download manager. It will trigger a new download. For this extension to function the Motrix download manager
should be running in the background.

### Contributing
Feel free to modify the code and open a PR.

##### Todo
- [ ] Show a toast on the currently active page to let users know that download has started.
- [ ] Add option to disable plugin via the popup.html 

### Releases
Please see the [releases](https://github.com/gautamkrishnar/motrix-chrome-extension/releases/latest) page.

### License
GNU GENERAL PUBLIC LICENSE
