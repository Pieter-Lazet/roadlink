# RoadLink

**Rij samen. Praat vrij.**

RoadLink is een Progressive Web App waarmee motorrijders hands-free met elkaar kunnen communiceren via push-to-talk (PTT). Geen account, geen abonnement, geen betaalde diensten — gewoon een gedeelde sessiecode en rijden.

---

## Wat is RoadLink?

- Maak of join een ride-sessie met een 6-cijferige code (bijv. `WOLF42`)
- Houd de grote knop ingedrukt om te spreken — laat los om te stoppen
- Andere rijders horen je direct via WebRTC (peer-to-peer audio)
- Werkt via WiFi, hotspot of mobiel netwerk (met TURN-server)
- Installeerbaar als app op iOS en Android via "Voeg toe aan beginscherm"

---

## Installatie

### Vereisten

- [Node.js](https://nodejs.org/) v18 of hoger
- Een browser die WebRTC ondersteunt (Chrome, Safari, Firefox, Edge)

### Stappen

```bash
# 1. Ga naar de projectmap
cd roadlink

# 2. Installeer de dependencies
npm install

# 3. Start de signaling server
npm start
# of voor automatisch herladen bij wijzigingen:
npm run dev
```

De server draait op `ws://localhost:3000`.

---

## Lokaal testen

1. Start de server (`npm start`)
2. Open `index.html` in **twee verschillende tabbladen** of op **twee apparaten op hetzelfde WiFi/hotspot**
   - Op je lokale machine: open `index.html` direct in de browser, of gebruik een lokale webserver:
     ```bash
     npx serve .
     ```
     Dan open je `http://localhost:3000` — maar let op: de signaling-server draait ook op 3000. Gebruik dan een andere poort voor de static file server:
     ```bash
     npx serve . -p 8080
     ```
     Open dan `http://localhost:8080`
3. Maak op één tabblad een sessie aan ("Create Ride")
4. Kopieer de sessiecode en voer deze in op het andere tabblad ("Join Ride")
5. Houd de PTT-knop ingedrukt om te spreken

> **Let op voor mobiel lokaal testen:** Apparaten moeten op hetzelfde netwerk zitten. Vervang `localhost` in `index.html` door het lokale IP van je computer (bijv. `ws://192.168.1.10:3000`).

---

## Productie deployment op een VPS

### 1. Kloon de code op je server

```bash
git clone <jouw-repo> roadlink
cd roadlink
npm install
```

### 2. Start de server met een process manager

```bash
# Installeer pm2 als je dat nog niet hebt
npm install -g pm2

# Start RoadLink
pm2 start server.js --name roadlink
pm2 save
pm2 startup
```

### 3. Configureer nginx als reverse proxy

Installeer nginx en maak een site-configuratie aan:

```nginx
server {
    listen 80;
    server_name jouwdomein.com;

    # Redirect HTTP naar HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name jouwdomein.com;

    ssl_certificate     /etc/letsencrypt/live/jouwdomein.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/jouwdomein.com/privkey.pem;

    # Statische bestanden serveren
    root /pad/naar/roadlink;
    index index.html;

    # WebSocket proxy voor de signaling server
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }

    # Statische bestanden
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Herlad nginx:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 4. Pas de WebSocket URL aan in index.html

Zoek in `index.html` de regel:

```js
const WS_URL = 'ws://localhost:3000';
```

Vervang door:

```js
const WS_URL = 'wss://jouwdomein.com/ws';
```

> Met `wss://` werkt de verbinding beveiligd via HTTPS — dit is vereist voor HTTPS-sites en voor microfoon-toegang op mobiele browsers.

### 5. SSL-certificaat (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d jouwdomein.com
```

---

## TURN-server instellen (voor mobiele netwerken)

Op mobiele netwerken (4G/5G) blokkeert de carrier soms directe WebRTC-verbindingen. Een TURN-server lost dit op door audio via een relay te sturen.

### Gratis optie: Metered.ca

1. Maak een account op [metered.ca](https://www.metered.ca/)
2. Ga naar **TURN Server** in het dashboard
3. Kopieer je TURN URL, gebruikersnaam en wachtwoord
4. Open RoadLink → ⚙️ Instellingen → vul je TURN-gegevens in

Metered.ca biedt een gratis tier met voldoende capaciteit voor persoonlijk gebruik.

### Zelf hosten (Coturn)

```bash
sudo apt install coturn
```

Bewerk `/etc/turnserver.conf`:

```
listening-port=3478
fingerprint
lt-cred-mech
user=gebruiker:wachtwoord
realm=jouwdomein.com
```

Voer dan in RoadLink Instellingen in:
- URL: `turn:jouwdomein.com:3478`
- Gebruikersnaam: `gebruiker`
- Wachtwoord: `wachtwoord`

---

## Bekende beperkingen

### iOS Safari — audio vereist gebruikersinteractie

iOS staat niet toe dat audio automatisch afspeelt zonder dat de gebruiker iets heeft aangetikt. RoadLink lost dit op door audio te ontgrendelen op het moment dat je voor het eerst de PTT-knop indrukt. Bij de allereerste keer dat een andere rijder spreekt, kan het zijn dat je zijn audio nog niet hoort — druk zelf even op PTT en daarna werkt het normaal.

### Maximaal 6 rijders per sessie

Elke sessie ondersteunt maximaal 6 gelijktijdige rijders.

### WebRTC vereist HTTPS in productie

Browsers staan `getUserMedia` (microfoon) alleen toe op `https://` pagina's of `localhost`. Zorg dat je productie-omgeving over HTTPS draait.

### Sessiecodes zijn niet beveiligd

Sessiecode zijn korte publieke codes. Deel ze alleen met mensen die je wilt uitnodigen. Er is geen wachtwoord of authenticatie.

---

## Technische stack

| Component | Technologie |
|---|---|
| Frontend | Vanilla HTML/CSS/JS, geen frameworks |
| PWA | Web App Manifest + Service Worker |
| Audio | WebRTC (`getUserMedia` + `RTCPeerConnection`) |
| Signaling | WebSocket (`ws` Node.js package) |
| Server | Node.js, geen database |
| Styling | CSS custom properties (design tokens) |
| Fonts | Inter (Google Fonts) |

RoadLink is volledig peer-to-peer voor audio. De server doet alleen signaling (het uitwisselen van WebRTC-verbindingsinformatie). Audio stroomt nooit via de server.

---

## Licentie

MIT — gebruik vrij, aanpassen welkom.
