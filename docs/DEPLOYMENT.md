# Linux VPS Deployment Guide

## Prerequisites

- Ubuntu 22.04 / 24.04 (or any Linux VPS)
- Node.js 20 LTS (`node -v`) & npm 9+ — **or** Docker + Docker Compose
- A domain pointed to your VPS IP (e.g., `monopoly.yourdomain.com`)

---

## Option A: Direct Node.js + systemd Deployment

### 1. Clone, Configure & Build
```bash
git clone <your-repo-url> /opt/capitalloop
cd /opt/capitalloop
cp .env.example .env
```

Edit `.env` for production:
```env
NODE_ENV=production
HOST=127.0.0.1
PORT=4000
CLIENT_ORIGIN=https://monopoly.yourdomain.com
TRUST_PROXY=1
DATA_DIR=/opt/capitalloop/data
LOG_LEVEL=info
```

Install dependencies, run tests, and build:
```bash
npm install
npm test
npm run build
```

### 2. Create systemd Service (`/etc/systemd/system/capitalloop.service`)
```ini
[Unit]
Description=CapitalLoop Private Multiplayer Game Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/capitalloop
EnvironmentFile=/opt/capitalloop/.env
ExecStart=/usr/bin/node /opt/capitalloop/server/dist/index.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo mkdir -p /opt/capitalloop/data
sudo chown -R www-data:www-data /opt/capitalloop/data
sudo systemctl daemon-reload
sudo systemctl enable --now capitalloop
sudo systemctl status capitalloop
```

---

## Option B: Docker Compose Deployment

```bash
cp .env.example .env
# Update CLIENT_ORIGIN=https://monopoly.yourdomain.com and TRUST_PROXY=1 in .env
docker compose up -d --build
docker compose logs -f
```

---

## HTTPS Reverse Proxy with WebSockets (Nginx + Certbot)

Create `/etc/nginx/sites-available/capitalloop`:

```nginx
server {
    listen 80;
    server_name monopoly.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;

        # Required for Socket.IO WebSocket upgrades
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}
```

Enable the site and issue an automatic Let's Encrypt HTTPS certificate:
```bash
sudo ln -s /etc/nginx/sites-available/capitalloop /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d monopoly.yourdomain.com
```

Verify live health check:
```bash
curl https://monopoly.yourdomain.com/api/health
```
