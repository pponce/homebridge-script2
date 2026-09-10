'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {mkdtemp,writeFile,unlink,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {fork}=require('node:child_process');
const root=process.env.SCRIPT2_PACKAGE_ROOT || path.resolve(__dirname,'..');
const fromPackage=require('node:module').createRequire(path.join(root,'package.json'));
async function until(check) { const start=Date.now();while(!check()){if(Date.now()-start>3000)throw Error('Timed out');await new Promise(r=>setTimeout(r,20));} }
test('installed chokidar detects initially absent flags through the actual plugin',async()=>{
  assert.equal(typeof fromPackage('chokidar').watch,'function');
  const dir=await mkdtemp(path.join(tmpdir(),'script2-watch-'));const file=path.join(dir,'state');const updates=[];
  const plugin=require(root);plugin({hap:{Characteristic:{On:'On'},Service:{}},registerPlatform(){}});
  const log=Object.fromEntries(['debug','info','warn','error'].map(l=>[l,()=>{}]));
  const logic=new plugin.Script2DeviceLogic(log,{name:'Flag',on:'unused-on',off:'unused-off',fileState:file},()=>{throw Error('Watcher must never run commands');});
  logic.switchService={updateCharacteristic:(c,v)=>updates.push(v)};
  try {logic.startMonitoring();await new Promise((resolve,reject)=>{logic.watcher.once('ready',resolve);logic.watcher.once('error',reject);});await writeFile(file,'on');await until(()=>updates.at(-1)===true);await unlink(file);await until(()=>updates.at(-1)===false);assert.deepEqual(updates,[false,true,false]);}
  finally {logic.shutdown();await rm(dir,{recursive:true,force:true});}
});
test('packaged custom UI starts via IPC and validates configuration',async()=>{
  const child=fork(path.join(root,'homebridge-ui/server.js'),[],{stdio:['ignore','ignore','pipe','ipc']});const messages=[];let stderr='';child.stderr.on('data',d=>stderr+=d);child.on('message',m=>messages.push(m));
  try {await until(()=>messages.some(m=>m.action==='ready')||child.exitCode!==null);assert.equal(child.exitCode,null,stderr);child.send({action:'request',requestId:'check',path:'/validate',body:{platform:'Script2Platform',on_off_switches:[]}});await until(()=>messages.some(m=>m.action==='response'));const response=messages.find(m=>m.action==='response');assert.equal(response.payload.data.valid,true);}
  finally {child.kill();}
});
