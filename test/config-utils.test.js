'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildPluginConfig, setDeviceField } = require('../homebridge-ui/public/config-utils');

test('buildPluginConfig updates the platform and preserves unrelated blocks', () => {
  const accessory = { accessory: 'Script2', name: 'Legacy accessory' };
  const platform = {
    platform: 'Script2Platform',
    name: 'Script2',
    unknown_option: 'preserve-me',
    on_off_switches: [{ name: 'Old switch' }],
  };
  const blocks = [accessory, platform];
  const state = {
    on_off_switches: [{ name: 'New switch', command_timeout: 120000 }],
    stateless_switches: [],
    devices: [],
  };

  const result = buildPluginConfig(blocks, 1, platform, state);

  assert.deepEqual(result[0], accessory);
  assert.equal(result[1].unknown_option, 'preserve-me');
  assert.equal(result[1].on_off_switches[0].command_timeout, 120000);
  assert.notStrictEqual(result, blocks);
  assert.notStrictEqual(result[1], platform);
});

test('buildPluginConfig appends a new platform without removing existing blocks', () => {
  const blocks = [{ accessory: 'Script2', name: 'Legacy accessory' }];
  const result = buildPluginConfig(blocks, -1, {}, {
    on_off_switches: [],
    stateless_switches: [],
    devices: [],
  });

  assert.equal(result.length, 2);
  assert.equal(result[1].platform, 'Script2Platform');
  assert.equal(result[1].name, 'Script2');
});

test('setDeviceField stores numeric settings as numbers and deletes empty values', () => {
  const device = {};

  setDeviceField(device, 'command_timeout', '120000');
  assert.equal(device.command_timeout, 120000);
  assert.equal(typeof device.command_timeout, 'number');

  setDeviceField(device, 'command_timeout', '');
  assert.equal(Object.hasOwn(device, 'command_timeout'), false);
});
