(function (root, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  root.Script2ConfigUtils = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const NUMERIC_FIELDS = new Set([
    'auto_reset_ms',
    'command_timeout',
    'homekit_set_ack_timeout_ms',
    'polling_interval',
    'state_cache_ttl_ms',
  ]);

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function setDeviceField(device, field, value) {
    if (value === '') {
      delete device[field];
      return;
    }

    device[field] = NUMERIC_FIELDS.has(field) ? Number(value) : value;
  }

  function buildPluginConfig(configBlocks, targetIndex, pluginConfig, state) {
    const blocks = clone(Array.isArray(configBlocks) ? configBlocks : []);
    const next = {
      ...clone(pluginConfig || {}),
      platform: 'Script2Platform',
      name: pluginConfig?.name || 'Script2',
      on_off_switches: clone(state.on_off_switches || []),
      stateless_switches: clone(state.stateless_switches || []),
    };

    if ((state.devices || []).length > 0) {
      next.devices = clone(state.devices);
    } else {
      delete next.devices;
    }

    if (targetIndex >= 0 && targetIndex < blocks.length) {
      blocks[targetIndex] = next;
    } else {
      blocks.push(next);
    }

    return blocks;
  }

  return {
    buildPluginConfig,
    setDeviceField,
  };
}));
