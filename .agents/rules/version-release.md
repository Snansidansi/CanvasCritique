---
trigger: model_decision
description: This Rule should always be used if the version of the Programm gets updated.
---

Bei dem releasen einer neuen Programmversion gehen wir wie folgt vor:
1. Wir updaten die versionsnummer in allen notwendigen (Configfiles) auf die vom User gewünschte version. Falls der User keine angegeben hat Frage ihn danach und breche erstmal ab. Mache NICHT weiter bis er nicht eine Versionsnummer angegeben hat.
2. Suche dir alle logs aus den commits seit dem letztn release tag (vx.x.x) zusammen. Und fasse die kurz und knapp (die wichtigsten Punkte) auf englsich in markdown Format zusammen. Verwende keine Emojis und unterteile in Features, Bugfixes und Miscellaneous. Schreibe niemal sowas wie Task 1,2,3 in das changelog auch wenn es in den commit messages steht. Das bezieht sich nur auf die Agentinteratktion.
3. Commite die geänderten files aus Schritt 1 und nenne den commit "Bumped to version Vx.x.x" (fülle Versionsnummer aus).
4. Erstelle auf dem gerade eben erstellten commit einen annotierten tag (vx.x.x)  und packst du in den details commit message body des tags gesamten changelog aus Schrit 1.
5. Pushe den commit und den tag auf den remote origin.

Allgemein: Bitte versuche umbedingt beim changelog darauf zu achten, das du Änderungen nicht als "Miscellaneous" oder "Bugfix" aufnimmst, wenn sie erst seit dem letzen version bump eingeführt wurden. Hier ein Beispiel. Wir führen das Feature WebDAV sync ein. Dies sind mehrere commits. In einem dieser commits fixxen wir ein Problem, weswegen Webdav bisher nicht richtig funktioniert hat. Wenn du jetzt die version bumpen sollst und den changelog erstellst, darf es keinen bugfix geben, das webdav sync gefixt wurder oder etwas in dieser art, da es ja zur letzen version garkein webdav gab und somit der changelog nur für interne nutzung sinvoll wäre aber er ist ja für den endnutzer.