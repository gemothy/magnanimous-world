// ============================================================================
// LIAR'S LOUNGE — room server
//
// Authoritative. Clients send intents, never state. The server owns the deck,
// runs the reducer, and decides what each socket is allowed to see: the television
// receives `publicView` (no hands, ever) and each phone receives `privateView` for
// its own player only.
//
// Transport is deliberately isolated to this one file. The game itself is a pure
// reducer in shared/game.mjs, so moving to PartyKit, Durable Objects or a hosted
// socket service means rewriting this file and nothing else.
// ============================================================================

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createGame, reduce, publicView, privateView, PHASE } from '../shared/game.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 7777);

// ---------------------------------------------------------------- rooms

const rooms = new Map();   // code -> {code, game, screens:Set, players:Map<id,ws>}

// Ambiguity-free alphabet: no O/0, no I/1. People read these off a television
// from across a room and type them on a phone.
const CODE_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXY';
function newCode(){
  let code;
  do {
    code = Array.from({length: 4}, function(){
      return CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }).join('');
  } while(rooms.has(code));
  return code;
}

function createRoom(){
  const code = newCode();
  const room = {
    code,
    game: createGame({seed: (Math.random() * 0xffffffff) >>> 0, roomCode: code}),
    screens: new Set(),
    players: new Map(),
    createdAt: Date.now()
  };
  rooms.set(code, room);
  console.log('[room] created ' + code);
  return room;
}

function send(ws, type, payload){
  if(!ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify(Object.assign({type}, payload)));
}

// The only place state leaves the server. Screens and phones get different shapes
// by construction, so it is not possible to accidentally broadcast a hand.
function broadcast(room, events){
  const pub = publicView(room.game);
  for(const screen of room.screens) send(screen, 'state', {view: pub, events: events || []});
  for(const [pid, ws] of room.players){
    send(ws, 'state', {view: pub, you: privateView(room.game, pid), events: events || []});
  }
}

function apply(room, action){
  const out = reduce(room.game, action);
  room.game = out.state;
  broadcast(room, out.events);
  return out;
}

// ---------------------------------------------------------------- static files

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg',
  '.svg':'image/svg+xml', '.webp':'image/webp', '.m4a':'audio/mp4', '.mp3':'audio/mpeg'
};

const httpServer = createServer(async function(req, res){
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = decodeURIComponent(url.pathname);
    if(path === '/')       path = '/tv/index.html';
    if(path === '/tv')     path = '/tv/index.html';
    if(path === '/play')   path = '/phone/index.html';
    if(path === '/phone')  path = '/phone/index.html';

    // Never let a path escape the project directory.
    const safe = normalize(join(ROOT, path)).replace(/\\/g, '/');
    if(!safe.startsWith(normalize(ROOT).replace(/\\/g, '/'))){
      res.writeHead(403); res.end('forbidden'); return;
    }
    const body = await readFile(safe);
    res.writeHead(200, {
      'Content-Type': MIME[extname(safe)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(body);
  } catch (e) {
    res.writeHead(404, {'Content-Type':'text/plain'});
    res.end('not found');
  }
});

// ---------------------------------------------------------------- sockets

const wss = new WebSocketServer({server: httpServer});

wss.on('connection', function(ws){
  ws.role = null;      // 'screen' | 'player'
  ws.room = null;
  ws.playerId = null;

  ws.on('message', function(raw){
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch(e){ return; }

    switch(msg.type){

      // A television announces itself and is handed a fresh room code to display.
      case 'HOST_SCREEN': {
        const room = createRoom();
        ws.role = 'screen'; ws.room = room.code;
        room.screens.add(ws);
        send(ws, 'hosting', {code: room.code});
        broadcast(room, [{type: 'roomOpen', code: room.code}]);
        break;
      }

      // A second television (or a browser tab) can mirror an existing room.
      case 'WATCH': {
        const room = rooms.get(String(msg.code || '').toUpperCase());
        if(!room){ send(ws, 'error', {reason: 'no such room'}); break; }
        ws.role = 'screen'; ws.room = room.code;
        room.screens.add(ws);
        send(ws, 'hosting', {code: room.code});
        broadcast(room, []);
        break;
      }

      // A phone joins with the code it can see on the television.
      case 'JOIN': {
        const room = rooms.get(String(msg.code || '').toUpperCase());
        if(!room){ send(ws, 'error', {reason: 'No table with that code.'}); break; }
        if(room.game.phase !== PHASE.LOBBY && !room.game.seats.some(function(p){ return p.id === msg.playerId; })){
          send(ws, 'error', {reason: 'That game has already started.'}); break;
        }
        const pid = msg.playerId || ('p' + Math.random().toString(36).slice(2, 9));
        ws.role = 'player'; ws.room = room.code; ws.playerId = pid;
        room.players.set(pid, ws);
        send(ws, 'joined', {playerId: pid, code: room.code});
        apply(room, {type:'JOIN', playerId: pid, name: msg.name, avatar: msg.avatar});
        break;
      }

      // Everything else is a game intent, validated by the reducer.
      case 'ACTION': {
        const room = rooms.get(ws.room);
        if(!room) break;
        const action = msg.action || {};
        // The socket's identity is authoritative — a phone cannot act as another player.
        if(ws.role === 'player') action.playerId = ws.playerId;
        else if(ws.role === 'screen' && action.type !== 'NEXT_ROUND') break;
        apply(room, action);
        break;
      }

      default: break;
    }
  });

  ws.on('close', function(){
    const room = rooms.get(ws.room);
    if(!room) return;
    if(ws.role === 'screen'){
      room.screens.delete(ws);
    } else if(ws.role === 'player' && ws.playerId){
      room.players.delete(ws.playerId);
      apply(room, {type:'LEAVE', playerId: ws.playerId});
    }
    // Reap a room once the television and every phone have gone.
    if(room.screens.size === 0 && room.players.size === 0){
      rooms.delete(room.code);
      console.log('[room] closed ' + room.code);
    }
  });
});

httpServer.listen(PORT, function(){
  console.log('');
  console.log('  LIAR\'S LOUNGE');
  console.log('  television :  http://localhost:' + PORT + '/tv');
  console.log('  phone      :  http://localhost:' + PORT + '/play');
  console.log('');
});
