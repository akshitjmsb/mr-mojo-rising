"""Install the optional local lesson service without modifying the stem worker."""
import os
import plistlib
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent.parent
label = "com.mrmojorising.lessons"
agents = Path.home() / "Library/LaunchAgents"
agents.mkdir(parents=True, exist_ok=True)
logs = root / ".mmr-logs"
logs.mkdir(exist_ok=True)
plist = agents / f"{label}.plist"
payload = {
    "Label": label,
    "ProgramArguments": ["/bin/bash", str(root / "mac-server/start-lessons.sh")],
    "WorkingDirectory": str(root), "RunAtLoad": True, "KeepAlive": True,
    "ThrottleInterval": 30,
    "EnvironmentVariables": {"PATH": os.environ.get("PATH", "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"), "PYTHONUNBUFFERED": "1"},
    "StandardOutPath": str(logs / "lessons.log"), "StandardErrorPath": str(logs / "lessons.log"),
}
service = f"gui/{os.getuid()}"
subprocess.run(["launchctl", "bootout", service, str(plist)], capture_output=True)
plist.write_bytes(plistlib.dumps(payload))
subprocess.run(["launchctl", "bootstrap", service, str(plist)], check=True)
print("Mojo lesson worker installed. It runs while this Mac is awake and signed in.")
