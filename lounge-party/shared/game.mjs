// ============================================================================
// LIAR'S LOUNGE — rules engine
//
// Pure state machine. No sockets, no DOM, no timers, no randomness except through
// an injected rng. Every transition is `reduce(state, action) -> {state, events}`,
// which means the whole game is testable from node with no server running, and the
// TV and phone clients can replay the same reducer to predict outcomes.
//
// The game is Liar's Bar / Ship of Deceit: everyone holds a small hand, a table
// rank is declared, and on your turn you put 1-3 cards FACE DOWN and claim they
// are all that rank. The next player either believes you and plays their own, or
// calls you a liar. Someone is always wrong, and the one who is wrong drinks.
//
// The tiki reskin of the revolver: six mugs on the bar, one is the bad one. Same
// escalating-dread mechanic, fits a resort where a guest has already turned up dead.
// ============================================================================

export const RANKS = ['ORCHID', 'TIKI', 'SKULL'];   // the three suits on the table
export const WILD = 'WILD';                          // counts as any declared rank

export const PHASE = {
  LOBBY:    'lobby',      // players joining, picking avatars
  DEAL:     'deal',       // cards going out, table rank being declared
  PLAY:     'play',       // someone's turn to place or challenge
  REVEAL:   'reveal',     // a challenge was made, cards are being turned over
  RECKON:   'reckoning',  // the loser is at the bar with six mugs
  ROUND_END:'roundEnd',
  GAME_OVER:'gameOver'
};

export const MUG_COUNT = 6;
export const HAND_SIZE = 5;
export const MAX_PLAY = 3;

// ---------------------------------------------------------------- helpers

function makeRng(seed){
  // Deterministic PRNG so a game can be replayed exactly from its seed — essential
  // for reproducing a bug someone hit on the couch.
  let s = seed >>> 0 || 1;
  return function rng(){
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

function shuffle(arr, rng){
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(rng){
  // Six of each rank plus two wilds: enough that a full table can be dealt from
  // one deck, few enough ranks that bluffing is constant.
  const deck = [];
  let id = 0;
  for(const rank of RANKS){
    for(let i = 0; i < 6; i++) deck.push({id: 'c' + (id++), rank});
  }
  for(let i = 0; i < 2; i++) deck.push({id: 'c' + (id++), rank: WILD});
  return shuffle(deck, rng);
}

export function livingPlayers(state){
  return state.seats.filter(function(p){ return p.alive; });
}

function nextLivingIndex(state, from){
  const n = state.seats.length;
  for(let step = 1; step <= n; step++){
    const idx = (from + step) % n;
    if(state.seats[idx].alive) return idx;
  }
  return from;
}

// ---------------------------------------------------------------- construction

export function createGame(opts){
  const o = opts || {};
  return {
    phase: PHASE.LOBBY,
    seed: o.seed || 1,
    roomCode: o.roomCode || '----',
    hostId: null,
    seats: [],            // {id, name, avatar, alive, hand:[], mugs, badMug, connected}
    tableRank: null,
    turn: 0,              // index into seats
    pile: [],             // [{playerId, cards:[...], claimed:n}]
    lastPlay: null,
    challenge: null,      // {byId, againstId, cards, liar:bool}
    reckoning: null,      // {playerId, pulled:[], survived:bool|null}
    round: 0,
    winnerId: null,
    log: []
  };
}

// ---------------------------------------------------------------- reducer

// Every action returns a NEW state plus a list of events. Events are what the TV
// dramatises (a reveal, a mug being lifted) — the state alone is not enough to
// know what just happened, only what is true now.
export function reduce(state, action){
  const events = [];
  const s = structuredClone(state);
  const emit = function(type, data){ events.push(Object.assign({type}, data || {})); };

  switch(action.type){

    case 'JOIN': {
      if(s.phase !== PHASE.LOBBY) { emit('rejected', {reason: 'in progress'}); break; }
      if(s.seats.length >= 8)     { emit('rejected', {reason: 'table full'}); break; }
      if(s.seats.some(function(p){ return p.id === action.playerId; })) break;
      s.seats.push({
        id: action.playerId,
        name: (action.name || 'Guest').slice(0, 14),
        avatar: action.avatar || 'orchid',
        alive: true, hand: [], mugs: MUG_COUNT, badMug: 0, connected: true
      });
      if(!s.hostId) s.hostId = action.playerId;
      emit('joined', {playerId: action.playerId});
      break;
    }

    case 'LEAVE': {
      const p = s.seats.find(function(x){ return x.id === action.playerId; });
      if(p) p.connected = false;
      // In the lobby a disconnect frees the seat; mid-game the seat is held so the
      // player can rejoin on the same code without collapsing the round.
      if(s.phase === PHASE.LOBBY){
        s.seats = s.seats.filter(function(x){ return x.id !== action.playerId; });
        if(s.hostId === action.playerId) s.hostId = s.seats.length ? s.seats[0].id : null;
      }
      emit('left', {playerId: action.playerId});
      break;
    }

    case 'SET_AVATAR': {
      const p = s.seats.find(function(x){ return x.id === action.playerId; });
      if(p && s.phase === PHASE.LOBBY){ p.avatar = action.avatar; p.name = (action.name || p.name).slice(0,14); }
      break;
    }

    case 'START': {
      if(action.playerId !== s.hostId) break;
      if(s.phase !== PHASE.LOBBY && s.phase !== PHASE.GAME_OVER) break;
      if(s.seats.length < 2){ emit('rejected', {reason: 'need two players'}); break; }
      const rng = makeRng(s.seed);
      s.seats.forEach(function(p){
        p.alive = true; p.mugs = MUG_COUNT;
        p.badMug = Math.floor(rng() * MUG_COUNT);   // nobody, including the host, knows
      });
      s.round = 0; s.winnerId = null;
      Object.assign(s, dealRound(s, emit));
      break;
    }

    case 'PLAY_CARDS': {
      if(s.phase !== PHASE.PLAY) break;
      const seat = s.seats[s.turn];
      if(!seat || seat.id !== action.playerId) break;
      const ids = (action.cardIds || []).slice(0, MAX_PLAY);
      if(!ids.length) break;
      const cards = [];
      for(const id of ids){
        const i = seat.hand.findIndex(function(c){ return c.id === id; });
        if(i === -1) return {state, events: [{type: 'rejected', reason: 'card not held'}]};
        cards.push(seat.hand.splice(i, 1)[0]);
      }
      s.pile.push({playerId: seat.id, cards: cards, claimed: cards.length});
      s.lastPlay = {playerId: seat.id, count: cards.length};
      emit('played', {playerId: seat.id, count: cards.length, handLeft: seat.hand.length});
      s.turn = nextLivingIndex(s, s.turn);
      emit('turn', {playerId: s.seats[s.turn].id});
      break;
    }

    case 'CHALLENGE': {
      if(s.phase !== PHASE.PLAY) break;
      if(!s.lastPlay) break;
      const challenger = s.seats.find(function(x){ return x.id === action.playerId; });
      if(!challenger || !challenger.alive) break;
      // only the player whose turn it is may call
      if(s.seats[s.turn].id !== action.playerId) break;
      const top = s.pile[s.pile.length - 1];
      const honest = top.cards.every(function(c){ return c.rank === s.tableRank || c.rank === WILD; });
      s.phase = PHASE.REVEAL;
      s.challenge = {
        byId: action.playerId,
        againstId: top.playerId,
        cards: top.cards,
        liar: !honest,
        loserId: honest ? action.playerId : top.playerId
      };
      emit('challenge', {byId: action.playerId, againstId: top.playerId});
      emit('reveal', {cards: top.cards, liar: !honest, loserId: s.challenge.loserId});
      // straight into the reckoning; the TV paces the drama, not the model
      s.phase = PHASE.RECKON;
      s.reckoning = {playerId: s.challenge.loserId, pulled: null, survived: null};
      emit('reckoning', {playerId: s.challenge.loserId});
      break;
    }

    case 'PULL_MUG': {
      if(s.phase !== PHASE.RECKON) break;
      if(!s.reckoning || s.reckoning.playerId !== action.playerId) break;
      const p = s.seats.find(function(x){ return x.id === action.playerId; });
      if(!p) break;
      const pick = Math.max(0, Math.min(MUG_COUNT - 1, action.mug | 0));
      const bad = pick === p.badMug;
      s.reckoning.pulled = pick;
      s.reckoning.survived = !bad;
      emit('mug', {playerId: p.id, mug: pick, bad: bad});
      if(bad){
        p.alive = false;
        emit('eliminated', {playerId: p.id});
      } else {
        // that mug is gone; the odds tighten every time they survive
        p.mugs = Math.max(1, p.mugs - 1);
      }
      const alive = livingPlayers(s);
      if(alive.length <= 1){
        s.phase = PHASE.GAME_OVER;
        s.winnerId = alive.length ? alive[0].id : null;
        emit('gameOver', {winnerId: s.winnerId});
      } else {
        s.phase = PHASE.ROUND_END;
        emit('roundEnd', {});
      }
      break;
    }

    case 'NEXT_ROUND': {
      if(s.phase !== PHASE.ROUND_END) break;
      Object.assign(s, dealRound(s, emit));
      break;
    }

    default: break;
  }

  return {state: s, events: events};
}

function dealRound(s, emit){
  const rng = makeRng(s.seed + s.round * 7919 + 13);
  const deck = buildDeck(rng);
  let i = 0;
  s.seats.forEach(function(p){
    p.hand = p.alive ? deck.slice(i, i += HAND_SIZE) : [];
  });
  s.round += 1;
  s.tableRank = RANKS[Math.floor(rng() * RANKS.length)];
  s.pile = [];
  s.lastPlay = null;
  s.challenge = null;
  s.reckoning = null;
  s.phase = PHASE.PLAY;
  // the first living seat opens
  const first = s.seats.findIndex(function(p){ return p.alive; });
  s.turn = first === -1 ? 0 : first;
  emit('deal', {round: s.round, tableRank: s.tableRank});
  emit('turn', {playerId: s.seats[s.turn].id});
  return s;
}

// ---------------------------------------------------------------- views
//
// The whole point of a hidden-hand game is that the TV must never receive the
// hands. These two projections are the security boundary: the server sends
// `publicView` to the television and `privateView` only down each player's own
// socket, so a curious guest reading the TV's network traffic learns nothing.

export function publicView(s){
  return {
    phase: s.phase, roomCode: s.roomCode, round: s.round,
    tableRank: s.tableRank,
    hostId: s.hostId,
    turnId: s.seats[s.turn] ? s.seats[s.turn].id : null,
    winnerId: s.winnerId,
    pileCount: s.pile.reduce(function(n, p){ return n + p.cards.length; }, 0),
    lastPlay: s.lastPlay,
    challenge: s.challenge ? {
      byId: s.challenge.byId, againstId: s.challenge.againstId,
      liar: s.challenge.liar, loserId: s.challenge.loserId,
      cards: s.challenge.cards            // revealed on purpose — this is the drama
    } : null,
    reckoning: s.reckoning,
    seats: s.seats.map(function(p){
      return {
        id: p.id, name: p.name, avatar: p.avatar, alive: p.alive,
        connected: p.connected, mugs: p.mugs,
        handCount: p.hand.length          // count only. never the cards.
      };
    })
  };
}

export function privateView(s, playerId){
  const me = s.seats.find(function(p){ return p.id === playerId; });
  return {
    you: me ? {
      id: me.id, name: me.name, avatar: me.avatar, alive: me.alive,
      mugs: me.mugs, hand: me.hand      // only ever sent to this one socket
    } : null,
    isHost: s.hostId === playerId,
    isYourTurn: !!(s.seats[s.turn] && s.seats[s.turn].id === playerId),
    canChallenge: s.phase === PHASE.PLAY && !!s.lastPlay &&
                  !!(s.seats[s.turn] && s.seats[s.turn].id === playerId),
    mustPull: s.phase === PHASE.RECKON && !!s.reckoning && s.reckoning.playerId === playerId
  };
}
