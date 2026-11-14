# Analyse des écarts fonctionnels musique et lots de spécifications

## Objectif et périmètre

Cette analyse compare l’inventaire Spotify fourni avec les fonctionnalités observables dans FlowFret au 14 novembre 2026. Spotify sert ici de référence fonctionnelle, pas de cible de parité. FlowFret est une application d’apprentissage de guitare qui propose aussi des fonctions musicales; toute extension doit rester cohérente avec ce produit et avec les droits des fournisseurs de musique.

Les statuts signifient :

- **Présent** : une fonctionnalité correspondante existe et peut être utilisée.
- **Partiel** : une première version existe, mais ne couvre pas le cas d’usage Spotify complet.
- **Absent** : aucune fonctionnalité produit/infrastructure identifiée dans le dépôt.
- **À confirmer** : la liste source la présente comme variable par pays, appareil ou offre; ne pas en déduire une exigence sans décision produit.

## Comparaison synthétique

| Domaine de l’inventaire | État FlowFret | Éléments trouvés / écart principal |
| --- | --- | --- |
| Compte, authentification, profil | **Partiel** | Inscription/connexion e-mail, Google, profil, sessions et paramètres existent. Pas de comptes Apple/Facebook ni de gestion complète de tous les appareils et données personnelles comme dans l’inventaire. |
| Accueil et recommandations | **Partiel** | Feed général, titres tendance et recommandations musicales existent. Pas de sections éditorialisées/algorithmiques équivalentes à Daily Mix, Discover Weekly, Release Radar ou DJ. |
| Recherche | **Partiel** | Recherche paginée de morceaux via fournisseurs musicaux, historique et recherche globale de contenu existent. Pas de recherche musicale unifiée albums/artistes/podcasts/audiobooks avec filtres par type. |
| Catalogue, artistes, albums | **Partiel** | Métadonnées et résultats de morceaux proviennent d’Audius, YouTube ou Spotify selon configuration. Le modèle local de catalogue est centré sur les pistes; pas de domaines complets album/artiste/discographie ni de pages dédiées identifiées. |
| Lecture et lecteur persistant | **Présent / partiel** | Lecture, pause, saut, seek, volume, répétition, shuffle, paroles, panneaux accords/vidéo et persistance de lecture existent. La file est principalement portée par l’état client et ne sait pas encore poursuivre de manière fiable au-delà de la page de résultats chargée. |
| File de lecture | **Partiel – priorité immédiate** | Une file, l’ordre, le shuffle et les modes de répétition existent. Le cas « fin des résultats de recherche » doit charger les pages suivantes et les ajouter sans interrompre la lecture ni remplacer les modifications de file de l’utilisateur. |
| Favoris, historique, statistiques | **Présent / partiel** | Favoris de morceaux, historique d’écoute et statistiques sont implémentés. Bibliothèque unifiée (albums, artistes, podcasts, contenus enregistrés) absente. |
| Playlists | **Présent / partiel** | Playlists personnelles, ajout/retrait/réorganisation de morceaux, copie, visibilité et partage de playlist existent. Pas de playlist collaborative à plusieurs éditeurs identifiée. |
| Paroles | **Présent / partiel** | Recherche de paroles et synchronisation LRC/auto-scroll sont présentes; couverture dépend des fournisseurs et de la disponibilité des paroles. |
| Social et partage | **Partiel** | Amis, conversations, partage de pistes et playlists publiques/partagées sont présents. Activité d’écoute partagée, blocage/contrôle social détaillé, Blend et Jam synchronisé ne sont pas identifiés. |
| Podcasts et émissions | **Absent** | Aucun modèle ou parcours de recherche/abonnement/lecture de podcasts et épisodes repéré. |
| Radios / découverte avancée | **Partiel / absent** | Recommandations personnalisées existent, mais radios par artiste/morceau, mixes et expérience de découverte récurrente ne sont pas identifiés. |
| Abonnements, publicité, droits Free/Premium | **Absent** | Pas de domaine d’abonnement, facturation, annonces musicales ni de droits d’accès par offre. Aucun comportement Free/Premium ne doit être simulé uniquement par masquage UI. |
| Audio de haute qualité et hors connexion | **Absent** | Pas de niveaux de qualité, licences de téléchargement musical, gestion de cache protégé ni lecture hors ligne identifiés. |
| Audiobooks, clips, Jam, DJ, playlists IA | **Absent / à confirmer** | Pas de domaines correspondants repérés; de nombreuses fonctions sont dépendantes du marché, de l’offre, du fournisseur et des droits. À exclure du premier périmètre, sauf décision produit explicite. |
| Confidentialité et réglages musique | **Partiel** | Paramètres compte/sessions existent; mode privé d’écoute, préférences explicites dédiées, confidentialité d’activité, autorisations tierces et appareils de lecture ne sont pas couverts de bout en bout. |

## Constat produit

FlowFret a déjà une verticale musique utilisable, construite autour de la recherche de morceaux, de leur lecture et de l’apprentissage guitare (accords, paroles, stems/transcription). Les morceaux et flux reposent sur des fournisseurs externes, alors que les playlists et l’historique sont enregistrés côté FlowFret.

Les écarts les plus concrets à traiter avant d’ajouter des domaines de contenu sont :

1. Rendre la file continue et cohérente avec la pagination de recherche et l’action « ajouter à la file ».
2. Stabiliser le parcours bibliothèque autour des favoris, playlists et historique déjà existants.
3. Renforcer les pages de découverte/catégories uniquement si elles apportent une valeur au parcours guitare.
4. Décider explicitement si abonnements et téléchargement hors ligne font partie du produit. Ils exigent des droits de diffusion, une architecture de paiement et des protections côté serveur.

La liste Spotify décrit aussi des offres et fonctions qui changent selon le pays et l’appareil. Les restrictions Spotify Free/Premium ne sont pas transposables à FlowFret sans modèle commercial, droits de contenu et règles contractuelles propres à FlowFret.

## Lot 0 — inventaire technique effectué

L’inventaire ci-dessous décrit ce que fait actuellement le code. Il ne certifie pas que l’usage est autorisé par les contrats applicables; les contrats/permissions des comptes de production et une revue juridique ne sont pas disponibles dans le dépôt.

| Fournisseur | Capacités vérifiées dans le code | Limites vérifiées | Vérification des droits à obtenir |
| --- | --- | --- | --- |
| Audius | Fournisseur par défaut (`MUSIC_PROVIDER=AUDIUS`); recherche de pistes, filtre `isStreamable`, pagination par offset, URL de stream canonique, métadonnées utilisées dans favoris/historique/playlists; source utilisée aussi pour certains traitements audio. | Pas de recherche explicite artistes/albums/podcasts dans l’adaptateur actuel; jeton requis; limite de recherche encadrée; disponibilité et durée de vie du flux dépendent du service. Les docs Audius décrivent aussi des pistes gated et un réglage créateur empêchant l’accès via API; ces champs/règles ne sont pas modélisés dans l’adaptateur actuel. | Confirmer les conditions API et la portée de l’Open Music License pour les usages FlowFret; respecter le réglage « Disallow Streaming via API » et vérifier les pistes gated avant de les proposer/streamer. Confirmer métadonnées/pochettes, persistance/cache, traitements (paroles, stems/transcription), attribution et restrictions commerciales. |
| YouTube | Recherche YouTube Data API de vidéos musicales intégrables; pagination par `pageToken`; lecteur iframe côté frontend; le dépôt contient également une extraction audio YouTube via `yt-dlp` pour certains traitements. | Le modèle de recherche renvoie des vidéos assimilées à des titres; podcasts/audiobooks ne sont pas des domaines dédiés. Quotas, cookies/proxy et disponibilité de l’extraction sont des limites opérationnelles. | **Blocage de conformité à éclaircir avant d’étendre l’usage** : les politiques développeur YouTube interdisent notamment les copies/cache et la lecture hors ligne de contenu audiovisuel sans autorisation écrite, et leur guide interdit de proposer le téléchargement/séparation des pistes audio via un API client. Le dépôt contient une extraction `yt-dlp` d’audio YouTube pour traitement. Faire confirmer le périmètre exact par YouTube/conseil juridique et décider si cette voie doit être désactivée ou remplacée. Ce constat est un signal de risque, pas une conclusion juridique sur le produit. |
| Spotify | Backend : Client Credentials pour rechercher des pistes et paginer par offset; frontend : lecture via Spotify Embed/iFrame pour les pistes complètes, préécoute native lorsqu’un `preview_url` existe. | Aucune recherche albums/artistes ni authentification Spotify utilisateur détectée; pas d’accès au flux audio complet via le backend. Les capacités d’embed sont contrôlées par Spotify et peuvent dépendre du contexte utilisateur. | Confirmer que le cas d’usage, la distribution, l’utilisation d’embed/métadonnées/préécoutes, leur conservation et toute monétisation FlowFret respectent les conditions applicables. Ne pas annoncer une offre payante liée au streaming Spotify avant validation. |

### Décisions et actions de sortie du lot 0

| ID | Action / décision | État | Critère de clôture |
| --- | --- | --- | --- |
| L0-1 | Maintenir une fiche versionnée des endpoints, modes de lecture, quotas, champs stockés et usages de chaque fournisseur. | **Fait — audit du code** | Matrice ci-dessus recoupée avec services et adaptateurs présents. |
| L0-2 | Revue des conditions contractuelles/permissions Audius pour streaming, persistance et traitements audio. | **À faire — documentation du compte et validation externe requises** | Référence du contrat/permission, restrictions applicables et décision produit enregistrées. |
| L0-3 | Revue prioritaire de la combinaison YouTube Data API, lecteur iframe et extraction `yt-dlp`. | **À faire — blocage avant extension YouTube** | Décision documentée par une personne habilitée; toute voie non permise est désactivée ou remplacée et couverte par un contrôle de configuration/test. |
| L0-4 | Revue Spotify Developer Agreement/Policy, notamment embed, previews, usage commercial et monétisation. | **À faire — blocage avant plan payant lié au streaming Spotify** | Cas d’usage FlowFret vérifié, restrictions explicites documentées et parcours utilisateur conforme. |
| L0-5 | Décider si FlowFret aura des plans payants, et quels droits propres à FlowFret ils débloquent. | **À décider — produit** | Une matrice plan × entitlement est approuvée; ne pas reprendre Free/Premium Spotify comme règles FlowFret. |
| L0-6 | Cartographier territoires, langues, quotas, coûts et chemins de repli des sources de contenu. | **À faire — technique/produit** | Chaque source active a une région/capacité connue, des erreurs utilisateur définies et des seuils de quota/alerte. |

### Références officielles consultées le 14 novembre 2026

- [YouTube Developer Policies — contenu audiovisuel et données API](https://developers.google.com/youtube/terms/developer-policies/)
- [Guide YouTube sur les politiques développeur](https://developers.google.com/youtube/terms/developer-policies-guide)
- [Audius API Reference](https://docs.audius.co/api/)
- [Audius Terms of Use](https://audius.co/documents/TermsOfUse.pdf)
- [Audius Help — disponibilité des pistes via API](https://help.audius.co/product/editing-your-release)
- [Spotify Developer Terms](https://developer.spotify.com/terms)
- [Spotify Developer Policy](https://developer.spotify.com/policy)
- [Documentation Spotify Embeds](https://developer.spotify.com/documentation/embeds)

Ces documents évoluent; cette consultation est un signal de cadrage, pas une approbation de conformité. Il reste nécessaire de vérifier les contrats associés aux identifiants et comptes réellement utilisés, ainsi que les conditions Audius pertinentes.

## Lots de spécifications proposés

### Lot 0 — Cadrage produit, fournisseurs et droits

**Priorité : préalable aux fonctions payantes ou hors ligne.**

**Objectif** : fixer le périmètre musical que FlowFret peut légitimement proposer et éviter de spécifier une parité Spotify sans base de droits. L’audit technique du dépôt est effectué; les validations contractuelles et décisions produit listées ci-dessus restent ouvertes.

**Spécification / tâches**

- Inventorier les capacités et conditions d’usage des fournisseurs effectivement activés (recherche, lecture, lecture intégrée, cache, attribution, territoires, quotas).
- Décider le modèle de produit : gratuit pour tous, options payantes, ou fonctionnalités d’apprentissage premium; ne pas reprendre les plans Spotify tels quels.
- Définir la matrice « rôle/plan × fonctionnalité × pays × fournisseur » et la source d’autorité serveur si des plans sont retenus.
- Établir les indicateurs de qualité de service et de coût des fournisseurs.

**Critères d’acceptation** : décisions documentées pour la lecture, le cache/téléchargement, les annonces et la monétisation; tout point non confirmé est explicitement hors périmètre. Les validations nécessitant des contrats ou une approbation externe restent des bloqueurs assignés, pas des validations supposées.

**Tests / validation** : revue des contrats et documentation des API; scénarios de droits autorisé/refusé; vérifier qu’aucun écran ne promet une fonction non disponible au fournisseur. Ajouter une vérification automatique des capacités après décision sur les droits.

**Dépend de** : aucun. Bloquant pour les lots 6 et 7.

### Lot 1 — Continuité du lecteur et file de lecture

**Priorité : P0, corrige une limite fonctionnelle déjà rencontrée.**

**Objectif** : ne pas arrêter la musique quand la file initiale est épuisée alors que la recherche possède encore des pages suivantes.

**Spécification / tâches**

- Formaliser la source de la file : résultats de recherche, playlist, favoris, recommandations ou ajouts manuels; une seule source active à la fois, avec son contexte de continuation.
- Conserver le curseur de pagination et la requête/provider associés au contexte de lecture.
- À l’approche de la fin de la file, charger une page suivante et ajouter les pistes nouvelles à la suite de la file sans changer la piste courante, l’index courant, le mode shuffle/répétition ou les éléments réordonnés par l’utilisateur.
- Dédupliquer selon `(provider, providerTrackId)`; éviter les chargements concurrents et les boucles si le curseur ne progresse pas ou si une page est vide.
- Garder la distinction entre « file terminée » et « chargement en cours/échec »; permettre une reprise et annoncer l’état de manière accessible.
- Définir le comportement de « suivant » manuel, fin naturelle, répétition de file et changement de recherche pendant une lecture.

**Critères d’acceptation**

- La piste courante joue jusqu’à sa fin pendant le chargement de la page suivante.
- À la fin, la prochaine piste disponible démarre automatiquement; si le fournisseur n’a plus de résultats, le lecteur s’arrête proprement.
- Une erreur réseau n’efface pas la file déjà chargée et peut être retentée.
- La pagination d’une recherche ne réinjecte jamais de doublons et ne remet pas le lecteur à l’index 0.
- Ajouter/réordonner/supprimer un élément manuellement reste déterministe pendant le chargement.

**Tests** : tests unitaires de la machine de file (curseur, déduplication, curseur bloqué, page vide, shuffle/répétition); tests de hook/intégration avec pages successives et concurrence; test E2E de fin naturelle sur mobile et desktop; vérifier le lecteur persistant à 375 px et large écran.

**Dépend de** : contrat de pagination existant; instrumentation facultative du lot 0.

**État d’implémentation (14 novembre 2026)** : le frontend rattache maintenant la continuation à une file issue d’une recherche, charge et déduplique une page supplémentaire à la fin de la file, permet aussi au bouton « suivant » de déclencher cette continuation, prend en charge une file de recherche d’un seul titre et affiche un état de reprise si le chargement échoue. La continuation reste enregistrée dans le lecteur persistant après navigation. Les validations automatiques et manuelles de ces changements restent à exécuter.

### Lot 2 — Bibliothèque musicale cohérente

**Priorité : P1.**

**Objectif** : rendre les fonctions déjà existantes de favoris, playlists et historique accessibles comme une bibliothèque de l’utilisateur.

**Spécification / tâches**

- Définir les sections Vus récemment, Favoris, Mes playlists et, si les fournisseurs le permettent, Albums/Artistes enregistrés.
- Uniformiser recherche, tri, filtres, états vide/erreur/chargement et pagination.
- Définir le comportement de retrait d’un favori, de suppression de playlist et de disparition d’une piste chez son fournisseur.
- Préserver la source de lecture quand une piste démarre depuis une section de bibliothèque; appliquer le lot 1 pour la suite de file.

**Critères d’acceptation** : les listes sont privées à leur propriétaire; actions confirmées et cohérentes après rafraîchissement; les pistes indisponibles ont un état explicite et ne bloquent pas les suivantes.

**Tests** : services/API avec propriétaire différent et pagination; tests UI de recherche/tri/états vides; parcours E2E favoris → lecture → suivant, playlist → ajout/retrait → rafraîchissement.

**Dépend de** : Lot 1 recommandé; modèles de favoris/historique/playlists existants.

### Lot 3 — Découverte et catalogue musical adaptés à FlowFret

**Priorité : P1 après stabilisation de la lecture.**

**Objectif** : enrichir la découverte sans présumer que les API fournissent des entités albums/artistes complètes.

**Spécification / tâches**

- Vérifier par fournisseur la disponibilité réelle de recherche par type, métadonnées, pagination, pages artiste/album et liens externes.
- Définir une première tranche restreinte : catégories/genres ou vues par artiste/album si l’API le permet; sinon rester sur des résultats de pistes et les recommandations existantes.
- Définir signaux de recommandation exploitables et contrôlables par l’utilisateur (favoris, historique, masquage éventuel), avec explication simple de la personnalisation.
- Ajouter des états explicites lorsque le fournisseur renvoie peu de résultats ou ne supporte pas un type de recherche.

**Critères d’acceptation** : les pages n’affichent que les données réellement reçues; aucun faux album/artiste n’est construit à partir de champs ambigus; démarrer une piste alimente une file continue.

**Tests** : contrats d’adaptation par fournisseur et réponses partielles; tests du curseur et fallback; tests UI des états sans résultat/indisponible; E2E recherche → page catalogue → lecture.

**Dépend de** : Lot 0 pour limites fournisseurs; Lot 1 pour la continuité.

### Lot 4 — Social musical et playlists collaboratives

**Priorité : P2, uniquement si la collaboration est un objectif produit.**

**Objectif** : prolonger les amis, conversations, partage et playlists publiques déjà présents vers une collaboration sécurisée.

**Spécification / tâches**

- Spécifier les rôles propriétaire/éditeur/lecteur et les invitations d’une playlist collaborative.
- Définir les règles de conflit de réorganisation et de suppression de pistes lorsque plusieurs éditeurs agissent simultanément.
- Définir visibilité, révocation d’accès, blocage et signalement.
- Différer Blend/Jam en temps réel : ce sont des produits séparés (matching de goûts, synchronisation audio, synchronisation de file, latence et consentement des participants).

**Critères d’acceptation** : chaque mutation est autorisée côté backend selon le rôle; retrait d’accès immédiat; les éditions concurrentes ne perdent pas silencieusement des changements.

**Tests** : matrice d’accès par rôle, propriétaire, invitation expirée/révoquée; tests de concurrence/version; parcours E2E avec deux comptes.

**Dépend de** : Lot 0 pour partage de contenu fournisseur; modèles playlist et amitié existants.

### Lot 5 — Paramètres d’écoute et confidentialité

**Priorité : P2.**

**Objectif** : compléter les réglages qui ont un effet produit réel avant des appareils connectés ou du partage d’activité.

**Spécification / tâches**

- Décider le comportement « écoute privée » et quelles données d’historique/statistiques elle exclut.
- Définir effacement/export des recherches et historique selon règles de conservation.
- Documenter les réglages de contenu explicite seulement si les fournisseurs exposent ce contrôle.
- Clarifier le contrôle de lecture multi-appareils; ne pas appeler cela Spotify Connect sans intégration/protocole correspondant.

**Critères d’acceptation** : état privé appliqué côté serveur à l’enregistrement d’écoute; suppression des données idempotente; libellés indiquent clairement le périmètre.

**Tests** : historique privé/non privé; effacement répété; autorisations d’appareils; tests d’accessibilité des préférences.

**Dépend de** : Lot 0; domaine utilisateur/session existant.

### Lot 6 — Plans, droits et facturation FlowFret (optionnel)

**Priorité : P2, décision produit préalable obligatoire.**

**Objectif** : si un plan payant est choisi, centraliser les droits au lieu de parsemer `isPremium` dans l’interface.

**Spécification / tâches**

- Définir offres FlowFret, période d’essai, renouvellement, annulation, expiration, remboursements et changements de formule.
- Concevoir des droits nommés et versionnés (ex. outils d’apprentissage, quota de transcriptions, limites de stockage); ne pas déclarer « musique sans publicité » ou « musique hors ligne » sans droits correspondants.
- Vérifier les droits côté backend pour chaque opération protégée; l’interface ne fait qu’expliquer/présenter le droit.
- Définir webhook fournisseur de paiement, idempotence, audit et procédure de réconciliation.

**Critères d’acceptation** : événements de paiement idempotents; expiration/révocation prise en compte sans délai indu; autorisation backend testée pour chaque entitlement; aucune donnée de carte bancaire stockée par FlowFret.

**Tests** : matrice des droits (actif, expiré, essai, annulé, remboursement); signatures de webhook valides/invalides; tests d’idempotence et accès interdit.

**Dépend de** : Lot 0 et décision business/legal.

### Lot 7 — Mode hors connexion (optionnel, fortement dépendant des droits)

**Priorité : P3.**

**Objectif** : prendre en charge uniquement les contenus dont le fournisseur autorise le téléchargement ou le cache hors ligne.

**Spécification / tâches**

- Séparer cache de métadonnées/ressources pédagogiques FlowFret et téléchargement du flux musical protégé; ne pas persister un flux externe sans autorisation.
- Définir stockage, chiffrement, expiration, révocation, quota, suppression, état de synchronisation et comportement à la déconnexion.
- Définir les contenus pédagogiques que FlowFret contrôle (paroles/chords générés, transcriptions) et leurs droits propres.

**Critères d’acceptation** : aucun contenu protégé n’est disponible hors ligne sans droit vérifié; cache supprimable et borné; erreurs réseau ne corrompent pas les données locales.

**Tests** : mode avion, cache expiré, quota atteint, utilisateur déconnecté, révocation de droit, synchronisation interrompue/reprise; tests sécurité stockage.

**Dépend de** : Lot 0 et, si la monétisation le requiert, Lot 6.

### Lot 8 — Podcasts, audiobooks, clips et expériences temps réel (hors MVP)

**Priorité : P3 / à reconsidérer après validation du produit.**

**Objectif** : éviter de créer plusieurs domaines médias sans demande utilisateur ni contrat fournisseur.

**Spécification / tâches si approuvées séparément**

- Un lot par type de média : modèle et recherche, reprise de position, progression, favoris/abonnements, téléchargement autorisé, lecteur et tests propres.
- Pour clips : transitions audio/vidéo, plein écran, accessibilité et consommation réseau.
- Pour Jam/écoute partagée : protocole de synchronisation, hôte, invités, latence, arbitrage de file, reconnexion et consentement.
- Pour DJ/playlists IA : provenance des suggestions, sûreté des prompts, coûts, filtrage et contrôle utilisateur.

**Critères d’acceptation** : spécification indépendante par domaine, fournisseur et territoire; fallback compréhensible lorsque le média ou la fonction est indisponible.

**Tests** : tests de reprise de position, erreurs de droits, réseau instable et compatibilité appareil; scénarios multi-clients pour toute synchronisation temps réel.

**Dépend de** : décision produit, Lot 0, et possiblement Lots 1, 5, 6 ou 7.

## Ordre de livraison recommandé

1. **Lot 1** — continuité de la file, avec tests de non-régression; c’est la prochaine amélioration concrète du lecteur.
2. **Lot 0** — cadrage fournisseurs/droits en parallèle de la conception des lots futurs.
3. **Lot 2** — bibliothèque cohérente qui exploite les données existantes.
4. **Lot 3** — découverte/catégories après vérification des capacités de chaque fournisseur.
5. **Lots 4 et 5** — seulement selon la demande pour collaboration et confidentialité musicale.
6. **Lots 6 à 8** — décisions séparées; pas de développement avant validation business, contractuelle et technique.

## Non-objectifs de cette feuille de route

- Reproduire à l’identique les offres, quotas ou restrictions Spotify Free/Premium.
- Présenter les intégrations Spotify/Audius/YouTube comme un catalogue appartenant à FlowFret.
- Implémenter Spotify Connect, publicité, lossless, téléchargement, podcasts ou audiobooks par simple imitation d’écran.
- Construire des systèmes de recommandation génératifs ou temps réel avant d’avoir des exigences et mesures de valeur produit.

