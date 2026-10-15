'use strict';
/**
 * Native Windows PC/SC through a tiny .NET Framework companion executable.
 * No .node addon, optional npm dependency, Python, VC++ Runtime, or node-gyp.
 * The companion is bundled inside Electron's portable EXE by electron-builder.
 * Every APDU request is bound to a reader + insertion generation token.
 */
const {EventEmitter}=require('node:events');
const {spawn}=require('node:child_process');
const {join}=require('node:path');
const {existsSync}=require('node:fs');
const {createInterface}=require('node:readline');

function decode(value) {return Buffer.from(value||'', 'base64').toString('utf8');}
function encode(value) {return Buffer.from(String(value),'utf8').toString('base64');}
function defaultExePath(packaged=false,resourcesPath=process.resourcesPath) {
  return packaged ? join(resourcesPath,'pcsc','NfcPcscBridge.exe') : join(__dirname,'bin','NfcPcscBridge.exe');
}
class WinScardBridge extends EventEmitter {
  constructor(options={}) {
    super();
    this.platform=options.platform||process.platform;
    this.spawnFn=options.spawnFn||spawn;
    this.exePath=options.exePath||defaultExePath(options.packaged,options.resourcesPath);
    this.existsFn=options.existsFn||existsSync;
    this.proc=null;this.rl=null;this.ready=false;this.closing=false;
    this.nextId=0;this.pending=new Map();this.stderr='';
  }
  async start(timeoutMs=9000) {
    if (this.platform!=='win32') throw new Error('La lettura PC/SC desktop richiede Windows.');
    if (!this.existsFn(this.exePath)) throw new Error('Bridge PC/SC mancante. Ricompila da GitHub Actions per includere NfcPcscBridge.exe.');
    if (this.proc) throw new Error('Bridge PC/SC già avviato.');
    return new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(err)=>{if(settled)return;settled=true;clearTimeout(timer);err?reject(err):resolve();};
      const timer=setTimeout(()=>{finish(new Error('Timeout di avvio WinSCard. Controlla il servizio Smart Card.'));this.stop();},timeoutMs);
      try {
        this.proc=this.spawnFn(this.exePath,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});
        // Writable stream errors are ASYNCHRONOUS. try/catch around write() does
        // not prevent an unhandled EPIPE when the helper exits during shutdown.
        this.proc.stdin.on('error',err=>{
          if(this.closing)return;
          finish(err);
          this.ready=false;
          this.failPending(err);
          this.emit('unavailable',`Comunicazione PC/SC interrotta: ${err.message}`);
        });
        this.rl=createInterface({input:this.proc.stdout,crlfDelay:Infinity});
        this.rl.on('line',line=>{
          if(line==='READY'){this.ready=true;finish();return;}
          if(line.startsWith('FATAL\t')){const err=new Error(decode(line.slice(6)));finish(err);this.emit('error-status',err.message);return;}
          this.handleLine(line);
        });
        this.proc.stderr.on('data',chunk=>{this.stderr=(this.stderr+chunk.toString()).slice(-1000);});
        this.proc.on('error',err=>{finish(err);this.failPending(err);this.emit('unavailable',err.message);});
        this.proc.on('exit',(code,signal)=>{
          this.ready=false;
          const err=new Error(this.closing?'Bridge arrestato.':`Servizio PC/SC terminato (${code??signal??'?'}). ${this.stderr}`.trim());
          finish(err);this.failPending(err);
          if(!this.closing)this.emit('unavailable',err.message);
          this.proc=null;
        });
      }catch(err){finish(err);}
    });
  }
  handleLine(line) {
    const parts=line.split('\t');
    if(parts[0]==='READERS') {
      this.emit('event',{type:'readers',readers:parts[1]?parts[1].split(',').map(decode):[]});
    } else if(parts[0]==='PRESENT' || parts[0]==='REMOVED') {
      const token=Number(parts[2]);
      if(!Number.isSafeInteger(token)||token<=0)return;
      const atr = parts[0] === 'PRESENT' && /^[0-9A-Fa-f]{2,72}$/.test(parts[3]||'') && (parts[3]||'').length%2===0
        ? parts[3].toUpperCase() : '';
      this.emit('event',{type:parts[0]==='PRESENT'?'present':'removed',reader:decode(parts[1]),token,atr});
    } else if(parts[0]==='ERROR') {
      this.emit('error-status',decode(parts[1]));
    } else if(parts[0]==='REPLY') {
      const pending=this.pending.get(parts[1]);
      if(!pending)return;
      clearTimeout(pending.timer);this.pending.delete(parts[1]);
      if(parts[2]==='OK' && /^[0-9a-fA-F]*$/.test(parts[3]||'') && (parts[3]||'').length%2===0) {
        pending.resolve(Buffer.from(parts[3]||'', 'hex'));
      }else pending.reject(new Error(parts[2]==='ERR'?decode(parts[3]):'Risposta PC/SC non valida.'));
    }
  }
  failPending(err) {
    for(const [,pending] of this.pending){clearTimeout(pending.timer);pending.reject(err);}
    this.pending.clear();
  }
  async transmit(reader,token,command) {
    if(!this.proc||!this.ready||this.closing)throw new Error('Servizio PC/SC non connesso.');
    if(typeof reader!=='string'||!reader||!Number.isSafeInteger(token)||token<=0)throw new Error('Lettore o tag non valido.');
    const bytes=Buffer.from(command);
    if(bytes.length<5||bytes.length>260||bytes[0]!==0xFF||![0xCA,0xB0,0xD6,0x82,0x86].includes(bytes[1]))throw new Error('Comando PC/SC non consentito.');
    const id=String(++this.nextId);
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Il lettore non ha risposto entro 10 secondi.'));},10000);
      this.pending.set(id,{resolve,reject,timer});
      try {this.proc.stdin.write(['TRANSMIT',id,encode(reader),token,bytes.toString('hex').toUpperCase()].join('\t')+'\n',err=>{
        if(err){const pending=this.pending.get(id);if(pending){clearTimeout(timer);this.pending.delete(id);reject(err);}}
      });}catch(err){clearTimeout(timer);this.pending.delete(id);reject(err);}
    });
  }
  stop() {
    this.closing=true;this.ready=false;
    this.failPending(new Error('Bridge PC/SC arrestato.'));
    if(this.proc){
      // No late writes to an already closed pipe: this was the 'write EPIPE'
      // crash on application exit. Closing the stream and terminating the child
      // also makes the Windows Smart Card handles release immediately.
      try{this.proc.stdin.destroy();}catch(_){}
      try{this.proc.kill();}catch(_){}
    }
    this.rl?.close();this.rl=null;
  }
}
module.exports={WinScardBridge,defaultExePath};
