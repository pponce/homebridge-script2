'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
(async()=>{
  const root=process.env.SCRIPT2_HB_ROOT;
  const apiFile=['dist/api.js','lib/api.js'].map(file=>path.join(root,file)).find(file=>fs.existsSync(file));
  assert.ok(apiFile,'Installed Homebridge API module was not found.');
  const {HomebridgeAPI}=await import(pathToFileURL(apiFile).href);
  const api=new HomebridgeAPI();
  let Platform, registrations=0;
  // Observe the real API instead of replacing registerPlatform with a mock.
  api.on('registerPlatform',(name,ctor,pluginIdentifier)=>{
    registrations++;
    assert.equal(name,'Script2Platform');
    assert.equal(pluginIdentifier,undefined);
    Platform=ctor;
  });
  require(process.env.SCRIPT2_PACKAGE_ROOT)(api);
  assert.equal(registrations,1);
  assert.equal(typeof Platform,'function');
  const log=Object.fromEntries(['debug','info','warn','error'].map(level=>[level,()=>{}]));
  const platform=new Platform(log,{platform:'Script2Platform',stateless_switches:[
    {name:'Cached trigger',trigger:'unused-command'},
    {name:'New trigger',trigger:'unused-command'}
  ]},api);
  assert.ok(HomebridgeAPI.isDynamicPlatformPlugin(platform));
  const cachedUUID=api.hap.uuid.generate('homebridge-script2:Cached trigger');
  const cached=new api.platformAccessory('Cached trigger',cachedUUID);
  api.registerPlatformAccessories('homebridge-script2','Script2Platform',[cached]);
  platform.configureAccessory(cached);
  const created=[],removed=[];
  api.on('registerPlatformAccessories',accessories=>created.push(...accessories));
  api.on('unregisterPlatformAccessories',accessories=>removed.push(...accessories));
  api.emit('didFinishLaunching');
  assert.equal(platform.instances.size,2);
  assert.equal(platform.accessories.get(cachedUUID),cached);
  assert.equal(created.length,1);
  assert.equal(created[0].UUID,api.hap.uuid.generate('homebridge-script2:New trigger'));
  assert.equal(created[0]._associatedPlugin,'homebridge-script2');
  assert.equal(created[0]._associatedPlatform,'Script2Platform');
  assert.equal(removed.length,0);
  for(const accessory of platform.accessories.values()) assert.ok(accessory.getService(api.hap.Service.Switch));
  api.emit('shutdown');
  assert.ok([...platform.instances.values()].every(instance=>instance.stopped));
  console.log('Installed Homebridge registration, cached accessory and startup smoke check passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
