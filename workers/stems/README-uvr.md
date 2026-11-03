# Equalizer : moteur UVR de démonstration

> **Cette page décrit le mode simulé `uvr-demo`, qui ne sépare pas réellement la
> voix.** Pour de vrais résultats, utiliser `AUDIO_STEMS_ENGINE=uvr-mdx` ou
> `uvr-ensemble` ([uvr_trained_worker.py](./uvr_trained_worker.py)), décrits dans
> [docs/uvr-source-integration.md](../../docs/uvr-source-integration.md).

Le bouton Equalizer utilise les mêmes API, file BullMQ, stockage Cloudinary et
mixeur progressif que Demucs. Le moteur `uvr-demo` exécute les deux estimateurs
**simulés, sans poids entraînés** de [uvr_pipeline.py](./uvr_pipeline.py).
L'interface indique le mode expérimental dès réception de la demande API.

## Configuration locale

Dans `.env.development.local` du backend :

```dotenv
AUDIO_STEMS_ENGINE=uvr-demo
AUDIO_STEMS_CPU_THREADS=2
```

Depuis le dossier backend :

```sh
node scripts/local-compose.mjs equalizer
```

Cette commande construit puis relance uniquement l'API et le worker stems
(avec leurs dépendances Compose). Elle installe les dépendances Python du worker
dans Docker. Les ports frontend 8080 et API 3000 restent les mêmes.
L'image actuelle fournit PyTorch CPU ; CUDA demande une image PyTorch CUDA et
l'exposition du GPU à Docker. MPS fonctionne seulement hors Docker sur macOS.

Pour exécuter le script autonome dans un environnement virtuel Python actif :

```sh
python -m pip install -r workers/stems/requirements-uvr.txt
python workers/stems/uvr_pipeline.py chanson.wav --output-dir sorties
```

Le script autonome utilise SoundFile (libsndfile fourni par les roues courantes).
L'adaptateur serveur nécessite aussi `ffmpeg` et `ffprobe`, inclus dans Docker.
Il décode l'entrée en WAV stéréo 44,1 kHz, traite des fenêtres de 8 secondes
avec 50 % de chevauchement et des poids 0,6/0,4, puis encode les deux pistes
en MP3 pour respecter la limite de téléchargement du lecteur. La reconstruction
est exacte à l'arrondi près dans le WAV ; le MP3 est une compression avec pertes.

## Cache et retour à Demucs

Les demandes de démonstration utilisent la version de cache `uvr-demo-v1`.
Le moteur est porté par chaque tâche : un ancien travail Demucs n'est pas
transformé en simulation lors d'un changement de configuration.
Remettre `AUDIO_STEMS_ENGINE=demucs` et relancer la même commande pour revenir
au modèle entraîné. Aucune suppression de cache ni migration de base nécessaire.
Une nouvelle version de l'algorithme devra changer la version du cache.

## Validation réelle facultative

Dans le worker construit, avec un fichier audio local :

```sh
node scripts/validate-stems.cjs /stems-tmp/extrait.wav --uvr-demo --upload
```

Vérifie durée, création des deux MP3, téléversement et téléchargement Cloudinary.
Supprime ensuite les seuls fichiers et ressources générés par cette validation.
Ce contrôle ne mesure pas la qualité perceptive de séparation.

## Contrôles du raccordement (3 novembre 2026)

- 31 tests backend ciblés et 15 tests frontend ciblés réussis, y compris le
  routage explicite `uvr-demo-v1` et la compatibilité des anciennes réponses API.
- TypeScript frontend, lint ciblé frontend/backend et compilation Docker des
  deux services réussis.
- Trois scénarios navigateur Equalizer réussis à 320, 768 et 1280 pixels
  (API simulée dans ces scénarios). Le processus Playwright est resté ouvert
  après les trois résultats positifs ; son arrêt a été interrompu manuellement.
- Quatre cas de reconstruction identité : entrée d'un seul échantillon,
  absence de chevauchement, chevauchements de 50 % et 75 %, dernier segment
  incomplet. Conservation de la longueur et reconstruction à 1e-6 près.
- Worker Python réel : signal synthétique stéréo de 120 secondes, deux MP3
  de durée correcte et progression reçue, en 37,28 secondes dans un conteneur
  limité à 2 CPU et 2 Gio. PyTorch 2.15.0+cpu. Ce résultat inclut le lancement
  Python et l'encodage, mais exclut extraction YouTube et stockage distant.
- Relecture : moteur porté par la tâche, cache distinct, protection des fichiers
  existants, protocole de progression conservé, compatibilité MP3 du lecteur,
  avertissement traduit et conservation du contrôle progressif de mixage.
- Chaîne réelle bridge Node → Python → deux MP3 → Cloudinary → téléchargement
  validée sur un signal de 5 secondes (53,16 secondes au total dans les conditions
  de cette exécution). Les ressources distantes de validation ont été supprimées.

Les tests techniques n'attestent pas de l'isolation perceptive d'une voix.
