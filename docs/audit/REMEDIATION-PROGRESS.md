# Avancement de la remédiation

Mis à jour le 20 novembre 2026. La feuille de route de référence est [REMEDIATION-ROADMAP.md](./REMEDIATION-ROADMAP.md).

## Terminés et vérifiés localement

- P0-1 à P0-6.
- P1-1 à P1-8. L'inscription par mot de passe crée un compte `PENDING` et envoie un code OTP; aucune session n'est ouverte avant vérification. Les comptes en attente peuvent demander un nouveau code. Les tests service, GraphQL E2E et fournisseur frontend couvrent ce parcours; le flux Google reste indépendant.
- P2-1, P2-2, P2-4, P2-5 et P2-9.
- P3-1, P3-2, P3-7, P3-8 et P3-9.

## Implémentés, validation encore nécessaire

- P2-3 : Playwright est intégré à la CI frontend. La suite locale comprend 18 scénarios; les scénarios autour du chargement et du déplacement de l'audio échouent encore localement. Le test axe ajouté pour la page publique passe.
- P2-6 : la procédure de sauvegarde et de restauration PostgreSQL est écrite; l'exercice sur une base jetable reste à faire.
- P2-7 : build Docker et scans Gitleaks, Trivy et pip-audit sont ajoutés à la CI backend; leur exécution réussie dans GitHub Actions reste à confirmer.

## En attente d'une décision produit

- P2-8 : livrer l'interface de collaboration de playlists ou retirer les opérations backend inutilisées. La question a été adressée à l'utilisateur.

## Restants à implémenter

- P3-3 : réduire `TeachingPage.tsx` et `teaching.resolver.ts` en unités plus petites, sous 500 lignes chacune, sans changer le comportement.
- P3-4 : générer les types client à partir du schéma GraphQL.
- P3-5 : activer `noImplicitAny` progressivement, module par module.
- P3-6 : déplacer l'état en mémoire qui doit être partagé entre plusieurs instances.

## Dernières validations locales

- Backend : 94 suites, 434 tests passés; 13 E2E passés; `typecheck` passé après l'ajustement du décorateur GraphQL; `bun audit --audit-level=high` passé après correction de la dépendance transitive `effect`.
- Frontend : le test ciblé `AuthProvider` passe (3/3); `typecheck`, `lint` et `build` repassent après le changement d'inscription. Le lint signale deux avertissements préexistants. La suite complète passe 223/225 tests; deux échecs restent dans `PersistentMediaPlayer.test.tsx` (contrôle des paroles) et `ChatPage.test.tsx` (sélection de conversation). Le build est à 1,81 Mio de JavaScript/CSS avec un chunk maximal de 375,3 Kio; le test axe WCAG A/AA de la page publique passe.
- Le résultat de la CI distante n'est pas disponible depuis cet environnement.
