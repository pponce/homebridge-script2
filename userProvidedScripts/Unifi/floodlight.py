#!/usr/bin/python3
"""Standalone Vision Enhancer hold-on helper for homebridge-script2."""
import contextlib
import fcntl
import getpass
import http.cookiejar
import json
import os
from pathlib import Path
import re
import signal
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE = Path(__file__).resolve().parent
PERIOD, DURATION, TIMEOUT = 3.0, 5000, 3.0
LOG_LIMIT = 1024 * 1024

def read(name, default=None):
    try:
        return json.loads((BASE / name).read_text())
    except (OSError, ValueError):
        return default

def write(name, value):
    fd, tmp = tempfile.mkstemp(prefix=".write-", dir=BASE)
    try:
        with os.fdopen(fd, "w") as out:
            json.dump(value, out)
        os.replace(tmp, BASE / name)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)

def remove(name):
    (BASE / name).unlink(missing_ok=True)

@contextlib.contextmanager
def lock():
    with (BASE / "command.lock").open("a") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        yield

class Cancelled(Exception):
    pass

def log_event(message):
    # Two files, each capped at 1 MiB; never write credentials or API bodies.
    entry = (time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()) + " " + str(message)[:2000] + "\n").encode()
    try:
        with (BASE / "log.lock").open("a") as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            path = BASE / "floodlight.log"
            if path.exists() and path.stat().st_size + len(entry) > LOG_LIMIT:
                if path.stat().st_size > LOG_LIMIT:
                    with path.open("rb") as old:
                        old.seek(-LOG_LIMIT, os.SEEK_END)
                        tail = old.read(LOG_LIMIT)
                    with path.open("wb") as old:
                        old.write(tail)
                os.replace(path, BASE / "floodlight.log.1")
            with path.open("ab") as out:
                out.write(entry)
    except OSError:
        pass

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None

class Protect:
    def __init__(self, config):
        self.config, self.csrf, self.logged_in = config, "", False
        # Protect local consoles commonly use self-signed certificates.
        self.http = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), NoRedirect(),
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
            urllib.request.HTTPSHandler(context=ssl._create_unverified_context()))

    def raw(self, path, body=None):
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if self.csrf:
            headers["X-CSRF-Token"] = self.csrf
        req = urllib.request.Request(self.config["url"] + path,
            data=None if body is None else json.dumps(body).encode(), headers=headers)
        with self.http.open(req, timeout=TIMEOUT) as response:
            self.csrf = response.headers.get("X-CSRF-Token", self.csrf)
            return response.read()

    def request(self, path, body=None, wanted=lambda: True):
        try:
            for attempt in range(2):
                if not wanted():
                    raise Cancelled()
                if not self.logged_in:
                    self.raw("/api/auth/login", {"username": self.config["username"],
                        "password": self.config["password"], "rememberMe": True})
                    self.logged_in = True
                if not wanted():
                    raise Cancelled()
                try:
                    return self.raw(path, body)
                except urllib.error.HTTPError as err:
                    if err.code not in (401, 403) or attempt:
                        raise
                    self.logged_in = False
        except urllib.error.HTTPError as err:
            raise RuntimeError("Protect returned HTTP %s; check login permissions and API support." % err.code) from None
        except (OSError, urllib.error.URLError):
            raise RuntimeError("Cannot reach the Protect controller, or the request timed out.") from None

    def cameras(self):
        try:
            return json.loads(self.request("/proxy/protect/api/bootstrap"))["cameras"]
        except (ValueError, KeyError, TypeError):
            raise RuntimeError("Protect returned an unexpected camera list.") from None

    def light(self, token, wanted=lambda: True):
        payload = {"name": "Homebridge Vision Enhancer", "enable": False,
            "conditions": [{"condition": {"type": "is", "source": "webhook", "value": ""}}],
            "schedules": [], "actions": [{"type": "SET_LIGHT", "order": -1,
                "metadata": {"enable": True, "duration": DURATION,
                    "sources": [{"device": self.config["mac"], "type": "include"}]}}]}
        self.request("/proxy/protect/api/automations/run", payload,
            wanted=lambda: wanted() and read("requested.json") == token)

def enhancer(camera):
    flags = camera.get("featureFlags", {}).get("hotplug", {}).get("extender", {})
    return flags.get("isAttached") is True and flags.get("hasFlash") is True

def choose(items, label):
    if not items:
        raise RuntimeError("No " + label + " found.")
    for index, item in enumerate(items, 1):
        print("%d. %s" % (index, item.get("name") or item.get("address") or item.get("mac")))
    if len(items) == 1:
        return items[0]
    answer = input("Select %s number: " % label).strip()
    if not answer.isdigit() or not 1 <= int(answer) <= len(items):
        raise RuntimeError("Invalid selection; run the installer again.")
    return items[int(answer) - 1]

def configure():
    config = read("config.json")
    if config is None:
        hb = read("../config.json", {})
        controllers = [c for p in hb.get("platforms", []) if p.get("platform") == "UniFi Protect"
            for c in p.get("controllers", []) if c.get("address") and c.get("username") and c.get("password")]
        if controllers:
            print("Using a local Protect login already saved in Homebridge:")
            c = choose(controllers, "Protect controller")
            address, username, password = c["address"], c["username"], c["password"]
        else:
            address = input("Protect controller IP or HTTPS address: ").strip()
            username = input("Local Protect username (with Full Management): ").strip()
            password = getpass.getpass("Local Protect password (hidden): ")
        url = urllib.parse.urlsplit(address if "://" in address else "https://" + address)
        if url.scheme != "https" or not url.hostname or url.username or url.password or url.query or url.fragment or url.path not in ("", "/"):
            raise RuntimeError("Enter only the controller hostname/IP or its HTTPS address.")
        config = {"url": urllib.parse.urlunsplit((url.scheme, url.netloc, "", "", "")),
            "username": username, "password": password}
        camera = choose([c for c in Protect(config).cameras() if enhancer(c)], "camera with a Vision Enhancer")
        config["mac"] = re.sub("[:-]", "", camera["mac"]).upper()
        config["name"] = camera.get("name", "AI Pro")
        if not re.fullmatch(r"[0-9A-F]{12}", config["mac"]):
            raise RuntimeError("Invalid camera MAC returned by Protect.")
        write("config.json", config)
    else:
        cameras = Protect(config).cameras()
        if not any(re.sub("[:-]", "", c.get("mac", "")).upper() == config["mac"] and enhancer(c) for c in cameras):
            raise RuntimeError("The saved camera's attached Vision Enhancer was not detected.")
    print("Login and enhancer detection passed for: " + config["name"])
    print("The installer has not activated the floodlight.")

def alive():
    # The worker holds this lock for its lifetime. Never signal an unchecked PID.
    with (BASE / "worker.lock").open("a") as handle:
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return False
        except BlockingIOError:
            return True

def start_worker():
    # Caller holds command.lock; the child takes worker.lock BEFORE command.lock.
    if alive():
        return
    child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), "worker"],
        stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        close_fds=True, start_new_session=True)
    deadline = time.monotonic() + 3
    while time.monotonic() < deadline:
        if alive():
            return
        if child.poll() is not None:
            break
        time.sleep(0.02)
    if child.poll() is None:
        child.terminate()
    raise RuntimeError("Could not start the worker. Check unifiFloodLight/floodlight.log.")

def worker_pid():
    ready = read("ready.json", {})
    try:
        return int(ready["pid"])
    except (KeyError, TypeError, ValueError):
        return None

def active():
    token, status = read("requested.json"), read("status.json", {})
    return bool(token and status.get("token") == token and not status.get("error")
        and 0 <= time.monotonic() - status.get("at", 0) < DURATION / 1000 and alive())

def command(action):
    if action == "state":
        print("true" if active() else "false")
        return
    with lock():
        if action == "off":
            remove("requested.json")
            remove("status.json")
            log_event("OFF requested; timed illumination will expire.")
            print("OFF; the last timed pulse will expire shortly.")
            return
        token = read("requested.json") if alive() else None
        if not token:
            token = uuid.uuid4().hex
            remove("status.json")
        write("requested.json", token)
        try:
            start_worker()
        except RuntimeError:
            remove("requested.json")
            raise
    deadline = time.monotonic() + 18
    while time.monotonic() < deadline:
        status = read("status.json", {})
        if status.get("token") == token:
            if status.get("error"):
                raise RuntimeError(status["error"])
            if active():
                print("ON; Protect accepted the lighting command.")
                return
        if read("requested.json") != token:
            raise RuntimeError("ON request was cancelled.")
        if not alive():
            with lock():
                if read("requested.json") == token:
                    remove("requested.json")
            raise RuntimeError("The lighting worker exited; check floodlight.log and switch ON again.")
        time.sleep(0.1)
    with lock():
        if read("requested.json") == token:
            remove("requested.json")
    raise RuntimeError("No successful lighting command within 18 seconds; ON was cancelled.")

def worker():
    config = read("config.json")
    if not config:
        raise RuntimeError("Run configure first.")
    singleton = (BASE / "worker.lock").open("a")
    try:
        fcntl.flock(singleton, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise RuntimeError("The floodlight worker is already running.") from None
    api = Protect(config)
    stopping = False
    def stop(signum, frame):
        nonlocal stopping
        stopping = True
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    current, next_at = None, 0
    def finish():
        # Release lifecycle ownership while still holding command.lock, so a new
        # ON cannot accidentally reuse a worker that has already decided to exit.
        if singleton.closed:
            return
        if worker_pid() == os.getpid():
            remove("ready.json")
        if stopping and read("requested.json") == current:
            remove("requested.json")
            remove("status.json")
        singleton.close()
        log_event("Worker stopped.")
    try:
        with lock():
            write("ready.json", {"pid": os.getpid()})
        log_event("Worker started.")
        while True:
            with lock():
                token = read("requested.json")
                if not token or stopping:
                    finish()
                    return
            if token != current or time.monotonic() >= next_at:
                first_pulse = token != current
                current = token
                started = time.monotonic()
                try:
                    api.light(token, wanted=lambda: not stopping)
                    # Use request start time conservatively: no physical-state feedback exists.
                    with lock():
                        if read("requested.json") == token:
                            write("status.json", {"token": token, "at": started})
                            if first_pulse:
                                log_event("ON; Protect accepted the lighting command.")
                    next_at = started + PERIOD
                except Cancelled:
                    pass
                except Exception as err:
                    message = str(err) if isinstance(err, RuntimeError) else "Unexpected helper error (%s)." % type(err).__name__
                    with lock():
                        if read("requested.json") == token:
                            write("status.json", {"token": token, "error": message})
                            remove("requested.json")
                            log_event("Lighting stopped: " + message)
                            finish()
                            return
            time.sleep(0.2)
    finally:
        with lock():
            finish()

if __name__ == "__main__":
    os.umask(0o077)
    try:
        action = sys.argv[1] if len(sys.argv) == 2 else ""
        if action == "configure":
            configure()
        elif action == "worker":
            worker()
        elif action in ("on", "off", "state"):
            command(action)
        else:
            raise RuntimeError("Usage: floodlight.py configure|on|off|state|worker")
    except (RuntimeError, OSError, ValueError, KeyError) as err:
        message = str(err) if isinstance(err, RuntimeError) else "Configuration or file error (%s)." % type(err).__name__
        if action == "worker":
            log_event(message)
        print(message, file=sys.stderr)
        sys.exit(1)
    except (KeyboardInterrupt, EOFError):
        print("Setup cancelled.", file=sys.stderr)
        sys.exit(1)
