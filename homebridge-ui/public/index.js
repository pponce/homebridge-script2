/* global homebridge */

let pluginConfig = {};

const state = {
  on_off_switches: [],
  stateless_switches: [],
  devices: [],
};

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  });
  children.forEach(c => node.appendChild(c));
  return node;
}

function textInput(value, onChange) {
  return el('input', { value: value || '', oninput: (e) => onChange(e.target.value) });
}

function renderDeviceRow(device, key, idx, fields) {
  const row = el('div', { class: 'row' });
  fields.forEach(([field, label]) => {
    row.appendChild(el('label', { text: label }));
    row.appendChild(textInput(device[field], (v) => { state[key][idx][field] = v; }));
  });
  row.appendChild(el('button', { text: 'Remove', onclick: () => { state[key].splice(idx, 1); render(); } }));
  return row;
}

function renderSection(title, key, fields) {
  const section = el('div');
  section.appendChild(el('h3', { text: title }));

  (state[key] || []).forEach((d, i) => section.appendChild(renderDeviceRow(d, key, i, fields)));

  section.appendChild(el('button', {
    text: `Add ${title.slice(0, -1)}`,
    onclick: () => { state[key].push({}); render(); },
  }));

  return section;
}

function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  app.appendChild(renderSection('On/Off Switches', 'on_off_switches', [
    ['name', 'Accessory Name'], ['on', 'ON Command'], ['off', 'OFF Command'], ['state', 'State Command'], ['fileState', 'State File Path'],
  ]));

  app.appendChild(renderSection('Stateless Switches', 'stateless_switches', [
    ['name', 'Accessory Name'], ['trigger', 'Trigger Command'], ['auto_reset_ms', 'Auto Reset Delay (ms)'], ['stateless_trigger_on', 'Stateless Trigger On (on/off)'],
  ]));

  if ((state.devices || []).length > 0) {
    app.appendChild(renderSection('Legacy Devices Config', 'devices', [
      ['name', 'Accessory Name'], ['on', 'ON Command'], ['off', 'OFF Command'], ['state', 'State Command'], ['fileState', 'State File Path'],
    ]));
  }
}

async function load() {
  const config = await homebridge.getPluginConfig();
  pluginConfig = (config && config[0]) ? config[0] : {};

  state.on_off_switches = Array.isArray(pluginConfig.on_off_switches) ? pluginConfig.on_off_switches : [];
  state.stateless_switches = Array.isArray(pluginConfig.stateless_switches) ? pluginConfig.stateless_switches : [];
  state.devices = Array.isArray(pluginConfig.devices) ? pluginConfig.devices : [];

  render();
}

async function save() {
  const next = {
    ...pluginConfig,
    platform: 'Script2Platform',
    name: pluginConfig.name || 'Script2',
    on_off_switches: state.on_off_switches,
    stateless_switches: state.stateless_switches,
  };

  if (state.devices.length > 0) next.devices = state.devices;
  else delete next.devices;

  await homebridge.updatePluginConfig([next]);
  await homebridge.savePluginConfig();
}

document.getElementById('saveBtn').addEventListener('click', save);
load();
