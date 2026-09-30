# Checklist de lancement — enseignement

## Portes automatiques

- [ ] Backend : `npm run validate` (lint, types, build et tests unitaires).
- [ ] Backend : `npm run test:e2e -- --runInBand` avec une base et un Redis de test configurés.
- [ ] Frontend : `bun run validate` (types, lint, tests et build).
- [ ] Base : `npx prisma migrate status` confirme que les migrations sont appliquées sur l’environnement cible.
- [ ] Configuration de production validée au démarrage; aucune variable secrète n’est livrée au frontend.

## Parcours à vérifier sur un environnement de préproduction

- [ ] Un compte FlowFret actif demande un profil enseignant; un administrateur approuve le profil.
- [ ] L’enseignant crée un cours individuel et un cours collectif; les tarifs et la capacité affichés correspondent aux valeurs enregistrées.
- [ ] Deux demandes simultanées pour la dernière place d’un groupe ne créent pas de dépassement de capacité.
- [ ] Un élève actif s’inscrit; un compte suspendu, supprimé ou l’enseignant lui-même ne peut pas s’inscrire.
- [ ] L’enseignant programme une séance et une série hebdomadaire; les conflits pour l’enseignant et les élèves sont refusés sans laisser une série partiellement créée.
- [ ] Les notifications de planification, déplacement, annulation et rappel arrivent aux bons comptes; les préférences désactivées sont respectées.
- [ ] Un élève actif peut consulter les documents de son cours; un autre compte et un compte désinscrit reçoivent un refus.
- [ ] Un fichier dans la limite du quota est téléversé, téléchargé puis supprimé; le dépassement du quota est refusé.
- [ ] L’enseignant termine une séance puis marque présence, absence et absence excusée; l’élève ne peut pas modifier les présences.
- [ ] Les heures affichées restent correctes avec le fuseau du navigateur et autour d’un changement d’heure.

## Déploiement et retour arrière

- [ ] Sauvegarder la base avant les migrations; vérifier le plan et les sauvegardes de stockage des documents.
- [ ] Déployer le backend et le frontend, appliquer les migrations, puis vérifier `/health` et le chargement du calendrier.
- [ ] Confirmer que le worker de rappels est actif et qu’un rappel n’est créé qu’une fois par séance et destinataire.
- [ ] Surveiller les erreurs GraphQL, les erreurs d’upload et l’échec des notifications durant le déploiement.
- [ ] Garder la procédure de retour arrière disponible; ne pas supprimer les données de cours ou de présence pendant un rollback applicatif.

Les tarifs sont enregistrés et affichés par cours ou par séance. L’encaissement, les remboursements et la facturation ne sont pas activés : aucune intégration de paiement n’existe dans le dépôt.
