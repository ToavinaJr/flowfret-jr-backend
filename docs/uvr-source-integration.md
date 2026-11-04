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
4. Comme dans UVR, le morceau entier passe en un seul appel à la bibliothèque,
   qui applique ses propres fenêtres chevauchantes (MDX, 25 %) ou segments
   (Demucs). Il n'y a plus de découpage externe, donc plus de raccord artificiel
   et un seul chargement du modèle.
5. L'entrée est amenée à un pic de 1,0 avant l'appel, puis le gain d'origine est
   rétabli à l'encodage MP3. Raison : en 0.48.0, `MDXSeparator.separate`
   multiplie ses sorties par le pic de l'entrée, mais ne normalise l'entrée que
   si elle dépasse le seuil. Tout autre morceau ressortirait atténué, et la voix
   restante fuirait dans l'instrumental. Un pic de 1,0 rend ce facteur neutre.
6. `uvr-mdx` : l'instrumental est celui de la bibliothèque,
   `mix - vocals × compensation`, c'est-à-dire la méthode d'UVR. `uvr-ensemble` :
   les deux modèles sont moyennés sur la voix seule (60/40), puis
   `instrumental = mix - vocals` en flux, sans compensation. Les WAV intermédiaires
   sont en virgule flottante ; seuls les MP3 finaux ajoutent de la perte.
7. Les threads ONNX Runtime sont limités à `AUDIO_STEMS_CPU_THREADS`
   (la bibliothèque ne limite pas sa session, donc elle prendrait tous les cœurs
   de l'hôte), et la barre de progression des fenêtres MDX alimente la jauge.
8. Le stockage et le curseur progressif d'Equalizer restent ceux de FlowFret.

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

## Mesures réelles (3 novembre 2026)

Worker complet, Python 3.12, `audio-separator[cpu]==0.48.0`, 4 threads, modèle
Voc_FT téléchargé. Entrée : 29 s de parole synthétisée (Windows SAPI) centrée,
mixée à des accords et une basse, pic du mix 0,40. Coefficients de projection des
MP3 décodés sur la parole et la musique de référence (1,00 = niveau exact) :

| Moteur | Piste voix : parole / musique | Instrumental : parole / musique |
| --- | --- | --- |
| `uvr-mdx` | 0,91 / 0,00 | 0,04 / 0,97 |
| `uvr-ensemble` | 0,91 / 0,00 | 0,06 / 0,97 |
| `uvr-demo` (simulation) | 0,89 / **0,84** | 0,08 / **0,13** |

Appel brut à `Separator` sur le même mix : la voix sort à **0,375** du bon niveau
(voir l'étape 5). Il s'agit de parole synthétique, pas d'un chant enregistré :
la mesure prouve la chaîne et le niveau, pas la qualité sur une vraie chanson.

**Durée.** `uvr-mdx` : 100 s pour ces 29 s, dont environ 63 s d'inférence
(8 fenêtres de ~7,6 s) et le téléchargement initial du modèle ; `uvr-ensemble` :
146 s. Le coût d'inférence est proportionnel à la durée. Pour une durée maximale
de 420 s, extrapolez plusieurs fois ce temps, et davantage à 2 threads :
`AUDIO_STEMS_TIMEOUT_MS=600000` risque de ne pas suffire. Mesurez sur le serveur
cible avant de fixer ce délai. En mode ensemble, la jauge reste à 45 % pendant
Demucs, qui ne publie pas de progression.

**Dépendance.** audio-separator 0.48.0 importe `audioread` sans le déclarer, et
librosa 1.0 ne l'installe plus : sans `audioread` dans
`requirements-uvr-trained.txt`, le worker plante à l'import.

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
