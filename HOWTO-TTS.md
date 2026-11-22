# Einzelnen Text als TTS-WAV erzeugen

1. Mit Athene verbinden und ins Projektverzeichnis wechseln:

   ```bash
   ssh athene
   cd ~/services/quiz-krawall-tts
   ```

2. Text sprechen lassen und WAV speichern:

   ```bash
   .venv/bin/python scripts/speak_text.py \
     --text "Willkommen bei Quiz-Krawall! Bist du bereit?" \
     --output output/willkommen.wav
   ```

3. Die Datei liegt unter `output/willkommen.wav`. Sie ist Mono-PCM-16 mit der nativen Samplerate des Modells. Eine vorhandene Datei wird niemals überschrieben; wähle dann einen neuen Dateinamen.

Optional kannst du die Betonung anpassen:

```bash
.venv/bin/python scripts/speak_text.py \
  --text "Jaaa, das war richtig!" \
  --output output/richtig.wav \
  --emotion jubilant \
  --direction "mit einer kurzen dramatischen Pause"
```

Verfügbare Emotionen: `excited`, `cheerful`, `jubilant`, `curious`, `friendly`, `clear`, `kind`, `gentle`. `--direction` steuert nur die Sprechweise und wird nicht mitgesprochen. Die JSON-Batchdatei und das Batchmanifest bleiben unverändert.
