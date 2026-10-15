import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const scope = 'https://example.org/nfc-reader/';
const source = fs.readFileSync(path.join(root,'sw.js'),'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');

function setup() {
  const listeners = new Map(), cachesMap = new Map(), stats = {skipped:0, claimed:0, network:0};
  const caches = {
    async open(key) {
      if(!cachesMap.has(key)) cachesMap.set(key,new Map());
      const entries=cachesMap.get(key);
      return {
        async addAll(requests) {
          for(const request of requests) {
            const url = new URL(request.url);
            const file = path.join(root, url.pathname.slice(new URL(scope).pathname.length) || 'index.html');
            assert.ok(fs.existsSync(file), `Precache file missing: ${file}`);
            entries.set(request.url,fs.readFileSync(file,'utf8'));
          }
        },
        async match(request) {return entries.get(request.url || String(request));},
      };
    },
    async keys(){ return [...cachesMap.keys()]; },
    async delete(key){ return cachesMap.delete(key); },
  };
  vm.runInNewContext(source, {
    self:{registration:{scope},addEventListener(k,fn){listeners.set(k,fn);},skipWaiting(){stats.skipped++;},clients:{async claim(){stats.claimed++;}}},
    caches,URL,Request,Promise,
    fetch(request) {stats.network++; return Promise.resolve(`network:${request.url}`);},
  });
  return {listeners, cachesMap, stats, async install(){let job; listeners.get('install')({waitUntil(p){job=p;}}); await job;},
    async activate(){let job;listeners.get('activate')({waitUntil(p){job=p;}});await job;},
    async get(url,mode='cors',method='GET'){let response;listeners.get('fetch')({request:{url,mode,method},respondWith(p){response=p;}});return await response;},
  };
}

test('manifest relativo e icone PWA presenti',()=>{
  for(const key of ['id','scope','start_url']) assert.equal(manifest[key],'./');
  assert.equal(manifest.display,'standalone');
  assert.ok(manifest.icons.some(i=>i.sizes==='512x512' && i.purpose==='maskable'));
  for(const icon of manifest.icons) assert.ok(fs.existsSync(path.join(root,icon.src)));
});
test('versioni degli asset coerenti, niente richieste CDN',()=>{
  assert.ok(!/(?:src|href)=[\"']https?:\/\//.test(html));
  for(const resource of ['assets/css/style.css','assets/js/app.mjs','assets/vendor/vue.global.js']) assert.ok(html.includes(`${resource}?v=1.8.0`));
  const app=fs.readFileSync(path.join(root,'assets/js/app.mjs'),'utf8');
  assert.ok(app.includes("./core.mjs?v=1.8.0"));
});
test('precache completo senza attivazione forzata',async()=>{
  const s=setup();await s.install();
  assert.equal(s.stats.skipped,0);
  assert.ok([...s.cachesMap.values()][0].size>=12);
});
test('shell e asset disponibili dalla cache senza rete (simulata)',async()=>{
  const s=setup();await s.install();
  assert.ok((await s.get(scope,'navigate')).includes('SCANSIONE CONTINUA'));
  assert.ok((await s.get(`${scope}index.html?source=pwa`,'navigate')).includes('panel-history'));
  assert.ok((await s.get(`${scope}assets/js/app.mjs?v=1.8.0`)).includes('handleReading'));
  assert.equal(s.stats.network,0);
});
test('attivazione rimuove solo le cache della stessa app',async()=>{
  const s=setup();await s.install();
  s.cachesMap.set(`nfc-reader:${scope}:old`,new Map());
  s.cachesMap.set('nfc-reader:https://example.org/other/:old',new Map());
  s.cachesMap.set('other-app',new Map());
  await s.activate();
  assert.ok(!s.cachesMap.has(`nfc-reader:${scope}:old`));
  assert.ok(s.cachesMap.has('other-app'));
  assert.ok(s.cachesMap.has('nfc-reader:https://example.org/other/:old'));
  assert.equal(s.stats.claimed,1);
});
test('aggiornamento attivato solo da messaggio esplicito',()=>{
  const s=setup();
  s.listeners.get('message')({data:{type:'OTHER'}});
  assert.equal(s.stats.skipped,0);
  s.listeners.get('message')({data:{type:'SKIP_WAITING'}});
  assert.equal(s.stats.skipped,1);
});
test('nessuna intercettazione di altre origini, altre app o POST',async()=>{
  const s=setup();await s.install();
  assert.equal(await s.get('https://external.example/a'),undefined);
  assert.equal(await s.get('https://example.org/other/a'),undefined);
  assert.equal(await s.get(scope,'cors','POST'),undefined);
});
