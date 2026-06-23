# ♟️ Midnight Gambit

Plataforma de **ajedrez multijugador en tiempo real**. Crea una sala, comparte el
enlace y juega sin recargas, con reglas FIDE completas, relojes sincronizados en
el servidor, reconexión automática, chat, cuentas de usuario y estadísticas.

Construida con **Node.js + Express + Socket.IO + PostgreSQL** en el backend y un
cliente **Vanilla JS (módulos ES, sin build step)** en el frontend. Se despliega
con un solo comando: `docker compose up --build`.

---

## ✨ Características

- **Reglas FIDE completas** validadas de forma autoritativa en el servidor
  (jaque, jaque mate, ahogado, enroque corto/largo, captura al paso, promoción,
  regla de 50 jugadas, triple repetición, material insuficiente, tablas).
- **Multijugador en tiempo real** por WebSockets: partidas simultáneas, salas
  públicas y privadas (por código), enlace de invitación, lista de partidas
  abiertas y **emparejamiento automático** por control de tiempo.
- **Relojes autoritativos** en el servidor (bullet, blitz, rapid, clásico o
  personalizado) con incremento Fischer y detección de caída de bandera.
- **Reconexión automática** y detección de abandono (derrota por desconexión
  tras un periodo de gracia configurable).
- **Cuentas de usuario**: registro, inicio de sesión, acceso como invitado,
  recuperación de contraseña, JWT, avatar por color, **estadísticas** (partidas,
  victorias, % de victorias) e **historial** de partidas. Rating Elo (K=32).
- **Experiencia visual premium**: tablero elegante con coordenadas grabadas,
  piezas SVG originales, animación de movimientos, resaltado de la última jugada,
  casilla seleccionada, movimientos legales e indicador de jaque, giro manual y
  rotación automática según el color.
- **Interfaz responsive** (móvil, tablet y escritorio) sin recargas de página.
- **Seguridad**: validación de jugadas en el servidor, saneamiento de entradas,
  límites de tasa (rate limiting), `helmet`, sesiones por token y contraseñas con
  `bcrypt`.

---

## 🏗️ Arquitectura

```
                 ┌──────────────────────────────────────────────┐
   Navegador     │                  Servidor Node                │
 ┌───────────┐   │  ┌────────────┐   ┌───────────────────────┐   │
 │  Cliente  │◄──┼─►│  Express   │   │      GameManager      │   │
 │ Vanilla JS│   │  │  REST API  │   │  (partidas en memoria)│   │
 │  + Socket │   │  │  /api/...  │   │  ┌─────────────────┐  │   │
 └───────────┘   │  └────────────┘   │  │    GameRoom     │  │   │
       ▲         │  ┌────────────┐   │  │  chess.js +     │  │   │
       │  WS     │  │  Socket.IO │◄─►│  │  Clock + chat   │  │   │
       └─────────┼─►│  (tiempo   │   │  └─────────────────┘  │   │
                 │  │   real)    │   └───────────┬───────────┘   │
                 │  └────────────┘               │ (solo al      │
                 │                               ▼  finalizar)   │
                 │                       ┌────────────────┐      │
                 │                       │   PostgreSQL   │      │
                 │                       │ users · games  │      │
                 │                       │ moves · resets │      │
                 │                       └────────────────┘      │
                 └──────────────────────────────────────────────┘
```

**Decisiones clave**

- Las **partidas en vivo viven en memoria** (`GameManager` → `GameRoom`). Solo
  las partidas **finalizadas**, los usuarios y sus estadísticas se persisten en
  PostgreSQL. Esto desacopla el juego en tiempo real de la carga de la base de
  datos y permite escalar mejor.
- La validación de reglas es **autoritativa en el servidor** con `chess.js`. El
  cliente vendoriza `chess.js` **solo** para mostrar pistas de movimientos
  legales; nunca decide la legalidad real.
- El **reloj es autoritativo en el servidor** (ms restantes por color). El
  cliente interpola localmente entre instantáneas para una cuenta atrás fluida.

---

## 📁 Estructura del proyecto

```
chess-platform/
├── docker-compose.yml        # Orquesta app + PostgreSQL
├── .env.example              # Variables de entorno (copiar a .env)
├── .dockerignore
├── .gitignore
├── README.md
│
├── server/                   # Backend Node.js (Express + Socket.IO)
│   ├── Dockerfile
│   ├── package.json
│   ├── .env.example          # Para ejecución local sin Docker
│   └── src/
│       ├── index.js          # Punto de entrada: HTTP + WS + estáticos
│       ├── config.js         # Configuración por variables de entorno
│       ├── auth/
│       │   ├── jwt.js         # Firma/verificación de tokens
│       │   ├── middleware.js  # requireAuth (REST) y socketAuth (WS)
│       │   └── routes.js      # /register /login /guest /me /forgot /reset
│       ├── api/
│       │   ├── users.js       # GET /api/users/:username (perfil público)
│       │   └── games.js       # /api/games/history y /api/games/:id
│       ├── db/
│       │   ├── pool.js        # Pool de conexiones pg
│       │   ├── init.js        # Espera a Postgres y aplica el esquema
│       │   └── schema.sql     # Tablas: users, games, moves, password_resets
│       ├── game/
│       │   ├── Clock.js       # Reloj autoritativo (incremento Fischer)
│       │   ├── GameRoom.js    # Una partida: reglas, reloj, chat, fin
│       │   ├── GameManager.js # Salas, emparejamiento, persistencia, Elo
│       │   └── socket.js      # Manejadores de eventos Socket.IO
│       └── utils/
│           └── sanitize.js    # Saneamiento de entradas
│
└── client/                   # Frontend (Vanilla JS, módulos ES)
    ├── index.html            # SPA: acceso · lobby · partida · modales
    ├── css/
    │   └── styles.css        # Identidad visual "Midnight Gambit"
    └── js/
        ├── app.js            # Controlador principal (orquestación)
        ├── api.js            # Cliente REST
        ├── socket.js         # Envoltura de Socket.IO + reconexión
        ├── board.js          # Tablero interactivo (clic/arrastrar, pistas)
        ├── clock.js          # Relojes suaves sincronizados
        ├── ui.js             # Render de pantallas, listas, toasts, modales
        ├── pieces.js         # Piezas SVG originales
        └── vendor/
            └── chess.js      # chess.js (solo pistas de jugadas en cliente)
```

---

## 🚀 Puesta en marcha con Docker (recomendado)

Requisitos: **Docker** y **Docker Compose**.

```bash
# 1) Copia las variables de entorno y ajústalas (sobre todo JWT_SECRET).
cp .env.example .env

# 2) Construye y levanta todo (app + base de datos).
docker compose up --build
```

Abre **http://localhost:4000** en el navegador. El servidor espera a que
PostgreSQL esté listo, crea las tablas automáticamente y sirve tanto la API como
el cliente.

Para detener: `Ctrl+C` y, si quieres limpiar los datos, `docker compose down -v`.

> En versiones antiguas el comando es `docker-compose` (con guion).

---

## 🛠️ Ejecución en local sin Docker (modo desarrollo)

Requisitos: **Node.js ≥ 18** y un **PostgreSQL** accesible.

```bash
# 1) Crea la base de datos (ejemplo con psql).
createdb chess   # o: CREATE DATABASE chess;

# 2) Configura el servidor.
cd server
cp .env.example .env        # ajusta DATABASE_URL a tu PostgreSQL
npm install

# 3) Arranca en modo desarrollo (recarga al guardar).
npm run dev                 # o: npm start
```

El servidor aplica el esquema al arrancar y queda escuchando en
`http://localhost:4000` (configurable con `PORT`). El cliente se sirve desde el
mismo origen, así que no hace falta un servidor estático aparte.

---

## ⚙️ Variables de entorno

| Variable                  | Por defecto         | Descripción                                        |
|---------------------------|---------------------|----------------------------------------------------|
| `APP_PORT` / `PORT`       | `4000`              | Puerto HTTP/WS de la aplicación.                   |
| `NODE_ENV`                | `development`       | Entorno de ejecución.                              |
| `JWT_SECRET`              | *(cambiar)*         | Secreto para firmar los tokens. **Cámbialo.**      |
| `JWT_EXPIRES_IN`          | `7d`                | Caducidad de los tokens.                           |
| `CORS_ORIGIN`             | `*`                 | Orígenes permitidos (usa tu dominio en prod).      |
| `DATABASE_URL`            | —                   | Cadena de conexión a PostgreSQL (tiene prioridad). |
| `PGHOST/PGPORT/PGUSER/…`  | `localhost/5432/chess` | Conexión a Postgres por partes.                 |
| `RECONNECT_GRACE_SECONDS` | `60`                | Segundos de gracia para reconectar.                |
| `ABANDON_GRACE_SECONDS`   | `30`                | Segundos antes de declarar abandono.               |

---

## 🌐 API REST (resumen)

| Método | Ruta                       | Auth | Descripción                          |
|--------|----------------------------|:----:|--------------------------------------|
| POST   | `/api/auth/register`       |  —   | Crear cuenta.                        |
| POST   | `/api/auth/login`          |  —   | Iniciar sesión.                      |
| POST   | `/api/auth/guest`          |  —   | Acceso rápido como invitado.         |
| GET    | `/api/auth/me`             |  ✓   | Datos del usuario autenticado.       |
| POST   | `/api/auth/forgot-password`|  —   | Solicitar recuperación.              |
| POST   | `/api/auth/reset-password` |  —   | Cambiar contraseña con token.        |
| GET    | `/api/users/:username`     |  —   | Perfil público y estadísticas.       |
| GET    | `/api/games/history`       |  ✓   | Historial del usuario.               |
| GET    | `/api/games/:id`           |  —   | Detalle de una partida (con jugadas).|
| GET    | `/api/health`              |  —   | Estado del servicio.                 |

## 🔌 Eventos WebSocket (resumen)

**Cliente → Servidor:** `lobby:subscribe`, `lobby:list`, `lobby:create`,
`lobby:quickplay`, `lobby:cancelQuickplay`, `game:join`, `game:move`,
`game:resign`, `game:offerDraw`, `game:respondDraw`, `game:rematch`, `chat:send`.

**Servidor → Cliente:** `lobby:games`, `lobby:waiting`, `lobby:matched`,
`game:joined`, `game:state`, `game:over`, `move:rejected`, `draw:offered`,
`draw:declined`, `rematch:offered`, `rematch:start`, `chat:message`, `error:msg`.

---

## 🔐 Notas de seguridad

- Toda jugada se valida en el servidor; el cliente no puede forzar movimientos
  ilegales ni manipular el reloj.
- Entradas saneadas (usuario, chat) y límites de tasa en las rutas sensibles.
- Contraseñas con `bcrypt`; sesiones mediante JWT firmados.
- **En producción**: define un `JWT_SECRET` largo y aleatorio, restringe
  `CORS_ORIGIN` a tu dominio y sirve detrás de HTTPS.

---

## 📜 Licencia

Proyecto de ejemplo entregable. Piezas SVG e interfaz son originales. La librería
`chess.js` se incluye bajo su licencia BSD-2-Clause.
