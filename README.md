homebridge-script
==============

Run custom scripts on the HomeBridge platform.
Based on the work done by XXCOMABT
Original plugin https://github.com/xxcombat/homebridge-script

This fork Works with latest file-exists and can work with a file flag or state script to determin current on/off state.

## Installation

1. Install homebridge using: `npm install -g homebridge`
2. Install module: `npm install -g file-exists`
2. Install this plugin using: `npm install -g homebridge-script`
3. Update your configuration file. See `sample-config.json` in this repository for a sample.
4. Copy scripts (*.sh) files to own directory.

For autostart homebridge with OSX copy com.homebridge.startup.plist to /Library/LaunchDaemons

Homebridge-script configuration parameters

Name | Value | Notes
----------- | ------- | --------------
`accessory` | "Script" | Must be set to "Script" and is required
`name` | _(custom)_ | Name of accessory that will appear in homekit app and is required
`on` | _(custom)_ | Location of script to execute the on action and is required
`off` | _(custom)_ | Location of script to execute the off action and is required
`fileState` | _(custom)_ | Location of file that flags on or off current state. If this is configured the plugin will use the existance of this file to determin the current on or off state. If file exists, accessory is determined to be on. If file does not exist, accessory is determined to be off. This is not required. But if set, it will overide using the state script.
`state` | _(custom)_ | Location of script to execute the current state check. It must output to stdout the current state. It is not required if fileState is being used instead.
`on_value` | _(custom)_ | Used in conjunction with the state script. If using the state script this is the value that will be used to match against the state script output. If this value matches the output then the accessory will be dertermined to be on.

## Configuration

### Configuration example 1:

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
              }
	}
]
```
#### Notes
##### Using the above configuration as an example:
- The on.sh script executes when you turn on the accessory via a homekit app. (In this case we are the using existance of a file to determine on or off current state, so you must insure the on.sh script creates the configured fileState file.
- The off.sh script executes when you turn off the accessory via a homekt app. ( In this case we are using existance of a file to determine on or off current state, insure the off.sh script deletes the configured fileState file.)
- The state.sh script in this case would not execute as fileState parameter overrides its use.
- The configured fileState file is used as a flag. When the homekit app checks for current state it checks for the existance of this file. If it exists, current state is on. If it does not exist, current state is off.
- The on_value in this case is not being used as it is only used when the state script is used to check for current state.

### Configuration example 2:
```
"accessories": [
	{
              "accessory": "Script",
              "name": "Alarm of bike",
              "on": "~/on.sh",
              "off": "~/off.sh",
              "state": "~/state.sh",
              "on_value" : "true",
              }
	}
]
```
#### Notes
##### Using the above configuration as an example:
- The on.sh script executes when you turn on the accessory via a homekit app. (In this case we are executing a state script to determine on or off current state.)
- The off.sh script executes when you turn off the accessory via a homekt app. ( In this case we are executing a state script to determine on or off current state.)
- The state.sh script in this case would be executed to check current state.  Insure that this script outputs to stdout the matching on value as configured by the on_value config parameter. If the on_value matches the on value output of this script then the accessory will be determined to be on.
- The configured fileState file is not used in this example. Because it was not configured the state script is being used.
- The on_value in this case is used to match against the state script output. If the value matches the output of the state script the accessory is determined to be on.

