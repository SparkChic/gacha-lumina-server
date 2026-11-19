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
// cualquier link (http, www, dominio.com, discord . gg, etc.) se bloquea
const LINK_RE = /(https?:|www\s*\.|:\/\/|\b[a-z0-9-]+\s*(\.|\(dot\)|\[\.\]|\(\.\)|\s(dot|punto)\s)\s*(com|net|org|gg|io|xyz|ly|tk|ml|ga|cf|gq|ru|tv|fm|cc|gl|biz|vip)\b|\b[a-z0-9-]+\.(es|me|co|to|in|de|us|uk|be|id|fun|top|pro|live|page|link|site|online|store|shop|club|app|info|dev|eu|fr|br|jp|kr|cn|cl|ar|mx|pe|ve|uy|py|bo|ec)(\b|\/)|discord\s*\.?\s*gg|\b(punto|dot)\s*(com|net|org|gg))/i;
// insultos -> ****
const BAD_RE = new RegExp('(^|[^a-z0-9áéíóúñüàèìòùâêîôûäëïö])(m+[oóòôö0]+t+h+[eéèêë3]+r+f+[uúùûü]+c+k+[eéèêë3]+r+|d+[iíìîï1\\!]+c+k+h+[eéèêë3]+[aáàâä4@]+d+|d+[uúùûü]+m+b+[aáàâä4@]+[s\\$5]+[s\\$5]+|b+[aáàâä4@]+[s\\$5]+t+[aáàâä4@]+r+d+|[iíìîï1\\!]+m+b+[eéèêë3]+c+[iíìîï1\\!]+l+|[aáàâä4@]+[s\\$5]+[s\\$5]+h+[oóòôö0]+l+[eéèêë3]+|c+[aáàâä4@]+l+l+[aáàâä4@]+t+[eéèêë3]+|r+[eéèêë3]+t+[aáàâä4@]+r+d+|[s\\$5]+t+[uúùûü]+p+[iíìîï1\\!]+d+|f+[aáàâä4@]+[g9]+[g9]+[oóòôö0]+t+|[iíìîï1\\!]+d+[iíìîï1\\!]+[oóòôö0]+t+[aáàâä4@]+|m+[uúùûü]+[eéèêë3]+r+t+[eéèêë3]+|b+[iíìîï1\\!]+t+c+h+|p+[uúùûü]+[s\\$5]+[s\\$5]+y+|w+h+[oóòôö0]+r+[eéèêë3]+|[iíìîï1\\!]+d+[iíìîï1\\!]+[oóòôö0]+t+|n+[eéèêë3]+[g9]+r+[oóòôö0]+|n+[iíìîï1\\!]+[g9]+[g9]+[aáàâä4@]+|n+1+[g9]+[g9]+[aáàâä4@]+|p+[uúùûü]+t+[oóòôö0]+|p+[uúùûü]+t+[aáàâä4@]+|f+[uúùûü]+c+k+|[s\\$5]+l+[uúùûü]+t+|c+[uúùûü]+n+t+|[s\\$5]+h+[iíìîï1\\!]+t+|h+[oóòôö0]+[eéèêë3]+)(e?s)?(?=$|[^a-z0-9áéíóúñüàèìòùâêîôûäëïö])', 'gi');
const censor = t => String(t).replace(BAD_RE, '$1****');
const pub = c => ({ id: c.id, name: c.name, look: c.look, x: c.x, y: c.y, dir: c.dir, anim: c.anim });
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, '').slice(0, n);
const roomInfo = r => ({ id: r.id, name: r.name, pub: r.pub, map: r.map || 0, count: r.members.size, max: MAX_PLAYERS, ownerRtt: r.owner.rtt || 0 });
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
  const r = { id: 'r' + (nextId++), name: 'Sala de ' + c.name, pub: !!isPub, map: 0, owner: c, members: new Set([c]) };
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
  const c = { id: 'p' + (nextId++), ws, name: 'Jugador', look: {}, room: null, x: 0, y: 0, dir: 1, anim: 301, rtt: 0, chat: [], alive: true, last: Date.now() };
  clients.set(c.id, c);
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', data => {
    c.last = Date.now();
    let m; try { m = JSON.parse(data.toString()); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;
    switch (m.t) {
      case 'hello':
        c.name = clean(m.name, 24) || 'Jugador';
        if (LINK_RE.test(c.name)) c.name = 'Jugador';
        c.name = censor(c.name);
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
        if (LINK_RE.test(msg)) return send(c, { t: 'err', msg: 'No se permiten links en el chat.' });
        const safe = censor(msg);
        for (const o of others(c.room, c)) send(o, { t: 'chat', id: c.id, msg: safe });
        break;
      }
      case 'setmap': {     // only the room owner can change the map
        if (!c.room) break;
        if (c.room.owner !== c) return send(c, { t: 'err', msg: 'Solo el propietario de la sala puede cambiar el mapa.' });
        const k = Math.max(0, Math.min(3, m.map | 0));
        if (c.room.map === k) break;
        c.room.map = k;
        for (const o of others(c.room, c)) send(o, { t: 'map', map: k });
        break;
      }
      case 'ping': send(c, { t: 'pong', c: m.c }); break;
      case 'rtt': c.rtt = Math.max(0, Math.min(5000, +m.ms | 0)); break;
    }
  });
  ws.on('close', () => drop(c));
  ws.on('error', () => {});
});

// The game sends a 'ping' every 3 s. If a player stops sending anything (power cut, internet down,
// game killed) we drop them after DEAD_MS; if they owned a room, the room closes for everybody.
const DEAD_MS = 15000;
function drop(c) {
  if (!clients.has(c.id)) return;
  clients.delete(c.id);
  leave(c, 'owner_left');
  try { c.ws.terminate(); } catch (e) {}
}
setInterval(() => {
  const now = Date.now();
  for (const c of [...clients.values()]) {
    if (now - c.last > DEAD_MS) { drop(c); continue; }
    try { c.ws.ping(); } catch (e) {}
  }
}, 5000);

server.listen(PORT, () => console.log('Gacha Lumina server listening on ' + PORT));
