# Quiz-Krawall TTS

Lokale, fortsetzbare WAV-Erzeugung aus `input/quiz-krawall-tts.json` mit Qwen3-TTS VoiceDesign. Das Skript spricht ausschließlich Text aus den JSON-`text`-Feldern. Regiehinweise und Emotionen steuern nur den VoiceDesign-Auftrag. Runtime-Vorlagen werden anhand ihrer JSON-Variablen-Metadaten mit den vorgesehenen Werten expandiert.

## Installation auf Athene

Die Installation verwendet ausschließlich eine eigene virtuelle Umgebung und ein eigenes Verzeichnis. Sie ändert keine globalen Python-Pakete und keine bestehenden Dienste.

```bash
mkdir -p ~/services/quiz-krawall-tts
cd ~/services/quiz-krawall-tts
mkdir -p .tools .cache/uv .cache/huggingface
curl -fLsS https://astral.sh/uv/install.sh -o .tools/install-uv.sh
UV_INSTALL_DIR="$PWD/.tools" UV_NO_MODIFY_PATH=1 sh .tools/install-uv.sh
export UV_PYTHON_INSTALL_DIR="$PWD/.tools/python" UV_CACHE_DIR="$PWD/.cache/uv"
.tools/uv python install 3.12
.tools/uv venv --python 3.12 .venv
.tools/uv pip install --python .venv/bin/python qwen-tts soundfile
```

Die offizielle Qwen3-TTS-Anleitung empfiehlt eine frische Python-3.12-Umgebung. `flash-attn` ist optional und wird hier ausgelassen, damit keine unnötige CUDA-Erweiterung kompiliert werden muss; Inferenz verwendet PyTorch SDPA und FP16 für die RTX 3060.

Kopiere `input/quiz-krawall-tts.json`, `scripts/`, `tests/` und dieses README in das Verzeichnis. Prüfe vorab `nvidia-smi`, `python3 --version`, `df -h ~` und den freien VRAM. `uv` und Python 3.12 werden dabei im Arbeitsverzeichnis abgelegt; globale Python-Pakete bleiben unberührt. Das erste Laden lädt die Modellgewichte von Hugging Face herunter.

## Testclips und Gesamtlauf

```bash
.venv/bin/python scripts/generate.py --test
```

Das erzeugt separat `tests/welcome.wav`, `tests/question.wav` und `tests/correct.wav`. Höre diese drei Dateien ab und prüfe deutsche Aussprache, Stimmcharakter und Verständlichkeit, bevor du die komplette Sammlung erzeugst.
Der Testlauf speichert sein Manifest separat unter `tests/manifest.json` und lässt das Manifest des vollständigen Exports unberührt.

```bash
.venv/bin/python scripts/generate.py
.venv/bin/python scripts/validate.py
```

Alle 361 Einträge werden berücksichtigt: `current`, `optional_new` und `runtime_template`. Die beiden Vorlagen mit Platzhaltern werden in konkrete Clips expandiert, ohne die JSON-Formulierungen zu ändern: Frage 1–40 sowie jede Punktzahl für die in der JSON genannten Rundenlängen 5, 10 und 20. Das ergibt 437 WAV-Dateien aus 361 Quell-IDs. Im Manifest bleibt jede Original-ID erhalten; Varianten stehen mit eingesetzten Laufzeitwerten unter `variants`.

Pro Text wird eine passende `max_new_tokens`-Grenze aus der Wortzahl berechnet, damit kurze Clips nicht unnötig weiterlaufen. Ein stabiler Seed pro ID und Variante macht gezielte Wiederholungen mit derselben Konfiguration reproduzierbar.

Bereits erfolgreich erstellte, lesbare Mono-WAVs werden übersprungen. Fehlgeschlagene Varianten bleiben mit Fehlertext im Manifest und können gezielt erneut generiert werden.

Einzelne IDs lassen sich gezielt erzeugen oder erzwingen:

```bash
.venv/bin/python scripts/generate.py --id q01.question --id feedback.correct
.venv/bin/python scripts/generate.py --id q01.question --force
.venv/bin/python scripts/generate.py --id results.score --points 4 --total 5 --force
```

Für Runtime-Texte können einzelne Variablenwerte gezielt erzeugt werden. Ohne CLI-Werte generiert das vollständige Skript alle im Spiel unterstützten Varianten:

```bash
.venv/bin/python scripts/generate.py --id question.prefix --question-number 3
.venv/bin/python scripts/generate.py --id results.score --points 4 --total 5
```

## Dateien

- `output/<id>.wav`: Mono-PCM-16 WAV mit nativer Modell-Samplerate für feste Texte. Laufzeitvarianten nutzen `<id>.<variable>-<wert>.wav`.
- `manifest.json`: Quelltext, ID, Varianten/gesprochener Text, Pfad, Dauer, Status, Modell, VoiceDesign-Auftrag, Generierungsparameter, Laufzeit und nach Möglichkeit Spitzen-VRAM pro Clip.
- `tests/`: drei separate Hörproben (`welcome.wav`, `question.wav`, `correct.wav`).

## Hinweise

Modellname: `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign`. Das Modell wird einmal pro Prozess geladen und für alle Clips wiederverwendet. Die erzeugte Audiodauer und der GPU-Spitzenverbrauch hängen vom Text und der Laufzeitumgebung ab; beides wird lokal im Manifest erfasst. Fehler werden pro ID protokolliert, ohne den restlichen Batch abzubrechen.

Offizielle Anleitung: [QwenLM/Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS). Sie führt VoiceDesign für Deutsch auf und zeigt die Inferenz mit `generate_voice_design`; die Installation empfiehlt ein isoliertes Python 3.12 Environment.

## React-Spiel (Vite, TypeScript, SCSS)

Die Spiel-App liegt unter `src/` und verwendet die 40 Fragen sowie die IDs aus `input/quiz-krawall-tts.json`. Steuerung per Maus, Tastatur und Gamepad; Einstellungsmenü für 5/10/20 Fragen, zufällige Fragen- und Antwortreihenfolge, Pause und Ergebnisschirm.

```bash
npm install
npm run dev
npm run build
```

### WAV-Audios im Spiel

Die generierten Clips verbleiben lokal in **`output/`** (per `.gitignore` ausgeschlossen). Der Vite-Entwicklungsserver stellt sie unter `/audio/` bereit; `npm run build` übernimmt vorhandene `output/**/*.wav` in `dist/audio/`. **WAV-Dateien niemals ins Repository pushen.** Fehlen WAV-Dateien, verwendet das Spiel automatisch die Browser-SpeechSynthesis-API als Fallback. Die Anwendung startet deshalb auch mit leerem `output/`.

Die Dateinamen entsprechen den IDs aus der TTS-JSON, z. B. `output/q01.question.wav`, `output/q01.answer.1.wav`, `output/feedback.correct.wav`. Dynamische Varianten werden wie von `scripts/generate.py` erzeugt angesprochen: `output/question.prefix.question_number-01.wav` und `output/results.score.points-04.total-05.wav`. Die Antwortpositionen X/Y/B/A werden als eigenständige Clips angesagt, damit die Reihenfolge pro Runde beliebig gemischt werden kann.

**Eingaben:** Xbox-Standardbelegung X/blau, Y/gelb, B/rot, A/grün; Steuerkreuz/Stick und A bestätigen Menüs, B geht zurück, Start pausiert. Tastatur X/Y/B/A oder 1–4, Pfeiltasten, Enter und Esc. Maus klickt Menüpunkte/Antworten.

Die App ist zunächst ein Web-Build; eine native Tauri-Hülle ist noch nicht integriert.

## Automatisierte Tests und Coverage

Die React-Anwendung wird mit Vitest, Testing Library und V8-Coverage geprüft.

```bash
npm install
npm test
npm run test:coverage
npm run build
```

Die Tests prüfen die 40 Fragen, Zufallsreihenfolgen, Menü- und Controllersteuerung,
Spielzustände, Audio-Playback, TTS-Fallback, Unterbrechungen und fehlerhafte Daten.
Der CI-Build erzwingt **100 % Statements, Branches, Functions und Lines** für
`src/App.tsx`, `src/game.ts` und `src/audio.ts`. Der reine React-Bootstrap
`src/main.tsx`, Styling, Vite-Buildkonfiguration sowie die separate Python-TTS-Pipeline
sind **nicht** Bestandteil dieser TypeScript-Coverage-Messung.

Für die Python-TTS-Pipeline existieren getrennte Tests unter `tests/test_generate.py`.
Ein Coverage-Wert von 100 % bedeutet vollständig ausgeführte instrumentierte Codepfade,
nicht automatisch fehlerfreie Benutzeroberflächen oder reale Controller-Kompatibilität.

## Quiz-Kategorien und neue Fragen

Die Fragenbank enthält jetzt **40 Fragen** in vier Kategorien mit jeweils zehn Fragen:
Tiere, Alltag, Natur & Jahreszeiten sowie Essen & Farben. In der Kategorieauswahl kann
zwischen einer Kategorie und „Alles gemischt“ gewechselt werden. Die Kategorien sind
in `input/categories.json` definiert und durch stabile Fragen-IDs mit den Einträgen
in `input/quiz-krawall-tts.json` verknüpft. Bestehende Texte und IDs wurden nicht verändert.

Neue Kategorien oder Fragen werden **durch zusätzliche Daten** eingebunden;
für weitere Kategorien sind keine Änderungen an der Spiel-/Filterlogik erforderlich.
Jede Frage besteht aus `qNN.question`, vier `qNN.answer.1..4`,
`qNN.correct`, `qNN.incorrect` und `qNN.reveal`. Pro Frage ist genau
eine Antwort mit `correct: true` markiert. Die UI mischt Fragen und Antworten
unabhängig. Wird eine Spielrundenlänge von 20 gewählt, eine Kategorie enthält aber
nur zehn Fragen, spielt die Runde maximal zehn Fragen.

### Audio für neue Fragen erzeugen

Die 20 neuen Fragen benötigen lokal WAV-Clips für ihre 160 neuen Sprecheinträge
und 20 zusätzliche Fragennummern-Varianten (21–40). Der vorhandene Generator
überspringt bereits erfolgreich generierte Dateien; die vorhandenen WAVs
werden nicht überschrieben und `output/` bleibt in `.gitignore`.

```bash
.venv/bin/python scripts/generate.py
.venv/bin/python scripts/validate.py
```

Bis die neuen WAV-Dateien vorhanden sind, verwendet das Spiel für diese Clips
die Browser-Sprachausgabe. Das bereits eingecheckte `manifest.json` ist eine
Aufzeichnung des letzten Erzeugungslaufs und wird erst nach einer lokalen
Generierung für die neuen IDs vollständig. Es müssen keine WAV-Dateien eingecheckt werden.

Die Tests validieren die vier Kategorien und die referenzierten Fragen-IDs.

## Moderierte Kategorienwechsel

Im Standardmodus „Alles gemischt“ werden die Fragen **in zufälligen Themenblöcken
mit 2–3 Fragen** gespielt. Vor dem ersten Block und bei jedem Kategorienwechsel
erscheint ein Intro-Screen mit Kategorie-Name, Symbol und einer zufällig gewählten
hyperaktiven Moderation. Der Ablauf setzt nach der gesprochenen Ansage automatisch
fort; A bzw. Enter oder ein Klick auf „Weiter zur Frage“ überspringt die Ansage.
Mit R1 lässt sie sich erneut starten, Esc führt zum Hauptmenü.

Bei Auswahl einer festen Kategorie bleiben alle Fragen in diesem Thema,
und der Intro-Screen erscheint nur einmal am Rundenbeginn. Jede Kategorie
hat vier verschiedene Ansagen, die innerhalb einer Runde nach Möglichkeit
nicht wiederholt werden. Die Dramaturgie liegt in `src/show.ts`, die
16 Audioskripte liegen als zusätzliche `category_intro`-Einträge in
`input/quiz-krawall-tts.json`. Die bisherigen 345 Quelltexte bleiben unverändert.
Neues Kategoriematerial wird durch Ergänzen der Daten hinzugefügt.

Die 16 Ansagen können auf Athene mit dem bereits vorhandenen TTS-Generator
nachvertont werden, z. B.:

```bash
.venv/bin/python scripts/generate.py --id category.intro.animals.1
.venv/bin/python scripts/generate.py
```

Die neuen Dateien heißen z. B. `output/category.intro.animals.1.wav`.
Sie werden nicht in Git gespeichert. Fehlende Audiodateien werden im Spiel
weiterhin über die Browser-Sprachengine ausgegeben.
