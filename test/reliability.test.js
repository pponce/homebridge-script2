'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { EventEmitter } = require('node:events');
const plugin = require('../index');
const { Script2DeviceLogic, Script2Platform } = plugin;
const { validate } = require('../homebridge-ui/public/validation');
const valid = {name:'Lamp',on:'on',off:'off',state:'state'};
function harness(config = {}, executor) {
  const calls = [], logs = [];
  const log = Object.fromEntries(['debug','info','warn','error'].map(l => [l, m => logs.push([l,m])]));
  const logic = new Script2DeviceLogic(log, {...valid,...config}, executor || ((command,options,callback) => {calls.push({command,callback});}));
  return {logic,calls,logs};
}
function apiHarness() {
  const api = new EventEmitter();
  api.hap = {Service:{AccessoryInformation:'info',Switch:'switch'},Characteristic:{On:'On',Manufacturer:'M',Model:'Model',SerialNumber:'Serial'},uuid:{generate:v=>v}};
  api.created=[];api.removed=[];
  api.platformAccessory = class {
    constructor(name, uuid) {this.displayName=name;this.UUID=uuid;this.context={};this.characteristic=new EventEmitter();this.updates=[];}
    getService(type) {return type==='info'? {setCharacteristic(){return this;}} : {getCharacteristic:()=>this.characteristic, updateCharacteristic:(c,v)=>this.updates.push(v)};}
  };
  api.registerPlatformAccessories = (p,n,a) => api.created.push(...a);
  api.unregisterPlatformAccessories = (p,n,a) => api.removed.push(...a);
  api.updatePlatformAccessories = () => {};
  api.registerPlatform=()=>{};
  plugin(api);
  const log = Object.fromEntries(['debug','info','warn','error'].map(l=>[l,()=>{}]));
  return {api,log};
}
test('only a dynamic platform is registered', () => {
  let count=0;
  plugin({hap:{},registerAccessory(){throw new Error('legacy registration');},registerPlatform(p,n,ctor,dynamic){count++;assert.equal(n,'Script2Platform');assert.equal(dynamic,true);}});
  assert.equal(count,1);
});
test('validation rejects legacy aliases, duplicates and malformed values before setup', () => {
  for (const config of [null,{}, {platform:'Script2Platform',devices:[]},{platform:'Script2Platform',on_off_switches:[{...valid,on_value:true}]},{platform:'Script2Platform',on_off_switches:[valid,valid]},{platform:'Script2Platform',on_off_switches:[{...valid,polling:'false'}]},{platform:'Script2Platform',on_off_switches:[{...valid,command_timeout:NaN}]}]) assert.equal(validate(config).valid,false);
  assert.equal(validate({platform:'Script2Platform',on_off_switches:[valid],stateless_switches:[{name:'Run',trigger:'run',auto_reset_ms:0}]}).valid,true);
});
test('missing and invalid configurations register nothing and preserve cache', () => {
  for (const config of [undefined,{}, {platform:'Script2Platform'}, {platform:'Script2Platform',devices:[valid]}, {platform:'Script2Platform',on_off_switches:[{name:'bad'}]}]) {
    const {api,log}=apiHarness(); const p=new Script2Platform(log,config,api);
    p.configureAccessory(new api.platformAccessory('Old','old')); api.emit('didFinishLaunching');
    assert.equal(api.created.length,0);assert.equal(api.removed.length,0);assert.equal(p.instances.size,0);
  }
});
test('canonical platform preserves UUID and explicit empty lists remove only its cache', () => {
  const {api,log}=apiHarness(); const p=new Script2Platform(log,{platform:'Script2Platform',on_off_switches:[valid]},api);
  const cached=new api.platformAccessory('Lamp','homebridge-script2:Lamp'); p.configureAccessory(cached);api.emit('didFinishLaunching');
  assert.equal(api.created.length,0);assert.equal(p.accessories.get(cached.UUID),cached);
  p.config.on_off_switches=[];p.discoverDevices();assert.deepEqual(api.removed,[cached]);
});
test('partial setup failure stops created instances and preserves cached accessories', () => {
  const {api,log}=apiHarness();const p=new Script2Platform(log,{platform:'Script2Platform',on_off_switches:[valid,{...valid,name:'Second'}]},api);
  let count=0;api.registerPlatformAccessories=()=>{if(++count===2)throw new Error('failure');};
  const old=new api.platformAccessory('Old','old');p.configureAccessory(old);api.emit('didFinishLaunching');
  assert.equal(api.removed.length,0);assert.equal(p.instances.get('homebridge-script2:Lamp').stopped,true);
});
test('synchronous executor failure resolves GET and SET and releases queues', () => {
  const {logic}=harness({},()=>{throw new Error('secret command');});let count=0;
  logic.setState(true,e=>{assert.ok(e);count++;});logic.getState(e=>{assert.ok(e);count++;});
  assert.equal(count,2);assert.equal(logic.inFlightSet,null);assert.equal(logic.inFlightStateRequest,null);
});
test('one throwing or rejecting GET subscriber does not block other subscribers', async () => {
  const {logic,calls}=harness();let count=0;
  logic.getState(()=>{throw new Error('subscriber');});logic.getState(async()=>{throw new Error('async subscriber');});logic.getState(()=>count++);
  calls[0].callback(null,'true','');await new Promise(r=>setImmediate(r));assert.equal(count,1);
});
test('timeout with usable partial stdout is still a read failure', () => {
  const {logic,calls}=harness();let error;
  logic.getState(e=>{error=e;});calls[0].callback(Object.assign(new Error('timeout'),{killed:true}),'true','');
  assert.ok(error);assert.equal(logic.lastStateRead,null);
});
test('an ordinary nonzero state exit remains configurable', () => {
  for(const strict of [false,true]) {const {logic,calls}=harness({fail_on_state_exit_code:strict});let error,value;logic.getState((e,v)=>{error=e;value=v;});calls[0].callback(Object.assign(new Error('nonzero'),{code:1}),'true','');assert.equal(!!error,strict);if(!strict)assert.equal(value,true);}
});
test('file notifications update presentation without any ON/OFF command', () => {
  apiHarness();const {logic,calls}=harness({fileState:'/tmp/script2-test-nonexistent',state:undefined});const watcher=new EventEmitter();let closed=0;watcher.close=async()=>closed++;
  logic.watchFactory=()=>watcher;const updates=[];logic.switchService={updateCharacteristic:(c,v)=>updates.push(v)};
  logic.startMonitoring();watcher.emit('add',logic.fileState);watcher.emit('unlink',logic.fileState);assert.doesNotThrow(()=>watcher.emit('error',new Error('watch error')));
  assert.deepEqual(updates.slice(-2),[true,false]);assert.equal(calls.length,0);logic.shutdown();assert.equal(closed,1);watcher.emit('add',logic.fileState);assert.equal(updates.at(-1),false);
});
test('shutdown resolves pending GET/SET and never starts a queued command', () => {
  const {logic,calls}=harness();let results=[];
  logic.setState(true,e=>results.push(e));logic.setState(false,e=>results.push(e));logic.getState(e=>results.push(e));logic.shutdown();
  assert.equal(results.length,3);assert.ok(results.every(e=>e instanceof Error));calls[0].callback(null,'','');assert.equal(calls.length,1);assert.equal(results.length,3);assert.equal(logic.deadlines.size,0);
});
test('stateless duplicate activation executes once and zero reset is retained', async () => {
  apiHarness();const {logic,calls}=harness({device_type:'stateless',trigger:'trigger',auto_reset_ms:0});const updates=[];logic.switchService={updateCharacteristic:(c,v)=>updates.push(v)};let count=0;
  logic.setStatelessTrigger(true,()=>count++);logic.setStatelessTrigger(true,()=>count++);assert.equal(calls.length,1);calls[0].callback(null,'','');await new Promise(r=>setTimeout(r,10));assert.equal(count,2);assert.deepEqual(updates,[false]);logic.shutdown();
});
test('command diagnostics and failing loggers do not leak or replay commands', () => {
  const {logic,calls,logs}=harness({on:'secret-password'});logic.setState(true,()=>{});calls[0].callback(new Error('secret-password'),'secret-password','secret-password');assert.ok(!JSON.stringify(logs).includes('secret-password'));
  const bad=Object.fromEntries(['debug','info','warn','error'].map(l=>[l,()=>{throw new Error('logger');}]));let done=0;
  const d=new Script2DeviceLogic(bad,valid,(c,o,cb)=>cb(null,'',''));d.setState(true,()=>done++);assert.equal(done,1);
});
test('real external process deadline is bounded and does not use partial output', async () => {
  const {logic}=harness({command_timeout:100,state:`"${process.execPath}" -e "console.log('true');setTimeout(()=>{},10000)"`},require('node:child_process').exec);
  const error=await new Promise(resolve=>logic.getState(resolve));assert.ok(error);assert.equal(logic.lastStateRead,null);logic.shutdown();
});
