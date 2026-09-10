'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.SCRIPT2_BROWSER_MODULES || process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES || path.join(__dirname,'../node_modules')]}));
let server,browser,url;
test.before(async()=>{
  server=http.createServer((req,res)=>{const file=path.join(__dirname,'../homebridge-ui/public',req.url==='/'?'index.html':req.url);if(!file.startsWith(path.join(__dirname,'../homebridge-ui/public'))){res.writeHead(404).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
});
test.after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
async function pageWith(blocks,options={}) {
  const page=await browser.newPage({viewport:{width:1000,height:850}});
  await page.addInitScript(({blocks,options})=>{
    window._hb={saved:null,enabled:false,writes:[],requests:0};
    window.homebridge={getPluginConfig:async()=>{if(options.loadFail)throw Error('Load failed');return blocks;},disableSaveButton:()=>window._hb.enabled=false,enableSaveButton:()=>window._hb.enabled=true,request:async(path,body)=>{window._hb.requests++;await new Promise(r=>setTimeout(r,options.delay||0));return window.Script2Validation.validate(body);},updatePluginConfig:async value=>{await new Promise(r=>setTimeout(r,options.delay||0));window._hb.saved=JSON.parse(JSON.stringify(value));window._hb.writes.push(window._hb.saved);return value;}};
  },{blocks,options});
  await page.goto(url);return page;
}
test('fresh setup, seconds conversion, booleans and Save round-trip',async()=>{
  const page=await pageWith([]);await page.getByRole('button',{name:'Add On/Off Switch',exact:true}).click();
  await page.getByLabel('Switch name',{exact:true}).fill('Lamp');await page.getByLabel('ON command',{exact:true}).fill('/opt/on');await page.getByLabel('OFF command',{exact:true}).fill('/opt/off');await page.getByLabel('State command',{exact:true}).fill('/opt/state');
  await page.getByText('Advanced timing and behavior',{exact:true}).click();await page.getByLabel('HomeKit acknowledgement (seconds)',{exact:true}).fill('5');await page.getByLabel('State cache lifetime (seconds)',{exact:true}).fill('0');await page.getByLabel('Poll the State command',{exact:true}).check();await page.waitForFunction(()=>window._hb.enabled);
  const saved=await page.evaluate(()=>window._hb.saved);assert.equal(saved[0].on_off_switches[0].homekit_set_ack_timeout_ms,5000);assert.equal(saved[0].on_off_switches[0].state_cache_ttl_ms,0);assert.equal(saved[0].on_off_switches[0].polling,true);
  fs.mkdirSync(path.join(__dirname,'../.test-artifacts'),{recursive:true});await page.screenshot({path:path.join(__dirname,'../.test-artifacts/settings-desktop.png'),fullPage:true});
  const reopened=await pageWith(saved);await reopened.getByText('Lamp',{exact:true}).click();await reopened.getByText('Advanced timing and behavior',{exact:true}).click();assert.equal(await reopened.getByLabel('HomeKit acknowledgement (seconds)').inputValue(),'5');await page.close();await reopened.close();
});
test('legacy and failed loads do not overwrite configuration',async()=>{
  for(const [blocks,options] of [[[{platform:'Script2Platform',devices:[]}],{}],[[],{loadFail:true}]]){const page=await pageWith(blocks,options);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>window._hb.enabled),false);assert.equal(await page.evaluate(()=>window._hb.writes.length),0);assert.equal(await page.locator('#settings').isVisible(),false);await page.close();}
});
test('rapid edits during validation persist newest snapshot and preserve metadata',async()=>{
  const config={platform:'Script2Platform',name:'Script2',_bridge:{username:'AA:BB:CC:DD:EE:FF'},custom:'keep',on_off_switches:[{name:'Lamp',on:'on',off:'off',state:'state'}],stateless_switches:[]};
  const page=await pageWith([config],{delay:180});await page.getByText('Lamp',{exact:true}).click();await page.getByLabel('ON command',{exact:true}).fill('first');await page.waitForTimeout(220);await page.getByLabel('ON command',{exact:true}).fill('newest');await page.waitForFunction(()=>window._hb.enabled && window._hb.saved?.[0].on_off_switches[0].on==='newest');const saved=await page.evaluate(()=>window._hb.saved[0]);assert.equal(saved.custom,'keep');assert.equal(saved._bridge.username,config._bridge.username);await page.close();
});
test('stateless trigger-on-Off and zero reset work on mobile without overflow',async()=>{
  const page=await pageWith([]);await page.setViewportSize({width:375,height:850});await page.getByRole('button',{name:'Add Stateless Switch',exact:true}).click();await page.getByLabel('Switch name',{exact:true}).fill('Reboot');await page.getByLabel('Trigger command',{exact:true}).fill('/opt/reboot');await page.getByLabel('Run command when',{exact:true}).selectOption('off');await page.getByLabel('Reset delay (seconds)',{exact:true}).fill('0');await page.waitForFunction(()=>window._hb.enabled);const saved=await page.evaluate(()=>window._hb.saved[0].stateless_switches[0]);assert.equal(saved.auto_reset_ms,0);assert.equal(saved.stateless_trigger_on,'off');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(__dirname,'../.test-artifacts/settings-mobile.png'),fullPage:true});await page.close();
});
