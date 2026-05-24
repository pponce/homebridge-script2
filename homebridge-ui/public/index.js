/* global homebridge */

let pluginConfig = {};

const state = {
  on_off_switches: [],
  stateless_switches: [],
  devices: [],
};
const openSections = {
  on_off_switches: false,
  stateless_switches: false,
  devices: false,
};
let validationErrors = [];
let showValidationDetails = false;

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
  fields.forEach(({ field, label, required, help }) => {
    const labelNode = el('label', { text: label });
    if (required) labelNode.appendChild(el('span', { class: 'req', text: '*' }));
    row.appendChild(labelNode);
    if (field === 'stateless_trigger_on') {
      row.appendChild(selectInput(device[field] || 'on', [
        { value: 'on', label: 'Trigger on On' },
        { value: 'off', label: 'Trigger on Off' },
      ], (v) => { state[key][idx][field] = v; }));
    } else {
      row.appendChild(textInput(device[field], (v) => { state[key][idx][field] = v; }));
    }
    if (help) row.appendChild(el('div', { class: 'field-help', text: help }));
  });
  row.appendChild(el('button', { class: 'btn btn-remove', text: 'Remove Device', onclick: () => { state[key].splice(idx, 1); openSections[key] = true; render(); } }));
  details.appendChild(row);
  return details;
}

function renderSection(title, description, key, fields) {
  const sectionProps = { class: 'section', ontoggle: (e) => { openSections[key] = e.target.open; } };
  if (openSections[key]) sectionProps.open = '';
  const section = el('details', sectionProps);
  section.appendChild(el('summary', { text: title }));
  const content = el('div', { class: 'section-content' });
  content.appendChild(el('div', { class: 'section-desc', text: description }));

  (state[key] || []).forEach((d, i) => content.appendChild(renderDeviceRow(d, key, i, fields)));

  content.appendChild(el('button', {
    class: 'btn btn-add',
    text: `Add ${title.slice(0, -1)} Device`,
    onclick: () => { state[key].push({}); openSections[key] = true; render(); },
  }));
  section.appendChild(content);

  return section;
}

function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  app.appendChild(renderSection('On/Off Switches', 'Configure standard ON/OFF switches in this section.', 'on_off_switches', [
    { field: 'name', label: 'Accessory Name', required: true, help: 'Name shown in Home app for this switch.' },
    { field: 'on', label: 'ON Command', required: true, help: 'Shell command/script executed when turning the switch ON.' },
    { field: 'off', label: 'OFF Command', required: true, help: 'Shell command/script executed when turning the switch OFF.' },
    { field: 'state', label: 'State Command', required: false, help: 'Command that prints current state value (for example true/false). Required if State File Path is not set.' },
    { field: 'fileState', label: 'State File Path', required: false, help: 'If set, ON/OFF state is determined by file existence. Required if State Command is not set.' },
  ]));

  app.appendChild(renderSection('Stateless Switches', 'Configure stateless switch device in this section.', 'stateless_switches', [
    { field: 'name', label: 'Accessory Name', required: true, help: 'Name shown in Home app for this trigger switch.' },
    { field: 'trigger', label: 'Trigger Command', required: true, help: 'Command/script executed when the stateless trigger is activated.' },
    { field: 'auto_reset_ms', label: 'Auto Reset Delay (ms)', required: false, help: 'Delay in milliseconds before the switch tile automatically resets.' },
    { field: 'stateless_trigger_on', label: 'Stateless Trigger On', required: false, help: 'Choose whether trigger runs on ON or OFF action.' },
  ]));

  if ((state.devices || []).length > 0) {
    app.appendChild(renderSection('Legacy Devices Config', 'Legacy compatibility list. Entries are treated as On/Off switches.', 'devices', [
      ['name', 'Accessory Name'], ['on', 'ON Command'], ['off', 'OFF Command'], ['state', 'State Command'], ['fileState', 'State File Path'],
    ]));
  } else {
    openSections.devices = false;
  }
  updateValidationPanel();
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
  openSections.on_off_switches = false;
  openSections.stateless_switches = false;
  openSections.devices = false;

  render();
}

function validateRequiredFields() {
  const errors = [];
  (state.on_off_switches || []).forEach((d, i) => {
    if (!d?.name) errors.push(`On/Off #${i + 1}: Accessory Name is required.`);
    if (!d?.on) errors.push(`On/Off #${i + 1}: ON Command is required.`);
    if (!d?.off) errors.push(`On/Off #${i + 1}: OFF Command is required.`);
    if (!d?.state && !d?.fileState) errors.push(`On/Off #${i + 1}: set State Command or State File Path.`);
  });
  (state.stateless_switches || []).forEach((d, i) => {
    if (!d?.name) errors.push(`Stateless #${i + 1}: Accessory Name is required.`);
    if (!d?.trigger) errors.push(`Stateless #${i + 1}: Trigger Command is required.`);
  });
  (state.devices || []).forEach((d, i) => {
    if (!d?.name) errors.push(`Legacy #${i + 1}: Accessory Name is required.`);
    if (!d?.on) errors.push(`Legacy #${i + 1}: ON Command is required.`);
    if (!d?.off) errors.push(`Legacy #${i + 1}: OFF Command is required.`);
    if (!d?.state && !d?.fileState) errors.push(`Legacy #${i + 1}: set State Command or State File Path.`);
  });
  return errors;
}

function updateValidationPanel() {
  validationErrors = validateRequiredFields();
  const panel = document.getElementById('validation');
  const icon = document.getElementById('statusIcon');
  if (!panel || !icon) return;

  if (validationErrors.length === 0) {
    icon.className = 'status-icon ok';
    icon.textContent = '✓';
    icon.title = 'Configuration is valid';
    icon.onclick = null;
    showValidationDetails = false;
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }

  icon.className = 'status-icon error';
  icon.textContent = '⚠';
  icon.title = `Validation errors (${validationErrors.length}) — click to view`;
  icon.onclick = () => {
    showValidationDetails = !showValidationDetails;
    updateValidationPanel();
  };

  if (!showValidationDetails) {
    panel.style.display = 'none';
    panel.innerHTML = '';
    return;
  }

  panel.style.display = 'block';
  panel.innerHTML = `Validation errors (${validationErrors.length})<ul>${validationErrors.map((e) => `<li>${e}</li>`).join('')}</ul>`;
}

async function save() {
  const errors = validateRequiredFields();
  if (errors.length > 0) {
    showValidationDetails = true;
    updateValidationPanel();
    return;
  }

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

load();
