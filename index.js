var Service;
var Characteristic;

var sys = require('sys');
    exec = require('child_process').exec;
    assign = require('object-assign');
    fileExists = require('file-exists');

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory('homebridge-script', 'Script', scriptAccessory);
}

function puts(error, stdout, stderr) {
   console.log(stdout)
}

function scriptAccessory(log, config) {
  this.log = log;
  this.service = 'Switch';

  this.name = config['name'];
  this.onCommand = config['on'];
  this.offCommand = config['off'];
  this.stateCommand = config['state'];
  this.onValue = config['on_value'];
  this.fileState = config['fileState'];
  this.onValue = this.onValue.trim().toLowerCase();
  this.exactMatch = config['exact_match'] || true;
}

scriptAccessory.prototype.matchesString = function(match) {
  if(this.exactMatch) {
    return (match === this.onValue);
  }
  else {
    return (match.indexOf(this.onValue) > -1);
  }
}

scriptAccessory.prototype.setState = function(powerOn, callback) {
  var accessory = this;
  var state = powerOn ? 'on' : 'off';
  var prop = state + 'Command';
  var command = accessory[prop];

    exec(command, puts);
    accessory.log('Set ' + accessory.name + ' to ' + state);
    callback(null);
}

scriptAccessory.prototype.getState = function(callback) {
  var accessory = this;
  var command = accessory['stateCommand'];
  var flagFile = fileExists(this.fileState);
    accessory.log('State of ' + accessory.name + ' is: ' + flagFile)
    callback(null, flagFile);
}

scriptAccessory.prototype.getServices = function() {
  var informationService = new Service.AccessoryInformation();
  var switchService = new Service.Switch(this.name);

  informationService
  .setCharacteristic(Characteristic.Manufacturer, 'script Manufacturer')
  .setCharacteristic(Characteristic.Model, 'script Model')
  .setCharacteristic(Characteristic.SerialNumber, 'script Serial Number');

  var characteristic = switchService.getCharacteristic(Characteristic.On)
  .on('set', this.setState.bind(this));

  if (this.stateCommand) {
    characteristic.on('get', this.getState.bind(this))
  };

  return [switchService];
}
