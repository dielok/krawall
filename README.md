# Quiz-Krawall – kostenloses Kinderquiz ab 3 Jahren mit Sprachausgabe

**Eine überdrehte Quizshow für Vorschulkinder.** Lustige Fragen, bunte Antworttasten und ein Moderator, der alles vorliest. **Ohne Lesekenntnisse, ohne Zeitdruck.**

> **Online spielen:** Eine öffentliche Demo unter **`krawall.kehrwasser.com` ist geplant** und noch nicht als verfügbar bestätigt. Bis dahin lässt sich das Spiel lokal starten.

**[Lokal starten](#sofort-lokal-spielen)** · **[Spielregeln](#so-funktioniert-quiz-krawall)** · **[Mitentwickeln](#fragen-und-verbesserungen-beitragen)** · **[Technische Dokumentation](docs/DEVELOPMENT.md)**

## Was ist Quiz-Krawall?

Quiz-Krawall ist ein kostenlos nutzbares, deutschsprachiges Quizspiel für Kinder im Vorschulalter, insbesondere ab etwa drei Jahren. Die Fragen und Antwortmöglichkeiten werden vorgelesen: Kinder können allein auf den Bildschirm schauen und per Controller, Maus oder Tastatur antworten. Ein Erwachsener kann bei Bedarf begleiten.

- **40 Fragen** in vier Kategorien: **Tiere**, **Alltag**, **Natur & Jahreszeiten** und **Essen & Farben**
- **Vier bunte Antwortmöglichkeiten**, jeweils mit passendem Emoji
- **Gesprochene Fragen und Reaktionen** mit einem lebhaften Quizshow-Moderator
- **Musik, Fanfaren und lustige Geräusche**, getrennt von der Sprachausgabe einstellbar
- **Controller-, Tastatur- und Maussteuerung** mit automatisch passenden Tastenhinweisen
- **Kein Countdown und kein Zeitdruck** beim Antworten
- **5, 10 oder 20 Fragen** pro Runde (bei fester Kategorie höchstens zehn)

### So funktioniert Quiz-Krawall

1. Spiel starten und eine Kategorie oder **„Alles gemischt“** auswählen.
2. Dem Moderator zuhören und eine der vier farbigen Antworten auswählen.
3. Eine lustige Reaktion hören, Punkte sammeln und weiterspielen.

Bei **„Alles gemischt“** wechseln die Kategorien nach kleinen Themenblöcken. Die Frage darf durch eine Antwort **sofort unterbrochen werden**; die anschließende Reaktion wird dagegen vollständig abgespielt.

| Aktion | Tastatur | Controller |
| --- | --- | --- |
| Antwort auswählen | **1–4** (auch X/Y/B/A) | **X / Y / B / A** |
| Menü bestätigen / Weiter | **Enter** | **A** |
| Zurück | **Esc** | **B** |
| Ansage wiederholen | **R** | **R1** |
| Pause | **Esc** | **Start** |

Die eingeblendeten Hinweise passen sich dem zuletzt verwendeten Eingabegerät an.

## Sofort lokal spielen

Voraussetzung: eine aktuelle Node.js-Version mit npm.

```bash
git clone https://github.com/dielok/krawall.git
cd krawall
npm install
npm run dev
```

Die im Repository vorhandenen MP3-Aufnahmen werden automatisch verwendet. Falls ein Sprachclip fehlt, kann das Spiel auf die Sprachausgabe des Browsers zurückgreifen. Für den normalen Spielstart sind **weder eine eigene GPU noch der TTS-Server nötig**.

Für einen Produktions-Build:

```bash
npm run build
npm run preview
```

## Für Eltern und pädagogische Fachkräfte

Quiz-Krawall ist für **kurze, gemeinsame Spielrunden** gedacht. Kinder müssen die Fragen nicht lesen und können in ihrem eigenen Tempo antworten. Die bunten Tasten, Symbole und gesprochenen Rückmeldungen ermöglichen ein spielerisches Quiz-Erlebnis.

Das Spiel ist ein Freizeitprojekt, **kein wissenschaftlich evaluiertes Lern- oder Förderprogramm**. Es ersetzt auch nicht die Begleitung durch Erwachsene.

## Fragen und Verbesserungen beitragen

Anregungen zu kindgerechten Fragen, neuen Kategorien, Barrierefreiheit, Controller-Kompatibilität oder Übersetzungen sind willkommen. Bitte eröffne dafür ein [GitHub Issue](https://github.com/dielok/krawall/issues).

Für Entwickler ist die Spieloberfläche mit **React, TypeScript, Vite und SCSS** umgesetzt; die Fragen und Audio-IDs liegen in JSON-Dateien. Die Tests verwenden **Vitest** und Testing Library.

```bash
npm test
npm run test:coverage
```

Ausführliche Hinweise zu Architektur, TTS-Erzeugung, lokalen MP3-Dateien und weiteren Entwicklungsaufgaben: **[Entwicklerdokumentation](docs/DEVELOPMENT.md)**. Die Anleitung für einzelne TTS-Aufnahmen steht in [HOWTO-TTS.md](HOWTO-TTS.md).

## Projektstatus, Lizenz und Medien

Das Spiel ist derzeit ein deutschsprachiges Webprojekt. Eine öffentliche, direkt spielbare Demo und eine kurze Gameplay-Vorschau sind geplant; sie werden verlinkt, sobald sie verfügbar sind.

**Lizenzhinweis:** Das Repository enthält derzeit **keine ausgewiesene Softwarelizenz**. Öffentlich sichtbarer Quellcode ist daher nicht automatisch frei zur Weiterverwendung oder Verbreitung lizenziert. Die enthaltenen Audioaufnahmen und Soundeffekte können **eigenständigen Lizenzbedingungen** unterliegen. Vor einer Wiederveröffentlichung oder Weiterverwendung bitte die jeweiligen Nutzungsrechte klären.

---

Ein Projekt von **[Kehrwasser](https://kehrwasser.com/)**.
