# Vocal remover — diagnostic, correction et validation

## Diagnostic observé

1. L’extracteur a rejeté `IkAhYtcDkc4` avec `AUDIO_TOO_LONG` : sa sortie indique `does not pass filter (duration <= 300)`. Le service partagé imposait 300 s alors que les stems autorisent 420 s. Un changement de modèle ne résout pas ce rejet.
2. Le traitement `mwG8DjNJvK4` a atteint Demucs puis a expiré après environ dix minutes. Les relances automatiques répétaient le traitement coûteux.
3. Le conteneur est limité à deux cœurs et 2 Go. Le processus Demucs avait 12 threads système ; les bibliothèques de calcul n’étaient pas bornées explicitement au quota. Le cache contenait déjà le modèle de 81 Mo. Le téléchargement initial n’explique donc pas toutes les expirations. Ce constat seul ne mesure pas le gain du correctif.
4. La sortie Demucs était entièrement capturée jusqu’à la fin. L’API conservait une progression nulle pendant le calcul et perdait le détail de l’erreur structurée dans les journaux du bridge.
5. Le watchdog Node tuait le parent Python sans cibler son arbre. Une sortie normale sans message final effaçait le timer sans résoudre/rejeter la promesse. Ce sont des défauts de cycle de vie constatés dans le code ; aucun processus orphelin n’a été constaté lors de l’inspection ponctuelle.
6. Un travail récupéré par BullMQ après interruption pouvait rester bloqué : la base conservait PROCESSING/DOWNLOADING et le worker ne réclamait que PENDING.

## Plan appliqué

1. Conserver `htdemucs`, les réglages de qualité et le format MP3 ; borner OMP/MKL/OpenBLAS à deux threads par défaut.
2. Diffuser les diagnostics et la progression de calcul, sans prendre le téléchargement du modèle pour une progression de séparation. Ne publier un pourcentage que pour le modèle par défaut dont le calcul utilise une seule barre.
3. Donner au timeout Python le temps de nettoyer ; réserver un watchdog externe à l’ensemble du processus et tuer le groupe si nécessaire. Rejeter toute fermeture sans résultat.
4. Ne pas relancer automatiquement les erreurs de durée/taille et les timeouts. Réinitialiser la progression lors d’une relance manuelle ou transitoire.
5. Utiliser la limite de durée des stems uniquement pour leur extraction YouTube. Les autres appelants restent à 300 s par défaut.
6. Récupérer uniquement les tâches que BullMQ signale comme stalled, préserver les résultats terminés et nettoyer les fichiers locaux après échec d’envoi.
7. Reconstruire le worker, exécuter tests de régression, tests navigateur et un traitement réel.

## Validation

- Suite backend générale : 79 suites / 329 tests réussis au premier passage.
- Après les ajouts finaux : 13 tests ciblés bridge/processor/source/workflow réussis ; 3 tests d’isolation de la limite YouTube réussis. Ces nombres recouvrent partiellement la suite générale et ne sont pas à additionner.
- Python : 4 tests réussis avec de vrais sous-processus simulant succès, erreur, fichiers manquants et timeout.
- Frontend : 6 tests existants API/mixage réussis.
- Navigateur Chrome : 3 scénarios réussis à 320, 768 et 1280 px ; lecture, pause, seek, curseur, changement de morceau et absence de débordement horizontal. Leurs réponses réseau sont simulées. Le Chromium fourni par Playwright était absent ; Chrome installé a été utilisé.
- TypeScript et build Nest réussis ; lint ciblé réussi ; aucun diagnostic éditeur sur les dossiers stems.
- Audio réel : extrait de 20 s, deux MP3 de durée correcte, transfert et téléchargement Cloudinary réussis. Durée mesurée : 92 508 ms, reconstruction Docker concurrente. Fichiers Cloudinary de validation supprimés ensuite. Ce résultat ne mesure pas isolément le gain de vitesse et ne garantit pas une suppression parfaite des voix.
- Validation du fichier complet de 219,66 s : en cours au moment de rédaction ; résultat à compléter.

## Revue du code

### Cycle de vie et erreurs

- Correction du résultat manquant, du watchdog et du nettoyage local après échec.
- Conservation des codes d’erreur ; messages techniques dans les journaux avec URLs masquées, pas dans l’interface.
- Progression sérialisée en base, attendue avant l’état final, afin d’éviter qu’une écriture tardive écrase la progression finale.
- Reprise conditionnée au signal stalled de BullMQ ; aucune reprise d’une ligne COMPLETED/FAILED par ce chemin.

### Régressions et périmètre

- Aucun changement du lecteur, du mixage, des routes OAuth, du port 8080, du schéma Prisma ou du modèle Demucs.
- Limite YouTube inchangée pour les appelants qui ne fournissent pas la politique stems ; tests dédiés.
- Les modifications déjà présentes dans le dépôt ont été conservées, notamment la configuration TypeScript de développement.
- Revue effectuée dans cette session ; aucune revue humaine indépendante ni CI distante n’est prétendue.

## Rejouer le test réel

Le fichier d’entrée doit déjà exister dans le conteneur. La commande suivante ne crée ni tâche de file ni ligne en base :

```sh
docker exec backend-stems-worker-1 node scripts/validate-stems.cjs /stems-tmp/voice-remover-validation.wav --upload
```

`--upload` vérifie aussi Cloudinary et supprime uniquement les assets qu’il a créés. Sans cette option, seuls Demucs et les deux fichiers de sortie sont vérifiés. Les fichiers de sortie temporaires sont nettoyés automatiquement ; l’entrée est conservée.

## Limites

Le traitement reste différé sur CPU. Une séparation valide n’équivaut pas à une expérience instantanée. Il faut mesurer plusieurs durées et niveaux de charge avant d’annoncer un délai produit ; une accélération GPU ou une comparaison qualitative de modèles constitue un travail distinct. Aucun score de qualité vocale n’a été mesuré ici.
