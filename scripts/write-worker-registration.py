"""Only external write: macOS startup registration. Retain a project backup."""
import datetime
import os
from pathlib import Path
import plistlib
import shutil
import sys

project, target = map(Path, sys.argv[1:])
logs = project / ".runtime/logs"
backups = project / ".runtime/backups"
logs.mkdir(parents=True, exist_ok=True)
backups.mkdir(parents=True, exist_ok=True)
target.parent.mkdir(parents=True, exist_ok=True)
if target.exists():
    shutil.copy2(target, backups / f"worker-{datetime.datetime.now():%Y%m%d%H%M%S}.plist")
config = {
    "Label": "com.mrmojorising.worker",
    "ProgramArguments": ["/bin/bash", str(project / "mac-server/start.sh")],
    "WorkingDirectory": str(project), "RunAtLoad": True, "KeepAlive": True,
    "ThrottleInterval": 15, "ExitTimeOut": 60,
    "StandardOutPath": str(logs / "worker.out.log"),
    "StandardErrorPath": str(logs / "worker.err.log"),
    "EnvironmentVariables": {"PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"},
}
temporary = target.with_suffix(".plist.pending")
with temporary.open("wb") as handle:
    plistlib.dump(config, handle)
os.replace(temporary, target)
