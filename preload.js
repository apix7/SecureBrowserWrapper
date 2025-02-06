const { contextBridge, ipcRenderer } = require('electron');

// Define valid IPC channels
const validChannels = ['get-local-storage', 'set-local-storage', 'close'];

// Expose a secure API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    getLocalStorage: (key) => ipcRenderer.invoke('get-local-storage', key),
    setLocalStorage: (key, value) => ipcRenderer.send('set-local-storage', key, value),
    close: () => ipcRenderer.send('close'),

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