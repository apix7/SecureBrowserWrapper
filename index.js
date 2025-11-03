const {app, Tray, Menu, shell, BrowserWindow, Notification, session, fuses, globalShortcut, ipcMain} = require('electron'),
      path = require('path'),
      _Store = require('electron-store'),
      Store = _Store && _Store.default ? _Store.default : _Store,
      log = require('electron-log'),
      store = new Store();

// Disable GPU hardware acceleration to avoid GPU-related errors
app.disableHardwareAcceleration();

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.info('Application starting', {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform
});

// Override console logging with electron-log
console.log = log.log;
console.error = log.error;
console.warn = log.warn;
console.info = log.info;
console.debug = log.debug;

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    log.error('Uncaught exception:', error);
    // Show notification to user
    if (app.isReady()) {
        new Notification({
            title: 'Error Occurred',
            body: 'An unexpected error occurred. The application may not work properly.'
        }).show();
    }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
    log.error('Unhandled promise rejection:', reason);
});

let tray, browserWindow, visible = true;
let hasUpdateReady = false;
let installUpdateAndRestart = null;

// Helper to persist and apply Windows login auto-start
const getLaunchAtLogin = () => store.get('launch-at-login', true);
const setLaunchAtLogin = (enabled) => {
    store.set('launch-at-login', enabled);
    try {
        const args = app.isPackaged ? [] : [app.getAppPath()];
        app.setLoginItemSettings({
            openAtLogin: enabled,
            path: process.execPath,
            args
        });
        log.info('Launch at login set to', enabled, { isPackaged: app.isPackaged, execPath: process.execPath, args });
    } catch (e) {
        log.warn('Failed to set login item settings:', e);
    }
};

const getValue = (key, defaultVal = false) => store.get(key, defaultVal);

const toggleVisibility = action => {
    visible = action;
    if (action) {
        browserWindow.show();
        browserWindow.focus();
    } else {
        browserWindow.hide();
        // Attempt to reduce memory usage when app is hidden
        if (process.platform !== 'darwin') { // Skip on macOS where this can cause issues
            global.gc && global.gc();
        }
    }
};

// Set up a periodic memory optimization task (every 10 minutes)
let memoryInterval;
const startMemoryManagement = () => {
    // Disabled aggressive cache clearing by default to avoid perf regressions
    if (memoryInterval) {
        clearInterval(memoryInterval);
    }
    memoryInterval = null; // noop; can be enabled later via a setting
};

const stopMemoryManagement = () => {
    if (memoryInterval) {
        clearInterval(memoryInterval);
        memoryInterval = null;
    }
};

const createWindow = () => {
    const winWidth = 1080, winHeight = 720;


    browserWindow = new BrowserWindow({
        width: winWidth,
        height: winHeight,
        frame: false,
        movable: true,
        maximizable: false,
        resizable: true,
        skipTaskbar: true,
        alwaysOnTop: getValue('always-on-top', false),
        transparent: true,
        center: true,
        icon: path.join(__dirname, 'icon.png'),
        show: getValue('show-on-startup', true),
        webPreferences: {
            contextIsolation: true,
            sandbox: true,
            preload: path.join(__dirname, 'preload.js'),
            devTools: true,
            nodeIntegration: false,
            webviewTag: true
        }
    });

    // Set window class name
    browserWindow.setTitle('AiFrame');
    browserWindow.webContents.once('dom-ready', () => {
        browserWindow.webContents.executeJavaScript(`document.title = 'AiFrame';`);
    });

    browserWindow.loadFile('src/index.html').catch(console.error);

    // Local (window-scoped) shortcuts to avoid hijacking system/global shortcuts
    browserWindow.webContents.on('before-input-event', (event, input) => {
        if ((input.control || input.meta) && input.type === 'keyDown') {
            const key = String(input.key || '').toUpperCase();
            const code = String(input.code || '');
            if (key === 'R') {
                event.preventDefault();
                browserWindow.webContents.send('reload-current-webview');
            } else if (code === 'Digit1' || key === '1') {
                event.preventDefault();
                browserWindow.webContents.send('switch-webview', 0);
            } else if (code === 'Digit2' || key === '2') {
                event.preventDefault();
                browserWindow.webContents.send('switch-webview', 1);
            } else if (code === 'Digit3' || key === '3') {
                event.preventDefault();
                browserWindow.webContents.send('switch-webview', 2);
            } else if (code === 'Digit4' || key === '4') {
                event.preventDefault();
                browserWindow.webContents.send('switch-webview', 3);
            }
        }
    });

    browserWindow.on('blur', () => {
        if (!getValue('always-on-top', false)) toggleVisibility(false);
    });
    
    // Verify WebView options before creation
    browserWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
        // Verify URL being loaded is one of our approved URLs
        if (!isAllowed(params.src)) {
            console.error(`Blocked attempt to load URL: ${params.src}`);
            event.preventDefault();
            return;
        }
        
        // Ensure security settings can't be overridden
        delete webPreferences.preload;
        webPreferences.nodeIntegration = false;
        webPreferences.nodeIntegrationInWorker = false;
        webPreferences.nodeIntegrationInSubFrames = false;
        webPreferences.contextIsolation = true;
        webPreferences.sandbox = true;
        webPreferences.allowRunningInsecureContent = false;
        webPreferences.webSecurity = true;
        webPreferences.experimentalFeatures = false;
        
        // Add additional security measures
        webPreferences.spellcheck = false;
        webPreferences.enableWebSQL = false;
        webPreferences.enableRemoteModule = false;
        
        log.info('Webview will attach with secure settings', { url: params.src });
    });

    // Helper: strict allowlist check
    const isAllowed = (url) => {
        try {
            const { hostname, protocol } = new URL(url);
            if (!(protocol === 'https:' || protocol === 'http:')) return false;
            const domains = ['duck.ai','perplexity.ai','grok.com','x.ai','gemini.google.com','google.com','gstatic.com'];
            return domains.some(d => hostname === d || hostname.endsWith(`.${d}`));
        } catch { return false; }
    };

    // Control navigation within the embedder
    browserWindow.webContents.on('will-navigate', (event, url) => {
        if (!isAllowed(url)) {
            log.warn(`Blocked navigation to: ${url}`);
            event.preventDefault();
            setImmediate(() => shell.openExternal(url).catch(() => {}));
        }
    });

    // Also guard each attached webview
    browserWindow.webContents.on('did-attach-webview', (event, wc) => {
        wc.on('will-navigate', (event, url) => {
            if (!isAllowed(url)) {
                log.warn(`Blocked webview navigation to: ${url}`);
                event.preventDefault();
                setImmediate(() => shell.openExternal(url).catch(() => {}));
            }
        });
        wc.setWindowOpenHandler((details) => {
            if (isAllowed(details.url)) {
                return {
                    action: 'allow',
                    overrideBrowserWindowOptions: {
                        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true }
                    }
                };
            }
            setImmediate(() => shell.openExternal(details.url).catch(() => {}));
            return { action: 'deny' };
        });

        // Set secure session permissions for this webview's session only
        try {
            wc.session.setPermissionRequestHandler((webContents, permission, callback) => {
                const allowedPermissions = ['fullscreen'];
                callback(allowedPermissions.includes(permission));
            });
        } catch (e) {
            log.warn('Failed to set permission handler for webview session', e);
        }

        // Add local shortcuts inside each webview so Ctrl+1..4 and Ctrl+R work while focused in the webview
        wc.on('before-input-event', (event, input) => {
            if ((input.control || input.meta) && input.type === 'keyDown') {
                const key = String(input.key || '').toUpperCase();
                const code = String(input.code || '');
                if (key === 'R') {
                    event.preventDefault();
                    browserWindow.webContents.send('reload-current-webview');
                } else if (code === 'Digit1' || key === '1') {
                    event.preventDefault();
                    browserWindow.webContents.send('switch-webview', 0);
                } else if (code === 'Digit2' || key === '2') {
                    event.preventDefault();
                    browserWindow.webContents.send('switch-webview', 1);
                } else if (code === 'Digit3' || key === '3') {
                    event.preventDefault();
                    browserWindow.webContents.send('switch-webview', 2);
                } else if (code === 'Digit4' || key === '4') {
                    event.preventDefault();
                    browserWindow.webContents.send('switch-webview', 3);
                }
            }
        });
    });

    // Listen for new windows and control them
    browserWindow.webContents.setWindowOpenHandler((details) => {
        const parsedUrl = new URL(details.url);

        // Only allow creation of new windows for our allowed domains
        if (isAllowed(details.url)) {
            // Allow window creation but prevent it from having node integration
            return {
                action: 'allow',
                overrideBrowserWindowOptions: {
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true,
                        sandbox: true
                    }
                }
            };
        }
        
        // For all other URLs, block window creation and instead open in external browser
        if (parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:') {
            setImmediate(() => {
                log.info(`Opening external URL in browser: ${details.url}`);
                shell.openExternal(details.url).catch(() => {});
            });
        }
        
        return { action: 'deny' };
    });

};

const clearBrowsingData = async () => {
    if (!browserWindow || !browserWindow.webContents) return;

    try {
        // Get all active sessions including the main one and webviews
        const sessionsSet = new Set();
        sessionsSet.add(browserWindow.webContents.session);
        
        // Get all webview sessions
        const webviews = await browserWindow.webContents.executeJavaScript(`
            Array.from(document.querySelectorAll('webview')).map(webview => webview.partition)
        `);
        
        for (const partition of webviews) {
            if (partition) {
                const webviewSession = partition.startsWith('persist:') 
                    ? session.fromPartition(partition)
                    : session.fromPartition(`persist:${partition}`);
                sessionsSet.add(webviewSession);
            }
        }

        // Clear data for all sessions
        for (const s of sessionsSet) {
            // Clear all storage data
            await s.clearStorageData({
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
            await s.clearCache();
            
            // Clear host resolver cache
            await s.clearHostResolverCache();
            
            // Clear authentication cache
            s.clearAuthCache();

            // Clear all cookies
            const cookies = await s.cookies.get({});
            for (const cookie of cookies) {
                try {
                    const domain = cookie.domain && cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
                    const url = `${cookie.secure ? 'https' : 'http'}://${domain}${cookie.path}`;
                    await s.cookies.remove(url, cookie.name);
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
            title: 'AiFrame', 
            body: 'All browsing data has been cleared' 
        }).show();
        
    } catch (error) {
        console.error('Error clearing browsing data:', error);
        new Notification({ 
            title: 'AiFrame', 
            body: 'Error clearing browsing data' 
        }).show();
    }
};

const createTray = () => {
    tray = new Tray(path.join(__dirname, 'icon.png'));

    const updateTrayMenu = () => {
        const template = [
            {
                label: 'About (GitHub)',
                click: () => shell.openExternal('https://github.com/apix7/securebrowserwrapper').catch(console.error)
            },
            {type: 'separator'},
            {
                label: 'AI Assistants',
                submenu: [
                    {
                        label: 'Duck AI (Ctrl+1)',
                        click: () => {
                            toggleVisibility(true);
                            browserWindow.webContents.send('switch-webview', 0);
                        }
                    },
                    {
                        label: 'Perplexity (Ctrl+2)',
                        click: () => {
                            toggleVisibility(true);
                            browserWindow.webContents.send('switch-webview', 1);
                        }
                    },
                    {
                        label: 'Grok (Ctrl+3)',
                        click: () => {
                            toggleVisibility(true);
                            browserWindow.webContents.send('switch-webview', 2);
                        }
                    },
                    {
                        label: 'Google Gemini (Ctrl+4)',
                        click: () => {
                            toggleVisibility(true);
                            browserWindow.webContents.send('switch-webview', 3);
                        }
                    },
                    {type: 'separator'},
                    {
                        label: 'Reload Current AI',
                        click: () => {
                            browserWindow.webContents.send('reload-current-webview');
                        }
                    }
                ]
            },
            {
                label: 'Always on Top',
                type: 'checkbox',
                checked: getValue('always-on-top', false),
                click: menuItem => {
                    store.set('always-on-top', menuItem.checked);
                    try { browserWindow.setAlwaysOnTop(menuItem.checked); } catch (e) { log.warn('setAlwaysOnTop failed', e); }
                }
            },
            {
                label: 'Show on Startup',
                type: 'checkbox',
                checked: getValue('show-on-startup', true),
                click: menuItem => store.set('show-on-startup', menuItem.checked)
            },
            {
                label: 'Launch at Login (Windows)',
                type: 'checkbox',
                checked: getLaunchAtLogin(),
                click: menuItem => setLaunchAtLogin(menuItem.checked)
            },
            {type: 'separator'},
            {
                label: 'Clear Browsing Data',
                click: () => clearBrowsingData()
            },
        ];

        if (hasUpdateReady) {
            template.push({
                label: 'Install Update and Restart',
                click: () => installUpdateAndRestart && installUpdateAndRestart()
            });
            template.push({type: 'separator'});
        } else {
            template.push({type: 'separator'});
        }

        template.push({
            label: 'Quit AiFrame',
            click: () => browserWindow.close()
        });

        const contextMenu = Menu.buildFromTemplate(template);
        tray.setContextMenu(contextMenu);
    };

    updateTrayMenu();
    tray.on('click', () => toggleVisibility(true));

    // Expose updater menu refresh to outer scope
    createTray.updateMenu = updateTrayMenu;
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
        // Ensure the app is registered to start at login on Windows
        if (process.platform === 'win32') {
            setLaunchAtLogin(getLaunchAtLogin());
        }

        createTray();
        createWindow();
        
        // Set up auto-updater
        setupAutoUpdater();
        
        // Start memory management
        startMemoryManagement();
        
        // Handle global shortcuts
        const safeRegister = (accel, handler) => {
            try {
                const ok = globalShortcut.register(accel, handler);
                if (!ok) log.warn('Failed to register shortcut', accel);
            } catch (e) { log.warn('Error registering shortcut', accel, e); }
        };

        safeRegister('CommandOrControl+G', () => {
            toggleVisibility(!visible);
        });
        // Removed global Ctrl+1-4 to avoid hijacking system shortcuts; handled locally when window is focused
        // Removed global Ctrl+R shortcut as it breaks system-wide Ctrl+R
        // Reload functionality is still available via tray menu

        // Unregister all shortcuts when the app is about to quit
        app.on('will-quit', () => {
            stopMemoryManagement();
            globalShortcut.unregisterAll();
        });
    }).catch(console.error);
}

// Add auto-update functionality
const setupAutoUpdater = () => {
    // Only use autoUpdater in production builds
    if (app.isPackaged) {
        const { autoUpdater } = require('electron-updater');
        
        // Configure logging for auto-updater
        autoUpdater.logger = log;
        autoUpdater.logger.transports.file.level = 'info';
        
        // Check for updates silently on start
        autoUpdater.checkForUpdatesAndNotify().catch(err => {
            log.error('Auto update error:', err);
        });
        
        // Set up a timer to check for updates every 6 hours
        setInterval(() => {
            autoUpdater.checkForUpdatesAndNotify().catch(err => {
                log.error('Auto update check error:', err);
            });
        }, 6 * 60 * 60 * 1000);
        
        // Handle update events
        autoUpdater.on('update-available', () => {
            log.info('Update available');
            new Notification({
                title: 'Update Available',
                body: 'A new version is being downloaded in the background.'
            }).show();
        });
        
        autoUpdater.on('update-downloaded', () => {
            log.info('Update downloaded');
            new Notification({
                title: 'Update Ready',
                body: 'A new version has been downloaded. Restart the application to apply the updates.'
            }).show();
            
            hasUpdateReady = true;
            installUpdateAndRestart = () => autoUpdater.quitAndInstall();
            if (tray && typeof createTray.updateMenu === 'function') {
                createTray.updateMenu();
            }
        });
        
        autoUpdater.on('error', (err) => {
            log.error('Auto updater error:', err);
        });
    }
};

// Check if we're running in a packaged app and apply fuses
if (app.isPackaged) {
    try {
        // Log existing fuse state for debugging
        log.info('Electron Fuse State:', {
            runAsNode: fuses.isRunAsNodeEnabled(),
            enableCookieEncryption: fuses.isCookieEncryptionEnabled(),
            enableNodeOptionsEnv: fuses.isNodeOptionsEnabled(),
            enableNodeCliInspect: fuses.isNodeCliInspectEnabled(),
            enableEmbeddedAsarIntegrityValidation: fuses.isEmbeddedAsarIntegrityValidationEnabled()
        });
    } catch (e) {
        log.warn('Unable to check fuses state:', e);
    }
}

// Register IPC handlers
ipcMain.handle('get-app-version', () => app.getVersion());

// Keybindings overlay storage handlers
ipcMain.handle('get-local-storage', (event, key) => {
    try { return store.get(key); } catch (e) { log.error('get-local-storage error', e); return null; }
});
ipcMain.on('set-local-storage', (event, key, value) => {
    try { store.set(key, value); } catch (e) { log.error('set-local-storage error', e); }
});
ipcMain.on('close', (event) => {
    try {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win && win !== browserWindow) win.close();
        else if (browserWindow) toggleVisibility(false);
    } catch (e) { log.error('close IPC error', e); }
});

