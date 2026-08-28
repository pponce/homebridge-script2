/* global homebridge, Script2ConfigUtils */

let pluginConfig = {};
let pluginConfigBlocks = [];
let pluginConfigIndex = -1;
let syncTimer = null;
let syncInProgress = false;
let syncError = null;

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

const FIELD_CONFIG = {
  on_off_switches: {
    title: 'On/Off Switches',
    description: 'Configure standard ON/OFF switches in this section.',
    fields: [
      { field: 'name', label: 'Accessory Name', required: true, help: 'Name shown in Home app for this switch.' },
      { field: 'on', label: 'ON Command', required: true, help: 'Shell command/script executed when turning the switch ON.' },
      { field: 'off', label: 'OFF Command', required: true, help: 'Shell command/script executed when turning the switch OFF.' },
      { field: 'state', label: 'State Command', required: false, help: 'Command that prints current state value (for example true/false). Required if State File Path is not set.' },
      { field: 'fileState', label: 'State File Path', required: false, help: 'If set, ON/OFF state is determined by file existence. Required if State Command is not set.' },
      { field: 'command_timeout', label: 'Command Timeout (ms)', required: false, type: 'number', min: 100, help: 'Maximum time an external command can run before it is terminated. Defaults to 10000 ms.' },
      { field: 'homekit_set_ack_timeout_ms', label: 'HomeKit Set Acknowledgement (ms)', required: false, type: 'number', min: 0, help: 'Acknowledge a still-running ON/OFF request after this delay to avoid controller timeouts. Defaults to 5000 ms; set 0 to wait for command completion.' },
    ],
  },

  stateless_switches: {
    title: 'Stateless Switches',
    description: 'Configure stateless switch device in this section.',
    fields: [
      { field: 'name', label: 'Accessory Name', required: true, help: 'Name shown in Home app for this trigger switch.' },
      { field: 'trigger', label: 'Trigger Command', required: true, help: 'Command/script executed when the stateless trigger is activated.' },
      { field: 'auto_reset_ms', label: 'Auto Reset Delay (ms)', required: false, type: 'number', min: 0, help: 'Delay in milliseconds before the switch tile automatically resets.' },
      { field: 'command_timeout', label: 'Command Timeout (ms)', required: false, type: 'number', min: 100, help: 'Maximum time an external command can run before it is terminated. Defaults to 10000 ms.' },
      { field: 'stateless_trigger_on', label: 'Stateless Trigger On', required: false, help: 'Choose whether trigger runs on ON or OFF action.' },
    ],
  },

  devices: {
    title: 'Legacy Devices Config',
    description: 'Legacy compatibility list. Entries are treated as On/Off switches.',
    fields: [
      { field: 'name', label: 'Accessory Name', required: true, help: 'Legacy device accessory name.' },
      { field: 'on', label: 'ON Command', required: true, help: 'Command executed when turning this legacy switch ON.' },
      { field: 'off', label: 'OFF Command', required: true, help: 'Command executed when turning this legacy switch OFF.' },
      { field: 'state', label: 'State Command', required: false, help: 'Required if State File Path is not set.' },
      { field: 'fileState', label: 'State File Path', required: false, help: 'Required if State Command is not set.' },
      { field: 'command_timeout', label: 'Command Timeout (ms)', required: false, type: 'number', min: 100, help: 'Maximum time an external command can run before it is terminated. Defaults to 10000 ms.' },
      { field: 'homekit_set_ack_timeout_ms', label: 'HomeKit Set Acknowledgement (ms)', required: false, type: 'number', min: 0, help: 'Acknowledge a still-running ON/OFF request after this delay to avoid controller timeouts. Defaults to 5000 ms; set 0 to wait for command completion.' },
    ],
  },
};

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  Object.entries(props).forEach(([k, v]) => {
    if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else {
      node.setAttribute(k, v);
    }
  });

  children.forEach(c => node.appendChild(c));
  return node;
}

function textInput(value, onChange, type = 'text', min) {
  return el('input', {
    value: value ?? '',
    type,
    ...(min === undefined ? {} : { min }),
    oninput: (e) => {
      onChange(e.target.value);
      configChanged();
    },
  });
}

function selectInput(value, options, onChange) {
  const node = el('select', {
    onchange: (e) => {
      onChange(e.target.value);
      configChanged();
    },
  });

  options.forEach((opt) => {
    const option = el('option', { value: opt.value, text: opt.label });

    if ((value || '') === opt.value) {
      option.selected = true;
    }

    node.appendChild(option);
  });

  return node;
}

function renderDeviceRow(device, key, idx, fields) {
  const title = device.name && String(device.name).trim().length > 0
    ? device.name
    : `New ${key === 'stateless_switches' ? 'Stateless Trigger' : 'Stateful Switch'}`;

  const details = el('details', { class: 'device' });

  const summary = el('summary', {}, [
    el('span', { text: title }),
    el('span', { text: 'Edit' }),
  ]);

  details.appendChild(summary);

  const row = el('div', { class: 'device-body' });

  fields.forEach(({ field, label, required, help, type, min }) => {
    const labelNode = el('label', { text: label });

    if (required) {
      labelNode.appendChild(el('span', { class: 'req', text: '*' }));
    }

    row.appendChild(labelNode);

    if (field === 'stateless_trigger_on') {
      row.appendChild(selectInput(
        device[field] || 'on',
        [
          { value: 'on', label: 'Trigger on On' },
          { value: 'off', label: 'Trigger on Off' },
        ],
        (v) => {
          Script2ConfigUtils.setDeviceField(state[key][idx], field, v);
        }
      ));
    } else {
      row.appendChild(textInput(
        device[field],
        (v) => {
          Script2ConfigUtils.setDeviceField(state[key][idx], field, v);
        },
        type,
        min,
      ));
    }

    if (help) {
      row.appendChild(el('div', {
        class: 'field-help',
        text: help,
      }));
    }
  });

  row.appendChild(el('button', {
    class: 'btn btn-remove',
    text: 'Remove Device',
    onclick: () => {
      state[key].splice(idx, 1);
      openSections[key] = true;
      render();
      configChanged();
    },
  }));

  details.appendChild(row);

  return details;
}

function renderSection(title, description, key, fields) {
  const sectionProps = {
    class: 'section',
    ontoggle: (e) => {
      openSections[key] = e.target.open;
    },
  };

  if (openSections[key]) {
    sectionProps.open = '';
  }

  const section = el('details', sectionProps);

  section.appendChild(el('summary', {
    text: title,
  }));

  const content = el('div', {
    class: 'section-content',
  });

  content.appendChild(el('div', {
    class: 'section-desc',
    text: description,
  }));

  (state[key] || []).forEach((d, i) => {
    content.appendChild(
      renderDeviceRow(d, key, i, fields)
    );
  });

  const addLabel = key === 'stateless_switches'
    ? 'Add Stateless Switch Device'
    : key === 'on_off_switches'
      ? 'Add On/Off Switch Device'
      : 'Add Legacy Switch Device';

  content.appendChild(el('button', {
    class: 'btn btn-add',
    text: addLabel,
    onclick: () => {
      state[key].push({});
      openSections[key] = true;
      render();
      configChanged();
    },
  }));

  section.appendChild(content);

  return section;
}

function render() {
  const app = document.getElementById('app');

  app.innerHTML = '';

  app.appendChild(
    renderSection(
      FIELD_CONFIG.on_off_switches.title,
      FIELD_CONFIG.on_off_switches.description,
      'on_off_switches',
      FIELD_CONFIG.on_off_switches.fields,
    )
  );

  app.appendChild(
    renderSection(
      FIELD_CONFIG.stateless_switches.title,
      FIELD_CONFIG.stateless_switches.description,
      'stateless_switches',
      FIELD_CONFIG.stateless_switches.fields,
    )
  );

  if ((state.devices || []).length > 0) {
    app.appendChild(
      renderSection(
        FIELD_CONFIG.devices.title,
        FIELD_CONFIG.devices.description,
        'devices',
        FIELD_CONFIG.devices.fields,
      )
    );
  } else {
    openSections.devices = false;
  }

  updateValidationPanel();
}

async function load() {
  const config = await homebridge.getPluginConfig();

  if (Array.isArray(config)) {
    pluginConfigBlocks = JSON.parse(JSON.stringify(config));
    pluginConfigIndex = pluginConfigBlocks.findIndex(
      (entry) => entry && entry.platform === 'Script2Platform'
    );
    pluginConfig = pluginConfigIndex >= 0
      ? pluginConfigBlocks[pluginConfigIndex]
      : {};
  } else {
    pluginConfigBlocks = [];
    pluginConfigIndex = -1;
    pluginConfig = {};
  }

  state.on_off_switches = Array.isArray(pluginConfig.on_off_switches)
    ? JSON.parse(JSON.stringify(pluginConfig.on_off_switches))
    : [];

  state.stateless_switches = Array.isArray(pluginConfig.stateless_switches)
    ? JSON.parse(JSON.stringify(pluginConfig.stateless_switches))
    : [];

  state.devices = Array.isArray(pluginConfig.devices)
    ? JSON.parse(JSON.stringify(pluginConfig.devices))
    : [];

  openSections.on_off_switches = false;
  openSections.stateless_switches = false;
  openSections.devices = false;

  render();
}

function validateRequiredFields() {
  const errors = [];

  const validateNumber = (device, field, label, minimum) => {
    if (device[field] === undefined) {
      return;
    }

    if (!Number.isInteger(device[field]) || device[field] < minimum) {
      errors.push(`${label} must be an integer of at least ${minimum} ms.`);
    }
  };

  (state.on_off_switches || []).forEach((d, i) => {
    if (!d?.name) {
      errors.push(`On/Off #${i + 1}: Accessory Name is required.`);
    }

    if (!d?.on) {
      errors.push(`On/Off #${i + 1}: ON Command is required.`);
    }

    if (!d?.off) {
      errors.push(`On/Off #${i + 1}: OFF Command is required.`);
    }

    if (!d?.state && !d?.fileState) {
      errors.push(
        `On/Off #${i + 1}: set State Command or State File Path.`
      );
    }

    validateNumber(d, 'command_timeout', `On/Off #${i + 1}: Command Timeout`, 100);
    validateNumber(d, 'homekit_set_ack_timeout_ms', `On/Off #${i + 1}: HomeKit Set Acknowledgement`, 0);
  });

  (state.stateless_switches || []).forEach((d, i) => {
    if (!d?.name) {
      errors.push(`Stateless #${i + 1}: Accessory Name is required.`);
    }

    if (!d?.trigger) {
      errors.push(`Stateless #${i + 1}: Trigger Command is required.`);
    }

    validateNumber(d, 'auto_reset_ms', `Stateless #${i + 1}: Auto Reset Delay`, 0);
    validateNumber(d, 'command_timeout', `Stateless #${i + 1}: Command Timeout`, 100);
  });

  (state.devices || []).forEach((d, i) => {
    if (!d?.name) {
      errors.push(`Legacy #${i + 1}: Accessory Name is required.`);
    }

    if (!d?.on) {
      errors.push(`Legacy #${i + 1}: ON Command is required.`);
    }

    if (!d?.off) {
      errors.push(`Legacy #${i + 1}: OFF Command is required.`);
    }

    if (!d?.state && !d?.fileState) {
      errors.push(
        `Legacy #${i + 1}: set State Command or State File Path.`
      );
    }

    validateNumber(d, 'command_timeout', `Legacy #${i + 1}: Command Timeout`, 100);
    validateNumber(d, 'homekit_set_ack_timeout_ms', `Legacy #${i + 1}: HomeKit Set Acknowledgement`, 0);
  });

  return errors;
}

function updateValidationPanel() {
  validationErrors = validateRequiredFields();

  const panel = document.getElementById('validation');
  const icon = document.getElementById('statusIcon');

  if (!panel || !icon) {
    return;
  }

  if (validationErrors.length === 0 && !syncError) {
    icon.className = 'status-icon ok';
    icon.textContent = '✓';
    icon.title = 'Configuration is valid';
    icon.onclick = null;

    showValidationDetails = false;
    panel.style.display = 'none';
    panel.innerHTML = '';

    if (!syncTimer && !syncInProgress) {
      homebridge.enableSaveButton();
    }

    return;
  }

  homebridge.disableSaveButton();

  icon.className = 'status-icon error';
  icon.textContent = '⚠';
  const issueCount = validationErrors.length + (syncError ? 1 : 0);
  icon.title = `Configuration errors (${issueCount}) — click to view`;

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

  panel.textContent = `Configuration errors (${issueCount})`;

  const ul = document.createElement('ul');

  validationErrors.forEach((error) => {
    const li = document.createElement('li');
    li.textContent = error;
    ul.appendChild(li);
  });

  if (syncError) {
    const li = document.createElement('li');
    li.textContent = `Unable to synchronize configuration: ${syncError.message}`;
    ul.appendChild(li);
  }

  panel.appendChild(ul);
}

function configChanged() {
  syncError = null;
  homebridge.disableSaveButton();
  updateValidationPanel();

  if (validationErrors.length > 0) {
    return;
  }

  if (syncTimer) {
    clearTimeout(syncTimer);
  }

  syncTimer = setTimeout(synchronizeConfig, 250);
}

async function synchronizeConfig() {
  syncTimer = null;
  syncInProgress = true;
  homebridge.disableSaveButton();

  const nextBlocks = Script2ConfigUtils.buildPluginConfig(
    pluginConfigBlocks,
    pluginConfigIndex,
    pluginConfig,
    state,
  );

  try {
    const updatedConfig = await homebridge.updatePluginConfig(nextBlocks);
    pluginConfigBlocks = Array.isArray(updatedConfig)
      ? JSON.parse(JSON.stringify(updatedConfig))
      : nextBlocks;
    pluginConfigIndex = pluginConfigBlocks.findIndex(
      (entry) => entry && entry.platform === 'Script2Platform'
    );
    pluginConfig = pluginConfigBlocks[pluginConfigIndex];
    syncError = null;
  } catch (error) {
    syncError = error instanceof Error ? error : new Error(String(error));
    showValidationDetails = true;
  } finally {
    syncInProgress = false;
    updateValidationPanel();
  }
}

load();
