'use strict';

const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const test = require('node:test');
const plugin = require('../index');
const { Script2DeviceLogic } = plugin;

function createHarness(config = {}) {
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
    homekit_set_ack_timeout_ms: 0,
    ...config,
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

test('a long-running set is acknowledged before command completion', async () => {
  const { commands, logic } = createHarness({ homekit_set_ack_timeout_ms: 10 });
  const results = [];

  logic.setState(true, (error, value) => results.push({ error, value }));
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.deepEqual(results, [{ error: null, value: true }]);
  assert.equal(commands.length, 1);
  assert.notEqual(logic.inFlightSet, null);

  commands[0].callback(null, '', '');
  assert.equal(results.length, 1);
  assert.equal(logic.inFlightSet, null);
});

test('failure after an early acknowledgement triggers authoritative reconciliation', async () => {
  const { commands, logic } = createHarness({ homekit_set_ack_timeout_ms: 10 });
  const results = [];

  logic.setState(true, (error, value) => results.push({ error, value }));
  await new Promise((resolve) => setTimeout(resolve, 25));
  commands[0].callback(new Error('late failure'), '', '');

  assert.deepEqual(results, [{ error: null, value: true }]);
  assert.equal(commands.length, 2);
  assert.equal(commands[1].command, 'get-state');

  commands[1].callback(null, 'false\n', '');
  assert.equal(logic.currentState, false);
});

test('early acknowledgement remains opt-in by default', () => {
  const log = { debug() {}, error() {}, info() {}, warn() {} };
  const logic = new Script2DeviceLogic(log, {
    name: 'Default Switch',
    on: 'turn-on',
    off: 'turn-off',
    state: 'get-state',
  }, () => {});

  assert.equal(logic.homekitSetAckTimeoutMs, 0);
});

test('optimistic acknowledgement is disabled without an authoritative state source', () => {
  const { logic } = createHarness({
    state: undefined,
    homekit_set_ack_timeout_ms: 10,
  });

  assert.equal(logic.homekitSetAckTimeoutMs, 0);
});

test('multiple duplicate requests are each acknowledged exactly once', async () => {
  const { commands, logic } = createHarness({ homekit_set_ack_timeout_ms: 10 });
  const callbackCounts = [0, 0, 0];

  callbackCounts.forEach((unused, index) => {
    logic.setState(true, () => callbackCounts[index]++);
  });
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.deepEqual(callbackCounts, [1, 1, 1]);
  assert.equal(commands.length, 1);
  assert.notEqual(logic.inFlightSet, null);

  commands[0].callback(null, '', '');
  assert.deepEqual(callbackCounts, [1, 1, 1]);
});

test('early acknowledgement does not advance an opposite-state queue', async () => {
  const { commands, logic } = createHarness({ homekit_set_ack_timeout_ms: 10 });

  logic.setState(true, () => {});
  logic.setState(false, () => {});
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(commands.length, 1);
  assert.equal(logic.pendingSetQueue.length, 1);
  assert.equal(logic.inFlightSet.requestedState, true);

  commands[0].callback(null, '', '');
  assert.equal(commands.length, 2);
  assert.equal(commands[1].command, 'turn-off');
});

test('shutdown clears pending acknowledgement timers', async () => {
  const { commands, logic } = createHarness({ homekit_set_ack_timeout_ms: 10 });
  let callbackCount = 0;

  logic.setState(true, () => callbackCount++);
  logic.shutdown();
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(callbackCount, 0);
  commands[0].callback(null, '', '');
  assert.equal(callbackCount, 1);
});

test('late failure reconciliation cannot overwrite a newer set generation', async () => {
  const { commands, logic } = createHarness({ homekit_set_ack_timeout_ms: 10 });

  logic.setState(false, () => {});
  await new Promise((resolve) => setTimeout(resolve, 25));
  commands[0].callback(new Error('late OFF failure'), '', '');
  assert.equal(commands[1].command, 'get-state');

  logic.setState(true, () => {});
  assert.equal(commands[2].command, 'turn-on');
  commands[1].callback(null, 'false\n', '');
  commands[2].callback(null, '', '');

  assert.equal(logic.currentState, true);
  assert.equal(logic.lastStateRead, null);
});
