# Audit Python

## Périmètre

`backend/workers/` : **transcription** (`transcribe.py` 279 lignes, `transcribe_helpers.py` 81), **stems** (`separate.py` 226, `separate_helpers.py` 65, `uvr_pipeline.py` 279, `uvr_trained_worker.py` 160, `uvr_audio.py` 73, `uvr_worker.py` 62) et **chords** (`analyze.py` 75, `timeline.py` 39, `setup_models.py` 42), soit ≈ 1 380 lignes. Le dossier `workers/chords/models/` contient du code tiers (BTC-ISMIR19) et est exclu des mesures.

Il n'y a **pas** de service Python HTTP (pas de FastAPI) : Python est invoqué comme **sous-processus** par le backend Node.

## Vérifications exécutées

| Vérification | Résultat |
|---|---|
| `python -m unittest discover -s tests` dans `workers/transcription` | 10 tests, OK |
| idem `workers/stems` | 12 tests, OK |
| idem `workers/chords` | 4 tests, OK |
| `pip-audit`, `ruff`, `mypy`, `bandit`, `pytest` | **Non exécutés** : outils non installés dans l'environnement |

Les tests exercent surtout les fonctions utilitaires (`*_helpers.py`, `timeline.py`, `uvr_audio.py`) ; la boucle principale de transcription et la séparation ne sont pas testées. En CI backend, les tests `transcription` et `stems` sont lancés, **pas** `chords`.

## Architecture et intégration

- **Communication** : `spawn`/`execFile` depuis `whisper-bridge.service.ts`, `stems-bridge.service.ts`, `youtube-audio.service.ts`, `chord-analysis.service.ts`. Les arguments sont passés en **tableau** (pas de `shell=True`), les résultats JSON sont validés côté Node.
- **Transcription** : processus Python long en mode `--server` ; `ffprobe`/`ffmpeg` appelés avec des listes d'arguments, délais de 30 s / 300 s (`transcribe.py:78,92`).
- **Stems** : parent qui supervise la durée totale et relaie la progression (`uvr_worker.py`), `subprocess.Popen` avec délai.
- **Chords** : exécuté par `execFile` avec délai (`CHORD_ANALYSIS_TIMEOUT_MS`, 900 s par défaut), `maxBuffer` 4 Mo, répertoire temporaire supprimé après usage, une seule analyse à la fois (`busy`), cache mémoire de 16 résultats.
- **Sécurité des échanges internes** : processus locaux, pas de port réseau Python.

## Qualité

- Code court, modulaire, avec fonctions utilitaires séparées et typage partiel.
- Aucun `eval`, `exec`, `os.system`, `shell=True`, `pickle` direct ; `yaml.load(f)` sans `Loader` uniquement dans du code tiers vendorisé (`models/btc/utils/hparams.py`), non appelé directement par `analyze.py` (appel indirect non vérifié).
- Un seul `TODO`, dans ce code tiers.
- Les chemins de fichiers viennent de répertoires temporaires créés par le backend (`mkdtemp`), pas d'entrées utilisateur.

## Sécurité

| ID | Niveau | Constat |
|---|---|---|
| SEC-05 | LOW | `torch.load(..., weights_only=False)` dans `analyze.py:35` : désérialisation `pickle` d'un modèle. Le fichier vient de `setup_models.py`, qui le télécharge depuis `raw.githubusercontent.com` à une révision git fixée (`2682317…`) **sans somme de contrôle**. Le commentaire du code précise que ce n'est « jamais un fichier téléversé » : le risque vient donc uniquement de la chaîne d'approvisionnement. |
| SEC-13 | LOW | `requirements.youtube.txt` : `bgutil-ytdlp-pot-provider` sans version ; `workers/chords/requirements.txt` et `requirements-uvr.txt` utilisent des plages (`torch>=2.6,<3`). La CI exécute `pip-audit` sur transcription, stems, uvr, uvr-trained et youtube, **pas sur chords**. |
| DOCKER-01 | MEDIUM | Le worker d'accords n'est installé dans aucune image. |
| — | INFO | `yt-dlp==2026.8.19` est épinglé ; la version doit suivre l'évolution de YouTube. |

## Performance et fiabilité

- Limites explicites : durée audio (900 s pour les accords, 5 min pour la transcription), taille (`TRANSCRIPTION_MAX_AUDIO_SIZE_MB`), concurrence (`TRANSCRIPTION_CONCURRENCY`, `AUDIO_STEMS_CONCURRENCY`), profondeur de file.
- Conteneur transcription : 2 Go / 2 CPU ; stems : 2 Go / 2 CPU (4 Go / 4 CPU en profil local). Le commentaire de `docker-compose.yml` précise que ce sont des valeurs de précaution **sans benchmark** (« Etape 0 »).
- Séparation de voix très gourmande (PyTorch, ONNX) : le risque de saturation relève du dimensionnement, non mesuré ici.
- Aucune fuite mémoire ni problème de concurrence démontré ; non testé en charge.

## Recommandations

1. Ajouter une somme de contrôle (sha256) aux modèles téléchargés (SEC-05) et utiliser `weights_only=True` quand le format le permet.
2. Épingler `bgutil-ytdlp-pot-provider` et utiliser un fichier de verrouillage (`pip-compile --generate-hashes`).
3. Ajouter `workers/chords` à `pip-audit` et aux tests de la CI ; choisir entre conteneuriser ou documenter l'exclusion (DOCKER-01).
4. Installer `ruff` et `mypy` en CI, au moins en mode informatif.
