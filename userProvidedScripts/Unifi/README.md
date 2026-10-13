# Vision Enhancer floodlight

Use a Script2 On/Off switch to control the white floodlight on a UniFi camera with an attached Vision Enhancer. ON starts a background worker that renews a five-second lighting command every three seconds. OFF stops renewal and lets the last command expire. No worker runs while OFF.

Before use, review the scripts and the [user-provided scripts disclaimer](../README.md#before-you-run-a-script).

## Install

These scripts target Linux Mint or another Linux system with `/usr/bin/python3`, `sudo`, a `homebridge` account, and Homebridge storage at `/var/lib/homebridge`.

From your checkout of this repository:

```bash
bash userProvidedScripts/Unifi/install.sh
```

The installer uses the local Protect login already saved in `/var/lib/homebridge/config.json`, or prompts for one if it cannot find it. Select a controller and camera if more than one is found. The local account needs permission to run Protect alarm actions; Full Management is the supported setup for this example.

It installs the scripts in `/var/lib/homebridge/unifiFloodLight`, owned by `homebridge`, with directory/script permissions `750`. The private `config.json` has permissions `600`. Setup checks login and enhancer detection without turning on the light. Reinstalling preserves your saved configuration and backs up the previous helper.

Temporary installation files stay in this repository folder and are removed when the installer exits.

## Configure Script2

Add an **On/Off switch** in the Script2 settings:

| Setting | Value |
| --- | --- |
| Name | Vision Enhancer Floodlight |
| ON command | `/var/lib/homebridge/unifiFloodLight/floodlight.sh on` |
| OFF command | `/var/lib/homebridge/unifiFloodLight/floodlight.sh off` |
| State command | `/var/lib/homebridge/unifiFloodLight/floodlight.sh state` |
| ON match value | `true` |
| Polling | Enabled, every **5 seconds** |
| Command timeout | **30 seconds** |
| HomeKit set acknowledgement | **5 seconds** |

Leave the State File field empty. Save and restart the instance or child bridge running Script2.

[script2.example.json](script2.example.json) contains the equivalent JSON. Add its switch to your existing `on_off_switches` list; do not add a second Script2 platform. JSON timing values are milliseconds; the settings UI uses seconds. Give each additional switch a different name and serial.

## Test and logs

Run these commands as the same user as Homebridge and watch the actual light:

```bash
sudo -u homebridge /var/lib/homebridge/unifiFloodLight/floodlight.sh on
sudo -u homebridge /var/lib/homebridge/unifiFloodLight/floodlight.sh state
sudo -u homebridge /var/lib/homebridge/unifiFloodLight/floodlight.sh off
```

The state command prints `true` while the helper has a recent accepted lighting command, otherwise `false`. OFF can take a few seconds to extinguish the light. Protect's own motion/alarm rules can activate it independently; those activations are not reported by this state command.

Logs are `/var/lib/homebridge/unifiFloodLight/floodlight.log` and `floodlight.log.1`, capped at **1 MiB each / 2 MiB total**. To view recent entries:

```bash
sudo -u homebridge tail -n 40 /var/lib/homebridge/unifiFloodLight/floodlight.log
```

If a worker exits or an API request fails, state becomes OFF. Another ON command starts a new worker. Restarting Homebridge may stop renewal; a machine reboot leaves the helper OFF.

## Configuration and limits

[config.example.json](config.example.json) shows the fields with placeholders only. The live configuration is `/var/lib/homebridge/unifiFloodLight/config.json`; never commit that file. If you configure it manually, replace every placeholder and use the camera's 12-digit MAC address without separators. If the Protect password changes, switch OFF, update the private runtime configuration, then switch ON again.

The helper uses the internal [Alarm Manager action-test workaround](https://github.com/hjdhjd/homebridge-unifi-protect/issues/1297); it does not save an alarm. It accepts a local console's self-signed HTTPS certificate. API behavior may change with Protect updates. The helper was tested against a mock controller; verify operation with your own hardware.

Keeping the switch ON holds the light continuously, with no cooling pauses or maximum ON timer. Continuous overnight use has not been confirmed by Ubiquiti for this example.
