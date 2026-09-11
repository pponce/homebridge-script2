"""Check heredoc publisher terminal handling without credentials or publication."""
import os
from pathlib import Path
import pty
import select
import subprocess
import sys

for script in ["scripts/publish-beta.sh", "scripts/update-and-publish-beta.txt",
               "scripts/publish-stable.sh", "scripts/update-and-publish-stable.txt"]:
    subprocess.run(["bash", "-n", script], check=True)
channel = sys.argv[1] if len(sys.argv) > 1 else "beta"
assert channel in ("beta", "stable")
tag = "beta" if channel == "beta" else "latest"
source = Path(f"scripts/publish-{channel}.sh").read_text()
helper = next(line for line in source.splitlines() if line.startswith("script2_interactive()"))
publish = next(line for line in source.splitlines() if line.startswith("script2_interactive npm publish"))
program = """bash <<'PROBE'
set -e
node -e 'if(process.stdin.isTTY)throw Error("Expected heredoc stdin"); console.log("Reproduced: heredoc stdin is not a terminal")'
""" + helper + """
npm() {
  node -e 'if(!process.stdin.isTTY || !process.stdout.isTTY)throw Error("TTY missing"); const a=process.argv.slice(1); for(const v of ["publish","--auth-type=web","--browser=false","__TAG__"])if(!a.includes(v))throw Error(v); console.log("PASS: publish receives terminal stdin/stdout and browser options")' -- "$@"
}
script2_archive=probe.tgz
script2_registry=https://registry.npmjs.org/
""" + publish + "\nPROBE\n"

program = program.replace("__TAG__", tag)
pid, fd = pty.fork()
if pid == 0:
    os.execvp("bash", ["bash", "-c", program])
output = b""
try:
    while True:
        ready, _, _ = select.select([fd], [], [], 10)
        if not ready:
            os.kill(pid, 9)
            raise RuntimeError("Publisher terminal probe timed out")
        try:
            chunk = os.read(fd, 4096)
        except OSError:
            break
        if not chunk:
            break
        output += chunk
finally:
    os.close(fd)
    _, status = os.waitpid(pid, 0)
print(output.decode())
assert os.waitstatus_to_exitcode(status) == 0
assert b"PASS:" in output
