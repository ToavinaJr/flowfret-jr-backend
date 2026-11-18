# Plan de remédiation de l'audit FlowFret

Ce plan recoupe les constats du rapport avec le code courant. Les doublons du rapport (SEC-03/FUNC-04 et SEC-04/05/FUNC-03) sont regroupés. Aucun constat conditionnel n'est transformé en changement métier sans preuve de l'intention.

## Priorités et ordre proposé

| Ordre | Constat | Priorité | État vérifié / correction envisagée | Vérification |
|---|---|---:|---|---|
| 1 | SEC-01 SSRF Tononkira | P1 | HTTP, sous-domaines et redirections présents; imposer hôte HTTPS exact, chemin attendu, ports/credentials absents, redirections coupées, destination DNS publique épinglée et réponse plafonnée. | Tests de validation URL, résolution, redirections, taille et erreurs réseau. |
| 2 | SEC-04/05, FUNC-03 Chat | P1 | Ajout, retrait et changement de rôle utilisent maintenant un verrou transactionnel par conversation; capacité et droits admin sont revérifiés dans la transaction, succession admin atomique; révocation Socket.IO après commit. | Tests unitaires ciblés passent; test d'intégration concurrente à ajouter avec la base de test. |
| 3 | SEC-03/FUNC-04 quota uploads | P1 | Les trois flux d'upload relisent le quota global sous verrou transactionnel par utilisateur avant insertion; les uploads Cloudinary sont compensés si la transaction échoue. La logique de verrou et quota est centralisée. | Tests unitaires de quota passent; concurrence DB et compensation Cloudinary à valider en intégration. |
| 4 | SEC-06 Docker workers | P1 | Images API et workers en cours d'alignement sur Bun; `.dockerignore` exclut déjà venv/caches. | Build des images à relancer après migration du gestionnaire. |
| 5 | SEC-07 GitHub Actions | P2 | Actions tierces pinées par SHA complet et commentaire de version; les deux workflows ont déjà `permissions: contents: read`, sans secrets ni interpolation de données PR dans les scripts. | Revue statique; validation par GitHub Actions non exécutée localement. |
| 6 | BUG-01 notifications après commit | P2 | Auditer les mutations concernées et les mécanismes de retry/idempotence; choisir une isolation d'erreur ou un outbox minimal suivant le modèle réel. | Tests d'échec post-commit et idempotence. |
| 7 | PERF-01 N+1 GraphQL | P2 | Vérifier les resolvers et loaders request-scoped existants; compléter seulement les relations sans loader en préservant les filtres d'accès. | Tests de batching et de permissions. |
| 8 | FE-01 conversation / URL | P2 | Corrigé: le paramètre de route est la source de vérité et les sélections mettent à jour `/messages/:conversationId`. | Test page de sélection et chargement des messages passe; historique navigateur reste à couvrir. |
| 9 | PERF-02 / FUNC-06 | P2 | Confirmer limites GraphQL et usages transactionnels `Serializable`; ajouter retry borné seulement pour opérations réessayables. | Tests limites et conflits simulés. |
| 10 | SEC-08/09/10, FUNC-07/08 | P3/conditionnel | Antivirus, rate limits socket, proxy, CSP/headers de déploiement et capacité mémoire nécessitent une décision de déploiement ou une mesure; documenter la limite avant tout changement risqué. | Tests de charge/hébergement et vérification de configuration. |
| 11 | FE-02/03, TypeScript strict, architecture | P3 | Corriger les races reproduites et découper par opportunité; activer le strict progressivement avec mesure des erreurs. Aucun refactor large sans couverture de comportement. | Tests ciblés, typecheck et build à chaque tranche. |
| 12 | SEC-02 Audio Stems | À confirmer | Le modèle observé est un cache partagé track/provider/engine sans propriétaire. Documenter ce contrat et vérifier URLs/identifiants avant d'ajouter une propriété ou migration. | Tests d'accès cohérents avec la politique du cache partagé. |

## Dépendances et limites

- Les invariants Chat doivent être décidés avant de déplacer les notifications ou la révocation Socket.IO.
- Les réservations de quota impliquent une coordination DB/Cloudinary; les changements doivent être compensables et ne modifient pas les données déjà stockées.
- Les règles CSP, `trust proxy`, antivirus et limites socket dépendent du déploiement qui n'est pas fourni par l'audit.
- Les changements seront faits par petites tranches testées. Pas de commit automatique, de modification d'environnement réel ni de migration destructive.

## Journal

- Audit statique recoupé le 2026-11-18.
- SEC-01 corrigé dans le code et couvert par tests unitaires; typecheck backend réussi.
- SEC-06: images API et workers basculées sur Bun 1.4.4; builds Docker à répéter. `bun audit --audit-level=high` trouve 25 avis (3 critiques, 22 élevés), dont Axios, body-parser, Handlebars, proxy-addr, undici et picomatch. Le contrôle reste rouge; traiter les dépendances avant d'attendre un CI vert. Le build Stems reste à valider, car il embarque des dépendances PyTorch lourdes.
- FE-01 corrigé: l'identifiant de conversation vient maintenant du paramètre de route, et les actions de sélection naviguent vers l'URL. Test de page ajouté pour la sélection et le chargement associé.
- SEC-07 corrigé: pins SHA complets appliqués aux actions externes des workflows frontend et backend.
- SEC-04/05: ajout, retrait et modification de rôle des membres Chat sont maintenant transactionnels sous verrou de conversation; les 8 tests unitaires du service passent. Le test PostgreSQL de concurrence reste à faire.
- SEC-03: ajout du verrou de quota utilisateur et du contrôle transactionnel aux uploads d'images, d'images de messages et de documents pédagogiques. Helper centralisé testé; la suite ciblée globale passe (37 tests). Une vérification en concurrence PostgreSQL et des tests d'intégration de compensation Cloudinary restent à faire.
- Vérifications backend: typecheck réussi; ESLint ciblé sur les fichiers backend modifiés réussi après correction des problèmes de format et de typage dans les tests Chat.
