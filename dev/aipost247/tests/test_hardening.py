from __future__ import annotations

import io
import json
import subprocess
import sys
import tempfile
import threading
import unittest
from email.message import Message
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from aipost247 import app, business, cli_provider, config, dashboard
from aipost247.facebook_client import FacebookAmbiguousWriteError, FacebookClient
from aipost247.instance_lock import AlreadyRunning, InstanceLock
from aipost247.memory import MemoryStore
from aipost247.provider_runtime import (
    ProcessResult,
    ProviderProcessCancelled,
    ProviderProcessTimeout,
    run_streaming,
    safe_provider_environment,
)


class ConfigValidationTests(unittest.TestCase):
    def test_valid_config_is_normalized(self):
        values = config.validate_dashboard_config(
            {
                "ai_provider": "codex",
                "schedule_mode": "daily",
                "schedule_interval_minutes": 30,
                "schedule_times": "09:00, 18:30",
                "post_language": "Bulgarian",
                "post_max_chars": 700,
                "dry_run": True,
            },
            config.Config(),
        )
        self.assertEqual(values["AI_PROVIDER"], "codex")
        self.assertEqual(values["SCHEDULE_TIMES"], "09:00,18:30")
        self.assertEqual(values["DRY_RUN"], "true")

    def test_invalid_schedule_is_rejected(self):
        with self.assertRaises(ValueError):
            config.validate_dashboard_config(
                {
                    "schedule_mode": "daily",
                    "schedule_interval_minutes": 30,
                    "schedule_times": "25:90",
                    "post_language": "Bulgarian",
                    "post_max_chars": 600,
                },
                config.Config(),
            )


class MemoryTests(unittest.TestCase):
    def test_execution_history_counts_failures_and_unknowns(self):
        with tempfile.TemporaryDirectory() as temp:
            memory = MemoryStore(str(Path(temp) / "data.db"), str(Path(temp) / "memory"))
            failed = memory.start_execution("generate", "codex")
            memory.update_execution(failed, "failed", error="bad output")
            unknown = memory.start_execution("publish", "gemini")
            memory.update_execution(unknown, "unknown", error="connection lost")
            self.assertEqual(memory.stats()["failed"], 2)
            self.assertEqual(memory.latest_unknown_execution()["id"], unknown)
            memory.close()

    def test_business_profile_round_trip(self):
        source = {
            "name": "Example",
            "description": "Local services",
            "audience": "Owners",
            "tone": "Friendly",
            "topics": "Advice",
            "avoid": "Politics",
            "cta": "Write to us",
            "links": "https://example.com",
            "notes": "Open weekdays",
        }
        parsed = business.parse_markdown(business.render_markdown(source))
        self.assertEqual(parsed, source)

    def test_unknown_publication_requires_manual_resolution(self):
        with tempfile.TemporaryDirectory() as temp:
            memory = MemoryStore(str(Path(temp) / "data.db"), str(Path(temp) / "memory"))
            execution = memory.start_execution("publish", "codex")
            memory.update_execution(execution, "unknown", content="Maybe posted", error="timeout")
            self.assertTrue(memory.resolve_unknown_execution(execution, published=True))
            self.assertIsNone(memory.latest_unknown_execution())
            self.assertEqual(memory.stats()["published"], 1)
            self.assertFalse(memory.resolve_unknown_execution(execution, published=False))
            memory.close()

    def test_unknown_publication_blocks_another_publish(self):
        with tempfile.TemporaryDirectory() as temp:
            memory = MemoryStore(str(Path(temp) / "data.db"), str(Path(temp) / "memory"))
            execution = memory.start_execution("publish", "codex")
            memory.update_execution(execution, "unknown", content="Maybe posted", error="timeout")
            with self.assertRaises(app.PendingPublicationError):
                app.execute_cycle(
                    config.Config(ai_provider="codex"),
                    memory,
                    mock.Mock(),
                    dry_run=False,
                )
            memory.close()

    def test_provider_failure_is_persisted(self):
        with tempfile.TemporaryDirectory() as temp:
            memory = MemoryStore(str(Path(temp) / "data.db"), str(Path(temp) / "memory"))
            with mock.patch.object(app, "generate_text", side_effect=RuntimeError("bad output")):
                with self.assertRaisesRegex(RuntimeError, "bad output"):
                    app.execute_cycle(
                        config.Config(ai_provider="codex"),
                        memory,
                        mock.Mock(),
                        dry_run=True,
                    )
            executions = memory.recent_executions()
            self.assertEqual(executions[0]["status"], "failed")
            self.assertEqual(executions[0]["error"], "bad output")
            memory.close()


class FacebookSafetyTests(unittest.TestCase):
    @mock.patch("aipost247.facebook_client.requests.request")
    def test_ambiguous_post_is_never_retried(self, request):
        from requests import Timeout

        request.side_effect = Timeout("lost connection")
        client = FacebookClient("page", "token")
        with self.assertRaises(FacebookAmbiguousWriteError):
            client.post("hello")
        self.assertEqual(request.call_count, 1)


class ProviderIsolationTests(unittest.TestCase):
    def test_provider_environment_excludes_application_secrets(self):
        with mock.patch.dict(
            "os.environ",
            {
                "PATH": "/usr/bin",
                "HOME": "/tmp/home",
                "FB_PAGE_ACCESS_TOKEN": "secret",
                "FB_APP_SECRET": "secret",
                "OPENAI_API_KEY": "secret",
            },
            clear=True,
        ):
            env = safe_provider_environment()
        self.assertEqual(env["PATH"], "/usr/bin")
        self.assertNotIn("FB_PAGE_ACCESS_TOKEN", env)
        self.assertNotIn("FB_APP_SECRET", env)
        self.assertNotIn("OPENAI_API_KEY", env)

    def test_codex_uses_ephemeral_read_only_empty_workspace(self):
        captured = {}

        def fake_run(cmd, **kwargs):
            captured["cmd"] = cmd
            captured["cwd"] = Path(kwargs["cwd"])
            kwargs["on_stdout"](
                json.dumps({
                    "type": "item.completed",
                    "item": {"type": "agent_message", "text": "OK"},
                })
            )
            return ProcessResult(0, "", "")

        with mock.patch.object(cli_provider, "cli_path", return_value="/usr/bin/codex"):
            with mock.patch.object(cli_provider, "run_streaming", side_effect=fake_run):
                result = cli_provider.generate("codex", "Reply with OK")

        self.assertEqual(result, "OK")
        self.assertIn("--ephemeral", captured["cmd"])
        self.assertIn("read-only", captured["cmd"])
        self.assertIn("--skip-git-repo-check", captured["cmd"])
        self.assertIn("--ignore-user-config", captured["cmd"])
        self.assertNotEqual(captured["cwd"], config.BASE_DIR)

    def test_managed_provider_process_streams_and_cancels(self):
        lines = []
        result = run_streaming(
            [sys.executable, "-c", "print('step', flush=True)"],
            timeout=5,
            cwd=config.BASE_DIR,
            on_stdout=lines.append,
        )
        self.assertEqual(result.returncode, 0)
        self.assertEqual(lines, ["step"])

        cancel = threading.Event()
        timer = threading.Timer(0.1, cancel.set)
        timer.start()
        try:
            with self.assertRaises(ProviderProcessCancelled):
                run_streaming(
                    [sys.executable, "-c", "import time; time.sleep(30)"],
                    timeout=5,
                    cwd=config.BASE_DIR,
                    cancel_event=cancel,
                )
        finally:
            timer.cancel()

    def test_managed_provider_process_times_out(self):
        with self.assertRaises(ProviderProcessTimeout):
            run_streaming(
                [sys.executable, "-c", "import time; time.sleep(30)"],
                timeout=1,
                cwd=config.BASE_DIR,
            )


class CoordinationTests(unittest.TestCase):
    def test_only_one_job_runs_and_it_can_be_cancelled(self):
        coordinator = dashboard.JobCoordinator()
        entered = threading.Event()

        def work(_progress, cancel):
            entered.set()
            cancel.wait(2)
            return {"ok": not cancel.is_set()}

        job = coordinator.start("first", work)
        self.assertIsNotNone(job)
        self.assertTrue(entered.wait(1))
        self.assertIsNone(coordinator.start("second", work))
        self.assertTrue(coordinator.cancel(job))
        state = coordinator.wait(job, timeout=3)
        self.assertEqual(state["status"], "done")
        coordinator.shutdown()

    def test_folder_lock_rejects_second_owner(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "app.lock"
            code = (
                "import sys,time;"
                "from aipost247.instance_lock import InstanceLock;"
                "lock=InstanceLock(sys.argv[1]);lock.acquire();"
                "print('locked',flush=True);time.sleep(30)"
            )
            child = subprocess.Popen(
                [sys.executable, "-c", code, str(path)],
                cwd=str(config.BASE_DIR),
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
            )
            try:
                self.assertEqual(child.stdout.readline().strip(), "locked")
                with self.assertRaises(AlreadyRunning):
                    InstanceLock(path).acquire()
            finally:
                child.terminate()
                child.communicate(timeout=5)

    def test_endpoint_returns_accepted_then_conflict(self):
        coordinator = dashboard.JobCoordinator()
        entered = threading.Event()

        def work(_progress, cancel):
            entered.set()
            cancel.wait(2)
            return {"ok": True}

        handler = object.__new__(dashboard._Handler)
        handler.responses = []
        handler._json = lambda payload, code=200: handler.responses.append((code, payload))
        with mock.patch.object(dashboard, "_COORDINATOR", coordinator):
            handler._start_exclusive("first", work)
            self.assertTrue(entered.wait(1))
            handler._start_exclusive("second", work)
            self.assertEqual(handler.responses[0][0], 202)
            self.assertEqual(handler.responses[1][0], 409)
            coordinator.cancel(handler.responses[0][1]["job"])
            self.assertTrue(coordinator.shutdown())


class DashboardSecurityTests(unittest.TestCase):
    @staticmethod
    def handler(headers=None, body=b"", path="/api/status"):
        handler = object.__new__(dashboard._Handler)
        message = Message()
        for key, value in (headers or {}).items():
            message[key] = value
        handler.headers = message
        handler.path = path
        handler.server = SimpleNamespace(server_address=("127.0.0.1", 8730))
        handler.rfile = io.BytesIO(body)
        handler.responses = []
        handler._json = lambda payload, code=200: handler.responses.append((code, payload))
        return handler

    def test_foreign_origin_and_bad_token_are_rejected(self):
        foreign = self.handler(
            {
                "Host": "127.0.0.1:8730",
                "Content-Type": "application/json",
                "Origin": "https://attacker.example",
                "X-AIPost-Token": dashboard._SESSION_TOKEN,
            },
        )
        self.assertFalse(foreign._authorize_api())
        self.assertEqual(foreign.responses[0][0], 403)

        bad_token = self.handler(
            {
                "Host": "localhost:8730",
                "X-AIPost-Token": "wrong",
            },
        )
        self.assertFalse(bad_token._authorize_api())
        self.assertEqual(bad_token.responses[0][0], 403)

        allowed = self.handler(
            {
                "Host": "localhost:8730",
                "Origin": "http://localhost:8730",
                "X-AIPost-Token": dashboard._SESSION_TOKEN,
            },
        )
        self.assertTrue(allowed._authorize_api())

    def test_oversized_body_is_rejected(self):
        body = b"{" + b'"x":"' + b"a" * (dashboard.MAX_REQUEST_BYTES + 1) + b'"}'
        handler = self.handler(
            {
                "Host": "localhost:8730",
                "Content-Type": "application/json",
                "Content-Length": str(len(body)),
                "Origin": "http://127.0.0.1:8730",
                "X-AIPost-Token": dashboard._SESSION_TOKEN,
            },
            body=body,
        )
        with self.assertRaisesRegex(ValueError, "прекалено голяма"):
            handler._body()


class DistributionTests(unittest.TestCase):
    def test_gallery_contains_only_documented_images(self):
        manifest = json.loads((config.BASE_DIR / "assets" / "images.json").read_text("utf-8"))
        self.assertEqual([item["src"] for item in manifest], ["1.jpg", "2.jpg", "3.jpg", "4.jpg"])
        self.assertTrue(all(item.get("caption") for item in manifest))

    def test_windows_stamp_is_written_only_after_successful_installs(self):
        text = (config.BASE_DIR / "run.bat").read_text("utf-8")
        stamp_position = text.index('>"%VENV_DIR%\\.requirements.stamp"')
        install_position = text.index("python -m pip install -r requirements.txt || goto install_failed")
        self.assertGreater(stamp_position, install_position)


if __name__ == "__main__":
    unittest.main()
