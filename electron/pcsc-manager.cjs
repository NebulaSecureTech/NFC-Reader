'use strict';
const {readTag,writeTag,assertWriteRequest}=require('./ndef.cjs');
const {readUid,isSupportedWriter,type2Adapter}=require('./pcsc-apdu.cjs');
const {WinScardBridge}=require('./winscard-bridge.cjs');

// UI-neutral PC/SC state machine. A bridge can be injected for tests.
class PcscManager {
  constructor(emit,bridge=null) {
    this.emit=emit;
    this.bridge=bridge||new WinScardBridge();
    this.readers=new Map();
    this.reading=false;
    this.pending=null;
    this.writeBusy=false;
    this.enabled=false;
    this.error='';
    this.closing=false;
    this.activeTasks=new Set();
  }
  status() {return {available:this.enabled,readers:[...this.readers.keys()],reading:this.reading,writing:!!this.pending||this.writeBusy,error:this.error};}
  sendStatus() {if(!this.closing)this.emit({type:'status',...this.status()});}
  async init() {
    this.bridge.on('event',event=>this.bridgeEvent(event));
    this.bridge.on('error-status',message=>{this.error=String(message);this.sendStatus();});
    this.bridge.on('unavailable',message=>{this.enabled=false;this.reading=false;this.readers.clear();this.error=String(message);this.sendStatus();});
    try {
      await this.bridge.start();
      this.enabled=true;this.error='';this.sendStatus();
    } catch (err) {
      this.enabled=false;this.error=`PC/SC non disponibile: ${err?.message||String(err)}`;
      this.sendStatus();
    }
  }
  bridgeEvent(event) {
    if(this.closing||!event)return;
    if(event.type==='readers') {
      const names=Array.isArray(event.readers)?event.readers.filter(name=>typeof name==='string'&&name):[];
      for(const name of this.readers.keys())if(!names.includes(name))this.readers.delete(name);
      for(const name of names)if(!this.readers.has(name))this.readers.set(name,{token:0,present:false,processed:0,busy:false});
      this.sendStatus();
    } else if(event.type==='present' && typeof event.reader==='string') {
      if(!this.readers.has(event.reader))this.readers.set(event.reader,{token:0,present:false,processed:0,busy:false});
      const slot=this.readers.get(event.reader);
      if(slot.token===event.token&&slot.present)return;
      slot.token=event.token;slot.present=true;slot.busy=false;slot.processed=0;
      this.error='';this.sendStatus();
      this.runTag(event.reader,slot);
    } else if(event.type==='removed') {
      const slot=this.readers.get(event.reader);
      if(slot && slot.token===event.token){slot.present=false;slot.busy=false;}
    }
  }
  runTag(name,slot) {
    if((!this.reading&&!this.pending)||slot.busy||!slot.present||slot.processed===slot.token)return;
    // Armed writes require a NEW presentation if a tag was already present.
    if(this.pending && this.pending.avoidToken?.get(name)===slot.token)return;
    slot.processed=slot.token;slot.busy=true;
    const token=slot.token;
    const task=this.processTag(name,token).catch(err=>{this.error=`${name}: ${err?.message||String(err)}`;this.sendStatus();}).finally(()=>{slot.busy=false;this.activeTasks.delete(task);this.runTag(name,slot);});
    this.activeTasks.add(task);
  }
  async processTag(name,token) {
    const card={transmit:bytes=>this.bridge.transmit(name,token,bytes)};
    const uid=await readUid(card);
    const adapter=type2Adapter(card,name);
    const stillHere=()=>{
      const slot=this.readers.get(name);
      return slot?.present && slot.token===token;
    };
    if(!stillHere())return;
    if(this.pending&&!this.writeBusy) {
      const pending=this.pending;
      if(pending.avoidToken?.get(name)===token)return;
      this.pending=null;clearTimeout(pending.timeout);
      this.writeBusy=true;this.sendStatus();
      try {
        if(!isSupportedWriter(name))throw new Error('Per scrivere serve un ACS ACR122U compatibile.');
        if(!uid)throw new Error('UID non leggibile: scrittura annullata per sicurezza.');
        const result=await writeTag(adapter,pending.data);
        if(!stillHere())throw new Error('Tag rimosso durante la verifica della scrittura.');
        this.emit({type:'write-result',ok:true,uid,reader:name,...result});
      }catch(err){this.emit({type:'write-result',ok:false,uid,reader:name,message:err?.message||'Errore scrittura PC/SC.'});}
      finally{this.writeBusy=false;this.sendStatus();}
      return;
    }
    if(!this.reading||this.writeBusy)return;
    let records=[];let ndefInfo='';
    try {const data=await readTag(adapter);records=data.records;ndefInfo=data.reason||'';}
    catch(err){ndefInfo=err?.message||'Contenuto NDEF non disponibile sul lettore.';}
    if(this.reading&&!this.writeBusy&&stillHere() && (uid||records.length)){
      this.emit({type:'reading',uid,reader:name,records,ndefInfo});
    }
  }
  startScan() {
    if(!this.enabled)return {ok:false,message:this.error||'Servizio PC/SC non disponibile.'};
    if(!this.readers.size)return {ok:false,message:'Collega un lettore NFC USB PC/SC. Verifica il driver e il servizio Smart Card.'};
    if(this.pending||this.writeBusy)return {ok:false,message:'Termina prima la scrittura.'};
    this.reading=true;this.sendStatus();
    for(const [name,slot] of this.readers)this.runTag(name,slot);
    return {ok:true};
  }
  stopScan() {this.reading=false;this.sendStatus();return {ok:true};}
  armWrite(data) {
    if(!this.enabled)return {ok:false,message:this.error||'Servizio PC/SC non disponibile.'};
    if(this.pending||this.writeBusy)return {ok:false,message:'Scrittura già in corso. Annullala prima.'};
    if(![...this.readers.keys()].some(isSupportedWriter))return {ok:false,message:'Per scrivere, collega un ACS ACR122U compatibile.'};
    try{data=assertWriteRequest(data);}catch(err){return {ok:false,message:err.message};}
    this.reading=false;
    const pending={data,timeout:null,avoidToken:new Map()};
    for(const [name,slot] of this.readers)if(slot.present)pending.avoidToken.set(name,slot.token);
    this.pending=pending;
    pending.timeout=setTimeout(()=>{
      if(this.pending!==pending)return;
      this.pending=null;this.sendStatus();
      this.emit({type:'write-result',ok:false,message:'Tempo scaduto: riprova la scrittura.'});
    },45000);
    this.sendStatus();return {ok:true};
  }
  cancelWrite() {
    if(this.writeBusy)return {ok:false,message:'Scrittura in corso: non rimuovere il tag.'};
    if(this.pending)clearTimeout(this.pending.timeout);
    this.pending=null;this.sendStatus();return {ok:true};
  }
  shutdown() {
    this.reading=false;
    if(this.pending)clearTimeout(this.pending.timeout);
    this.pending=null;
    this.closing=true;
    this.bridge.stop();
  }
}
module.exports={PcscManager};
