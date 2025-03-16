const {app, Tray, Menu, shell, BrowserWindow, screen, Notification, session, fuses, globalShortcut, ipcMain} = require('electron'),
      path = require('path'),
      Store = require('electron-store'),
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

// Function to minimize memory usage
const reduceMemoryUsage = () => {
    if (!browserWindow || !browserWindow.webContents) return;
    
    try {
        // Minimize memory usage by clearing cache when appropriate
        browserWindow.webContents.session.clearCache();
        
        // Force a garbage collection if node was started with --expose-gc
        if (global.gc) {
            global.gc();
        }
    } catch (error) {
        console.error('Error reducing memory usage:', error);
    }
};

// Set up a periodic memory optimization task (every 10 minutes)
let memoryInterval;
const startMemoryManagement = () => {
    // Clear any existing interval
    if (memoryInterval) {
        clearInterval(memoryInterval);
    }
    
    // Run memory optimization every 10 minutes
    memoryInterval = setInterval(() => {
        if (!visible) { // Only run when app is not visible to avoid disrupting user
            reduceMemoryUsage();
        }
    }, 10 * 60 * 1000); // 10 minutes
};

const stopMemoryManagement = () => {
    if (memoryInterval) {
        clearInterval(memoryInterval);
        memoryInterval = null;
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
        icon: path.join(__dirname, 'icon.png'),
        show: getValue('show-on-startup', true),
        webPreferences: {
            contextIsolation: true,
            sandbox: true,
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
    
    // Verify WebView options before creation
    browserWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
        // Verify URL being loaded is one of our approved URLs
        const allowedURLs = [
            'https://duck.ai',
            'https://grok.com',
            'https://gemini.google.com'
        ];
        
        // Check if the URL starts with any of our allowed URLs
        const isAllowedURL = allowedURLs.some(url => params.src.startsWith(url));
        
        if (!isAllowedURL) {
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
        
        // Set secure session permissions
        browserWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
            // Deny all permission requests from webviews
            const allowedPermissions = ['fullscreen'];
            callback(allowedPermissions.includes(permission));
        });
        
        log.info('Webview attached with secure settings', { url: params.src });
    });

    // Control navigation within webviews
    browserWindow.webContents.on('will-navigate', (event, url) => {
        const parsedUrl = new URL(url);
        const allowedHosts = ['duck.ai', 'grok.com', 'gemini.google.com'];
        
        // Block navigation to anything but allowed hosts
        if (!allowedHosts.some(host => parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`))) {
            log.warn(`Blocked navigation to: ${url}`);
            event.preventDefault();
        }
    });

    // Listen for new windows and control them
    browserWindow.webContents.setWindowOpenHandler((details) => {
        const parsedUrl = new URL(details.url);
        const allowedHosts = ['duck.ai', 'grok.com', 'gemini.google.com'];
        
        // Only allow creation of new windows for our allowed domains
        if (allowedHosts.some(host => parsedUrl.hostname === host || parsedUrl.hostname.endsWith(`.${host}`))) {
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
                shell.openExternal(details.url);
            });
        }
        
        return { action: 'deny' };
    });

    // Register global shortcuts to switch between webviews
    globalShortcut.register('CommandOrControl+1', () => {
        log.info('Switching to Duck AI webview');
        browserWindow.webContents.send('switch-webview', 0);
    });
    
    globalShortcut.register('CommandOrControl+2', () => {
        log.info('Switching to Grok webview');
        browserWindow.webContents.send('switch-webview', 1);
    });
    
    globalShortcut.register('CommandOrControl+3', () => {
        log.info('Switching to Gemini webview');
        browserWindow.webContents.send('switch-webview', 2);
    });
    
    // Add a shortcut to reload the current webview
    globalShortcut.register('CommandOrControl+R', () => {
        log.info('Reloading current webview');
        browserWindow.webContents.send('reload-current-webview');
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
    tray = new Tray(path.join(__dirname, 'icon.png'));
    const contextMenu = Menu.buildFromTemplate([
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
                    label: 'Grok (Ctrl+2)',
                    click: () => {
                        toggleVisibility(true);
                        browserWindow.webContents.send('switch-webview', 1);
                    }
                },
                {
                    label: 'Google Gemini (Ctrl+3)',
                    click: () => {
                        toggleVisibility(true);
                        browserWindow.webContents.send('switch-webview', 2);
                    }
                },
                {type: 'separator'},
                {
                    label: 'Reload Current AI (Ctrl+R)',
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
        
        // Set up auto-updater
        setupAutoUpdater();
        
        // Start memory management
        startMemoryManagement();
        
        // Handle the global shortcut by toggling visibility
        const { globalShortcut } = require('electron');
        globalShortcut.register('CommandOrControl+G', () => {
            toggleVisibility(!visible);  // Toggle based on current state
        });

        // Add shortcuts for switching between different websites
        globalShortcut.register('Control+1', () => {
            if (browserWindow && browserWindow.webContents) {
                browserWindow.webContents.send('switch-webview', 0);
                toggleVisibility(true);
            }
        });

        globalShortcut.register('Control+2', () => {
            if (browserWindow && browserWindow.webContents) {
                browserWindow.webContents.send('switch-webview', 1);
                toggleVisibility(true);
            }
        });

        globalShortcut.register('Control+3', () => {
            if (browserWindow && browserWindow.webContents) {
                browserWindow.webContents.send('switch-webview', 2);
                toggleVisibility(true);
            }
        });

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
            
            // Add update option to tray menu
            if (tray) {
                const contextMenu = tray.getContextMenu();
                const menuItems = contextMenu.items;
                const hasUpdateItem = menuItems.some(item => item.label === 'Install Update and Restart');
                
                if (!hasUpdateItem) {
                    // Create a new context menu with the update item
                    const newMenuItems = [...menuItems];
                    // Add before the last separator and quit item
                    newMenuItems.splice(newMenuItems.length - 2, 0, {
                        label: 'Install Update and Restart',
                        click: () => {
                            autoUpdater.quitAndInstall();
                        }
                    });
                    
                    const newContextMenu = Menu.buildFromTemplate(newMenuItems);
                    tray.setContextMenu(newContextMenu);
                }
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
ipcMain.handle('get-app-version', () => {
    return app.getVersion();
});

// Clean up global shortcuts when app is quitting
app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});
