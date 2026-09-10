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
test('installed chokidar loads and detects real state-file creation/deletion',async()=>{
  const chokidar=fromPackage('chokidar');
  const dir=await mkdtemp(path.join(tmpdir(),'script2-watch-'));const file=path.join(dir,'state');const events=[];
  const watcher=chokidar.watch(file,{ignoreInitial:true});watcher.on('add',()=>events.push('add'));watcher.on('unlink',()=>events.push('unlink'));
  try {await new Promise((resolve,reject)=>{watcher.once('ready',resolve);watcher.once('error',reject);});await writeFile(file,'on');await until(()=>events.includes('add'));await unlink(file);await until(()=>events.includes('unlink'));assert.deepEqual(events,['add','unlink']);}
  finally {await watcher.close();await rm(dir,{recursive:true,force:true});}
});
test('packaged custom UI starts via IPC and validates configuration',async()=>{
  const child=fork(path.join(root,'homebridge-ui/server.js'),[],{stdio:['ignore','ignore','pipe','ipc']});const messages=[];let stderr='';child.stderr.on('data',d=>stderr+=d);child.on('message',m=>messages.push(m));
  try {await until(()=>messages.some(m=>m.action==='ready')||child.exitCode!==null);assert.equal(child.exitCode,null,stderr);child.send({action:'request',requestId:'check',path:'/validate',body:{platform:'Script2Platform',on_off_switches:[]}});await until(()=>messages.some(m=>m.action==='response'));const response=messages.find(m=>m.action==='response');assert.equal(response.payload.data.valid,true);}
  finally {child.kill();}
});
