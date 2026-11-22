import json
import io
import tempfile
import unittest
import wave
from pathlib import Path

from scripts.tts_pipeline import as_home_path, build_plan, convert_wav_to_mp3, safe_save_wav, save_manifest


class TtsPipelinePlanTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(Path("input/quiz-krawall-tts.json").read_text(encoding="utf-8"))

    def test_remote_home_paths_preserve_hidden_directory_names(self):
        self.assertEqual(as_home_path(".local/lib/tts-service"), "$HOME/.local/lib/tts-service")
        self.assertEqual(as_home_path("~/services/tts"), "$HOME/services/tts")
        self.assertEqual(as_home_path("/opt/python"), "/opt/python")

    def test_plan_covers_all_questions_templates_and_category_intros(self):
        with tempfile.TemporaryDirectory() as directory:
            requests, conversions, existing_mp3s, targets = build_plan(
                self.data, Path(directory), 2026
            )

        self.assertEqual(len(targets), 437)
        self.assertEqual(len(requests), 437)
        self.assertEqual(conversions, [])
        self.assertEqual(existing_mp3s, [])
        intro_ids = {item["id"] for item in self.data["items"] if item.get("category") == "category_intro"}
        self.assertEqual(len(intro_ids), 16)
        self.assertTrue(all(any(key.startswith(f"{entry_id}::") for key in targets) for entry_id in intro_ids))

    def test_existing_wav_is_scheduled_for_conversion_instead_of_tts(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            wav_path = output / "q01.question.wav"
            wav_path.touch()
            requests, conversions, existing_mp3s, _ = build_plan(self.data, output, 2026)

        self.assertIn("q01.question::default", {row["request_id"] for row in conversions})
        self.assertNotIn("q01.question::default", {row["request_id"] for row in requests})
        self.assertEqual(existing_mp3s, [])

    def test_existing_mp3_is_preserved_even_when_source_text_changes(self):
        data = json.loads(json.dumps(self.data))
        item = next(row for row in data["items"] if row["id"] == "q01.question")
        item["text"] = "Geänderter Text, vorhandene Audiodatei bleibt erhalten."
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            mp3_path = output / "q01.question.mp3"
            mp3_path.write_bytes(b"existing mp3")
            requests, conversions, existing_mp3s, _ = build_plan(data, output, 2026)
            preserved_bytes = mp3_path.read_bytes()

        self.assertIn("q01.question::default", {row["request_id"] for row in existing_mp3s})
        self.assertNotIn("q01.question::default", {row["request_id"] for row in conversions})
        self.assertNotIn("q01.question::default", {row["request_id"] for row in requests})
        self.assertEqual(preserved_bytes, b"existing mp3")

    def test_master_and_mp3_savers_never_replace_existing_files(self):
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(24000)
            wav.writeframes(b"\x00\x00" * 240)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            master = root / "clip.wav"
            master.write_bytes(b"existing master")
            self.assertFalse(safe_save_wav(master, buffer.getvalue()))
            self.assertEqual(master.read_bytes(), b"existing master")

            app_mp3 = root / "clip.mp3"
            app_mp3.write_bytes(b"existing app asset")
            self.assertFalse(convert_wav_to_mp3(root / "missing.wav", app_mp3))
            self.assertEqual(app_mp3.read_bytes(), b"existing app asset")

    def test_conversion_updates_manifest_paths_without_rewriting_old_text(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            wav_path = root / "q01.question.wav"
            with wave.open(str(wav_path), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(24000)
                wav.writeframes(b"\x00\x00" * 240)
            data = json.loads(json.dumps(self.data))
            item = next(row for row in data["items"] if row["id"] == "q01.question")
            item["text"] = "Current input text differs from archived spoken text."
            _, conversions, _, _ = build_plan(data, root, 2026)
            target = next(row for row in conversions if row["request_id"] == "q01.question::default")
            old_text = "Archived spoken text"
            manifest_path = root / "manifest.json"
            manifest_path.write_text(json.dumps({"entries": {"q01.question": {
                "id": "q01.question",
                "source_text": old_text,
                "text": old_text,
                "variants": [{
                    "key": "default",
                    "source_text": old_text,
                    "text": old_text,
                    "status": "success",
                }],
            }}}), encoding="utf-8")

            save_manifest(manifest_path, target, generated=False)
            saved = json.loads(manifest_path.read_text(encoding="utf-8"))
            row = saved["entries"]["q01.question"]
            variant = row["variants"][0]

        self.assertEqual(row["source_text"], old_text)
        self.assertEqual(row["text"], old_text)
        self.assertEqual(variant["source_text"], old_text)
        self.assertEqual(variant["text"], old_text)
        self.assertEqual(variant["master_path"], str(wav_path))
        self.assertEqual(variant["app_path"], str(root / "q01.question.mp3"))


if __name__ == "__main__":
    unittest.main()
