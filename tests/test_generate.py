import json
import tempfile
import unittest
from types import SimpleNamespace
from pathlib import Path

from scripts.generate import (
    build_jobs,
    has_valid_completed_wav,
    max_new_tokens_for_text,
    safe_filename,
    stable_seed,
    validate_input,
    voice_instruction,
)


class GenerateInputTests(unittest.TestCase):
    def test_source_has_unique_ids_and_readable_text(self):
        data = json.loads(Path("input/quiz-krawall-tts.json").read_text(encoding="utf-8"))
        items = validate_input(data)
        self.assertEqual(len(items), 361)
        self.assertEqual(len({item["id"] for item in items}), len(items))
        self.assertTrue(all(isinstance(item["text"], str) for item in items))

    def test_runtime_templates_expand_only_to_source_supported_values(self):
        data = json.loads(Path("input/quiz-krawall-tts.json").read_text(encoding="utf-8"))
        items = {item["id"]: item for item in data["items"]}
        questions = build_jobs(items["question.prefix"], data)
        scores = build_jobs(items["results.score"], data)
        all_jobs = sum(len(build_jobs(item, data)) for item in data["items"])
        self.assertEqual(len(questions), 40)
        self.assertEqual(questions[0]["text"], "Frage 1.")
        self.assertEqual(questions[-1]["text"], "Frage 40.")
        self.assertEqual(len(scores), 38)
        self.assertEqual(scores[0]["text"], "0 von 5 Fragen richtig.")
        self.assertEqual(scores[-1]["text"], "20 von 20 Fragen richtig.")
        self.assertTrue(all("{" not in row["text"] for row in questions + scores))
        self.assertEqual(len({row["filename"] for row in scores}), 38)
        self.assertEqual(all_jobs, 437)

    def test_one_runtime_variant_can_be_selected_explicitly(self):
        data = json.loads(Path("input/quiz-krawall-tts.json").read_text(encoding="utf-8"))
        score = next(item for item in data["items"] if item["id"] == "results.score")
        jobs = build_jobs(score, data, {"points": 4, "total": 5})
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["text"], "4 von 5 Fragen richtig.")
        self.assertEqual(jobs[0]["values"], {"points": 4, "total": 5})

    def test_short_text_generation_is_bounded_and_seed_is_stable_per_variant(self):
        self.assertEqual(max_new_tokens_for_text("Frage 1."), 32)
        self.assertGreater(max_new_tokens_for_text("Ein deutlich längerer Satz mit mehreren Wörtern."), 32)
        self.assertEqual(stable_seed(2026, "q01.question", "default"), stable_seed(2026, "q01.question", "default"))
        self.assertNotEqual(stable_seed(2026, "q01.question", "default"), stable_seed(2026, "q02.question", "default"))

    def test_filename_preserves_dotted_id_without_path_traversal(self):
        self.assertEqual(safe_filename("q01.answer.1"), "q01.answer.1.wav")
        self.assertEqual(safe_filename("../escape"), "escape.wav")

    def test_instruction_uses_direction_as_control_not_spoken_text(self):
        instruction = voice_instruction(
            {"emotion": "kind", "direction": "Ermutigend, nicht enttäuscht."},
            {"voice_direction": "Warm und verspielt."},
        )
        self.assertIn("Ermutigend, nicht enttäuscht.", instruction)
        self.assertIn("Kind and reassuring", instruction)

    def test_manifest_atomic_write_and_load(self):
        from scripts.generate import load_manifest, save_manifest

        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "manifest.json"
            expected = {"schema_version": 1, "entries": {"id": {"status": "success"}}}
            save_manifest(path, expected)
            self.assertEqual(load_manifest(path), expected)
            self.assertFalse(path.with_suffix(".json.tmp").exists())

    def test_resume_requires_success_status_and_valid_mono_wav(self):
        class FakeSoundfile:
            @staticmethod
            def info(path):
                return SimpleNamespace(frames=2400, channels=1)

        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "clip.wav"
            path.write_bytes(b"x" * 128)
            completed = {"status": "success", "source_text": "hi", "model": "model"}
            self.assertTrue(has_valid_completed_wav(path, completed, FakeSoundfile, "hi", "model"))
            self.assertFalse(has_valid_completed_wav(path, {**completed, "status": "failed"}, FakeSoundfile, "hi", "model"))
            self.assertFalse(has_valid_completed_wav(path, completed, FakeSoundfile, "changed", "model"))

            class StereoSoundfile:
                @staticmethod
                def info(path):
                    return SimpleNamespace(frames=2400, channels=2)

            self.assertFalse(has_valid_completed_wav(path, completed, StereoSoundfile, "hi", "model"))


if __name__ == "__main__":
    unittest.main()
