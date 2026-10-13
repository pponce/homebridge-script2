'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { exec } = require('node:child_process');
const { mkdtemp, rm } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Script2DeviceLogic } = require('../index');

function harness(t, config = {}, debug = false, executor) {
  const commands = [], logs = [];
  const logger = Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level, message => {
    if (level !== 'debug' || debug) logs.push([level, message]);
  }]));
  const logic = new Script2DeviceLogic(logger, {
    name: 'Lamp', on: 'on-command', off: 'off-command', state: 'state-command',
    ...config,
  }, executor || ((command, options, callback) => commands.push({ command, callback })));
  t.after(() => logic.shutdown());
  return { logic, commands, logs };
}

for (const source of ['state', 'fileState']) {
  test(`successful ON/OFF stderr does not fail HomeKit with ${source}`, t => {
    const config = source === 'fileState' ? { state: undefined, fileState: join(tmpdir(), 'script2-stderr.flag') } : {};
    const { logic, commands, logs } = harness(t, config);
    const results = [], reads = [];
    logic.setState(true, (error, value) => results.push({ error, value }));
    logic.setState(false, (error, value) => results.push({ error, value }));
    logic.getState((error, value) => reads.push({ error, value }));
    commands[0].callback(null, '', 'ON progress\n');
    assert.equal(commands[1].command, 'off-command');
    commands[1].callback(null, '', 'OFF progress\n');
    assert.deepEqual(results, [{ error: null, value: true }, { error: null, value: false }]);
    assert.deepEqual(reads, [{ error: null, value: false }]);
    assert.equal(logic.inFlightSet, null);
    assert.equal(logic.currentState, false);
    assert.equal(logs.filter(([level]) => level === 'warn').length, 2);
    assert.ok(!logs.some(([level]) => level === 'error'));
  });
}

test('real ON/OFF processes exit zero with stderr and update the state file', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'script2-stderr-'));
  const flag = join(dir, 'state.flag');
  t.after(() => rm(dir, { recursive: true, force: true }));
  const command = code => `"${process.execPath}" -e '${code.replaceAll("'", "'\\''")}'`;
  const { logic, logs } = harness(t, {
    state: undefined, fileState: flag,
    on: command(`require("node:fs").writeFileSync(${JSON.stringify(flag)}, ""); console.error("ON progress");`),
    off: command(`require("node:fs").unlinkSync(${JSON.stringify(flag)}); console.error("OFF progress");`),
  }, false, exec);
  for (const requested of [true, false]) {
    const value = await new Promise((resolve, reject) => logic.setState(requested, (error, result) => error ? reject(error) : resolve(result)));
    assert.equal(value, requested);
    assert.equal(existsSync(flag), requested);
    const read = await new Promise((resolve, reject) => logic.getState((error, result) => error ? reject(error) : resolve(result)));
    assert.equal(read, requested);
  }
  assert.equal(logs.filter(([level]) => level === 'warn').length, 2);
});

test('stderr warns by default without exposing command or output', t => {
  const { logic, commands, logs } = harness(t, { on: 'secret-command' });
  logic.setState(true, () => {});
  commands[0].callback(null, 'secret-stdout', 'secret-stderr');
  const text = JSON.stringify(logs);
  assert.match(text, /on command wrote to stderr/);
  assert.doesNotMatch(text, /secret-command|secret-stdout|secret-stderr/);
});

test('debug shows stderr for actions and state reads without exposing command or stdout', t => {
  const { logic, commands, logs } = harness(t, { on: 'secret-command' }, true);
  logic.setState(true, () => {});
  commands[0].callback(null, 'secret-stdout', 'action detail');
  logic.getState(() => {});
  commands[1].callback(null, 'true', 'state detail');
  const debugText = logs.filter(([level]) => level === 'debug').map(([, message]) => message).join('\n');
  assert.match(debugText, /on command stderr: "action detail"/);
  assert.match(debugText, /state command stderr: "state detail"/);
  assert.doesNotMatch(debugText, /secret-command|secret-stdout/);
});

test('debug stderr is bounded and control characters are escaped', t => {
  const { logic, commands, logs } = harness(t, {}, true);
  logic.setState(true, () => {});
  commands[0].callback(null, '', 'detail\n\u001b[31m' + 'x'.repeat(5000));
  const message = logs.find(([level, text]) => level === 'debug' && text.includes('command stderr:'))[1];
  assert.ok(!message.includes('\n') && !message.includes('\u001b'));
  assert.ok(message.includes('\\n') && message.includes('\\u001b'));
  assert.match(message, /\[truncated\]$/);
  const quoted = message.slice(message.indexOf('stderr: ') + 8, -' [truncated]'.length);
  assert.equal(JSON.parse(quoted).length, 4096);
});

test('blank stderr produces no warning or stderr debug entry', t => {
  const { logic, commands, logs } = harness(t, {}, true);
  logic.setState(true, () => {});
  commands[0].callback(null, '', ' \n\t');
  assert.ok(!logs.some(([level, message]) => level === 'warn' || message.includes('stderr')));
});

for (const failure of [
  { code: 1 }, { killed: true }, { signal: 'SIGTERM' }, { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' },
]) {
  test(`ON/OFF execution failure stays an error with stderr: ${JSON.stringify(failure)}`, t => {
    const { logic, commands } = harness(t, { state: undefined, fileState: join(tmpdir(), 'script2-stderr.flag') });
    let received;
    logic.setState(true, (error, value) => { received = { error, value }; });
    commands[0].callback(Object.assign(new Error('failure'), failure), '', 'error detail');
    assert.ok(received.error instanceof Error);
    assert.equal(received.value, null);
    assert.equal(logic.inFlightSet, null);
  });
}

for (const strict of [false, true]) {
  test(`state exit-code policy stays unchanged with stderr (strict=${strict})`, t => {
    const { logic, commands, logs } = harness(t, { fail_on_state_exit_code: strict, state_cache_ttl_ms: 0 });
    let received;
    logic.getState((error, value) => { received = { error, value }; });
    commands[0].callback(null, 'true', 'state warning');
    assert.deepEqual(received, { error: null, value: true });
    logic.getState((error, value) => { received = { error, value }; });
    commands[1].callback(Object.assign(new Error('nonzero'), { code: 1 }), 'true', 'state warning');
    assert.equal(Boolean(received.error), strict);
    assert.equal(received.value, strict ? null : true);
    assert.ok(logs.some(([level, message]) => ['warn', 'error'].includes(level) && message.includes('exited non-zero')));
  });
}

test('stateless trigger succeeds with stderr and still rejects nonzero exits', t => {
  const { logic, commands, logs } = harness(t, { device_type: 'stateless', trigger: 'trigger-command', auto_reset_ms: 0 }, true);
  const results = [];
  logic.setStatelessTrigger(true, (error, value) => results.push({ error, value }));
  commands[0].callback(null, '', 'trigger progress');
  assert.deepEqual(results[0], { error: null, value: true });
  assert.ok(logs.some(([level, message]) => level === 'debug' && message.includes('trigger command stderr: "trigger progress"')));
  logic.setStatelessTrigger(true, (error, value) => results.push({ error, value }));
  commands[1].callback(Object.assign(new Error('failure'), { code: 1 }), '', 'trigger failure');
  assert.ok(results[1].error instanceof Error);
  assert.equal(results[1].value, null);
});
