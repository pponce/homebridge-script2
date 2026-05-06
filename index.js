let Service;
let Characteristic;

const exec = require("child_process").exec;
const fileExists = require("file-exists");
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
  this.uniqueSerial = config["unique_serial"] || "script2 Serial Number";
  this.onValue = this.onValue.trim().toLowerCase();
  this.watcher = null;

  try {
    this.currentState = this.fileState ? fileExists.sync(this.fileState) : false;
  } catch (err) {
    this.log.error(`Error checking initial file state: ${err.message}`);
    this.currentState = false;
  }
}

Script2DeviceLogic.prototype.shutdown = function () {
  if (this.watcher) {
    this.watcher.close().catch((err) => {
      this.log.warn(`Error while closing file watcher for ${this.name}: ${err.message}`);
    });
    this.watcher = null;
  }
};

Script2DeviceLogic.prototype.setState = function (powerOn, callback) {
  this.log.info(`Setting ${this.name} to ${powerOn ? "ON" : "OFF"}...`);

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
    this.log.info(`Set ${this.name} to ${powerOn ? "ON" : "OFF"}`);

    callback(null, powerOn);
  });
};

Script2DeviceLogic.prototype.getState = function (callback) {
  this.log.info(`Getting ${this.name} state...`);

  if (this.fileState) {
    try {
      const poweredOn = fileExists.sync(this.fileState);
      this.log.info(`State of ${this.name} is: ${poweredOn ? "ON" : "OFF"}`);
      callback(null, poweredOn);
    } catch (err) {
      this.log.error(`Error checking file state: ${err.message}`);
      callback(err, null);
    }
    return;
  }

  if (this.stateCommand) {
    const command = this.stateCommand;
    this.log.debug(`Executing command: ${command}`);
    exec(command, (error, stdout, stderr) => {
      if (error || stderr) {
        const errMessage = stderr ? `${stderr} (${error.message})` : error.message;
        this.log.error(`Get State returned an error: ${errMessage}`);
        callback(new Error(errMessage), null);
        return;
      }

      const cleanCommandOutput = stdout.trim().toLowerCase();
      this.log.debug(`Get State Command returned ${cleanCommandOutput}`);

      const poweredOn = cleanCommandOutput == this.onValue;
      this.log.info(`State of ${this.name} is: ${poweredOn ? "ON" : "OFF"}`);
      callback(null, poweredOn);
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
    characteristic.on("get", this.getState.bind(this));
  }

  if (this.fileState) {
    const fileCreatedHandler = function (path) {
      if (!this.currentState) {
        this.log.info(`File "${path}" was created`);
        this.currentState = true;
        switchService.setCharacteristic(Characteristic.On, true);
      }
    }.bind(this);

    const fileRemovedHandler = function (path) {
      if (this.currentState) {
        this.log.info(`File "${path}" was deleted`);
        this.currentState = false;
        switchService.setCharacteristic(Characteristic.On, false);
      }
    }.bind(this);

    this.shutdown();
    this.watcher = chokidar.watch(this.fileState, { alwaysStat: true });
    this.watcher.on("add", fileCreatedHandler);
    this.watcher.on("unlink", fileRemovedHandler);
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
