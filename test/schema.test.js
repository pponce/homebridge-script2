'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const compileSchema = require('../scripts/check-schema.cjs');
const schema = require('../config.schema.json').schema;
const { validate: validateRuntime } = require('../homebridge-ui/public/validation.js');

test('schema checker catches the boolean required regression', () => {
  assert.doesNotThrow(() => compileSchema());
  for (const boolean of [true, false]) {
    const broken = structuredClone(schema);
    broken.properties.platform.required = boolean;
    assert.throws(() => compileSchema(broken), /required.*array/);
  }
});

test('existing platform configurations remain valid without adding or changing fields', () => {
  const validateSchema = compileSchema();
  const configurations = [
    { platform: 'Script2Platform' },
    { platform: 'Script2Platform', name: 'Script2', on_off_switches: [], stateless_switches: [] },
    { platform: 'Script2Platform', _bridge: { username: 'AA:BB:CC:DD:EE:FF', port: 51234 },
      on_off_switches: [{ name: 'Command state', on: 'on.sh', off: 'off.sh', state: 'state.sh' }] },
    { platform: 'Script2Platform', on_off_switches: [
      { name: 'File state', on: 'on.sh', off: 'off.sh', fileState: '/tmp/script2.flag' },
      { name: 'Both sources', on: 'on.sh', off: 'off.sh', state: 'state.sh', fileState: '/tmp/script2-other.flag' },
    ] },
    { platform: 'Script2Platform', stateless_switches: [
      { name: 'Trigger', trigger: 'trigger.sh', stateless_trigger_on: 'off', auto_reset_ms: 0 },
    ] },
  ];
  for (const config of configurations) {
    const original = structuredClone(config);
    assert.equal(validateSchema(config), true, JSON.stringify(validateSchema.errors));
    assert.equal(validateRuntime(config).valid, true);
    assert.deepEqual(config, original);
  }
});

test('platform identity and existing device requirements remain enforced', () => {
  const validateSchema = compileSchema();
  const invalid = [
    {}, { platform: 'Script2' },
    { platform: 'Script2Platform', on_off_switches: [{ on: 'on.sh', off: 'off.sh', state: 'state.sh' }] },
    { platform: 'Script2Platform', on_off_switches: [{ name: 'Switch', off: 'off.sh', state: 'state.sh' }] },
    { platform: 'Script2Platform', on_off_switches: [{ name: 'Switch', on: 'on.sh', state: 'state.sh' }] },
    { platform: 'Script2Platform', on_off_switches: [{ name: 'Switch', on: 'on.sh', off: 'off.sh' }] },
    { platform: 'Script2Platform', stateless_switches: [{ trigger: 'trigger.sh' }] },
    { platform: 'Script2Platform', stateless_switches: [{ name: 'Trigger' }] },
  ];
  for (const config of invalid) {
    assert.equal(validateSchema(config), false);
    assert.equal(validateRuntime(config).valid, false);
  }
});
