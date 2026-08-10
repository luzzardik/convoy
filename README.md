# Convoy

Convoy est une application web de gestion de convoi automobile inspirée de [Roads Tour](https://github.com/killianeletellier/roads_tour), construit originellement pour la [1ère édition du C15 Tour Festival](https://c15tour.fr).

## Stack

- Monorepo géré via **Turbo Repo**
- Typescript-first
- Frontend : Nuxt 3, MapLibre GL JS, PWA, shadcn-vue
- Backend (API/WS) : Node 20+, Express, Socket.io
- Base de données : Prisma ORM, PostgreSQL
- Routage : OSRM régionalisé self-hosted via Docker Compose
- Déploiement : Docker Compose

## Structure

```
convoy
├── apps/
│   └── app/                        # Frontend Nuxt, avec API et WS Nitro
├── docker/
│   ├── Dockerfile                  # Build multi-stage
│   ├── entrypoint.sh               # Script de démarrage avec migrations Prisma
│   ├── nginx/                      # Configuration du reverse proxy HTTPS
│   └── osrm/prepare.sh             # Préparation et installation d'OSRM
├── scripts/
│   ├── deploy.sh                   # Déploiement en production
│   ├── cleanup.sh                  # Arrêt de la production et nettoyage
│   ├── download-osrm.sh            # Téléchargement des données OSRM
│   └── init-ssl.sh                 # Création des certificats SSL via Let's Encrypt
├── docker-compose.yml              # Environnement Compose de développement
├── docker-compose.prod.yml         # Environnement Compose de production
├── .env.example                    # Variables d'environnement de développement
├── .env.prod.example               # Variables d'environnement de production
└── ...                             # Fichiers de configuration de la stack et divers (comme le README)
```

## Développement local

### Prérequis

- Node.js v20+
- Env. de développement : Docker Compose ou serveur PostgreSQL et optionnellement OSRM

### Installation

```sh
cp .env.example .env        # obligatoire pour configurer DATABASE_URL
npm install                 # installe les dépendances npm
npm run db:generate         # génére les types du client Prisma
```

### Démarrer PostgresSQL

```sh
docker compose up postgres -d       # démarre PostgreSQL à l'aide de Docker Compose
npm run db:migrate                  # crée les tables et structures
```

> **Port 5433** : en développement, PostgreSQL Docker est exposé sur le port 5433 (et non 5432 par défaut) pour éviter les conflits avec le PostgreSQL natif déjà installé sur MacOS. Si vous n'avez pas de Postgres local, vous pouvez remettre `5432:5432` dans `docker-compose.yml` et `localhost:5432` dans `.env` même si ce n'est pas nécessaire.

### OSRM (optionnel en développement)

Sans OSRM local, le guidage turn-by-turn ne fonctionnera pas.
Pour la préparation des données, vous pouvez réaliser les étapes suivantes dans un terminal :

```sh
# Télécharger un extract OSRM (Poitou-Charentes par défaut)
# Vous pouvez télécharger un autre extract en l'ajoutant en premier argument du script
./scripts/download-osrm.sh

# Vérifier que le PBF est valide (pas une page HTML d'erreur)
ls -lh docker/osrm/data/region.osm.pbf
head -c 20 docker/osrm/data/region.osm.pbf | xxd    # premier octet doit être 0a, pas <!DOCTYPE

# Préparer le PBF
./docker/osrm/prepare.sh docker/osrm/data/region.osm.pbf

# Démarrer OSRM
docker compose --profile osrm up osrm -d
```

### Lancer l'application

Contraitement à Roads Tour, Convoy utilise un manager de monorepo qui permet de lancer l'ensemble des applications via un TUI.

```sh
# À la racine du projet
npm run dev
```

Les applications seront disponibles via les URLs suivantes :

- **Exploitation** : http://localhost:5173/
- **Administration** : http://localhost:5173/admin/login (mot de passe par défaut: `admin`)
- **Suivi convois** : http://localhost:5173/follow (mot de passe par défaut: `follower`)

### Test depuis un téléphone (réseau local)

Le serveur Vite écoute sur `0.0.0.0` et sont donc accessibles aux autres appareils de votre réseau local.

1. Trouver l'adresse IP de votre machine

```sh
# macOS / Linux
ipconfig getifaddr en0
# ou: ifconfig | grep "inet "
```

2. Démarrer l'app `npm run dev`
3. Sur le téléphone, ouvrir `http://<VOTRE_IP>:5173/` (ex. `http://192.168.1.42:5173/`)

> **HTTPS:** en développement HTTP, la géolocalisation peut être limitée sur mobile. En production, HTTPS est requis. (cf. section Production)

> **Tunnel ngrok:** en développement, Vite accepte tous les hôtes (`allowedHosts: true`) mais peut être configuré à l'aide d'une liste explicite :

```sh
VITE_ALLOWED_HOSTS=xxx.ngrok-free.app,dev.example.com npm run dev
```

## Mise en Production

Convoy est entièrement dockerisé et peut être déployé en quelques commandes, avec la gestion du SSL par Let's Encrypt.

### Architecture

L'environnement Docker Compose déploit deux réseaux Docker exploités différemment : un réseau `cy-internal` pour les communications entre les microservices et un réseau `cy-frontend` pour exposer les ports 80 et 443 pour le Web.

```
Internet → nginx:443 (HTTPS)
              └── /            → app:3000 (Nuxt & Nitro)

app → postgres:5432 (réseau interne, non exposé)
app → osrm:5000     (réseau interne, non exposé)
app → redis:6379    (réseau interne, non exposé)
```

Dans une version ultérieure, OSRM sera exposé avec un module nginx pour n'autoriser que les porteurs d'un JWT valide à s'y connecter et éviter de surproxiser OSRM en cas de panne de l'API ou de diviser les applications en plusieurs nodes.

### Prérequis serveur

- Docker Engine 24+ et Docker Compose v2
- Nom de domaine avec un enregistrement **A** (et/ou **AAAA** si IPv6) pointant vers le serveur
- Ports **80** et **443** ouverts
- Espace disque suffisant pour PostgreSQL et l'extrait OSRM (Poitou-Charentes ~220 Mo, France ~4 Go) : prévoyez minimum 20 Go pour ~200 utilisateurs et la carte
- 2 Go de RAM par tranche de 200 utilisateurs + 1.5x la taille de la carte

### Configuration

Avant la mise en production, l'application doit être configurée. Pour se faire, copiez le fichier `.env.prod.example`

```sh
cp .env.prod.example .env.prod
```

Éditez le fichier `.env.prod` pour convenir à vos besoins :

| Variable                | Description                          | Valeur par défaut         |
| ----------------------- | ------------------------------------ | ------------------------- |
| POSTGRES_ENABLED        | Lancer le serveur PostgresSQL local? | true                      |
| POSTGRES_USER           | Utilisateur du serveur PostgresSQL   | convoy                    |
| POSTGRES_PASSWORD       | Mot de passe du serveur PostgresSQL  | convoychangeme            |
| POSTGRES_DB             | Base du serveur PostgresSQL          | convoy                    |
| DATABASE_URL            | URL du serveur PostgresSQL           | (vide, générée v/ Prisma) |
| ADMIN_PASSWORD          | Mot de passe de l'accès admin        | admin (en argon2)         |
| FOLLOWER_PASSWORD       | Mot de passe de l'observatoire       | follower (en argon2)      |
| ALLOW_INSECURE_SECRETS  | Autoriser les secrets non chiffrés?  | false                     |
| JWT_SECRET              | Secret pour les jetons signés        | changemejwt               |
| USE_JWT_KEYS_REPOSITORY | Utiliser un répertoire JWKS?         | false                     |
| JWT_KEYS_REPOSITORY     | Répertoire JWKS                      | /jwks                     |
| OSRM_URL                | Adresse du serveur OSRM              | http://osrm:5000          |
| NODE_DOMAIN             | Adresse du noeud Convoy              | node1.convoy.example.com  |
| APP_DOMAIN              | Adresse de Convoy                    | convoy.example.com        |
| CERTBOT_EMAIL           | Adresse e-mail pour Let's Encrypt    | admin@example.com         |
| CERTBOT_STAGING         | Mode Staging pour Let's Encrypt      | 0                         |
| REDIS_URL               | URL du serveur Redis                 | (vide, générée v/ API)    |
| REDIS_PASSWORD          | Mot de passe Redis                   | convoychangeme            |

### Préparer OSRM

OSRM n'est **pas** exposé publiquement ; seul le contenur `app` y accède.

```sh
mkdir -p docker/osrm/data
chmod +x scripts/download-osrm.sh docker/osrm/prepare.sh

# Poitou-Charentes (région par défaut)
./scripts/download-osrm.sh
# ou ./scripts/download-osrm.sh poitou-charentes
# ou manuellement avec reprise :
# wget -c -O docker/osrm/data/region.osm.pbf \
#   https://download.geofabrik.de/europe/france/poitou-charentes-latest.osm.pbf

# Vérifier le fichier avant de le préparer (prepare.sh)
ls -lh docker/osrm/data/region.osm.pbf
head -c 20 docker/osrm/data/region.osm.pbf | xxd   # attendu : 0a… (protobuf), PAS HTML

./docker/osrm/prepare.sh docker/osrm/data/region.osm.pbf --prod
```

Vous pouvez lister les régions courantes à l'aide de la commande `./scripts/download-osrm.sh --list`.

Pour un autre région, vous pouvez utiliser `./scripts/download-osrm.sh <region>` (ex. `./scripts/download-osrm.sh monaco`) ou télécharger l'extract via [Geofabrik](https://download.geofabrik.de/) puis relancer `prepare.sh`.

La préparation OSRM créera un volume appelé `convoy_osrm-data` (nom du projet Compose + nom du volume). Vérifiez qu'il existe bien et que tout fonctionne à l'aide des commande suivantes :

```sh
docker volume inspect roads-tour_osrm-data
docker run --rm -v roads-tour_osrm-data:/data alpine:3.20 ls -la /data
# Attendu : region.osrm, region.osrm.cells, region.osrm.mldgr, etc.
```

Si le volume est vide, OSRM redémarrera en boucle et le proxy renverra 502 sur `/api/osrm/*`.

> **Utilisateurs avancés:** Vous pouvez toujours préparer OSRM sur un autre serveur et l'exposer pour l'API, vous n'aurez qu'à changer la variable d'environnement `OSRM_URL`.

### Premier déploiement

Une fois que vous avez réalisé les étapes précédentes, vous pouvez réaliser le premier déploiement de Convoy. Pour cela, utilisez les commandes suivantes :

```sh
chmod +x scripts/deploy-prod.sh scripts/cleanup-prod.sh scripts/init-letsencrypt.sh

# Déployer toute la stack (HTTP tant que pas de certificat)
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# Ou via le script helper :
./scripts/deploy-prod.sh
```

Vérifiez que l'application répond bien (en HTTP) :

```sh
curl -sf http://localhost/api/health
```

### Certificats HTTPS via Let's Encrypt

Avant de réaliser cette étape, vérifiez que vos DNS ont bien été propagés et que le port 80 de votre serveur est accessible depuis Internet.

Vous pourrez en suite lancer le script :

```sh
./scripts/init-ssl.sh
```

Ce script démarrera l'ensemble des conteneurs, dont nginx en mode bootstrap HTTP, obtiendra un certificat à l'aide de Certbot (webroot) et redémarrera nginx en mode HTTPS ainsi que certbot pour renouveller le certificat toutes les 12 heures.

À l'issue du script, vous pourrez vérifier que HTTPS est bien accessible :

```sh
curl -sf https://VOTRE_DOMAINE/api/health
```

> **HTTPS obligatoire** pour la géolocalisation et le micro sur mobile.

> **Test de Let's Encrypt** Modifiez `CERTBOT_STAGING=1` dans `.env.prod` pour éviter les limites de Let's Encrypt.

### Mises à jour de Convoy

Nous recommandons d'installer Convoy en clonant directement le répertoire Github, rendant la mise à jour extrêmement simple à l'aide de `git pull`.

Vous pourrez utiliser les commandes suivantes pour mettre à jour Convoy :

```sh
git pull   # si applicable
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

Les migrations Prisma s'exécutent automatiquement au démarrage du conteneur `app`.

### Sauvegarder et restauration de PostgreSQL

Pour créer une backup de PostgreSQL, vous pourrez utiliser la commande suivante :

```sh
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U convoy convoy > backup-$(date +%F).sql
```

Pour la restaurer, utilisez :

```sh
cat backup.sql | docker compose -f docker-compose.prod.yml exec -i postgres psql -U convoy -d convoy
```

### Logs et maintenance

En cas de besoin, voilà les quelques commandes utiles pour Convoy :

```sh
# Tous les services
docker compose -f docker-compose.prod.yml logs -f

# Service spécifique
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f nginx

# État des conteneurs
docker compose -f docker-compose.prod.yml ps

# Renouvellement manuel certificat
docker compose -f docker-compose.prod.yml exec certbot certbot renew
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

### Haute disponibilité et load balancing (HALB)

Convoy est construit de manière à supporter nativement la haute disponibilité et load balancing. Tous ses systèmes sont stateless.

Vous serez responsable de votre déploiement Redis et PostgreSQL ainsi que de leur mise en cluster, Convoy ne dispose pas de configurations embarquées pour cela. Nous vous recommandons d'utiliser Tailscale ou un autre VPN similaire pour ne pas exposer à Internet vos services sensibles.

Vous devrez modifier les variables suivantes :

| Variable          | Description                          | Valeur par défaut             |
| ----------------- | ------------------------------------ | ----------------------------- |
| POSTGRES_ENABLED  | Lancer le serveur PostgresSQL local? | false                         |
| DATABASE_URL      | URL du serveur PostgresSQL           | L'adresse de votre serveur HA |
| ADMIN_PASSWORD    | Mot de passe de l'accès admin        | Mettre la même valeur partout |
| FOLLOWER_PASSWORD | Mot de passe de l'observatoire       | Mettre la même valeur partout |
| JWT_SECRET        | Secret pour les jetons signés        | Mettre la même valeur partout |
| NODE_DOMAIN       | Adresse du noeud Convoy              | Adresse directe vers le node  |
| APP_DOMAIN        | Adresse de Convoy                    | Adresse load balancée         |
| REDIS_URL         | URL du serveur Redis                 | L'adresse de votre cluster    |

Dans une version ultérieure, les mots de passe et la gestion des secrets pourront être centralisée vers un noeud de tête.

### Répertoire JWKS

Convoy peut héberger un répertoire JWKS, similaire aux serveurs OpenID Connect.

Dans une version ultérieure, Convoy pourra utiliser le répertoire JWKS d'un noeud de tête ou encore accepter les authentifications via un serveur OpenID Connect.

Pour configurer un répertoire JWKS, vous devrez :

- Modifier la variable d'environnement `USE_JWT_KEYS_REPOSITORY` en `true`
- Modifier la variable d'environnement `JWT_KEYS_REPOSITORY` en `/jwks`
- Modifier le fichier `docker-compose.prod.yml` pour exposer un dossier avec vos clés dans `/jwks`

Vous pourrez génerer des paires de clés via le script `generate-jwks.sh`. La désactivation d'une clé se fait en supprimant sa clé privée. Si la clé publique est toujours disponible, les jetons créés par la clé privée seront toujours lisibles.

### Arrêt de Convoy

```bash
docker compose -f docker-compose.prod.yml down
# Conserver les volumes (données) :
docker compose -f docker-compose.prod.yml down
# Supprimer aussi les volumes (DESTRUCTIF) :
docker compose -f docker-compose.prod.yml down -v
```

## Dépannage

### Conteneur `app` unhealthy

Si vous recevez l'erreur `dependency failed to start: container convoy-app is unhealthy`, utilisez :

```sh
docker compose -f docker-compose.prod.yml logs app
docker compose -f docker-compose.prod.yml ps
```

Vous pourrez trouver l'un de ces messages fréquents dans les logs :

| Log                                                  | Cause                                         | Action                                                                                      |
| ---------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Set JWT_SECRET in .env.prod` / `Set ADMIN_PASSWORD` | Secrets encore aux valeurs du template        | Renseigner des secrets forts dans `.env.prod`, ou temporairement `ALLOW_INSECURE_SECRETS=1` |
| `PostgreSQL not reachable`                           | Postgres pas prêt ou `DATABASE_URL` incorrect | `docker logs roads-tour-postgres`, vérifier user/password/db                                |
| `Prisma migrate deploy failed`                       | Schéma DB incompatible ou droits manquants    | Vérifier `DATABASE_URL`, logs postgres                                                      |
| `Cannot find module ... bcrypt_lib.node`             | Module natif non compilé (image ancienne)     | `docker compose ... up -d --build` pour reconstruire l'image                                |
| `Client build not found at ...`                      | Build client absent de l'image                | Rebuild complet : `--build --no-cache`                                                      |
| `Fatal startup error`                                | Crash Node au démarrage                       | Lire la stack trace complète dans les logs                                                  |

Un healthcheck interne `GET http://127.0.0.1:3000/api/health` (délai de grâce 120 s au démarrage) est disponible.

<!-- TODO: review globale, ajouter les fonctionnalités, les limitations connues... -->
