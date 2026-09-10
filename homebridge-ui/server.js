'use strict';
const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');
const { validate } = require('./public/validation');
class Script2UiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.onRequest('/validate', config => {
      try { return validate(config); }
      catch { return {valid:false, errors:['Could not validate Script2 settings.']}; }
    });
    this.ready();
  }
}
new Script2UiServer();
