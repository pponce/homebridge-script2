(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.Script2Validation = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const legacyKeys = ['devices', 'stateful_devices', 'stateless_devices', 'On/Off Switches', 'Stateless Switches'];
  const timings = { command_timeout: [100, 2147483647, 10000], homekit_set_ack_timeout_ms: [0, 2147483647, 0], polling_interval: [250, 2147483647, 5000], state_cache_ttl_ms: [0, 2147483647, 1000], auto_reset_ms: [0, 2147483647, 500] };
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  function validate(config) {
    const errors = [];
    if (!object(config)) return { valid: false, errors: ['Script2 configuration must be an object.'] };
    if (config.platform !== 'Script2Platform') errors.push('Use platform: Script2Platform.');
    for (const key of legacyKeys) if (Object.hasOwn(config, key)) errors.push(`Legacy ${key} is no longer supported. Back up config.json and follow README Migration before saving.`);
    if (config.name !== undefined && (typeof config.name !== 'string' || !config.name.trim())) errors.push('Platform name must be a nonblank string.');
    const names = new Set();
    for (const list of ['on_off_switches', 'stateless_switches']) {
      if (config[list] === undefined) continue;
      if (!Array.isArray(config[list])) { errors.push(`${list} must be an array.`); continue; }
      config[list].forEach((device, index) => {
        const label = `${list} #${index + 1}`;
        if (!object(device)) { errors.push(`${label} must be an object.`); return; }
        const required = list === 'on_off_switches' ? ['name', 'on', 'off'] : ['name', 'trigger'];
        for (const key of required) if (typeof device[key] !== 'string' || !device[key].trim()) errors.push(`${label}: ${key} is required and must be a nonblank string.`);
        if (typeof device.name === 'string') {
          if (names.has(device.name)) errors.push(`${label}: duplicate accessory name. Names must be unique across both lists.`);
          names.add(device.name);
        }
        if (Object.hasOwn(device, 'device_type')) errors.push(`${label}: remove legacy device_type; the list determines behavior.`);
        for (const key of ['state', 'fileState', 'on_value', 'unique_serial']) if (device[key] !== undefined && (typeof device[key] !== 'string' || !device[key].trim())) errors.push(`${label}: ${key} must be a nonblank string.`);
        if (list === 'on_off_switches' && !device.state && !device.fileState) errors.push(`${label}: provide a State command or State file.`);
        if (device.fileState && typeof device.fileState === 'string' && !/^(\/|[A-Za-z]:[\\/]|\\\\)/.test(device.fileState)) errors.push(`${label}: fileState must be an absolute path.`);
        for (const [key, [min, max]] of Object.entries(timings)) if (device[key] !== undefined && (!Number.isInteger(device[key]) || device[key] < min || device[key] > max)) errors.push(`${label}: ${key} must be an integer between ${min} and ${max} milliseconds.`);
        for (const key of ['polling', 'polling_on_start', 'reset_state_cache_on_set', 'fail_on_state_exit_code']) if (device[key] !== undefined && typeof device[key] !== 'boolean') errors.push(`${label}: ${key} must be true or false.`);
        if (device.stateless_trigger_on !== undefined && !['on', 'off'].includes(device.stateless_trigger_on)) errors.push(`${label}: stateless_trigger_on must be on or off.`);
      });
    }
    return { valid: errors.length === 0, errors };
  }
  return { validate, legacyKeys, timings };
}));
