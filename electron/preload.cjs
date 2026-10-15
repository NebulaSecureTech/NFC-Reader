'use strict';
const {contextBridge,ipcRenderer}=require('electron');
// Deliberately narrow IPC bridge. Never expose ipcRenderer, require or generic channels.
contextBridge.exposeInMainWorld('nfcDesktop',Object.freeze({
  getStatus:()=>ipcRenderer.invoke('nfc:status'),
  startScan:()=>ipcRenderer.invoke('nfc:scan:start'),
  stopScan:()=>ipcRenderer.invoke('nfc:scan:stop'),
  startWrite:request=>ipcRenderer.invoke('nfc:write:start',{kind:request?.kind,value:request?.value}),
  cancelWrite:()=>ipcRenderer.invoke('nfc:write:cancel'),
  onEvent:callback=>{
    if(typeof callback!=='function') return ()=>{};
    const listener=(_event,data)=>callback(data);
    ipcRenderer.on('nfc:event',listener);
    return ()=>ipcRenderer.removeListener('nfc:event',listener);
  },
}));
