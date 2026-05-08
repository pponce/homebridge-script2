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
    const devices = Array.isArray(this.config.devices) ? this.config.devices : [];

    if (devices.length === 0) {
      this.log.warn("No devices configured for Script2Platform.");
      return;
    }

    const configuredUuids = new Set();

    for (const deviceConfig of devices) {
      const name = deviceConfig?.name;
      if (!name) {
        this.log.error("Skipping platform device with missing required 'name'.");
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

function Script2DeviceLogic(log, config) {
  this.log = log;
  this.service = "Switch";

  this.name = config["name"];
  this.onCommand = config["on"];
  this.offCommand = config["off"];
  this.stateCommand = config["state"] || false;
  this.onValue = config["on_value"] || "true";
  this.fileState = config["fileState"] || false;
  this.polling = config["polling"] || false;
  this.pollingInterval = Number(config["polling_interval"] || 5000);
  this.pollingOnStart =
    config["polling_on_start"] === undefined ? true : !!config["polling_on_start"];
  this.stateCacheTtlMs = Number(config["state_cache_ttl_ms"] ?? 1000);
  this.resetStateCacheOnSet = config["reset_state_cache_on_set"] === true;
  this.uniqueSerial = config["unique_serial"] || "script2 Serial Number";
  this.onValue = this.onValue.trim().toLowerCase();
  this.watcher = null;
  this.pollTimer = null;
  this.lastStateRead = null;
  this.lastStateReadAt = 0;
  this.inFlightStateCallbacks = null;

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

Script2DeviceLogic.prototype.pollStateAndUpdateCharacteristic = function (switchService) {
  this.getState((err, poweredOn) => {
    if (err) {
      this.log.warn(`Polling state failed for ${this.name}: ${err.message}`);
      return;
    }

    if (this.currentState !== poweredOn) {
      this.currentState = poweredOn;
      switchService.updateCharacteristic(Characteristic.On, poweredOn);
    }
  }, "polling");
};

Script2DeviceLogic.prototype.setState = function (powerOn, callback) {
  this.log.debug(`Setting ${this.name} to ${powerOn ? "ON" : "OFF"}...`);

  const command = powerOn ? this.onCommand : this.offCommand;
  this.log.debug(`Executing command: ${command}`);
  exec(command, (error, stdout, stderr) => {
    if (error || stderr) {
      const errMessage = stderr
        ? `${stderr} (${error?.message ?? "unknown error"})`
        : `${error?.message ?? "unknown error"}`;
      this.log.error(`Set State returned an error: ${errMessage}`);
      callback(new Error(errMessage), null);
      return;
    }

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

    callback(null, powerOn);
  });
};

Script2DeviceLogic.prototype.getState = function (callback, requestPath = "homekit-get") {
  this.log.debug(`Getting ${this.name} state...`);

  if (this.fileState) {
    try {
      const poweredOn = existsSync(this.fileState);
      this.log.info(`GetState ${this.name}: ${poweredOn ? "ON" : "OFF"} (path: ${requestPath}, source: file-state)`);
      callback(null, poweredOn, "file-state");
    } catch (err) {
      this.log.error(`Error checking file state: ${err.message}`);
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
      this.stateCacheTtlMs > 0 &&
      this.lastStateRead !== null &&
      now - this.lastStateReadAt <= this.stateCacheTtlMs
    ) {
      this.log.info(`GetState ${this.name}: ${this.lastStateRead ? "ON" : "OFF"} (path: ${requestPath}, source: ttl-cache)`);
      callback(null, this.lastStateRead, "ttl-cache");
      return;
    }

    if (this.inFlightStateCallbacks) {
      this.log.debug(`State get for ${this.name} served from in-flight request.`);
      this.inFlightStateCallbacks.push((err, poweredOn, source) => {
        if (err) {
          callback(err, null, source);
          return;
        }

        this.log.info(`GetState ${this.name}: ${poweredOn ? "ON" : "OFF"} (path: ${requestPath}, source: in-flight-coalesced)`);
        callback(null, poweredOn, "in-flight-coalesced");
      });
      return;
    }

    this.inFlightStateCallbacks = [callback];
    const command = this.stateCommand;
    this.log.debug(`Executing command: ${command}`);
    exec(command, (error, stdout, stderr) => {
      const pendingCallbacks = this.inFlightStateCallbacks || [];
      this.inFlightStateCallbacks = null;
      const cleanCommandOutput = stdout.trim().toLowerCase();
      this.log.debug(`Get State Command returned ${cleanCommandOutput}`);

      if (stderr && stderr.trim().length > 0) {
        this.log.warn(`Get State Command stderr: ${stderr.trim()}`);
      }

      if (!cleanCommandOutput) {
        const errMessage = error
          ? error.message
          : "Get State command returned empty output.";
        this.log.error(`Get State returned an error: ${errMessage}`);
        pendingCallbacks.forEach((cb) => cb(new Error(errMessage), null));
        return;
      }

      if (error) {
        this.log.warn(
          `Get State command exited non-zero (${error.code ?? "unknown"}) but returned stdout; using stdout for state.`
        );
      }

      const poweredOn = cleanCommandOutput == this.onValue;
      this.log.info(`GetState ${this.name}: ${poweredOn ? "ON" : "OFF"} (path: ${requestPath}, source: state-script)`);
      this.lastStateRead = poweredOn;
      this.lastStateReadAt = Date.now();
      pendingCallbacks.forEach((cb) => cb(null, poweredOn, "state-script"));
    });
    return;
  }

  this.log.error("Must set config value for fileState or state.");
  callback(new Error("Must set config value for fileState or state."), null);
};

Script2DeviceLogic.prototype.bindServices = function (platformAccessory) {
  const informationService =
    platformAccessory.getService(Service.AccessoryInformation) ||
    platformAccessory.addService(Service.AccessoryInformation);

  const switchService =
    platformAccessory.getService(Service.Switch) ||
    platformAccessory.addService(Service.Switch, this.name);

  const theSerial = this.uniqueSerial.toString();

  informationService
    .setCharacteristic(Characteristic.Manufacturer, "script2 Manufacturer")
    .setCharacteristic(Characteristic.Model, "script2 Model")
    .setCharacteristic(Characteristic.SerialNumber, theSerial);

  const characteristic = switchService.getCharacteristic(Characteristic.On);
  characteristic.removeAllListeners("set");
  characteristic.on("set", this.setState.bind(this));

  characteristic.removeAllListeners("get");
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
