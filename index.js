const {app, Tray, Menu, shell, BrowserWindow, screen} = require('electron'),
      path = require('path'),
      Store = require('electron-store'),
      store = new Store();

let tray, gemini, visible = true;

const getValue = (key, defaultVal = false) => store.get(key, defaultVal);

const toggleVisibility = action => {
    visible = action;
    if (action) {
        gemini.show();
        gemini.focus();
    } else {
        gemini.hide();
    }
};

const createWindow = () => {
    const {width, height} = screen.getPrimaryDisplay().bounds,
        winWidth = 400, winHeight = 700;

    gemini = new BrowserWindow({
        width: winWidth,
        height: winHeight,
        frame: false,
        movable: true,
        maximizable: false,
        resizable: true,
        skipTaskbar: true,
        alwaysOnTop: true,
        transparent: true,
        x: width - winWidth - 10,
        y: height - winHeight - 60,
        icon: path.resolve(__dirname, 'icon.png'),
        show: getValue('show-on-startup', true),
        webPreferences: {
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            devTools: true,
            nodeIntegration: false,
            webviewTag: true
        }
    });

    // Set window class name
    gemini.setTitle('Gemini Desktop');
    gemini.webContents.once('dom-ready', () => {
        gemini.webContents.executeJavaScript(`document.title = 'Gemini Desktop';`);
    });

    gemini.loadFile('src/index.html').catch(console.error);

    gemini.on('blur', () => {
        if (!getValue('always-on-top', false)) toggleVisibility(false);
    });
};

const createTray = () => {
    tray = new Tray(path.resolve(__dirname, 'icon.png'));
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'About (GitHub)',
            click: () => shell.openExternal('https://github.com/nekupaw/gemini-desktop').catch(console.error)
        },
        {type: 'separator'},
        {
            label: 'Always on Top',
            type: 'checkbox',
            checked: getValue('always-on-top', false),
            click: menuItem => store.set('always-on-top', menuItem.checked)
        },
        {
            label: 'Show on Startup',
            type: 'checkbox',
            checked: getValue('show-on-startup', true),
            click: menuItem => store.set('show-on-startup', menuItem.checked)
        },
        {type: 'separator'},
        {
            label: 'Quit Gemini',
            click: () => gemini.close()
        }
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('click', () => toggleVisibility(true));
};

// Check if another instance is already running
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // If another instance exists, send a signal to focus it and quit this instance
    const { exec } = require('child_process');
    exec('wmctrl -a "Gemini Desktop"', (error) => {
        if (error) {
            console.error('Error focusing window:', error);
        }
    });
    app.quit();
} else {
    app.on('second-instance', () => {
        if (gemini) {
            if (gemini.isMinimized()) gemini.restore();
            gemini.show();
            gemini.focus();
        }
    });

    app.whenReady().then(() => {
        createTray();
        createWindow();
    }).catch(console.error);
}
