let Service;
let Characteristic;

const exec = require("child_process").exec;
const fileExists = require("file-exists");
const chokidar = require("chokidar");

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory(
    "homebridge-script2",
    "Script2",
    script2Accessory
  );
};

function script2Accessory(log, config) {
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
  try {
    this.currentState = this.fileState
      ? fileExists.sync(this.fileState)
      : false;
  } catch (err) {
    this.log.error(`Error checking initial file state: ${err.message}`);
    this.currentState = false;
  }

  this.setStateHandler = function (powerOn, callback) {
    function setStateHandlerExecCallback(error, stdout, stderr) {
      if (error || stderr) {
        const errMessage = stderr
          ? `${stderr} (${error.message})`
          : error.message;
        this.log.error(`Set State returned an error: ${errMessage}`);
        callback(new Error(errMessage), null);
        return;
      }

      const commandOutput = stdout.trim().toLowerCase();
      this.log.debug(`Set State Command returned ${commandOutput}`);

      this.currentState = powerOn;
      this.log.info(`Set ${this.name} to ${powerOn ? "ON" : "OFF"}`);

      callback(null, powerOn);
    }

    const command = powerOn ? this.onCommand : this.offCommand;
    this.log.debug(`Executing command: ${command}`);
    exec(command, setStateHandlerExecCallback.bind(this));
  };

  this.getStateHandler = function (callback) {
    function getStateHandlerExecCallback(error, stdout, stderr) {
      if (error || stderr) {
        const errMessage = stderr
          ? `${stderr} (${error.message})`
          : error.message;
        this.log.error(`Get State returned an error: ${errMessage}`);
        callback(new Error(errMessage), null);
        return;
      }

      const cleanCommandOutput = stdout.trim().toLowerCase();
      this.log.debug(`Get State Command returned ${cleanCommandOutput}`);

      const poweredOn = cleanCommandOutput == this.onValue;
      this.log.info(`State of ${this.name} is: ${poweredOn ? "ON" : "OFF"}`);
      callback(null, poweredOn);
    }

    const command = this.stateCommand;
    this.log.debug(`Executing command: ${command}`);
    exec(command, getStateHandlerExecCallback.bind(this));
  };

  this.getFileStateHandler = function (callback) {
    try {
      const poweredOn = fileExists.sync(this.fileState);
      this.log.info(`State of ${this.name} is: ${poweredOn ? "ON" : "OFF"}`);
      callback(null, poweredOn);
    } catch (err) {
      this.log.error(`Error checking file state: ${err.message}`);
      callback(err, null);
    }
  };
}

script2Accessory.prototype.setState = function (powerOn, callback) {
  this.log.info(`Setting ${this.name} to ${powerOn ? "ON" : "OFF"}...`);
  this.setStateHandler(powerOn, callback);
};

script2Accessory.prototype.getState = function (callback) {
  this.log.info(`Getting ${this.name} state...`);
  if (this.fileState) {
    this.getFileStateHandler(callback);
  } else if (this.stateCommand) {
    this.getStateHandler(callback);
  } else {
    this.log.error("Must set config value for fileState or state.");
  }
};

script2Accessory.prototype.getServices = function () {
  const informationService = new Service.AccessoryInformation();
  const switchService = new Service.Switch(this.name);
  const theSerial = this.uniqueSerial.toString();

  informationService
    .setCharacteristic(Characteristic.Manufacturer, "script2 Manufacturer")
    .setCharacteristic(Characteristic.Model, "script2 Model")
    .setCharacteristic(Characteristic.SerialNumber, theSerial);

  const characteristic = switchService
    .getCharacteristic(Characteristic.On)
    .on("set", this.setState.bind(this));

  if (this.stateCommand || this.fileState) {
    characteristic.on("get", this.getState.bind(this));
  }

  if (this.fileState) {
    const fileCreatedHandler = function (path, stats) {
      if (!this.currentState) {
        this.log.info(`File "${path}" was created`);
        this.currentState = true;
        switchService.setCharacteristic(Characteristic.On, true);
      }
    }.bind(this);

    const fileRemovedHandler = function (path, stats) {
      if (this.currentState) {
        this.log.info(`File "${path}" was deleted`);
        this.currentState = false;
        switchService.setCharacteristic(Characteristic.On, false);
      }
    }.bind(this);

    const watcher = chokidar.watch(this.fileState, { alwaysStat: true });
    watcher.on("add", fileCreatedHandler);
    watcher.on("unlink", fileRemovedHandler);
  }
  return [informationService, switchService];
};
