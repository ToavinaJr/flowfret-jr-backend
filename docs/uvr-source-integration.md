# UVR : reprise du moteur de séparation dans Equalizer

## Sources examinées

- [UVR — orchestration des architectures](https://github.com/Anjok07/ultimatevocalremovergui/blob/master/separate.py) : chemins MDX, VR, Demucs, paramètres spécifiques des modèles.
- [UVR — métadonnées MDX](https://github.com/Anjok07/ultimatevocalremovergui/blob/master/models/MDX_Net_Models/model_data/model_data.json) : dimensions STFT, compensation et identification de la source principale.
- [audio-separator — API publique](https://github.com/nomadkaraoke/python-audio-separator/blob/main/audio_separator/separator/separator.py) : chargement des modèles et sélection matérielle.
- [audio-separator — MDX](https://github.com/nomadkaraoke/python-audio-separator/blob/main/audio_separator/separator/architectures/mdx_separator.py) : inférence ONNX, STFT/ISTFT, fenêtres chevauchantes.
- [audio-separator — ensemble](https://github.com/nomadkaraoke/python-audio-separator/blob/main/audio_separator/separator/ensembler.py) : moyenne pondérée `avg_wave` et variantes spectrales.
- [audio-separator — découpage grossier](https://github.com/nomadkaraoke/python-audio-separator/blob/main/audio_separator/separator/audio_chunking.py) : concaténation simple, sans fondu.

La dépendance est figée à **audio-separator 0.48.0**, sous
[licence MIT](https://github.com/nomadkaraoke/python-audio-separator/blob/main/LICENSE).
L'intégration utilise son API publique au lieu de copier son code. Les poids des
modèles sont des ressources distinctes : leurs conditions de redistribution ne
sont pas déduites de la licence Python.

## Périmètre implémenté

| Mode serveur | Traitement |
| --- | --- |
| `uvr-mdx` | MDX-Net préentraîné `UVR-MDX-NET-Voc_FT.onnx` |
| `uvr-ensemble` | Même MDX + Demucs `htdemucs.yaml`, moyenne temporelle 60/40 |
| `demucs` | Ancien moteur Demucs conservé |
| `uvr-demo` | Ancienne simulation, explicitement identifiée dans l'interface |

Il ne s'agit pas d'un clone de toute l'application UVR : la sélection de tous
les modèles VR/Roformer, les ensembles spectraux min/max, le traitement par lots,
le dé-écho et la séparation de tous les instruments ne sont pas exposés ici.

## Traitement

1. L'API choisit une version de moteur et l'inscrit dans la tâche BullMQ.
2. Le worker extrait/décode l'audio avec les validations existantes.
3. [L'adaptateur réel](../workers/stems/uvr_trained_worker.py) charge les poids
   préentraînés. Aucun repli silencieux vers les simulations.
4. Le traitement externe utilise des fenêtres de 30 secondes et un chevauchement
   de 25 %, avec accumulation Hann normalisée. Les extraits de 30 secondes ou
   moins sont traités en une seule fenêtre. MDX applique aussi ses propres fenêtres.
5. Chaque segment est normalisé à l'entrée et le même facteur de gain est
   réappliqué à sa prédiction. Le traitement/export interne de la bibliothèque
   reste celui d'UVR/audio-separator.
6. Après réassemblage, `instrumental = original - vocal`, dans le domaine temporel.
   Les WAV flottants vérifient la reconstruction à l'arrondi près. Les MP3 finaux
   introduisent ensuite la perte de compression habituelle.
7. Le stockage et le curseur progressif d'Equalizer restent ceux de FlowFret.

Le mode ensemble est plus coûteux : deux modèles et leurs calculs. Le chargement
initial peut télécharger des poids ; `/models/uvr` les conserve entre les jobs.
L'image Docker actuelle utilise les versions CPU de PyTorch et ONNX Runtime.
Une machine NVIDIA nécessite les dépendances CUDA et l'exposition du GPU à Docker.
La détection MPS/CoreML du paquet concerne une installation native macOS.

## Configuration

```dotenv
AUDIO_STEMS_ENGINE=uvr-mdx
AUDIO_STEMS_CPU_THREADS=2
# Dans Docker, défini par Compose :
AUDIO_STEMS_MODEL_DIR=/models/uvr
```

Depuis le backend :

```sh
node scripts/local-compose.mjs equalizer
```

Les versions de cache `uvr-mdx-0.48.0-voc-ft-v1` et
`uvr-ensemble-0.48.0-voc-ft-v1` empêchent la réutilisation d'une simulation.
Les tâches anciennes conservent leur moteur. Changer la recette ou le modèle
nécessite de changer la version du cache.

## Validation

Les tests de contrat couvrent le choix explicite des trois modes UVR, les
timeouts et les erreurs. Le comportement réel doit être validé séparément avec
les poids téléchargés, les deux sorties et un extrait contenant une voix.
Un succès sur un signal synthétique prouve l'exécution, pas la qualité perceptive.

```sh
node scripts/validate-stems.cjs /stems-tmp/extrait.wav --uvr-mdx --upload
```

Ce test supprime ses propres ressources Cloudinary et ne modifie pas les tâches
musicales existantes. L'absence de facture d'API d'inférence ne supprime pas les
limites de CPU, de mémoire, de stockage ou de durée du worker.
