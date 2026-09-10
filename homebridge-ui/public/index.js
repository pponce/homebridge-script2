/* global homebridge, Script2Validation, Script2ConfigUtils */
'use strict';
const hb = window.homebridge;
const form = document.getElementById('settings');
const message = document.getElementById('message');
let blocks, index, config, revision = 0, syncing = false, timer, fieldId = 0;
const clone = value => JSON.parse(JSON.stringify(value));
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function feedback(text, kind = 'info') { message.className = `alert alert-${kind}`; message.textContent = text; }
function changed() {
  revision++;
  hb.disableSaveButton();
  feedback('Checking your changes…');
  clearTimeout(timer);
  timer = setTimeout(sync, 180);
}
async function sync() {
  if (syncing) return;
  syncing = true;
  try {
    while (true) {
      const current = revision;
      const result = Script2Validation.validate(config);
      if (!form.checkValidity() || !result.valid) {
        feedback(result.errors.join(' ') || 'Check the required fields and allowed number ranges.', 'warning');
        break;
      }
      const snapshot = Script2ConfigUtils.buildPluginConfig(blocks, index, config, config);
      const checked = await hb.request('/validate', snapshot[index]);
      if (current !== revision) continue;
      if (!checked.valid) { feedback(checked.errors.join(' '), 'warning'); break; }
      await hb.updatePluginConfig(snapshot);
      if (current !== revision) continue;
      blocks = snapshot;
      hb.enableSaveButton();
      feedback('Settings are ready. Use Save below to keep them.', 'success');
      break;
    }
  } catch {
    hb.disableSaveButton();
    feedback('Could not validate or synchronize settings. Edit a field to retry, or reopen this screen. Changes have not been saved.', 'danger');
  } finally { syncing = false; }
}
function field(parent, object, key, label, options = {}) {
  const wrapper = node('div', undefined, 'script2-field');
  const id = `script2-field-${++fieldId}`;
  const title = node('label', label); title.htmlFor = id;
  const input = node(options.choices ? 'select' : 'input', undefined, options.choices ? 'form-select' : 'form-control');
  input.id = id;
  if (options.choices) for (const [value, text] of options.choices) { const option = node('option', text); option.value = value; input.append(option); }
  else input.type = options.boolean ? 'checkbox' : options.seconds ? 'number' : 'text';
  input.required = !!options.required;
  if (options.seconds) {
    input.min = options.min ?? 0; input.max = 2147483.647; input.step = '0.001';
    input.value = (object[key] ?? options.default) / 1000;
  } else if (options.boolean) input.checked = object[key] ?? options.default ?? false;
  else input.value = object[key] ?? options.default ?? '';
  input.addEventListener(options.choices || options.boolean ? 'change' : 'input', () => {
    if (options.seconds) { if (input.value === '') delete object[key]; else object[key] = Math.round(Number(input.value) * 1000); }
    else if (options.boolean) object[key] = input.checked;
    else Script2ConfigUtils.setDeviceField(object, key, input.value);
    options.edit?.(); changed();
  });
  wrapper.append(title, input);
  if (options.help) { const help = node('small', options.help); help.id = `${id}-help`; input.setAttribute('aria-describedby', help.id); wrapper.append(help); }
  parent.append(wrapper);
  return { input, wrapper };
}
function details(parent, title) { const d = node('details'); d.append(node('summary', title)); parent.append(d); return d; }
function timing(parent, device, key, label, help) {
  const [min,,fallback] = Script2Validation.timings[key];
  return field(parent, device, key, `${label} (seconds)`, { seconds:true, default:fallback, min:min/1000, help });
}
function render() {
  const container = document.getElementById('devices'); container.replaceChildren();
  for (const key of ['on_off_switches', 'stateless_switches']) {
    for (const device of config[key]) {
      const stateless = key === 'stateless_switches';
      const card = details(container, device.name || (stateless ? 'New Stateless Switch' : 'New On/Off Switch'));
      card.className = 'script2-device'; card.open = !device.name;
      const grid = node('div', undefined, 'script2-grid'); card.append(grid);
      field(grid, device, 'name', 'Switch name', { required:true, edit:() => { card.querySelector('summary').textContent = device.name || 'New switch'; }, help:'Keep this name unchanged during migration; changing it creates a new HomeKit accessory.' });
      if (stateless) {
        field(grid, device, 'trigger', 'Trigger command', { required:true });
        field(grid, device, 'stateless_trigger_on', 'Run command when', { default:'on', choices:[['on','Turned On (resets Off)'],['off','Turned Off (resets On)']] });
        timing(grid, device, 'auto_reset_ms', 'Reset delay', 'After the command finishes, reset the tile. This does not send another command.');
      } else {
        field(grid, device, 'on', 'ON command', { required:true });
        field(grid, device, 'off', 'OFF command', { required:true });
        const selection = { source:device.fileState ? 'file' : 'command' };
        const source = node('div'); card.append(source);
        const drawSource = () => {
          source.replaceChildren();
          if (selection.source === 'file') {
            field(source, device, 'fileState', 'State file (absolute path)', { required:true, help:'File exists = On; absent = Off. Your scripts create/delete it. Polling is not used.' });
            if (device.state) source.append(node('p', 'A saved State command is also present. The State file takes precedence. Choosing State command explicitly removes the file setting.'));
          } else {
            field(source, device, 'state', 'State command', { required:true, help:'Print a value such as true or false. Opening or saving settings never runs this command.' });
            field(source, device, 'on_value', 'Output that means On', { default:'true', help:'Matching ignores case and surrounding whitespace.' });
          }
        };
        field(grid, selection, 'source', 'State source', { choices:[['command','State command'],['file','State file']], edit:() => { if (selection.source === 'file') delete device.state; else delete device.fileState; drawSource(); } });
        drawSource();
      }
      const advanced = details(card, 'Advanced timing and behavior');
      timing(advanced, device, 'command_timeout', 'Command timeout', 'Maximum command execution time. A timeout is a failure, not success.');
      if (!stateless) {
        timing(advanced, device, 'homekit_set_ack_timeout_ms', 'HomeKit acknowledgement', '0 waits for command completion. A positive delay acknowledges a pending request; late failure is reconciled from the state source.');
        field(advanced, device, 'polling', 'Poll the State command', { boolean:true, help:'Ignored when using a State file.' });
        timing(advanced, device, 'polling_interval', 'Polling interval', 'Used only when polling is enabled and a State command is active.');
        field(advanced, device, 'polling_on_start', 'Poll immediately on startup', { boolean:true, default:true });
        timing(advanced, device, 'state_cache_ttl_ms', 'State cache lifetime', '0 disables the TTL cache. Concurrent reads still share one running state command.');
        field(advanced, device, 'reset_state_cache_on_set', 'Reset the state cache after a successful action', { boolean:true });
        field(advanced, device, 'fail_on_state_exit_code', 'Fail state reads on a nonzero exit code', { boolean:true, help:'When off, usable output from an ordinary nonzero exit can determine state. Timeouts and terminated commands always fail.' });
      }
      field(advanced, device, 'unique_serial', 'Serial number', { help:'Optional accessory information. It does not replace the name-based HomeKit identity.' });
      const remove = node('button', 'Remove switch', 'btn btn-outline-danger btn-sm'); remove.type = 'button';
      let armed = false;
      remove.addEventListener('click', () => { if (!armed) { armed = true; remove.textContent = 'Confirm remove'; return; } config[key].splice(config[key].indexOf(device),1); render(); changed(); });
      remove.addEventListener('blur', () => { armed = false; remove.textContent = 'Remove switch'; });
      card.append(remove);
    }
  }
  if (!config.on_off_switches.length && !config.stateless_switches.length) container.append(node('p', 'No switches yet. Add an On/Off switch or a Stateless switch to get started.', 'script2-empty'));
}
async function initialize() {
  hb.disableSaveButton();
  form.addEventListener('submit', event => event.preventDefault());
  try {
    blocks = await hb.getPluginConfig();
    if (!Array.isArray(blocks)) throw new Error('Unexpected configuration response.');
    blocks = clone(blocks);
    const targets = blocks.filter(b => b?.platform === 'Script2Platform');
    const legacy = blocks.some(b => b?.accessory === 'Script2' || Script2Validation.legacyKeys.some(key => Object.hasOwn(b || {}, key)));
    if (legacy) { document.getElementById('migration').hidden = false; throw new Error('Legacy configuration detected. Back up config.json and migrate before editing.'); }
    if (targets.length > 1) throw new Error('Multiple Script2 platform blocks found. Consolidate them manually; no settings have been changed.');
    index = blocks.findIndex(b => b?.platform === 'Script2Platform');
    if (index < 0) { index = blocks.length; blocks.push({platform:'Script2Platform',name:'Script2',on_off_switches:[],stateless_switches:[]}); }
    config = clone(blocks[index]);
    for (const key of ['on_off_switches','stateless_switches']) { if (config[key] === undefined) config[key] = []; if (!Array.isArray(config[key]) || config[key].some(d => !d || typeof d !== 'object' || Array.isArray(d))) throw new Error('Invalid device list. Correct the JSON configuration; no settings have been changed.'); }
    field(document.getElementById('platform'), config, 'name', 'Platform name', { default:'Script2', required:true });
    for (const [id,key] of [['add-stateful','on_off_switches'],['add-stateless','stateless_switches']]) document.getElementById(id).addEventListener('click', () => { config[key].push({}); render(); changed(); document.getElementById('devices').querySelector('details[open] input')?.focus(); });
    form.hidden = false;
    render(); changed();
  } catch (error) { form.hidden = true; feedback(error.message || 'Could not load settings. Reopen this screen to retry.', 'danger'); }
}
void initialize();
