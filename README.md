homebridge-script2
==============

Execute custom scripts via homekit apps.

Core of the code written by [@xxcombat](https://github.com/xxcombat/). Great plugin that has served me well.
Original plugin [homebridge-script](https://github.com/xxcombat/homebridge-script).

Because it appears that the original [homebridge-script](https://github.com/xxcombat/homebridge-script) plugin has stopped being maintained and supported and PR's are also not being accepted. I've updated it to allow for executing a state script or work by checking for the existance of a file. Thanks to [@ybizeul](https://github.com/ybizeul/) for the code snipet that allows for state.sh to execute. This plugin also works with the latest file-exists that broke the original plugin.
While this fork depends on file-exists there is no need to install it seperately for this fork, as i've included it as a dependency.


## Installation
(Requires node >=6.0.0)

1. Install homebridge using: `npm install -g homebridge`
2. Install this plugin using: `npm install -g homebridge-script2`
3. Update your configuration file. See examples below that show the plugin working by using filestate for current state check as well as an example using state.sh script for current state check.
4. Make sure scripts have been made executable (chmod +x scriptname.sh) and also accessible by the homebridge user. 

For autostart homebridge with OSX copy com.homebridge.startup.plist to /Library/LaunchDaemons

Homebridge-script configuration parameters

Name | Value | Required | Notes
----------- | ------- | -------------- | --------------
`accessory` | "Script2" | yes | Must be set to "Script2" and is required
`name` | _(custom)_ | yes | Name of accessory that will appear in homekit app and is required
`on` | _(custom)_ | yes | Location of script to execute the on action and is required
`off` | _(custom)_ | yes | Location of script to execute the off action and is required
`fileState` | _(custom)_ | fileState or state is required (see note) | Location of file that flags on or off current state. If this is configured the plugin will use the existence of this file to determine the current on or off state. If file exists, accessory is determined to be on. If file does not exist, accessory is determined to be off. This is not required. But if set, it will override using the state script. fileState or state must be configured.
`state` | _(custom)_ | fileState or state is required (see note) | Location of script to execute the current state check. It must output to stdout the current state. It is not required if fileState is being used instead. fileState or state must be configured.
`on_value` | _(custom)_ | no* (see note, default set to "true") | Used in conjunction with the state script. If using the state script this is the value that will be used to match against the state script output. If this value matches the output, then the accessory will be determined to be on. Required if using state script.

## Configuration

### Configuration example 1, using filestate for current state check:

```
"accessories": [
	{
              "accessory": "Script2",
              "name": "RPC3 Socket 1",
              "on": "/var/homebridge/rpc3control/on.sh 1",
              "off": "/var/homebridge/rpc3control/off.sh 1",
              "state": "/var/homebridge/rpc3control/state.sh 1",
              "fileState": "/var/homebridge/rpc3control/script1.flag",
              "on_value" : "true"
	}
]
```
#### Notes
##### Using the above configuration as an example:
- The on.sh script executes when you turn on the accessory via a homekit app. (In this case we are the using existence of a file to determine on or off current state, so you must insure the on.sh script creates the configured fileState file.
- The off.sh script executes when you turn off the accessory via a homekit app. ( In this case we are using existence of a file to determine on or off current state, insure the off.sh script deletes the configured fileState file.)
- The state.sh script in this case would not execute as fileState parameter overrides its use.
- The configured fileState file is used as a flag. When the homekit app checks for current state it checks for the existence of this file. If it exists, current state is on. If it does not exist, current state is off.
- The on_value in this case is not being used as it is only used when the state script is used to check for current state.

### Configuration example 2, executing state.sh script for current state check:
```
"accessories": [
	{
              "accessory": "Script2",
              "name": "Alarm of bike",
              "on": "~/on.sh",
              "off": "~/off.sh",
              "state": "~/state.sh",
              "on_value" : "true"
	}
]
```
#### Notes
##### Using the above configuration as an example:
- The on.sh script executes when you turn on the accessory via a homekit app. (In this case we are executing a state script to determine on or off current state.)
- The off.sh script executes when you turn off the accessory via a homekit app. ( In this case we are executing a state script to determine on or off current state.)
- The state.sh script in this case would be executed to check current state.  Insure that this script outputs to stdout the matching on value as configured by the on_value config parameter. If the on_value matches the on value output of this script then the accessory will be determined to be on.
- The configured fileState file is not used in this example. Because it was not configured, the state script is being used.
- The on_value in this case is used to match against the state script output. If the value matches the output of the state script, the accessory is determined to be on.

