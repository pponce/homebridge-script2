var Service;
var Characteristic;
const ServiceTypes = ['Garage Door Opener'];

var exec = require('child_process').exec;
var assign = require('object-assign');
var fileExists = require('file-exists');
var chokidar = require('chokidar');

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory('homebridge-script2-Garage-Fork', 'Script2-Garage-Fork', script2Accessory);
}

function puts(error, stdout, stderr) {
  console.log(stdout)
}

class script2Accessory {

  constructor(log, config) {
    this.log = log;
    //Deprecated
    //this.service = 'Switch';

    this.name = config['name'];
    //Accessory type
    this.service = config['accessory_type'];
    this.onCommand = config['on'];
    this.offCommand = config['off'];
    this.stateCommand = config['state'] || false;
    this.onValue = config['on_value'] || "true";
    this.fileState = config['fileState'] || false;
    if (!this.fileState) {
      this.onValue = this.onValue.trim().toLowerCase();
    }
    this.uniqueSerial = config['unique_serial'] || "script2 Serial Number";
  }



  setState(powerOn, callback) {
    var accessory = this;
    var state = powerOn ? 'on' : 'off'; //This is the old one.
    var prop = state + 'Command';
    var command = accessory[prop];

    exec(command, puts);
    accessory.log('Set ' + accessory.name + ' to ' + state);
    accessory.currentState = powerOn;
    callback(null);
  }


  getState(callback) {
    var accessory = this;

    if (this.fileState) {
      var flagFile = fileExists.sync(this.fileState);
      accessory.log('State of ' + accessory.name + ' is: ' + flagFile);
      callback(null, flagFile);
    }
    else if (this.stateCommand) {
      exec(this.stateCommand, function (error, stdout, stderr) {
        if (stderr) { return; }
        var cleanOut = stdout.trim().toLowerCase();
        accessory.log('State of ' + accessory.name + ' is: ' + cleanOut);
        callback(null, cleanOut == accessory.onValue);
      });
    }
    else {
      accessory.log('Must set config value for fileState or state.');
    }
  }


  getServices() {

    var serviceType = this.service;

    if (ServiceTypes.indexOf(serviceType)>=0){
      this.log('Error! Unable to find accessory type ' + serviceType + ' on the list of supported accessories. Check spelling or if it is supported.');
      return 0;
    }

    var informationService = new Service.AccessoryInformation();
    var switchService = new Service[serviceType](this.name);
    var theSerial = this.uniqueSerial.toString();

    informationService
      .setCharacteristic(Characteristic.Manufacturer, 'Script2-Garage-Fork Manufacturer')
      .setCharacteristic(Characteristic.Model, 'Script2-Garage-Fork Model')
      .setCharacteristic(Characteristic.SerialNumber, theSerial);

    var characteristic = switchService.getCharacteristic(Characteristic.CurrentDoorState)
      .on('set', this.setState.bind(this));

    if (this.stateCommand || this.fileState) {
      characteristic.on('get', this.getState.bind(this))
    };

    if (this.fileState) {
      var fileCreatedHandler = function (path, stats) {
        if (!this.currentState) {
          this.log('File ' + path + ' was created');
          switchService.setCharacteristic(Characteristic.On, true);
        }
      }.bind(this);

      var fileRemovedHandler = function (path, stats) {
        if (this.currentState) {
          this.log('File ' + path + ' was deleted');
          switchService.setCharacteristic(Characteristic.On, false);
        }
      }.bind(this);

      var watcher = chokidar.watch(this.fileState, { alwaysStat: true });
      watcher.on('add', fileCreatedHandler);
      watcher.on('unlink', fileRemovedHandler);
    }
    return [informationService, switchService];
  }
}