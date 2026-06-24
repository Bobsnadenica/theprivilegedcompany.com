"""Isolated, cancellable subprocess runner for login-based AI providers."""
from __future__ import annotations

import os
import queue
import signal
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

MAX_CAPTURE_CHARS = 2_000_000
_SAFE_ENV_KEYS = {
    "APPDATA",
    "CODEX_HOME",
    "COMSPEC",
    "HOME",
    "HOMEDRIVE",
    "HOMEPATH",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "LANG",
    "LC_ALL",
    "LOCALAPPDATA",
    "NO_PROXY",
    "PATH",
    "SHELL",
    "SSL_CERT_DIR",
    "SSL_CERT_FILE",
    "SYSTEMROOT",
    "TEMP",
    "TERM",
    "TMP",
    "TMPDIR",
    "USER",
    "USERPROFILE",
    "WINDIR",
    "XDG_CACHE_HOME",
    "XDG_CONFIG_HOME",
}


class ProviderProcessError(RuntimeError):
    pass


class ProviderProcessTimeout(ProviderProcessError):
    pass


class ProviderProcessCancelled(ProviderProcessError):
    pass


@dataclass
class ProcessResult:
    returncode: int
    stdout: str
    stderr: str


def safe_provider_environment() -> dict[str, str]:
    """Return an environment that excludes app tokens, secrets, and API keys."""
    env = {
        key: value
        for key, value in os.environ.items()
        if key.upper() in _SAFE_ENV_KEYS or key.upper().startswith("LC_")
    }
    env["PYTHONNOUSERSITE"] = "1"
    return env


def _terminate_process(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
        else:
            os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=3)
    except (OSError, subprocess.TimeoutExpired):
        try:
            if os.name == "nt":
                proc.kill()
            else:
                os.killpg(proc.pid, signal.SIGKILL)
        except OSError:
            pass


def _reader(stream, source: str, events: queue.Queue) -> None:
    try:
        for line in iter(stream.readline, ""):
            events.put((source, line.rstrip("\r\n")))
    finally:
        events.put((source, None))


def run_streaming(
    cmd: list[str],
    *,
    timeout: int,
    cwd: str | Path,
    progress: Callable[[str], None] | None = None,
    cancel_event: threading.Event | None = None,
    on_stdout: Callable[[str], None] | None = None,
    on_stderr: Callable[[str], None] | None = None,
) -> ProcessResult:
    """Run a provider CLI while streaming lines and enforcing cancellation."""
    emit = progress or (lambda _message: None)
    creationflags = 0
    popen_kwargs = {"start_new_session": True}
    if os.name == "nt":
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP  # type: ignore[attr-defined]
        popen_kwargs = {}

    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(cwd),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            env=safe_provider_environment(),
            creationflags=creationflags,
            **popen_kwargs,
        )
    except OSError as exc:
        raise ProviderProcessError(str(exc)) from exc

    events: queue.Queue = queue.Queue()
    threads = [
        threading.Thread(target=_reader, args=(proc.stdout, "stdout", events), daemon=True),
        threading.Thread(target=_reader, args=(proc.stderr, "stderr", events), daemon=True),
    ]
    for thread in threads:
        thread.start()

    stdout_lines: list[str] = []
    stderr_lines: list[str] = []
    captured_chars = {"stdout": 0, "stderr": 0}
    streams_open = 2
    started = time.monotonic()
    next_heartbeat = started + 10

    try:
        while streams_open or proc.poll() is None:
            if cancel_event is not None and cancel_event.is_set():
                _terminate_process(proc)
                raise ProviderProcessCancelled("Операцията беше отменена.")

            elapsed = time.monotonic() - started
            if elapsed >= timeout:
                _terminate_process(proc)
                raise ProviderProcessTimeout(f"AI доставчикът не завърши за {timeout} секунди.")

            now = time.monotonic()
            if now >= next_heartbeat:
                remaining = max(0, timeout - int(elapsed))
                emit(f"AI still working · {int(elapsed)}s elapsed · {remaining}s remaining.")
                next_heartbeat = now + 10

            try:
                source, line = events.get(timeout=0.2)
            except queue.Empty:
                continue
            if line is None:
                streams_open -= 1
                continue
            target = stdout_lines if source == "stdout" else stderr_lines
            if captured_chars[source] < MAX_CAPTURE_CHARS:
                target.append(line)
                captured_chars[source] += len(line) + 1
            callback = on_stdout if source == "stdout" else on_stderr
            if callback:
                callback(line)
    finally:
        if proc.poll() is None:
            _terminate_process(proc)
        for thread in threads:
            thread.join(timeout=1)
        for stream in (proc.stdout, proc.stderr):
            if stream is not None:
                stream.close()

    return ProcessResult(
        returncode=int(proc.returncode or 0),
        stdout="\n".join(stdout_lines).strip(),
        stderr="\n".join(stderr_lines).strip(),
    )


class provider_workspace:
    """A fresh empty working directory removed after each provider call."""

    def __init__(self) -> None:
        self._temporary = None

    def __enter__(self) -> Path:
        self._temporary = tempfile.TemporaryDirectory(prefix="aipost247-provider-")
        path = Path(self._temporary.name)
        try:
            path.chmod(0o700)
        except OSError:
            pass
        return path

    def __exit__(self, *_args) -> None:
        if self._temporary is not None:
            self._temporary.cleanup()
