const { contextBridge, ipcRenderer } = require('electron');

// Define valid IPC channels
const validChannels = ['get-local-storage', 'set-local-storage', 'close', 'switch-webview', 'get-app-version', 'reload-current-webview'];

// Expose a secure API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    getLocalStorage: (key) => ipcRenderer.invoke('get-local-storage', key),
    setLocalStorage: (key, value) => ipcRenderer.send('set-local-storage', key, value),
    close: () => ipcRenderer.send('close'),
    
    // Add new methods for webview switching
    onSwitchWebview: (callback) => ipcRenderer.on('switch-webview', (event, ...args) => callback(event, ...args)),
    onReloadWebview: (callback) => ipcRenderer.on('reload-current-webview', (event, ...args) => callback(event, ...args)),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),

    // Additionally, generic send/receive methods with channel whitelist
    send: (channel, data) => {
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    receive: (channel, func) => {
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    }
}); 