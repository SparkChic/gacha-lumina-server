// Gacha Lumina - servidor de salas online.
// Cada jugador que entra al modo Online crea su sala; el creador es el dueño.
// Si el dueño se va, la sala se cierra y los demás reciben {t:'closed'}.
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const MAX_PLAYERS = 16;
let nextId = 1;
const clients = new Map();   // id -> client
const rooms = new Map();     // id -> room

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(`Gacha Lumina server OK - ${clients.size} jugadores, ${rooms.size} salas\n`);
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

const send = (c, m) => { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(m)); };
const pub = c => ({ id: c.id, name: c.name, look: c.look, x: c.x, y: c.y, dir: c.dir, anim: c.anim });
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, '').slice(0, n);
const roomInfo = r => ({ id: r.id, name: r.name, pub: r.pub, count: r.members.size, max: MAX_PLAYERS, ownerRtt: r.owner.rtt || 0 });
const others = (r, c) => [...r.members].filter(m => m !== c);

function leave(c, reason) {
  const r = c.room; if (!r) return;
  c.room = null; r.members.delete(c);
  if (r.owner === c) {                      // the owner left: close the room
    for (const m of r.members) { m.room = null; send(m, { t: 'closed', reason: reason || 'owner_left' }); }
    rooms.delete(r.id);
  } else {
    for (const m of r.members) send(m, { t: 'pl', id: c.id });
  }
}
function host(c, isPub) {
  leave(c);
  const r = { id: 'r' + (nextId++), name: 'Sala de ' + c.name, pub: !!isPub, owner: c, members: new Set([c]) };
  rooms.set(r.id, r); c.room = r;
  send(c, { t: 'hosted', room: roomInfo(r), owner: c.id });
}
function join(c, id) {
  const r = rooms.get(id);
  if (!r) return send(c, { t: 'err', msg: 'La sala ya no existe.' });
  if (r === c.room) return send(c, { t: 'err', msg: 'Ya estás en esta sala.' });
  if (!r.pub) return send(c, { t: 'err', msg: 'Esta sala es privada.' });
  if (r.members.size >= MAX_PLAYERS) return send(c, { t: 'err', msg: 'La sala está llena.' });
  leave(c);
  for (const m of r.members) send(m, { t: 'pj', p: pub(c) });
  r.members.add(c); c.room = r;
  send(c, { t: 'joined', room: roomInfo(r), owner: r.owner.id, players: others(r, c).map(pub) });
}

wss.on('connection', ws => {
  const c = { id: 'p' + (nextId++), ws, name: 'Jugador', look: {}, room: null, x: 0, y: 0, dir: 1, anim: 301, rtt: 0, chat: [], alive: true };
  clients.set(c.id, c);
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', data => {
    let m; try { m = JSON.parse(data.toString()); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    switch (m.t) {
      case 'hello':
        c.name = clean(m.name, 24) || 'Jugador';
        if (m.look && typeof m.look === 'object' && JSON.stringify(m.look).length < 16000) c.look = m.look;
        send(c, { t: 'welcome', id: c.id }); break;
      case 'host': host(c, m.pub !== false); break;
      case 'list': send(c, { t: 'rooms', rooms: [...rooms.values()].map(roomInfo), cur: c.room ? c.room.id : null }); break;
      case 'join': join(c, String(m.id)); break;
      case 'leave': leave(c); break;
      case 'setpub': if (c.room && c.room.owner === c) { c.room.pub = !!m.pub; send(c, { t: 'pubset', pub: c.room.pub }); } break;
      case 'st':
        c.x = +m.x || 0; c.y = +m.y || 0; c.dir = m.dir < 0 ? -1 : 1; c.anim = (+m.anim | 0) || 301;
        if (c.room) for (const o of others(c.room, c)) send(o, { t: 'st', id: c.id, x: c.x, y: c.y, dir: c.dir, anim: c.anim });
        break;
      case 'look':
        if (m.look && typeof m.look === 'object' && JSON.stringify(m.look).length < 16000) {
          c.look = m.look; if (c.room) for (const o of others(c.room, c)) send(o, { t: 'lk', id: c.id, look: c.look });
        } break;
      case 'chat': {
        const now = Date.now(); c.chat = c.chat.filter(t => now - t < 5000);
        if (c.chat.length >= 5) return send(c, { t: 'cool', ms: 5000 });
        c.chat.push(now);
        const msg = clean(m.msg, 120); if (!msg || !c.room) return;
        for (const o of others(c.room, c)) send(o, { t: 'chat', id: c.id, msg });
        break;
      }
      case 'ping': send(c, { t: 'pong', c: m.c }); break;
      case 'rtt': c.rtt = Math.max(0, Math.min(5000, +m.ms | 0)); break;
    }
  });
  ws.on('close', () => { leave(c, 'owner_left'); clients.delete(c.id); });
  ws.on('error', () => {});
});

setInterval(() => {                                    // drop dead connections
  for (const c of clients.values()) {
    if (!c.alive) { try { c.ws.terminate(); } catch (e) {} continue; }
    c.alive = false; try { c.ws.ping(); } catch (e) {}
  }
}, 20000);

server.listen(PORT, () => console.log('Gacha Lumina server listening on ' + PORT));
