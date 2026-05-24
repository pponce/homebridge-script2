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

function selectInput(value, options, onChange) {
  const node = el('select', { onchange: (e) => onChange(e.target.value) });
  options.forEach((opt) => {
    const option = el('option', { value: opt.value, text: opt.label });
    if ((value || '') === opt.value) option.selected = true;
    node.appendChild(option);
  });
  return node;
}

function renderDeviceRow(device, key, idx, fields) {
  const title = device.name && String(device.name).trim().length > 0 ? device.name : `New ${key === 'stateless_switches' ? 'Stateless Trigger' : 'Stateful Switch'}`;
  const details = el('details', { class: 'device' });
  const summary = el('summary', {}, [el('span', { text: title }), el('span', { text: 'Edit' })]);
  details.appendChild(summary);
  const row = el('div', { class: 'device-body' });
  fields.forEach(([field, label]) => {
    row.appendChild(el('label', { text: label }));
    if (field === 'stateless_trigger_on') {
      row.appendChild(selectInput(device[field] || 'on', [
        { value: 'on', label: 'Trigger on On' },
        { value: 'off', label: 'Trigger on Off' },
      ], (v) => { state[key][idx][field] = v; }));
    } else {
      row.appendChild(textInput(device[field], (v) => { state[key][idx][field] = v; }));
    }
  });
  row.appendChild(el('button', { class: 'btn btn-remove', text: 'Remove Device', onclick: () => { state[key].splice(idx, 1); render(); } }));
  details.appendChild(row);
  return details;
}

function renderSection(title, description, key, fields) {
  const section = el('details', { class: 'section' });
  section.appendChild(el('summary', { text: title }));
  const content = el('div', { class: 'section-content' });
  content.appendChild(el('div', { class: 'section-desc', text: description }));

  (state[key] || []).forEach((d, i) => content.appendChild(renderDeviceRow(d, key, i, fields)));

  content.appendChild(el('button', {
    class: 'btn btn-add',
    text: `Add ${title.slice(0, -1)} Device`,
    onclick: () => { state[key].push({}); render(); },
  }));
  section.appendChild(content);

  return section;
}

function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  app.appendChild(renderSection('On/Off Switches', 'Configure standard ON/OFF switches in this section.', 'on_off_switches', [
    ['name', 'Accessory Name'], ['on', 'ON Command'], ['off', 'OFF Command'], ['state', 'State Command'], ['fileState', 'State File Path'],
  ]));

  app.appendChild(renderSection('Stateless Switches', 'Configure stateless switch device in this section.', 'stateless_switches', [
    ['name', 'Accessory Name'], ['trigger', 'Trigger Command'], ['auto_reset_ms', 'Auto Reset Delay (ms)'], ['stateless_trigger_on', 'Stateless Trigger On (on/off)'],
  ]));

  if ((state.devices || []).length > 0) {
    app.appendChild(renderSection('Legacy Devices Config', 'Legacy compatibility list. Entries are treated as On/Off switches.', 'devices', [
      ['name', 'Accessory Name'], ['on', 'ON Command'], ['off', 'OFF Command'], ['state', 'State Command'], ['fileState', 'State File Path'],
    ]));
  }
}

async function load() {
  const config = await homebridge.getPluginConfig();
  if (Array.isArray(config)) {
    pluginConfig = config.find((entry) => entry && entry.platform === 'Script2Platform') || config[0] || {};
  } else {
    pluginConfig = {};
  }

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
