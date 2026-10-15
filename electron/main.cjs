'use strict';
const {app,BrowserWindow,ipcMain,protocol}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {PcscManager}=require('./pcsc-manager.cjs');
const {WinScardBridge}=require('./winscard-bridge.cjs');
// Secure, standard local origin: file:// module imports may fail CORS and localStorage.
protocol.registerSchemesAsPrivileged([{scheme:'nfc-app',privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true}}]);
let win;
const manager=new PcscManager(event=>{
  if(win && !win.isDestroyed()) win.webContents.send('nfc:event',event);
}, new WinScardBridge({packaged:app.isPackaged,resourcesPath:process.resourcesPath}));
function isTrusted(event) {return !!win && event.sender===win.webContents;}
function route(channel,handler) {ipcMain.handle(channel,(event,...args)=>isTrusted(event)?handler(...args):{ok:false,message:'Origine non autorizzata.'});}
app.whenReady().then(()=>{
  // Packaged: unpacked extraResources/web. Development: same site directory as Pages.
  const webDir=app.isPackaged?path.join(process.resourcesPath,'web'):path.resolve(__dirname,'..');
  const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.webmanifest':'application/manifest+json','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
  protocol.handle('nfc-app',async request=>{
    try {
      const url=new URL(request.url);
      if(request.method!=='GET' || url.hostname!=='bundle')return new Response('Forbidden',{status:403});
      const name=decodeURIComponent(url.pathname);
      const absolute=path.resolve(webDir,'.'+name);
      const relative=path.relative(webDir,absolute);
      if(relative.startsWith('..')||path.isAbsolute(relative)||!mime[path.extname(absolute)])return new Response('Forbidden',{status:403});
      const data=await fs.readFile(absolute);
      return new Response(data,{status:200,headers:{'content-type':mime[path.extname(absolute)],'X-Content-Type-Options':'nosniff'}});
    }catch(_){return new Response('Not found',{status:404});}
  });
  win=new BrowserWindow({
    width:1320,height:850,minWidth:1024,minHeight:720,
    backgroundColor:'#f7f8fc',title:'NFC Reader',autoHideMenuBar:true,
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true},
  });
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',(event,url)=>{
    if(url!==win.webContents.getURL()) event.preventDefault();
  });
  win.loadURL('nfc-app://bundle/index.html');
  win.on('closed',()=>{win=null;manager.shutdown();});
  route('nfc:status',()=>manager.status());
  route('nfc:scan:start',()=>manager.startScan());
  route('nfc:scan:stop',()=>manager.stopScan());
  route('nfc:write:start',data=>manager.armWrite(data));
  route('nfc:write:cancel',()=>manager.cancelWrite());
  manager.init();
});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',()=>manager.shutdown());
