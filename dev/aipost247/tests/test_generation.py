from __future__ import annotations

import unittest
from unittest import mock

from aipost247 import app
from aipost247.config import Config
from aipost247.gemini_client import GeminiError


class NonPostDetectionTests(unittest.TestCase):
    def test_flags_clarification_or_refusal(self):
        for bad in (
            "I need a brief to write the facebook post. please provide the brief",
            "As an AI, I cannot do that.",
            "Could you provide more details?",
            "Нямам достатъчно информация.",
            "",
            "   ",
        ):
            self.assertTrue(app._looks_like_non_post(bad), bad)

    def test_accepts_real_posts(self):
        post = (
            "☕ Ново при нас! Опитайте сезонния specialty blend — топъл, ароматен "
            "и перфектен за есента. Заповядайте! #кафе #specialtycoffee"
        )
        self.assertFalse(app._looks_like_non_post(post))
        # A long post that merely contains a flagged phrase must NOT be rejected.
        long_post = "Please share this with your friends and join us this weekend! " * 8
        self.assertFalse(app._looks_like_non_post(long_post))


class GenerateTextValidationTests(unittest.TestCase):
    def setUp(self):
        self.cfg = Config(ai_provider="antigravity", post_language="Bulgarian", post_max_chars=600)

    def test_good_post_returned_without_retry(self):
        with mock.patch.object(
            app, "_provider_generate", return_value="Чудесна публикация за нашето кафене днес!"
        ) as m:
            out = app.generate_text(self.cfg, "брийф за кафене")
        self.assertIn("кафене", out)
        self.assertEqual(m.call_count, 1)  # no retry needed

    def test_retry_then_success(self):
        outputs = iter(["I need a brief", "Чудесна публикация за нашето кафене!"])
        with mock.patch.object(
            app, "_provider_generate", side_effect=lambda *a, **k: next(outputs)
        ) as m:
            out = app.generate_text(self.cfg, "брийф")
        self.assertIn("кафене", out)
        self.assertEqual(m.call_count, 2)  # retried once, firmly

    def test_persistent_non_post_raises_clear_error(self):
        with mock.patch.object(
            app, "_provider_generate", return_value="I need a brief, please provide the brief"
        ):
            with self.assertRaises(GeminiError):
                app.generate_text(self.cfg, "брийф")


if __name__ == "__main__":
    unittest.main()
