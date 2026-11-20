# Design — Playlists collaboratives

## Intention

Permettre au propriétaire d’une playlist de partager son édition avec un ami FlowFret. Le lot 4 de la feuille de route vise une collaboration sécurisée, sans introduire Blend, Jam ni synchronisation temps réel.

## Approches

- **Accès par lien public** : déjà couvert par la visibilité publique et ne permet pas de gérer les éditeurs; écarté.
- **Invitations externes par lien/token** : ajoute un secret à distribuer et des risques de transfert; écarté pour ce premier périmètre.
- **Accès nominatif entre amis existants** : un propriétaire invite un ami accepté avec un rôle lecteur ou éditeur; le destinataire accepte ou refuse et le propriétaire peut révoquer l’accès. C’est le choix retenu pour s’appuyer sur le graphe social et éviter des invitations non sollicitées.

## Règles proposées

- Une playlist a un seul propriétaire. Les accès collaboratifs sont nominatifs et limités aux amitiés acceptées.
- Rôles : après acceptation, `VIEWER` peut consulter une playlist privée partagée; `EDITOR` peut consulter, ajouter, retirer et réordonner ses morceaux. Le propriétaire conserve les mutations de métadonnées, visibilité, partage et suppression.
- Chaque mutation vérifie le rôle en base au moment de l’opération. Le réordonnancement conserve le contrôle optimiste par version; deux changements concurrents ne doivent pas s’écraser silencieusement.
- Révoquer un accès le rend immédiatement inopérant. Une suppression ou révocation ne doit pas révéler l’existence d’une playlist à un utilisateur non autorisé.
- La première livraison porte sur schéma, autorisations, API GraphQL et tests backend. L’interface de gestion des collaborateurs et les notifications sont reportées à une tranche frontend dédiée.

## Hors périmètre

Invitations hors du graphe d’amis, URL d’invitation, édition simultanée avec résolution automatique, présence temps réel, Blend/Jam, notifications, modification des métadonnées par les éditeurs.

## Critères d’acceptation

- Un non-propriétaire ne peut pas lire une playlist privée ni muter une playlist sans rôle actif.
- Un lecteur peut lire mais ne peut pas écrire.
- Un éditeur actif peut ajouter, retirer et réordonner; l’utilisateur doit encore être ami du propriétaire.
- Le propriétaire seul peut accorder ou retirer les rôles et modifier/supprimer la playlist.
- Les conflits de version de réordonnancement restent rejetés et la révocation prend effet immédiatement.
