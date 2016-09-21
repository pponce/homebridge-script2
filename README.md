homebridge-script
==============

Run custom script on the HomeBridge platform.

## Installation

1. Install homebridge using: `npm install -g homebridge`
2. Install this plugin using: `npm install -g homebridge-script`
3. Update your configuration file. See `sample-config.json` in this repository for a sample.

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
              "on_value" : "true",
              "exact_match": true
              }
	}
]
```
