homebridge-script
==============

Run custom script on the HomeBridge platform.

## Installation

1. Install homebridge using: `sudo npm install -g homebridge`
2. Install module: `sudo npm install -g file-exists`
2. Install this plugin using: `sudo npm install -g homebridge-script`
3. Update your configuration file. See `sample-config.json` in this repository for a sample.
4. Copy scripts (*.sh) files to own directory.

## Configuration

Configuration sample:

```
"accessories": [
	{
              "accessory": "Script",
              "name": "Alarm of bike",
              "on": "~/on.sh",
              "off": "~/off.sh",
              "state": "~/state.sh",
              "fileState": "/Users/olegmalovichko/script.flag",
              "on_value" : "true",
              "exact_match": true
              }
	}
]
```

![homekit](screen1.png "homekit")
![homebridge](screen2.png "homebridge")
