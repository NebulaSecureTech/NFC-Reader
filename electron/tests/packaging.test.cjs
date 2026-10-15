'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const root=join(__dirname,'..');
function text(name){return readFileSync(join(root,name),'utf8');}
test('Windows delivers a single portable exe with the helper bundled',()=>{
 const pkg=JSON.parse(text('package.json'));
 assert.equal(pkg.build.win.target[0],'portable');
 assert.equal(pkg.build.win.target.length,1);
 assert.equal(pkg.build.win.artifactName,'NFC-Reader-Portable-${version}-${arch}.${ext}');
 assert.ok(pkg.build.extraResources.some(e=>e.to==='pcsc/NfcPcscBridge.exe'));
 assert.ok(!pkg.dependencies || Object.keys(pkg.dependencies).length===0);
 assert.doesNotMatch(text('main.cjs'),/pcsc-mini/);
 assert.ok(text('bridge/NfcPcscBridge.cs').includes('winscard.dll'));
});
test('Windows runner builds bridge first, then portable and checks result',()=>{
 const workflow=readFileSync(join(root,'../.github/workflows/build-windows.yml'),'utf8');
 const compile=workflow.indexOf('Compila bridge WinSCard Windows');
 const packageStep=workflow.indexOf('Compila NFC Reader portable');
 assert.ok(compile>0&&packageStep>compile);
 assert.match(workflow,/NFC-Reader-Portable-1\.8\.0-x64\.exe/);
 assert.doesNotMatch(workflow,/pcsc-mini|node-gyp|npm run rebuild/);
});
