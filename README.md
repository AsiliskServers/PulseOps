# PulseOps

PulseOps supervise et orchestre les mises a jour Debian 13 via un serveur principal Node/TypeScript et des agents Debian autonomes en Go.

## Architecture

- `web`: React/Vite/TypeScript, configure pour vivre sous `/pulseops`
- `server`: Fastify/Prisma/SQLite, expose l'UI API sous `/pulseops/api`
- `agent`: binaire Go outbound-only, s'enrole puis remonte son etat vers le main

## Flux principal

1. L'administrateur ouvre l'UI PulseOps sous `https://app.asilisk.fr/pulseops`
2. PulseOps affiche un one-liner d'installation avec un enrollment token
3. Le serveur Debian 13 telecharge le binaire agent et s'enrole automatiquement
4. L'agent remonte periodiquement son etat via HTTPS
5. L'agent poll les jobs `refresh` et `upgrade`
6. L'agent peut aussi executer une mise a jour manuelle de son binaire
7. Le main centralise snapshots, jobs et historiques

## Backend local

### 1. Installer les dependances

```bash
npm install
```

### 2. Configurer `server/.env`

Base minimale :

```env
PORT=4000
HOST=0.0.0.0
DATABASE_URL="file:./dev.db"
SESSION_SECRET=change-me-session-secret
APP_ENCRYPTION_KEY=change-me-encryption-key
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me-admin-password
WEB_ORIGIN=http://localhost:5173
APP_BASE_PATH=/pulseops
APP_PUBLIC_URL=https://app.asilisk.fr/pulseops
AGENT_REPORT_INTERVAL_SECONDS=300
AGENT_JOB_POLL_INTERVAL_SECONDS=10
AGENT_AUTO_UPDATE_INTERVAL_SECONDS=900
AGENT_STALE_AFTER_SECONDS=1800
AGENT_OFFLINE_AFTER_SECONDS=7200
```

### 3. Initialiser Prisma

```bash
npm run prisma:generate --workspace server
npm run prisma:push --workspace server
```

### 4. Lancer le main et le frontend

```bash
npm run dev:server
npm run dev:web
```

Le frontend Vite est servi localement sous `http://localhost:5173/pulseops/`.

### Mise a jour rapide d'une instance

Depuis la racine du projet :

```bash
bash ./update-pulseops.sh
```

Le script fait :

- `git pull --ff-only`
- `npm install`
- `prisma generate`
- `prisma push`
- build web et server
- build agent si Go est installe
- restart `pulseops.service` si le service existe

## Agent Go

### Build releases Linux

Depuis la racine du repo :

```bash
bash ./agent/scripts/build-release.sh
```

Ou sous PowerShell Windows :

```powershell
npm run build:agent
```

Les binaires sont generes dans `agent/dist/` :

- `pulseops-agent-linux-amd64`
- `pulseops-agent-linux-arm64`

### One-liner cible Debian 13

Commande type :

```bash
curl -fsSL https://app.asilisk.fr/pulseops/install-agent.sh | bash -s -- \
  --server-url https://app.asilisk.fr/pulseops \
  --enrollment-token VOTRE_TOKEN \
  --environment production
```

Le script :

- verifie Debian 13 et root
- telecharge le bon binaire
- cree `/opt/pulseops-agent`
- ecrit `pulseops-agent.env`
- verifie l'etat agent existant si `state.json` est deja present
- lance `pulseops-agent enroll` au premier enrollement, ou si les identifiants locaux sont rejetes par le serveur
- installe et active `systemd`

Par defaut :

- l'agent remonte un report toutes les `5 min`
- il poll les jobs toutes les `10 s`
- il verifie les nouvelles releases agent toutes les `15 min`

### Agent sans shell

Pour les hyperviseurs, appliances ou equipements ou tu ne veux jamais ouvrir un shell root via PulseOps :

```bash
curl -fsSL https://app.asilisk.fr/pulseops/install-agent.sh | bash -s -- \
  --server-url https://app.asilisk.fr/pulseops \
  --enrollment-token VOTRE_TOKEN \
  --environment production \
  --agent-profile appliance
```

Ce profil :

- conserve les reports, refresh, upgrade et mise a jour agent
- desactive explicitement l'ouverture de shell distant
- fait refuser toute tentative de terminal cote API et cote interface

### Supprimer proprement un agent d'une machine

Sur la machine Debian cible, en `root` :

```bash
systemctl stop pulseops-agent || true
systemctl disable pulseops-agent || true
rm -f /etc/systemd/system/pulseops-agent.service
systemctl daemon-reload
systemctl reset-failed
rm -rf /opt/pulseops-agent
```

Verification :

```bash
systemctl status pulseops-agent --no-pager || true
test -d /opt/pulseops-agent && echo "agent encore present" || echo "agent supprime"
```

Cette suppression retire :

- le service `systemd`
- le binaire `pulseops-agent`
- le fichier de configuration local
- le `state.json` et les secrets d'enrollement stockes localement

Important :

- cela ne supprime pas automatiquement l'entree du serveur dans PulseOps
- pour nettoyer aussi le parc, supprime ensuite le serveur depuis l'interface PulseOps
- si tu reinstalles l'agent plus tard, la machine sera reenrolee comme un nouvel agent
- si tu veux forcer un reenrollement sans supprimer tout le dossier agent, relance le one-liner avec `--force-reenroll`

## Reverse proxy

En production, le plus simple est :

- servir `web/dist` directement sous `/pulseops/`
- proxy uniquement les endpoints dynamiques PulseOps vers Fastify

Exemple Nginx :

```nginx
location = /pulseops {
    return 301 /pulseops/;
}

location /pulseops/assets/ {
    alias /var/www/pulseops/assets/;
    access_log off;
    expires 7d;
}

location /pulseops/api/ {
    proxy_pass http://127.0.0.1:4000/pulseops/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Host $host;
}

location /pulseops/health {
    proxy_pass http://127.0.0.1:4000/pulseops/health;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

location /pulseops/install-agent.sh {
    proxy_pass http://127.0.0.1:4000/pulseops/install-agent.sh;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

location /pulseops/downloads/ {
    proxy_pass http://127.0.0.1:4000/pulseops/downloads/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

location /pulseops/ {
    alias /var/www/pulseops/;
    try_files $uri $uri/ /pulseops/index.html;
}
```

Le frontend build doit etre genere avec la base `/pulseops/`, puis copie dans `/var/www/pulseops/`.

## Notes

- Aucun serveur de demo n'est cree automatiquement.
- Aucun jeu de donnees d'exemple n'est insere en base.
- Le premier compte admin est cree seulement si la base est vide et que `ADMIN_EMAIL` et `ADMIN_PASSWORD` sont fournis.
- L'agent n'execute jamais `dist-upgrade` ni `full-upgrade`.
- Les actions `refresh`, `upgrade` et `agent_update` sont asynchrones : le main cree un job, l'agent le recupere ensuite par polling.
