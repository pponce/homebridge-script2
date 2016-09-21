var Service;
var Characteristic;

var sys = require('sys');
    exec = require('child_process').exec;
    assign = require('object-assign');

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory('homebridge-script', 'Script', scriptAccessory);
}

function puts(error, stdout, stderr) {
   sys.puts(stdout)
}

function scriptAccessory(log, config) {
  this.log = log;
  this.service = 'Switch';

  this.name = config['name'];
  this.onCommand = config['on'];
  this.offCommand = config['off'];
  this.stateCommand = config['state'];
  this.onValue = config['on_value'] || "playing";
  this.onValue = this.onValue.trim().toLowerCase();
  this.exactMatch = config['exact_match'] || true;
  this.script = assign({
    user: config['user'],
    host: config['host'],
    password: config['password'],
    key: config['key']
  }, config['script']);
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

//  var stream = ssh(command, accessory.script);

//  stream.on('error', function (err) {
//    accessory.log('Error: ' + err);
//    callback(err || new Error('Error setting ' + accessory.name + ' to ' + state));
 // });
//
//  stream.on('finish', function () {
    exec(command, puts);
    accessory.log('Set ' + accessory.name + ' to ' + 'state000');
    callback(null);
//  });
}

scriptAccessory.prototype.getState = function(callback) {
  var accessory = this;
  var command = accessory['stateCommand'];

 // var stream = script(command, accessory.script);

  //stream.on('error', function (err) {
//    accessory.log('Error: ' + err);
//    callback(err || new Error('Error getting state of ' + accessory.name));
 // });

  //stream.on('data', function (data) {
//    var state = data.toString('utf-8').trim().toLowerCase();
    exec(command, puts);
    accessory.log('State of ' + accessory.name + ' is: ' + 'state000');
    callback(null, accessory.matchesString('state000'));
//  });
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
