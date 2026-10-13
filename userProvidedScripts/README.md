# User-provided scripts

Optional scripts you can run with homebridge-script2. Each folder includes setup instructions and configuration examples.

## Before you run a script

**Review the source code and commands before running any script.** Only run scripts you understand and trust. Scripts can change configurations, access credentials, modify or delete data, and control connected devices. Check that their behavior and permissions are appropriate for your setup.

User-provided scripts are shared for convenience and provided **as is**, without warranty of any kind. Inclusion in this repository does not constitute endorsement or a guarantee of safety, correctness, or compatibility. You are responsible for reviewing, configuring, and running them. To the extent permitted by applicable law, the maintainers and contributors disclaim liability for damage, data loss, security issues, or other consequences arising from their use. See the repository's [MIT license](../LICENSE).

| Folder | Scripts |
| --- | --- |
| [Unifi](Unifi/) | Control a UniFi camera's Vision Enhancer floodlight with an On/Off switch. |

Install scripts separately from the plugin and run them as the same account as Homebridge. Commit configuration examples with placeholders; keep actual credentials and runtime files out of the repository.

## Contribute a script

Have a useful script for Script2? Contributions are welcome through a pull request.

1. Create a new, descriptive subfolder under `userProvidedScripts` and add your scripts. Include configuration examples with placeholders; keep actual credentials, logs, and runtime files out of the PR.
2. Add a `README.md` in your subfolder covering requirements, installation, usage, and the commands and settings to use in Script2. Include a link to the shared usage disclaimer above.
3. Add your folder to the table above with a relative link and a short description, following the existing [Unifi](Unifi/) entry. Use the Unifi folder as an example for the scripts, configuration files, and README.
4. Open a pull request explaining what the scripts do and how you tested them.

For example, add a table row like this:

```markdown
| [MyDevice](MyDevice/) | Brief description of what the scripts do. |
```
