let Service;
let Characteristic;

const exec = require("child_process").exec;
const { existsSync } = require("fs");
const chokidar = require("chokidar");

const PLUGIN_NAME = "homebridge-script2";
const ACCESSORY_NAME = "Script2";
const PLATFORM_NAME = "Script2Platform";

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  // Legacy accessory mode (backward compatible)
  homebridge.registerAccessory(PLUGIN_NAME, ACCESSORY_NAME, script2Accessory);

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
  const legacyDevices = Array.isArray(config?.devices) ? config.devices : [];
  const statefulDevices = Array.isArray(config?.on_off_switches)
    ? config.on_off_switches.map((device) => ({ ...device, device_type: "switch" }))
    : Array.isArray(config?.["On/Off Switches"])
      ? config["On/Off Switches"].map((device) => ({ ...device, device_type: "switch" }))
      : Array.isArray(config?.stateful_devices)
        ? config.stateful_devices.map((device) => ({ ...device, device_type: "switch" }))
        : [];
  const statelessDevices = Array.isArray(config?.stateless_switches)
    ? config.stateless_switches.map((device) => ({ ...device, device_type: "stateless" }))
    : Array.isArray(config?.["Stateless Switches"])
      ? config["Stateless Switches"].map((device) => ({ ...device, device_type: "stateless" }))
      : Array.isArray(config?.stateless_devices)
        ? config.stateless_devices.map((device) => ({ ...device, device_type: "stateless" }))
        : [];

  return [...legacyDevices, ...statefulDevices, ...statelessDevices];
}

class Script2Platform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;
    this.accessories = new Map();
    this.instances = new Map();

    this.api.on("didFinishLaunching", () => {
      this.discoverDevices();
    });
  }

  configureAccessory(accessory) {
    this.log.info(`Restoring cached accessory: ${accessory.displayName}`);
    this.accessories.set(accessory.UUID, accessory);
  }

  discoverDevices() {
    const devices = getConfiguredDevices(this.config);

    if (devices.length === 0) {
      this.log.warn("No devices configured for Script2Platform.");
      return;
    }

    const configuredUuids = new Set();

    for (const rawDeviceConfig of devices) {
      const deviceConfig = sanitizeDeviceConfig(rawDeviceConfig);
      const name = deviceConfig?.name;
      if (!name) {
        this.log.debug("Ignoring incomplete device entry without name.");
        continue;
      }

      const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${name}`);
      configuredUuids.add(uuid);

      let platformAccessory = this.accessories.get(uuid);
      if (platformAccessory) {
        this.log.info(`Configuring cached platform accessory: ${name}`);
        platformAccessory.context.device = deviceConfig;
        this.api.updatePlatformAccessories([platformAccessory]);
      } else {
        this.log.info(`Adding new platform accessory: ${name}`);
        platformAccessory = new this.api.platformAccessory(name, uuid);
        platformAccessory.context.device = deviceConfig;
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [platformAccessory]);
        this.accessories.set(uuid, platformAccessory);
      }

      const instance = new Script2DeviceLogic(this.log, platformAccessory.context.device);
      instance.bindServices(platformAccessory);
      this.instances.set(uuid, instance);
    }

    for (const [uuid, accessory] of this.accessories.entries()) {
      if (!configuredUuids.has(uuid)) {
        this.log.info(`Removing stale cached accessory: ${accessory.displayName}`);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        this.accessories.delete(uuid);
        const staleInstance = this.instances.get(uuid);
        if (staleInstance) {
          staleInstance.shutdown();
          this.instances.delete(uuid);
        }
      }
    }
  }
}

function script2Accessory(log, config) {
  this.logic = new Script2DeviceLogic(log, config);
}

script2Accessory.prototype.setState = function (powerOn, callback) {
  this.logic.setState(powerOn, callback);
};

script2Accessory.prototype.getState = function (callback) {
  this.logic.getState(callback);
};

script2Accessory.prototype.getServices = function () {
  return this.logic.buildServices();
};

function Script2DeviceLogic(log, config, commandExecutor = exec) {
  this.log = log;
  this.service = "Switch";

  this.name = config["name"];
  this.onCommand = config["on"];
  this.offCommand = config["off"];
  this.deviceType = config["device_type"] === "stateless" ? "stateless" : "switch";
  this.triggerCommand = config["trigger"] || config["on"] || false;
  this.autoResetMs = Number(config["auto_reset_ms"] || 500);
  this.commandTimeout = Number(config["command_timeout"] ?? 10000);
  this.homekitSetAckTimeoutMs = Number(config["homekit_set_ack_timeout_ms"] ?? 5000);
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
  this.onValue = this.onValue.trim().toLowerCase();
  this.watcher = null;
  this.pollTimer = null;
  this.lastStateRead = null;
  this.lastStateReadAt = 0;
  this.inFlightStateRequest = null;
  this.deferredStateRequests = [];
  this.reconcileAfterSet = false;
  this.stateGeneration = 0;
  this.switchService = null;
  this.commandExecutor = commandExecutor;
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
      `Invalid homekit_set_ack_timeout_ms '${this.homekitSetAckTimeoutMs}' for ${this.name}; using default 5000ms.`
    );
    this.homekitSetAckTimeoutMs = 5000;
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

Script2DeviceLogic.prototype.formatCommandDiagnostics = function (
  action,
  command,
  error,
  stdout,
  stderr
) {
  const exitCode = error?.code ?? 0;
  const signal = error?.signal ? `, signal=${error.signal}` : "";
  const errorMessage = error?.message ?? "none";
  const trimmedStdout = (stdout ?? "").trim();
  const trimmedStderr = (stderr ?? "").trim();

  // child_process.exec() sets killed=true when the process was terminated
  // because the configured timeout was reached.
  if (error?.killed === true) {
    return `${this.name} ${action} command timed out after ${this.commandTimeout}ms`;
  }

  return `${this.name} ${action} command diagnostics: exitCode=${exitCode}${signal}, errorMessage="${errorMessage}", stdout="${trimmedStdout}", stderr="${trimmedStderr}", command="${command}"`;
};

Script2DeviceLogic.prototype.shutdown = function () {
  if (this.pollTimer) {
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  if (this.watcher) {
    this.watcher.close().catch((err) => {
      this.log.warn(`Error while closing file watcher for ${this.name}: ${err.message}`);
    });
    this.watcher = null;
  }
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
      switchService.updateCharacteristic(Characteristic.On, poweredOn);
    }
  }, "polling");
};

Script2DeviceLogic.prototype.setState = function (powerOn, callback) {
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
  const entry = { callback, requestedState, settled: false, timer: null };

  if (this.homekitSetAckTimeoutMs > 0) {
    entry.timer = setTimeout(() => {
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
  this.log.debug(`Executing command: ${command}`);
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
      this.log.debug(`Set State Command returned ${commandOutput}`);

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

  this.getState((error, poweredOn, source, nonFatalError) => {
    if (
      !error &&
      (shouldUpdateCharacteristic || mustReconcileAcknowledgedFailure) &&
      this.switchService
    ) {
      this.currentState = poweredOn;
      this.switchService.updateCharacteristic(Characteristic.On, poweredOn);
    }
    this.resolveDeferredStateRequests(error, poweredOn, source, nonFatalError);
  }, "post-set-reconciliation", true);
};

Script2DeviceLogic.prototype.getState = function (
  callback,
  requestPath = "homekit-get",
  bypassCache = false
) {
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
    this.log.debug(`Executing command: ${command}`);
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
      this.log.debug(`Get State Command returned ${cleanCommandOutput}`);

      if (stderr && stderr.trim().length > 0) {
        this.log.warn(`Get State Command stderr: ${stderr.trim()}`);
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
        if (this.failOnStateExitCode) {
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
  const triggerOnOnAction = this.statelessTriggerOn !== "off";
  const shouldTrigger = triggerOnOnAction ? powerOn : !powerOn;
  const resetState = triggerOnOnAction ? false : true;

  if (!shouldTrigger) {
    callback(null, powerOn);
    return;
  }

  const command = this.triggerCommand;
  if (!command) {
    callback(new Error("Missing required trigger command for stateless device."), null);
    return;
  }

  this.log.debug(`Triggering ${this.name} stateless action...`);
  this.log.debug(`Executing command: ${command}`);
  this.commandExecutor(command, { timeout: this.commandTimeout }, (error, stdout, stderr) => {
    if (error || stderr) {
      const diagnostics = this.formatCommandDiagnostics("trigger", command, error, stdout, stderr);
      const errMessage = `Stateless trigger returned an error. ${diagnostics}`;
      this.log.error(errMessage);
      callback(new Error(errMessage), null);
      return;
    }

    this.log.info(`Triggered ${this.name} stateless action`);
    callback(null, shouldTrigger);

    const resetDelay = Number.isFinite(this.autoResetMs) && this.autoResetMs >= 0 ? this.autoResetMs : 500;
    setTimeout(() => {
      if (this.switchService) {
        this.switchService.updateCharacteristic(Characteristic.On, resetState);
      }
    }, resetDelay);
  });
};

Script2DeviceLogic.prototype.bindServices = function (platformAccessory) {
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
    characteristic.on("get", (callback) => callback(null, this.statelessTriggerOn === "off"));
    return;
  }

  characteristic.on("set", this.setState.bind(this));

  if (this.stateCommand || this.fileState) {
    characteristic.on("get", (callback) => this.getState(callback, "homekit-get"));
  }

  if (this.fileState) {
    const fileCreatedHandler = function (path) {
      if (!this.currentState) {
        this.log.debug(`File "${path}" was created`);
        this.currentState = true;
        switchService.setCharacteristic(Characteristic.On, true);
      }
    }.bind(this);

    const fileRemovedHandler = function (path) {
      if (this.currentState) {
        this.log.debug(`File "${path}" was deleted`);
        this.currentState = false;
        switchService.setCharacteristic(Characteristic.On, false);
      }
    }.bind(this);

    this.shutdown();
    this.watcher = chokidar.watch(this.fileState, { alwaysStat: true });
    this.watcher.on("add", fileCreatedHandler);
    this.watcher.on("unlink", fileRemovedHandler);
  }

  if (!this.fileState && this.stateCommand && this.polling) {
    if (!Number.isFinite(this.pollingInterval) || this.pollingInterval <= 0) {
      this.log.warn(
        `Invalid polling_interval '${this.pollingInterval}' for ${this.name}; using default 5000ms.`
      );
      this.pollingInterval = 5000;
    }

    if (this.pollingOnStart) {
      this.pollStateAndUpdateCharacteristic(switchService);
    }

    this.pollTimer = setInterval(() => {
      this.pollStateAndUpdateCharacteristic(switchService);
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

Script2DeviceLogic.prototype.buildServices = function () {
  const informationService = new Service.AccessoryInformation();
  const switchService = new Service.Switch(this.name);
  const platformAccessory = {
    getService: (svcType) => {
      if (svcType === Service.AccessoryInformation) {
        return informationService;
      }
      if (svcType === Service.Switch) {
        return switchService;
      }
      return null;
    },
    addService: () => null,
  };

  this.bindServices(platformAccessory);
  return [informationService, switchService];
};

module.exports.Script2DeviceLogic = Script2DeviceLogic;
