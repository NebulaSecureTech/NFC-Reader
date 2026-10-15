'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {identifyCard,unsupportedWriteMessage}=require('../card-identify.cjs');
test('ACS ATR differentiates Type 2 Ultralight from Classic 1K and 4K',()=>{
 const ul=identifyCard('3B8F8001804F0CA0000003060300030000000068');
 assert.equal(ul.kind,'type2');assert.match(ul.name,/Ultralight/);
 const classic=identifyCard('3B8F8001804F0CA000000306030001000000006A');
 assert.equal(classic.kind,'classic1k');assert.match(classic.name,/Classic 1K/);
 assert.match(unsupportedWriteMessage(classic),/Nessun dato è stato modificato/);
 assert.equal(identifyCard('3B8F8001804F0CA0000003060300020000000069').kind,'other');
});
test('Unknown ISO14443-4, missing and malformed ATR are not assumed safe to write',()=>{
 for(const atr of ['','3B86800106757781028000','bad atr','3B8F8001804F0CA00000030603FF000000000000']){
   assert.equal(identifyCard(atr).kind,'unknown');
 }
});
test('Ultralight EV1 and C recognized via PCSC card name',()=>{
 assert.equal(identifyCard('3B8F8001804F0CA00000030603003A0000000051').kind,'type2');
 assert.equal(identifyCard('3B8F8001804F0CA00000030603003D0000000056').kind,'type2');
});
