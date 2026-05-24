'use strict';

const { HomebridgePluginUiServer } = require('@homebridge/plugin-ui-utils');

class Script2UiServer extends HomebridgePluginUiServer {
  constructor() {
    super();
    this.ready();
  }
}

(() => new Script2UiServer())();
