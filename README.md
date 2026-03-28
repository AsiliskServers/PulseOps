# PulseOps

PulseOps est une application full-stack vide pour superviser et declencher les mises a jour Debian 13 via un serveur principal et des agents locaux.

## Structure

- `web`: interface React/Vite/TypeScript
- `server`: API principale Fastify/Prisma/SQLite
- `agent`: agent Debian 13 Fastify executant `apt-get update` et `apt-get upgrade -y`

## Demarrage rapide

### 1. Installer les dependances

```bash
npm install
```

### 2. Configurer le backend principal

Creer `server/.env` a partir de `server/.env.example`.

Variables minimales :

- `DATABASE_URL`
- `SESSION_SECRET`
- `APP_ENCRYPTION_KEY`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

### 3. Configurer l'agent Debian

Creer `agent/.env` a partir de `agent/.env.example`.

Variables minimales :

- `PORT`
- `AGENT_TOKEN`
- `ALLOW_UPGRADE`

### 4. Creer la base Prisma

```bash
npm run prisma:generate --workspace server
npm run prisma:push --workspace server
```

### 5. Lancer les applications

```bash
npm run dev:server
npm run dev:web
npm run dev:agent
```

## Notes v1

- Aucun serveur n'est cree automatiquement.
- Aucun jeu de donnees d'exemple n'est insere en base.
- Le premier compte admin est cree seulement si la base est vide et que `ADMIN_EMAIL` et `ADMIN_PASSWORD` sont fournis.
- L'agent n'execute jamais `dist-upgrade` ni `full-upgrade`.
