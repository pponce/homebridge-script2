let Service;
let Characteristic;

const exec = require("child_process").exec;
const { existsSync } = require("fs");
const { dirname, resolve } = require("node:path");
const { validate } = require("./homebridge-ui/public/validation");
const { safeLogger, onceCallback } = require("./lib/safety");

const PLUGIN_NAME = "homebridge-script2";
const PLATFORM_NAME = "Script2Platform";

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  // New dynamic platform mode (cached accessories + configureAccessory)
  homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, Script2Platform, true);
};


function sanitizeDeviceConfig(deviceConfig) {
  const sanitized = { ...(deviceConfig || {}) };
  const deviceType = sanitized["device_type"] === "stateless" ? "stateless" : "switch";

  if (deviceType === "stateless") {
    delete sanitized["on"];
    delete sanitized["off"];
    delete sanitized["fileState"];
    delete sanitized["state"];
    delete sanitized["on_value"];
    delete sanitized["polling"];
    delete sanitized["polling_interval"];
    delete sanitized["polling_on_start"];
    delete sanitized["state_cache_ttl_ms"];
    delete sanitized["reset_state_cache_on_set"];
    delete sanitized["fail_on_state_exit_code"];
    delete sanitized["homekit_set_ack_timeout_ms"];
  } else {
    delete sanitized["trigger"];
    delete sanitized["auto_reset_ms"];
    delete sanitized["stateless_trigger_on"];
  }

  return sanitized;
}


function getConfiguredDevices(config) {
  return [
    ...(config.on_off_switches || []).map(d => ({ ...d, device_type: "switch" })),
    ...(config.stateless_switches || []).map(d => ({ ...d, device_type: "stateless" })),
  ];
}

class Script2Platform {
  constructor(log, config, api) {
    this.log = safeLogger(log);
    this.config = config;
    this.api = api;
    this.accessories = new Map();
    this.instances = new Map();
    this.stopped = false;
    api.on("shutdown", () => {
      this.stopped = true;
      for (const instance of this.instances.values()) instance.shutdown();
    });
    api.on("didFinishLaunching", () => {
      if (this.stopped || !this.config) return;
      try { this.discoverDevices(); }
      catch { this.log.error("Script2 setup failed; cached accessories were preserved. Check configuration and restart."); }
    });
  }

  configureAccessory(accessory) { this.accessories.set(accessory.UUID, accessory); }

  discoverDevices() {
    const result = validate(this.config);
    if (!result.valid) {
      for (const message of result.errors) this.log.error(message);
      return;
    }
    const devices = getConfiguredDevices(this.config);
    // Only explicit empty lists represent a deliberate removal of every device.
    if (!devices.length && !Object.hasOwn(this.config, "on_off_switches") && !Object.hasOwn(this.config, "stateless_switches")) return;
    const wanted = new Set();
    const created = [];
    try {
      for (const raw of devices) {
        const config = sanitizeDeviceConfig(raw);
        const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${config.name}`);
        wanted.add(uuid);
        let accessory = this.accessories.get(uuid);
        const isNew = !accessory;
        if (isNew) accessory = new this.api.platformAccessory(config.name, uuid);
        this.instances.get(uuid)?.shutdown();
        const instance = new Script2DeviceLogic(this.log, config);
        created.push(instance);
        // Bind without starting commands/watchers until all accessories are ready.
        instance.bindServices(accessory, false);
        accessory.context.device = config;
        if (isNew) this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        else this.api.updatePlatformAccessories([accessory]);
        this.accessories.set(uuid, accessory);
        this.instances.set(uuid, instance);
      }
      for (const instance of created) instance.startMonitoring();
    } catch {
      for (const instance of created) instance.shutdown();
      this.log.error("Script2 device setup failed; monitoring stopped and cached accessories preserved. Check device configuration and restart.");
      return;
    }
    for (const [uuid, accessory] of this.accessories) {
      if (!wanted.has(uuid)) {
        this.instances.get(uuid)?.shutdown();
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.instances.delete(uuid);
        this.accessories.delete(uuid);
      }
    }
  }
}

function Script2DeviceLogic(log, config, commandExecutor = exec) {
  this.log = safeLogger(log);
  this.service = "Switch";

  this.name = config["name"];
  this.onCommand = config["on"];
  this.offCommand = config["off"];
  this.deviceType = config["device_type"] === "stateless" ? "stateless" : "switch";
  this.triggerCommand = config["trigger"] || false;
  this.autoResetMs = Number(config["auto_reset_ms"] ?? 500);
  this.commandTimeout = Number(config["command_timeout"] ?? 10000);
  this.homekitSetAckTimeoutMs = Number(config["homekit_set_ack_timeout_ms"] ?? 0);
  this.statelessTriggerOn = config["stateless_trigger_on"] === "off" ? "off" : "on";
  this.stateCommand = config["state"] || false;
  this.onValue = config["on_value"] || "true";
  this.fileState = config["fileState"] || false;
  this.polling = config["polling"] || false;
  this.pollingInterval = Number(config["polling_interval"] || 5000);
  this.pollingOnStart =
    config["polling_on_start"] === undefined ? true : !!config["polling_on_start"];
  this.stateCacheTtlMs = Number(config["state_cache_ttl_ms"] ?? 1000);
  this.resetStateCacheOnSet = config["reset_state_cache_on_set"] === true;
  this.failOnStateExitCode = config["fail_on_state_exit_code"] === true;
  this.uniqueSerial = config["unique_serial"] || "script2 Serial Number";
  this.onValue = String(this.onValue).trim().toLowerCase();
  this.watcher = null;
  this.pollTimer = null;
  this.lastStateRead = null;
  this.lastStateReadAt = 0;
  this.inFlightStateRequest = null;
  this.deferredStateRequests = [];
  this.reconcileAfterSet = false;
  this.stateGeneration = 0;
  this.switchService = null;
  this.rawExecutor = commandExecutor;
  this.children = new Set();
  this.deadlines = new Set();
  this.stopped = false;
  this.resetTimer = null;
  this.triggerCallbacks = [];
  this.triggerInFlight = false;
  this.commandExecutor = this.executeCommand.bind(this);
  this.watchFactory = (...args) => require("chokidar").watch(...args);
  this.inFlightSet = null;
  this.pendingSetQueue = [];
  this.earlySetAcknowledged = false;

  if (!Number.isFinite(this.commandTimeout) || this.commandTimeout <= 0) {
    this.log.warn(
      `Invalid command_timeout '${this.commandTimeout}' for ${this.name}; using default 10000ms.`
    );
  this.commandTimeout = 10000;
  }
  if (
    !Number.isFinite(this.homekitSetAckTimeoutMs) ||
    !Number.isInteger(this.homekitSetAckTimeoutMs) ||
    this.homekitSetAckTimeoutMs < 0
  ) {
    this.log.warn(
      `Invalid homekit_set_ack_timeout_ms '${this.homekitSetAckTimeoutMs}' for ${this.name}; using default 0ms.`
    );
    this.homekitSetAckTimeoutMs = 0;
  }
  if (this.homekitSetAckTimeoutMs > 0 && !this.stateCommand && !this.fileState) {
    this.log.warn(
      `${this.name}: homekit_set_ack_timeout_ms requires 'state' or 'fileState' for late-failure reconciliation; disabling early acknowledgement.`
    );
    this.homekitSetAckTimeoutMs = 0;
  }
  if (this.fileState && this.stateCommand) {
    this.log.warn(
      `${this.name}: both 'fileState' and 'state' are configured. The state script will not be executed for status changes; the configured file flag will be used instead. To use the state script, remove the 'fileState' config parameter.`
    );
  }

  try {
    this.currentState = this.fileState ? existsSync(this.fileState) : false;
  } catch (err) {
    this.log.error(`Error checking initial file state: ${err.message}`);
    this.currentState = false;
  }
}

Script2DeviceLogic.prototype.formatCommandDiagnostics = function (action, command, error) {
  const code = typeof error?.code === "number" ? error.code : "unavailable";
  return `${this.name}: ${action} command ${error?.killed ? "timed out or was terminated" : "failed"} (exit code: ${code}). Check the script as the Homebridge service user. Command text and output are omitted.`;
};

Script2DeviceLogic.prototype.executeCommand = function (command, options, callback) {
  if (this.stopped) return;
  let child;
  let completed = false;
  let deadline;
  const finish = (error, stdout = "", stderr = "") => {
    if (completed) return;
    completed = true;
    clearTimeout(deadline);
    this.deadlines.delete(deadline);
    if (child) this.children.delete(child);
    if (this.stopped) return;
    try { callback(error, String(stdout ?? ""), String(stderr ?? "")); }
    catch {
      this.log.error(`${this.name}: internal command completion failed; stopping this device until restart.`);
      this.shutdown();
    }
  };
  try {
    deadline = setTimeout(() => {
      try { child?.kill("SIGKILL"); } catch { this.log.warn(`${this.name}: timed-out process could not be stopped.`); }
      finish(Object.assign(new Error("Command deadline exceeded."), { killed: true }));
    }, options.timeout);
    this.deadlines.add(deadline);
    deadline.unref?.();
    child = this.rawExecutor(command, { ...options, killSignal: "SIGKILL", maxBuffer: 1024 * 1024 }, finish);
    if (child && !completed) {
      this.children.add(child);
      child.stdin?.on("error", () => {});
      child.stdin?.end();
    }
  } catch (error) { finish(error); }
};

Script2DeviceLogic.prototype.stopMonitoring = function () {
  clearInterval(this.pollTimer);
  this.pollTimer = null;
  if (this.watcher) {
    const watcher = this.watcher;
    this.watcher = null;
    try { Promise.resolve(watcher.close()).catch(() => this.log.warn(`${this.name}: watcher close failed.`)); }
    catch { this.log.warn(`${this.name}: watcher close failed.`); }
  }
};

Script2DeviceLogic.prototype.shutdown = function () {
  if (this.stopped) return;
  this.stopped = true;
  this.stopMonitoring();
  clearTimeout(this.resetTimer);
  for (const deadline of this.deadlines) clearTimeout(deadline);
  this.deadlines.clear();
  this.resetTimer = null;
  const error = new Error("Script2 device stopped.");
  const sets = [this.inFlightSet, ...this.pendingSetQueue].filter(Boolean);
  this.inFlightSet = null;
  this.pendingSetQueue = [];
  for (const request of sets) for (const entry of request.callbacks) this.settleSetCallback(entry, error);
  const reads = [...(this.inFlightStateRequest?.requests || []), ...this.deferredStateRequests];
  this.inFlightStateRequest = null;
  this.deferredStateRequests = [];
  for (const request of reads) request.callback(error, null);
  for (const callback of this.triggerCallbacks.splice(0)) callback(error, null);
  this.triggerInFlight = false;
  for (const child of this.children) {
    try { child.kill("SIGKILL"); } catch { this.log.warn(`${this.name}: command shutdown failed.`); }
  }
  this.children.clear();
};

Script2DeviceLogic.prototype.logGetStateResult = function (poweredOn, requestPath, source, nonZeroExit) {
  const message = `GetState ${this.name}: ${poweredOn ? "ON" : "OFF"} (path: ${requestPath}, source: ${source})`;
  if (nonZeroExit) {
    this.log.info(message);
    return;
  }

  this.log.debug(message);
};

Script2DeviceLogic.prototype.pollStateAndUpdateCharacteristic = function (switchService) {
  if (this.stopped) return;
  if (this.inFlightSet) {
    this.reconcileAfterSet = true;
    this.log.debug(
      `Deferring polling update for ${this.name}; set to ${this.inFlightSet.requestedState ? "ON" : "OFF"} is in flight.`
    );
    return;
  }

  this.getState((err, poweredOn, source, nonFatalError) => {
    if (err) {
      this.updateReachabilityFault(true);
      this.log.warn(`Polling state failed for ${this.name}: ${err.message}`);
      return;
    }

    if (nonFatalError) {
      this.log.warn(`Polling state warning for ${this.name}: ${nonFatalError.message}`);
    }

    this.updateReachabilityFault(false);
    if (this.currentState !== poweredOn) {
      this.currentState = poweredOn;
      this.presentState(poweredOn);
    }
  }, "polling");
};

Script2DeviceLogic.prototype.setState = function (powerOn, callback) {
  if (this.stopped) { onceCallback(this.log, callback)(new Error("Script2 device stopped.")); return; }
  const requestedState = !!powerOn;
  const callbackEntry = this.createSetCallbackEntry(requestedState, callback);

  if (this.inFlightSet) {
    if (
      this.inFlightSet.requestedState === requestedState &&
      this.pendingSetQueue.length === 0
    ) {
      this.log.debug(
        `Coalescing duplicate ${requestedState ? "ON" : "OFF"} request for ${this.name}; command is already in flight.`
      );
      this.inFlightSet.callbacks.push(callbackEntry);
      return;
    }

    const lastPendingSet = this.pendingSetQueue[this.pendingSetQueue.length - 1];
    if (lastPendingSet?.requestedState === requestedState) {
      this.log.debug(
        `Coalescing queued ${requestedState ? "ON" : "OFF"} request for ${this.name}.`
      );
      lastPendingSet.callbacks.push(callbackEntry);
      return;
    }

    this.log.debug(
      `Queueing ${requestedState ? "ON" : "OFF"} request for ${this.name}; another set command is in flight.`
    );
    this.pendingSetQueue.push({ requestedState, callbacks: [callbackEntry] });
    return;
  }

  this.startSetCommand({ requestedState, callbacks: [callbackEntry] });
};

Script2DeviceLogic.prototype.createSetCallbackEntry = function (requestedState, callback) {
  const entry = { callback: onceCallback(this.log, callback), requestedState, settled: false, timer: null };

  if (this.homekitSetAckTimeoutMs > 0) {
    entry.timer = setTimeout(() => {
      if (entry.settled) {
        return;
      }
      this.earlySetAcknowledged = true;
      this.log.debug(
        `Acknowledging ${requestedState ? "ON" : "OFF"} request for ${this.name} while its command remains pending.`
      );
      this.settleSetCallback(entry, null, requestedState);
    }, this.homekitSetAckTimeoutMs);
  }

  return entry;
};

Script2DeviceLogic.prototype.settleSetCallback = function (entry, error, value) {
  if (entry.settled) {
    return;
  }

  entry.settled = true;
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }

  try {
    entry.callback(error, error ? null : value);
  } catch (callbackException) {
    this.log.error(
      `Set callback for ${this.name} threw an error: ${callbackException.message}`
    );
  }
};

Script2DeviceLogic.prototype.startSetCommand = function (setRequest) {
  const powerOn = setRequest.requestedState;
  this.stateGeneration += 1;

  if (this.inFlightStateRequest) {
    this.log.debug(
      `Deferring state read completion for ${this.name}; a newer set is starting.`
    );
    this.deferredStateRequests.push(...this.inFlightStateRequest.requests);
    if (this.inFlightStateRequest.requests.some((request) => request.requestPath === "polling")) {
      this.reconcileAfterSet = true;
    }
    this.inFlightStateRequest = null;
  }

  this.inFlightSet = setRequest;
  this.log.debug(`Setting ${this.name} to ${powerOn ? "ON" : "OFF"}...`);

  const command = powerOn ? this.onCommand : this.offCommand;
  const action = powerOn ? "on" : "off";
  this.log.debug(`${this.name}: executing configured command.`);
  let commandSettled = false;
  this.commandExecutor(command, { timeout: this.commandTimeout }, (error, stdout, stderr) => {
    if (commandSettled) {
      this.log.warn(`Ignoring duplicate ${action} command completion for ${this.name}.`);
      return;
    }
    commandSettled = true;

    let callbackError = null;

    if (error || stderr) {
      const diagnostics = this.formatCommandDiagnostics(action, command, error, stdout, stderr);
      const errMessage = `Set State returned an error. ${diagnostics}`;
      this.log.error(`Set State returned an error: ${errMessage}`);
      callbackError = new Error(errMessage);
    } else {
      const commandOutput = stdout.trim().toLowerCase();
      this.log.debug(`${this.name}: set command completed.`);

      this.currentState = powerOn;
      if (this.resetStateCacheOnSet && this.stateCommand && !this.fileState) {
        this.lastStateRead = powerOn;
        this.lastStateReadAt = Date.now();
        this.log.debug(
          `Reset state cache for ${this.name} from manual set action to ${powerOn ? "ON" : "OFF"}.`
        );
      }
      this.log.info(`Set ${this.name} to ${powerOn ? "ON" : "OFF"}`);
    }

    const completedSet = this.inFlightSet;
    this.inFlightSet = null;
    const nextSet = this.pendingSetQueue.shift();
    if (nextSet) {
      this.startSetCommand(nextSet);
    } else {
      this.finishSetStateReconciliation(callbackError, powerOn);
    }

    completedSet.callbacks.forEach((callbackEntry) => {
      this.settleSetCallback(callbackEntry, callbackError, powerOn);
    });
  });
};

Script2DeviceLogic.prototype.deferStateRequest = function (callback, requestPath) {
  this.log.debug(
    `Deferring GetState ${this.name} (${requestPath}); ` +
    `${this.inFlightSet.requestedState ? "ON" : "OFF"} set is in flight.`
  );
  this.deferredStateRequests.push({ callback, requestPath });
};

Script2DeviceLogic.prototype.resolveDeferredStateRequests = function (
  error,
  poweredOn,
  source,
  nonFatalError = null
) {
  const deferredRequests = this.deferredStateRequests;
  this.deferredStateRequests = [];

  deferredRequests.forEach(({ callback, requestPath }) => {
    try {
      if (!error) {
        this.logGetStateResult(poweredOn, requestPath, source, !!nonFatalError);
      }
      callback(error, error ? null : poweredOn, source, nonFatalError);
    } catch (callbackException) {
      this.log.error(
        `Deferred state callback for ${this.name} threw an error: ${callbackException.message}`
      );
    }
  });
};

Script2DeviceLogic.prototype.finishSetStateReconciliation = function (setError, requestedState) {
  if (!setError) {
    this.earlySetAcknowledged = false;
    this.resolveDeferredStateRequests(null, requestedState, "completed-set");

    const shouldReconcile = this.reconcileAfterSet;
    this.reconcileAfterSet = false;
    if (shouldReconcile && this.switchService) {
      this.pollStateAndUpdateCharacteristic(this.switchService);
    }
    return;
  }

  const shouldUpdateCharacteristic = this.reconcileAfterSet;
  this.reconcileAfterSet = false;
  const mustReconcileAcknowledgedFailure = this.earlySetAcknowledged;
  this.earlySetAcknowledged = false;
  if (
    this.deferredStateRequests.length === 0 &&
    !shouldUpdateCharacteristic &&
    !mustReconcileAcknowledgedFailure
  ) {
    return;
  }

  const reconciliationGeneration = this.stateGeneration;
  this.getState((error, poweredOn, source, nonFatalError) => {
    if (reconciliationGeneration !== this.stateGeneration) {
      this.log.debug(
        `Discarding stale post-set reconciliation for ${this.name}; generation changed from ${reconciliationGeneration} to ${this.stateGeneration}.`
      );
      return;
    }

    if (
      !error &&
      (shouldUpdateCharacteristic || mustReconcileAcknowledgedFailure) &&
      this.switchService
    ) {
      this.currentState = poweredOn;
      this.presentState(poweredOn);
    }
    this.resolveDeferredStateRequests(error, poweredOn, source, nonFatalError);
  }, "post-set-reconciliation", true);
};

Script2DeviceLogic.prototype.getState = function (
  callback,
  requestPath = "homekit-get",
  bypassCache = false
) {
  callback = onceCallback(this.log, callback);
  if (this.stopped) { callback(new Error("Script2 device stopped.")); return; }
  this.log.debug(`Getting ${this.name} state...`);

  if (this.inFlightSet) {
    this.deferStateRequest(callback, requestPath);
    return;
  }

  if (this.fileState) {
    try {
      const poweredOn = existsSync(this.fileState);
      this.logGetStateResult(poweredOn, requestPath, "file-state", false);
      this.updateReachabilityFault(false);
      callback(null, poweredOn, "file-state");
    } catch (err) {
      this.log.error(`Error checking file state: ${err.message}`);
      this.updateReachabilityFault(true);
      callback(err, null);
    }
    return;
  }

  if (this.stateCommand) {
    if (!Number.isFinite(this.stateCacheTtlMs) || this.stateCacheTtlMs < 0) {
      this.log.warn(
        `Invalid state_cache_ttl_ms '${this.stateCacheTtlMs}' for ${this.name}; using default 1000ms.`
      );
      this.stateCacheTtlMs = 1000;
    }

    const now = Date.now();
    if (
      !bypassCache &&
      this.stateCacheTtlMs > 0 &&
      this.lastStateRead !== null &&
      now - this.lastStateReadAt <= this.stateCacheTtlMs
    ) {
      this.logGetStateResult(this.lastStateRead, requestPath, "ttl-cache", false);
      this.updateReachabilityFault(false);
      callback(null, this.lastStateRead, "ttl-cache");
      return;
    }

    if (this.inFlightStateRequest) {
      this.log.debug(`State get for ${this.name} served from in-flight request.`);
      this.inFlightStateRequest.requests.push({
        requestPath,
        callback: (err, poweredOn, source) => {
          if (err) {
            this.updateReachabilityFault(true);
            callback(err, null, source);
            return;
          }

          this.logGetStateResult(poweredOn, requestPath, "in-flight-coalesced", false);
          this.updateReachabilityFault(false);
          callback(null, poweredOn, "in-flight-coalesced");
        },
      });
      return;
    }

    const stateRequest = {
      generation: this.stateGeneration,
      requests: [{ callback, requestPath }],
    };
    this.inFlightStateRequest = stateRequest;
    const command = this.stateCommand;
    this.log.debug(`${this.name}: executing configured command.`);
    this.commandExecutor(command, { timeout: this.commandTimeout }, (error, stdout, stderr) => {
      if (this.inFlightStateRequest === stateRequest) {
        this.inFlightStateRequest = null;
      }

      if (stateRequest.generation !== this.stateGeneration) {
        this.log.debug(
          `Discarding stale state result for ${this.name}; set generation changed from ${stateRequest.generation} to ${this.stateGeneration}.`
        );
        return;
      }

      const pendingCallbacks = stateRequest.requests.map((request) => request.callback);
      const cleanCommandOutput = stdout.trim().toLowerCase();
      this.log.debug(`${this.name}: state command returned output.`);

      if (stderr && stderr.trim().length > 0) {
        this.log.warn(`${this.name}: state command wrote to stderr (output omitted).`);
      }

      if (!cleanCommandOutput) {
        const diagnostics = this.formatCommandDiagnostics("state", command, error, stdout, stderr);
        const errMessage = error
          ? `Get State command returned empty output. ${diagnostics}`
          : "Get State command returned empty output.";
        this.log.error(`Get State returned an error: ${errMessage}`);
        this.updateReachabilityFault(true);
        pendingCallbacks.forEach((cb) => cb(new Error(errMessage), null));
        return;
      }

      let nonFatalStateError = null;
      if (error) {
        if (this.failOnStateExitCode || error.killed || error.signal || error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
          const diagnostics = this.formatCommandDiagnostics("state", command, error, stdout, stderr);
          const errMessage = `Get State command exited non-zero and fail_on_state_exit_code is enabled. ${diagnostics}`;
          this.log.error(errMessage);
          this.updateReachabilityFault(true);
          pendingCallbacks.forEach((cb) => cb(new Error(errMessage), null));
          return;
        }
        const diagnostics = this.formatCommandDiagnostics("state", command, error, stdout, stderr);
        const errMessage = `Get State command exited non-zero but returned stdout; using stdout for state. ${diagnostics}`;
        nonFatalStateError = new Error(errMessage);
        this.log.warn(errMessage);
      }

      const poweredOn = cleanCommandOutput == this.onValue;
      this.logGetStateResult(poweredOn, requestPath, "state-script", !!nonFatalStateError);
      this.updateReachabilityFault(false);
      this.lastStateRead = poweredOn;
      this.lastStateReadAt = Date.now();
      pendingCallbacks.forEach((cb) => cb(null, poweredOn, "state-script", nonFatalStateError));
    });
    return;
  }

  this.log.error("Must set config value for fileState or state.");
  callback(new Error("Must set config value for fileState or state."), null);
};

Script2DeviceLogic.prototype.setStatelessTrigger = function (powerOn, callback) {
  callback = onceCallback(this.log, callback);
  if (this.stopped) { callback(new Error("Script2 device stopped.")); return; }
  const resetState = this.statelessTriggerOn === "off";
  if (!!powerOn === resetState) { callback(null, powerOn); return; }
  this.triggerCallbacks.push(callback);
  if (this.triggerInFlight) return;
  this.triggerInFlight = true;
  clearTimeout(this.resetTimer);
  this.commandExecutor(this.triggerCommand, { timeout: this.commandTimeout }, (error, stdout, stderr) => {
    this.triggerInFlight = false;
    const callbacks = this.triggerCallbacks.splice(0);
    const failure = error || stderr ? new Error(this.formatCommandDiagnostics("trigger", this.triggerCommand, error)) : null;
    if (failure) this.log.error(failure.message);
    else this.log.info(`Triggered ${this.name} stateless action`);
    for (const cb of callbacks) cb(failure, failure ? null : powerOn);
    if (!this.stopped) this.resetTimer = setTimeout(() => {
      this.resetTimer = null;
      this.presentState(resetState);
    }, this.autoResetMs);
  });
};

Script2DeviceLogic.prototype.presentState = function (state) {
  if (this.stopped) return;
  try { this.switchService?.updateCharacteristic(Characteristic.On, state); }
  catch { this.log.error(`${this.name}: HomeKit state update failed.`); }
};

Script2DeviceLogic.prototype.bindServices = function (platformAccessory, startMonitoring = true) {
  const informationService =
    platformAccessory.getService(Service.AccessoryInformation) ||
    platformAccessory.addService(Service.AccessoryInformation);

  const switchService =
    platformAccessory.getService(Service.Switch) ||
    platformAccessory.addService(Service.Switch, this.name);
  this.switchService = switchService;

  const theSerial = this.uniqueSerial.toString();

  informationService
    .setCharacteristic(Characteristic.Manufacturer, "script2 Manufacturer")
    .setCharacteristic(Characteristic.Model, "script2 Model")
    .setCharacteristic(Characteristic.SerialNumber, theSerial);

  const characteristic = switchService.getCharacteristic(Characteristic.On);
  characteristic.removeAllListeners("set");

  characteristic.removeAllListeners("get");

  if (this.deviceType === "stateless") {
    characteristic.on("set", this.setStatelessTrigger.bind(this));
    characteristic.on("get", callback => onceCallback(this.log, callback)(this.stopped ? new Error("Script2 device stopped.") : null, this.statelessTriggerOn === "off"));
    this.presentState(this.statelessTriggerOn === "off");
    return;
  }

  characteristic.on("set", this.setState.bind(this));

  if (this.stateCommand || this.fileState) {
    characteristic.on("get", (callback) => this.getState(callback, "homekit-get"));
  }

  if (startMonitoring) this.startMonitoring();
};

Script2DeviceLogic.prototype.startMonitoring = function () {
  if (this.stopped || this.deviceType === "stateless") return;
  this.stopMonitoring();
  if (this.fileState) {
    const update = state => {
      if (this.stopped) return;
      if (this.inFlightSet) { this.reconcileAfterSet = true; return; }
      this.currentState = state;
      this.presentState(state);
    };
    try {
      // Watching the parent also detects a flag that does not exist at startup.
      const parent = dirname(this.fileState);
      if (!existsSync(parent)) throw new Error("State-file parent directory does not exist.");
      this.watcher = this.watchFactory(parent, { alwaysStat: true, depth: 0 });
      this.watcher.on("error", () => this.log.error(`${this.name}: state-file watcher failed. Check the file path and permissions.`));
      this.watcher.on("add", path => { if (resolve(path) === resolve(this.fileState)) update(true); });
      this.watcher.on("unlink", path => { if (resolve(path) === resolve(this.fileState)) update(false); });
      update(existsSync(this.fileState));
    } catch {
      this.stopMonitoring();
      throw new Error("State-file watcher setup failed.");
    }
  } else if (this.stateCommand && this.polling) {
    if (this.pollingOnStart) this.pollStateAndUpdateCharacteristic(this.switchService);
    this.pollTimer = setInterval(() => {
      try { this.pollStateAndUpdateCharacteristic(this.switchService); }
      catch { this.log.error(`${this.name}: polling failed.`); }
    }, this.pollingInterval);
  }
};

Script2DeviceLogic.prototype.updateReachabilityFault = function (hasFault) {
  // Intentionally no-op for Switch accessories.
  // HomeKit does not define StatusFault as a supported characteristic for Service.Switch,
  // so writing it causes Homebridge to log warnings.
  // State-read errors are still propagated through callback errors and can surface to clients
  // as transient read failures (for example temporary "No Response" moments).
  void hasFault;
};

module.exports.Script2DeviceLogic = Script2DeviceLogic;
module.exports.Script2Platform = Script2Platform;
