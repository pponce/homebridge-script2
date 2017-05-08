var Service;
var Characteristic;

var sys = require('sys');
    exec = require('child_process').exec;
    assign = require('object-assign');
    fileExists = require('file-exists');

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory('homebridge-script2', 'Script2', script2Accessory);
}

function puts(error, stdout, stderr) {
   console.log(stdout)
}

function script2Accessory(log, config) {
  this.log = log;
  this.service = 'Switch';

  this.name = config['name'];
  this.onCommand = config['on'];
  this.offCommand = config['off'];
  this.stateCommand = config['state'];
  this.onValue = config['on_value'];
  this.fileState = config['fileState'] || false;
  this.onValue = this.onValue.trim().toLowerCase();
  this.serviceType = config['service_Type'];
  //this.exactMatch = config['exact_match'] || true;
}

/* 
  script2Accessory.prototype.matchesString = function(match) {
  if(this.exactMatch) {
    return (match === this.onValue);
  }
  else {
    return (match.indexOf(this.onValue) > -1);
  }
}
*/

script2Accessory.prototype.setState = function(powerOn, callback) {
  var accessory = this;
  var state = powerOn ? 'on' : 'off';
  var prop = state + 'Command';
  var command = accessory[prop];

    exec(command, puts);
    accessory.log('Set ' + accessory.name + ' to ' + state);
    callback(null);
}

script2Accessory.prototype.getState = function(callback) {
  var accessory = this;
  var command = accessory['stateCommand'];
  var stdout = "none";  
  
  if (this.fileState) {
    var flagFile = fileExists.sync(this.fileState);
    accessory.log('State of ' + accessory.name + ' is: ' + flagFile);
    callback(null, flagFile);
  }
  else {
    exec(command, function (error, stdout, stderr) {
      var cleanOut=stdout.trim().toLowerCase();
      accessory.log('State of ' + accessory.name + ' is: ' + cleanOut);
      callback(null, cleanOut == accessory.onValue);
    });
  }
}

script2Accessory.prototype.getServices = function() {
  var informationService = new Service.AccessoryInformation();

  informationService
  .setCharacteristic(Characteristic.Manufacturer, 'script2 Manufacturer')
  .setCharacteristic(Characteristic.Model, 'script2 Model')
  .setCharacteristic(Characteristic.SerialNumber, 'script2 Serial Number');  
  
  if (this.stateCommand || this.fileState) {
    if (this.serviceType == "switch") {
        var switchService = new Service.Switch(this.name);
        switchService
        .getCharacteristic(Characteristic.On)
        .on('get', this.getState.bind(this))
        .on('set', this.setState.bind(this));
    }
    else {
        var lockService = new Service.LockMechanism(this.name);
        lockService
        .getCharacteristic(Characteristic.LockCurrentState)
        .on('get', this.getState.bind(this));
       
        lockService
        .getCharacteristic(Characteristic.LockTargetState)
        .on('get', this.getState.bind(this))
        .on('set', this.setState.bind(this));
    }
}

  if (switchService) {return [switchService];}
  if (lockService) {return [lockService];}  
}
