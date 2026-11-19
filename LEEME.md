# Servidor de salas de Gacha Lumina

Este servidor conecta a todos los jugadores del modo **Online**.

- Cada jugador que entra al modo Online crea su propia sala (pública o privada según su Configuración).
- Cualquier jugador puede unirse a una sala **pública** (máximo 16 por sala).
- El creador es el **dueño**: si sale del modo Online o cierra el juego, la sala se cierra y los demás vuelven al menú principal con el mensaje "El propietario ha cerrado la sala".

## Subirlo gratis a Render (una sola vez)

1. Crea una cuenta en https://github.com y un repositorio nuevo (por ejemplo `gacha-lumina-server`).
2. En el repositorio pulsa **Add file → Upload files** y sube `server.js`, `package.json` y `.gitignore`.
3. Crea una cuenta en https://render.com (puedes entrar con GitHub).
4. En Render: **New → Web Service** → elige tu repositorio.
   - Runtime: **Node**
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: **Free**
5. Pulsa **Deploy**. Cuando termine verás una dirección como `https://gacha-lumina.onrender.com`.
   Si la abres en el navegador debe decir `Gacha Lumina server OK`.
6. En la carpeta del juego abre `GachaLuminaDiscord.ini` y escribe tu dirección cambiando `https://` por `wss://` y agregando `/ws` al final:

   ```
   server_url=wss://gacha-lumina.onrender.com/ws
   ```

7. Abre el juego con **Gacha Lumina.exe** (no con Gacha Lumiina.exe). Ese programa es el que conecta el juego con el servidor.

Para que otras personas jueguen contigo, pásales el juego con ese mismo `.ini` (con tu `server_url`).

## Notas del plan gratis de Render

- Si nadie juega durante 15 minutos el servidor se duerme. El primero en entrar puede esperar ~1 minuto mientras despierta (el juego reintenta solo).
- Mientras haya jugadores conectados no se duerme.
- Si reinicias el servidor, todas las salas se cierran.

## Probarlo en tu PC (opcional)

Con Node.js instalado: `npm install` y luego `npm start`. Pon `server_url=ws://127.0.0.1:8080/ws` en el `.ini`.
