# Entwicklerdokumentation – Quiz-Krawall

Diese Seite bewahrt die bisherige technische Dokumentation. Der Einstieg für Spieler und Eltern steht in der [README](../README.md).

# Technische Einrichtung und TTS-Pipeline

Fortsetzbare TTS-Pipeline aus `input/quiz-krawall-tts.json` mit Qwen3-TTS VoiceDesign auf Athene. Athene liefert WAV-Master zurück; lokal entstehen daraus MP3-Dateien für die App. Gesprochen wird ausschließlich Text aus den JSON-`text`-Feldern. Regiehinweise und Emotionen steuern nur den VoiceDesign-Auftrag. Runtime-Vorlagen werden anhand ihrer JSON-Variablen-Metadaten mit den vorgesehenen Werten expandiert.

Einzelnen Freitext als WAV erzeugen: [HOWTO-TTS.md](HOWTO-TTS.md).

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

Prüfe vorab `nvidia-smi`, `python3 --version`, `df -h ~` und den freien VRAM. `uv` und Python 3.12 werden dabei im Arbeitsverzeichnis abgelegt; globale Python-Pakete bleiben unberührt. Das erste Laden lädt die Modellgewichte von Hugging Face herunter. Das Repository bleibt auf deinem Rechner; die Pipeline überträgt nur den generischen TTS-Server und fehlende Textanfragen.

## TTS-Pipeline

Im Repository startet ein einzelner Befehl die Pipeline:

```bash
npm run tts
```

Der Befehl verbindet sich per SSH mit `athene`, aktualisiert dort den generischen Server unter `~/.local/lib/tts-service/tts_server.py` und sendet die noch fehlenden Clips. Das Modell wird pro Pipeline-Lauf einmal geladen und für alle Anfragen wiederverwendet. Athene kennt nur Text, Sprache, Stimmenbeschreibung, Emotion, Regieanweisung und Seed; Quiz-IDs, Dateinamen und MP3-Konvertierung bleiben lokal.

**Vorhandene WAV- und MP3-Dateien werden niemals überschrieben oder neu erzeugt**, auch wenn sich ein Text in der JSON geändert hat. Gibt es eine WAV, aber noch keine MP3, wird nur lokal konvertiert. WAV-Master bleiben lokal; MP3-App-Dateien werden versioniert.

Für eine Vorschau ohne Dateiveränderungen, SSH oder Modelllauf:

```bash
npm run tts:dry-run
```

Die lokale MP3-Konvertierung benötigt `ffmpeg` und `ffprobe`.

Nur vorhandene WAV-Master konvertieren, ohne Athene oder TTS-Generierung:

```bash
npm run tts:convert
```

Der Standard-SSH-Alias ist `athene`. Abweichungen lassen sich über Umgebungsvariablen setzen:

```bash
KRAWALL_TTS_HOST=athene npm run tts
KRAWALL_TTS_REMOTE_PYTHON=services/quiz-krawall-tts/.venv/bin/python npm run tts
```

Der zweite Wert zeigt den Standardpfad zur vorhandenen Python-Umgebung. Der Client benötigt lokal nur Python 3 und SSH; Qwen, PyTorch und CUDA laufen ausschließlich auf Athene.

Die bisherigen Generator-Kommandos bleiben für gezielte Tests und Debugging verfügbar; sie erzeugen nur WAVs. Für MP3-App-Dateien und die vollständige Pipeline `npm run tts` verwenden.

Alle 361 Einträge werden berücksichtigt: `current`, `optional_new`, `runtime_template` und `category_intro`. Die Vorlagen werden ohne Änderungen an den Quelltexten in konkrete Clips expandiert: Frage 1–40 sowie Punktestände für 5, 10 und 20 Fragen. Das ergibt 437 WAV-Master und 437 MP3-App-Dateien aus 361 Quell-IDs. Im Manifest bleibt jede Original-ID erhalten; Varianten stehen mit eingesetzten Laufzeitwerten unter `variants`.

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

- `output/<id>.wav`: unveränderter Mono-PCM-16 WAV-Master mit nativer Modell-Samplerate. Laufzeitvarianten nutzen `<id>.<variable>-<wert>.wav`.
- `output/<id>.mp3`: Mono-MP3 mit 64 kbit/s für die App; dieselben IDs und Varianten wie bei den WAV-Mastern.
- `manifest.json`: Quelltext, Varianten, WAV-Masterpfad (`path`) und App-MP3-Pfad (`app_path`). Die Pipeline ergänzt Konvertierungsdaten, ändert aber keine vorhandenen Quelltexte.
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

### MP3-Audios im Spiel

WAV-Master verbleiben lokal in **`output/`** und sind per `.gitignore` ausgeschlossen. Die MP3-App-Dateien liegen ebenfalls dort, werden aber ins Repository eingecheckt. Der Vite-Entwicklungsserver stellt MP3s mit `audio/mpeg` unter `/audio/` bereit; `npm run build` übernimmt vorhandene `output/**/*.mp3` in `dist/audio/`. Fehlen MP3-Dateien, verwendet das Spiel automatisch die Browser-SpeechSynthesis-API als Fallback.

Die MP3-Dateinamen entsprechen den IDs aus der TTS-JSON, z. B. `output/q01.question.mp3`, `output/q01.answer.1.mp3`, `output/feedback.correct.mp3`. Dynamische Varianten heißen z. B. `output/question.prefix.question_number-01.mp3` und `output/results.score.points-04.total-05.mp3`. Die Antwortpositionen X/Y/B/A werden als eigenständige Clips angesagt, damit die Reihenfolge pro Runde beliebig gemischt werden kann.

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

### Audio für neue Fragen und Kategorien erzeugen

Die 20 neuen Fragen benötigen 160 Clips für Frage, Antworten und Reaktionen sowie
20 Varianten der Fragennummer (21–40). Die 16 Kategorie-Intros sind ebenfalls
Einträge der TTS-JSON. `npm run tts` berücksichtigt alle diese Texte automatisch.
Es konvertiert vorhandene WAV-Master ohne TTS-Neugenerierung und überspringt
vorhandene MP3s unabhängig vom Manifest. WAVs bleiben lokal und ausgeschlossen;
die MP3s werden versioniert.

```bash
npm run tts
```

Bis die neuen MP3-Dateien vorhanden sind, verwendet das Spiel für diese Clips
die Browser-Sprachausgabe. Das bereits eingecheckte `manifest.json` ist eine
Aufzeichnung des letzten Erzeugungslaufs und wird nach TTS-Generierung oder
MP3-Konvertierung ergänzt. Es müssen keine Audiodateien eingecheckt werden.

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

Die 16 Ansagen sind bereits in der Eingabe für `npm run tts` enthalten und werden
automatisch erzeugt, sofern weder WAV-Master noch MP3 vorhanden sind. Die App-Dateinamen lauten z. B.:

```bash
output/category.intro.animals.1.mp3
```

Die WAV-Master werden nicht in Git gespeichert, die MP3s schon. Bis zur Erzeugung werden fehlende Audios im Spiel
weiterhin über die Browser-Sprachengine ausgegeben.

## Hintergrundmusik und Soundeffekte

Die sechs MP3-Dateien liegen unter `sounds/`. Vite stellt sie im Entwicklungsmodus
über `/sounds/` bereit und kopiert sie beim Build nach `dist/sounds/`.
Es ist kein weiteres Herunterladen erforderlich.

Der `SoundDirector` trennt Musik und Effekte von der Sprecherwiedergabe:
Menü-Musik als Loop, leises Quiz-Ticktack nach dem Vorlesen, Fanfare bei
Kategorienwechsel, ein eigener Effekt für richtige/falsche Antworten und
Applaus am Ende. Die Musik wird bei laufender Sprache automatisch abgesenkt.
In Einstellungen gibt es einen separaten Schalter **Musik & Effekte**.

Der Sprecher liest eine Frage vollständig vor, selbst wenn währenddessen bereits
eine Antwort gewählt wird; die Feedbackansage wartet bis zum Ende. Schnelles
Weiterdrücken merkt die Aktion vor und schneidet nicht mehr die laufende Ansage ab.
Die Controller-Zuordnung verwendet die auf dem Gerät beobachteten
X/Y-Tastenpositionen und ist mit Interaktionstests abgesichert.

Die Originaldateien unter `sounds/` unterliegen ihren jeweiligen Lizenzbedingungen
und dürfen nicht als eigenständige Audio-Bibliothek weiterverteilt werden.

Alle 160 Antwortoptionen besitzen einen `display_label` mit einem passenden Emoji. Das ursprüngliche `text`-Feld bleibt als TTS-Sprechertext unverändert. Tests prüfen die vollständige Zuordnung, sodass neue Fragen nicht versehentlich reine Textantworten enthalten.

## Dynamische Steuerungshinweise

`src/controls.tsx` liefert die Tastenbeschriftungen zentral. Ohne Gamepad
stehen an Aktionsschaltflächen Enter, Esc, R und bei Antworten 1–4.
Bei erkanntem Controller werden A, B, Start, R1 und X/Y/B/A angezeigt.
Die Anzeige folgt dem zuletzt genutzten Eingabegerät und schaltet bei Trennung
des Controllers wieder auf Tastatur um. Tastatureingaben funktionieren auch
bei verbundenem Controller weiterhin.
