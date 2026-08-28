'use strict';

const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const test = require('node:test');
const plugin = require('../index');
const { Script2DeviceLogic } = plugin;

function createHarness() {
  const commands = [];
  const executor = (command, options, callback) => {
    commands.push({ command, options, callback });
  };
  const log = {
    debug() {},
    error() {},
    info() {},
    warn() {},
  };
  const logic = new Script2DeviceLogic(log, {
    name: 'Test Switch',
    on: 'turn-on',
    off: 'turn-off',
    state: 'get-state',
  }, executor);

  return { commands, logic };
}

test('duplicate in-flight requests share one command result', () => {
  const { commands, logic } = createHarness();
  const results = [];

  logic.setState(true, (error, value) => results.push({ error, value }));
  logic.setState(true, (error, value) => results.push({ error, value }));

  assert.equal(commands.length, 1);
  assert.equal(commands[0].command, 'turn-on');
  assert.equal(logic.inFlightSet.callbacks.length, 2);

  commands[0].callback(null, '', '');

  assert.deepEqual(results, [
    { error: null, value: true },
    { error: null, value: true },
  ]);
  assert.equal(logic.inFlightSet, null);
});

test('opposite requests are serialized and never overlap', () => {
  const { commands, logic } = createHarness();
  const results = [];

  logic.setState(true, (error, value) => results.push({ error, value }));
  logic.setState(false, (error, value) => results.push({ error, value }));

  assert.equal(commands.length, 1);
  assert.equal(logic.pendingSetQueue.length, 1);

  commands[0].callback(null, '', '');

  assert.equal(commands.length, 2);
  assert.equal(commands[1].command, 'turn-off');
  assert.equal(results.length, 1);

  commands[1].callback(null, '', '');

  assert.deepEqual(results, [
    { error: null, value: true },
    { error: null, value: false },
  ]);
  assert.equal(logic.inFlightSet, null);
});

test('duplicate failures invoke one command and settle every callback once', () => {
  const { commands, logic } = createHarness();
  const errors = [];

  logic.setState(true, (error) => errors.push(error));
  logic.setState(true, (error) => errors.push(error));
  commands[0].callback(new Error('failed'), '', '');

  assert.equal(commands.length, 1);
  assert.equal(errors.length, 2);
  assert.ok(errors.every((error) => error instanceof Error));
  assert.equal(logic.inFlightSet, null);
  assert.equal(logic.pendingSetQueue.length, 0);
});

test('a duplicate executor completion cannot settle callbacks twice', () => {
  const { commands, logic } = createHarness();
  let callbackCount = 0;

  logic.setState(true, () => callbackCount++);
  commands[0].callback(null, '', '');
  commands[0].callback(new Error('late duplicate'), '', '');

  assert.equal(commands.length, 1);
  assert.equal(callbackCount, 1);
});

test('binding services repeatedly leaves exactly one set handler', () => {
  const characteristic = new EventEmitter();
  const Characteristic = {
    Manufacturer: 'Manufacturer',
    Model: 'Model',
    On: 'On',
    SerialNumber: 'SerialNumber',
  };
  const Service = {
    AccessoryInformation: 'AccessoryInformation',
    Switch: 'Switch',
  };
  plugin({
    hap: { Characteristic, Service },
    registerAccessory() {},
    registerPlatform() {},
  });

  const informationService = {
    setCharacteristic() {
      return this;
    },
  };
  const switchService = {
    getCharacteristic() {
      return characteristic;
    },
  };
  const accessory = {
    getService(service) {
      return service === Service.AccessoryInformation ? informationService : switchService;
    },
    addService() {
      throw new Error('service should already exist');
    },
  };
  const { logic } = createHarness();

  logic.bindServices(accessory);
  logic.bindServices(accessory);

  assert.equal(characteristic.listenerCount('set'), 1);
  assert.equal(characteristic.listenerCount('get'), 1);
});

test('a HomeKit GET during a successful set is deferred and receives the set result', () => {
  const { commands, logic } = createHarness();
  const getResults = [];

  logic.setState(true, () => {});
  logic.getState((error, value, source) => getResults.push({ error, value, source }));

  assert.equal(commands.length, 1);
  assert.equal(logic.deferredStateRequests.length, 1);

  commands[0].callback(null, '', '');

  assert.deepEqual(getResults, [
    { error: null, value: true, source: 'completed-set' },
  ]);
  assert.equal(logic.deferredStateRequests.length, 0);
});

test('a failed set reconciles deferred GETs with an authoritative state read', () => {
  const { commands, logic } = createHarness();
  const getResults = [];

  logic.setState(true, () => {});
  logic.getState((error, value, source) => getResults.push({ error, value, source }));
  commands[0].callback(new Error('set failed'), '', '');

  assert.equal(commands.length, 2);
  assert.equal(commands[1].command, 'get-state');
  commands[1].callback(null, 'false\n', '');

  assert.deepEqual(getResults, [
    { error: null, value: false, source: 'state-script' },
  ]);
});

test('a state read started before a set cannot publish its stale result', () => {
  const { commands, logic } = createHarness();
  const getResults = [];

  logic.getState((error, value, source) => getResults.push({ error, value, source }));
  logic.setState(true, () => {});

  assert.equal(commands.length, 2);
  assert.equal(commands[0].command, 'get-state');
  assert.equal(commands[1].command, 'turn-on');

  commands[0].callback(null, 'false\n', '');
  assert.equal(getResults.length, 0);
  assert.equal(logic.lastStateRead, null);

  commands[1].callback(null, '', '');
  assert.deepEqual(getResults, [
    { error: null, value: true, source: 'completed-set' },
  ]);
});

test('polling during a set is deferred and reconciled after completion', () => {
  const { commands, logic } = createHarness();
  const updates = [];
  logic.switchService = {
    updateCharacteristic(characteristicType, value) {
      updates.push({ characteristicType, value });
    },
  };

  logic.setState(true, () => {});
  logic.pollStateAndUpdateCharacteristic(logic.switchService);
  assert.equal(commands.length, 1);
  assert.equal(logic.reconcileAfterSet, true);

  commands[0].callback(null, '', '');
  assert.equal(commands.length, 2);
  assert.equal(commands[1].command, 'get-state');
  commands[1].callback(null, 'true\n', '');

  assert.deepEqual(updates, []);
  assert.equal(logic.currentState, true);
});

test('deferred GETs remain pending until queued opposite sets finish', () => {
  const { commands, logic } = createHarness();
  const getResults = [];

  logic.setState(true, () => {});
  logic.getState((error, value, source) => getResults.push({ error, value, source }));
  logic.setState(false, () => {});

  commands[0].callback(null, '', '');
  assert.equal(commands.length, 2);
  assert.equal(getResults.length, 0);

  commands[1].callback(null, '', '');
  assert.deepEqual(getResults, [
    { error: null, value: false, source: 'completed-set' },
  ]);
});
