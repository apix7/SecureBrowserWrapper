const {app, Tray, Menu, shell, BrowserWindow, screen, Notification, session} = require('electron'),
      path = require('path'),
      Store = require('electron-store'),
      store = new Store();

let tray, browserWindow, visible = true;

const getValue = (key, defaultVal = false) => store.get(key, defaultVal);

const toggleVisibility = action => {
    visible = action;
    if (action) {
        browserWindow.show();
        browserWindow.focus();
    } else {
        browserWindow.hide();
    }
};

const createWindow = () => {
    const {width, height} = screen.getPrimaryDisplay().bounds,
        winWidth = 1080, winHeight = 720;

    browserWindow = new BrowserWindow({
        width: winWidth,
        height: winHeight,
        frame: false,
        movable: true,
        maximizable: false,
        resizable: true,
        skipTaskbar: true,
        alwaysOnTop: true,
        transparent: true,
        center: true,
        icon: path.resolve(__dirname, 'icon.png'),
        show: getValue('show-on-startup', true),
        webPreferences: {
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            devTools: true,
            nodeIntegration: false,
            webviewTag: true,
            partition: 'persist:main'
        }
    });

    // Set window class name
    browserWindow.setTitle('SecureBrowserWrapper');
    browserWindow.webContents.once('dom-ready', () => {
        browserWindow.webContents.executeJavaScript(`document.title = 'SecureBrowserWrapper';`);
    });

    browserWindow.loadFile('src/index.html').catch(console.error);

    browserWindow.on('blur', () => {
        if (!getValue('always-on-top', false)) toggleVisibility(false);
    });
};

const clearBrowsingData = async () => {
    if (!browserWindow || !browserWindow.webContents) return;

    try {
        // Get all active sessions including the main one and webviews
        const sessions = new Set();
        sessions.add(browserWindow.webContents.session);
        
        // Get all webview sessions
        const webviews = await browserWindow.webContents.executeJavaScript(`
            Array.from(document.querySelectorAll('webview')).map(webview => webview.partition)
        `);
        
        for (const partition of webviews) {
            if (partition) {
                const webviewSession = partition.startsWith('persist:') 
                    ? session.fromPartition(partition)
                    : session.fromPartition(`persist:${partition}`);
                sessions.add(webviewSession);
            }
        }

        // Clear data for all sessions
        for (const session of sessions) {
            // Clear all storage data
            await session.clearStorageData({
                storages: [
                    'appcache',
                    'cookies',
                    'filesystem',
                    'indexdb',
                    'localstorage',
                    'shadercache',
                    'websql',
                    'serviceworkers',
                    'cachestorage'
                ],
                quotas: [
                    'temporary',
                    'persistent',
                    'syncable'
                ]
            });

            // Clear HTTP cache
            await session.clearCache();
            
            // Clear host resolver cache
            await session.clearHostResolverCache();
            
            // Clear authentication cache
            session.clearAuthCache();

            // Clear all cookies
            const cookies = await session.cookies.get({});
            for (const cookie of cookies) {
                try {
                    const url = `${cookie.secure ? 'https' : 'http'}://${cookie.domain}${cookie.path}`;
                    await session.cookies.remove(url, cookie.name);
                } catch (e) {
                    console.error('Error removing cookie:', e);
                }
            }
        }

        // Force reload with cache clearing
        browserWindow.webContents.reloadIgnoringCache();
        
        // Execute JavaScript to reload all webviews
        await browserWindow.webContents.executeJavaScript(`
            Array.from(document.querySelectorAll('webview')).forEach(webview => {
                webview.reloadIgnoringCache();
            });
        `);

        // Show notification
        new Notification({ 
            title: 'SecureBrowserWrapper', 
            body: 'All browsing data has been cleared' 
        }).show();
        
    } catch (error) {
        console.error('Error clearing browsing data:', error);
        new Notification({ 
            title: 'SecureBrowserWrapper', 
            body: 'Error clearing browsing data' 
        }).show();
    }
};

const createTray = () => {
    tray = new Tray(path.resolve(__dirname, 'icon.png'));
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'About (GitHub)',
            click: () => shell.openExternal('https://github.com/apix7/securebrowserwrapper').catch(console.error)
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
            label: 'Clear Browsing Data',
            click: () => clearBrowsingData()
        },
        {type: 'separator'},
        {
            label: 'Quit SecureBrowserWrapper',
            click: () => browserWindow.close()
        }
    ]);

    tray.setContextMenu(contextMenu);
    tray.on('click', () => toggleVisibility(true));
};

// Check if another instance is already running
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // If another instance exists, just quit - the main instance will handle showing the window
    app.quit();
} else {
    app.on('second-instance', () => {
        if (browserWindow) {
            toggleVisibility(true);  // Use our existing toggle function
        }
    });

    // Add a new IPC handler for the global shortcut
    app.whenReady().then(() => {
        createTray();
        createWindow();
        
        // Handle the global shortcut by toggling visibility
        const { globalShortcut } = require('electron');
        globalShortcut.register('CommandOrControl+G', () => {
            toggleVisibility(!visible);  // Toggle based on current state
        });
    }).catch(console.error);
}
