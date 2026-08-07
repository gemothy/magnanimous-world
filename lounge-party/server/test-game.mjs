// Headless exercise of the rules engine. No server, no browser — if the game is
// wrong it should be provable here, in a second, not discovered on a couch.
import { createGame, reduce, publicView, privateView, PHASE, RANKS, WILD } from '../shared/game.mjs';

let pass = 0, fail = 0;
function check(name, cond, detail){
  if(cond){ pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); }
}
function run(state, action){ const r = reduce(state, action); return r; }

console.log('\nLIAR\'S LOUNGE — rules engine\n');

// ---------------------------------------------------------------- lobby
let g = createGame({seed: 42, roomCode: 'TIKI'});
g = run(g, {type:'JOIN', playerId:'p1', name:'Cem',  avatar:'orchid'}).state;
g = run(g, {type:'JOIN', playerId:'p2', name:'Mika', avatar:'tiki'}).state;
g = run(g, {type:'JOIN', playerId:'p3', name:'Rae',  avatar:'skull'}).state;

console.log('lobby');
check('three players seated', g.seats.length === 3);
check('first to join is host', g.hostId === 'p1');
check('starts in lobby phase', g.phase === PHASE.LOBBY);

// non-host cannot start
let r = run(g, {type:'START', playerId:'p2'});
check('non-host cannot start', r.state.phase === PHASE.LOBBY);

// ---------------------------------------------------------------- deal
g = run(g, {type:'START', playerId:'p1'}).state;
console.log('\ndeal');
check('phase is play', g.phase === PHASE.PLAY);
check('everyone holds five', g.seats.every(function(p){ return p.hand.length === 5; }));
check('a table rank was declared', RANKS.includes(g.tableRank), g.tableRank);
check('each player got a bad mug assigned', g.seats.every(function(p){ return p.badMug >= 0 && p.badMug < 6; }));
check('no duplicate card ids dealt', (function(){
  const ids = g.seats.flatMap(function(p){ return p.hand.map(function(c){ return c.id; }); });
  return new Set(ids).size === ids.length;
})());

// ---------------------------------------------------------------- hidden information
console.log('\nhidden information (the security boundary)');
const pub = publicView(g);
check('public view leaks no hands', JSON.stringify(pub).indexOf('"rank"') === -1);
check('public view still gives hand counts', pub.seats.every(function(p){ return p.handCount === 5; }));
check('public view hides the bad mug', JSON.stringify(pub).indexOf('badMug') === -1);
const priv = privateView(g, 'p1');
check('private view gives you your own hand', priv.you.hand.length === 5);
check('private view does not include other hands', !JSON.stringify(priv).includes('p2'));

// ---------------------------------------------------------------- honest play
console.log('\nhonest play, then a wrong challenge');
let turnId = g.seats[g.turn].id;
let seat = g.seats.find(function(p){ return p.id === turnId; });
// deliberately play only cards that match the table rank (or wild) -> honest
let honestCards = seat.hand.filter(function(c){ return c.rank === g.tableRank || c.rank === WILD; }).slice(0, 2);
if(!honestCards.length){
  // guarantee the case by handing them a matching card
  seat.hand[0] = {id:'forced1', rank:g.tableRank};
  honestCards = [seat.hand[0]];
}
const beforeHand = seat.hand.length;
g = run(g, {type:'PLAY_CARDS', playerId:turnId, cardIds:honestCards.map(function(c){return c.id;})}).state;
check('cards left the hand', g.seats.find(function(p){return p.id===turnId;}).hand.length === beforeHand - honestCards.length);
check('turn advanced', g.seats[g.turn].id !== turnId);

const challengerId = g.seats[g.turn].id;
r = run(g, {type:'CHALLENGE', playerId: challengerId});
check('challenge resolved', r.state.phase === PHASE.RECKON);
check('honest play means the CHALLENGER loses', r.state.reckoning.playerId === challengerId,
      'loser was ' + r.state.reckoning.playerId);
check('reveal event emitted for the TV', r.events.some(function(e){ return e.type === 'reveal'; }));

// ---------------------------------------------------------------- lying
console.log('\na lie, correctly called');
let g2 = createGame({seed: 7, roomCode:'LIAR'});
g2 = run(g2, {type:'JOIN', playerId:'a', name:'A'}).state;
g2 = run(g2, {type:'JOIN', playerId:'b', name:'B'}).state;
g2 = run(g2, {type:'START', playerId:'a'}).state;
const liarId = g2.seats[g2.turn].id;
const liar = g2.seats.find(function(p){ return p.id === liarId; });
// force a card that is definitely NOT the table rank and not wild
const wrongRank = RANKS.find(function(x){ return x !== g2.tableRank; });
liar.hand[0] = {id:'lie1', rank: wrongRank};
g2 = run(g2, {type:'PLAY_CARDS', playerId: liarId, cardIds:['lie1']}).state;
const callerId = g2.seats[g2.turn].id;
r = run(g2, {type:'CHALLENGE', playerId: callerId});
check('the liar is caught', r.state.reckoning.playerId === liarId, 'loser was ' + r.state.reckoning.playerId);
check('challenge marked as a lie', r.state.challenge.liar === true);

// ---------------------------------------------------------------- the reckoning
console.log('\nthe reckoning');
let g3 = r.state;
const doomed = g3.seats.find(function(p){ return p.id === g3.reckoning.playerId; });
const safeMug = (doomed.badMug + 1) % 6;
let r3 = run(g3, {type:'PULL_MUG', playerId: doomed.id, mug: safeMug});
check('surviving a mug keeps you alive', r3.state.seats.find(function(p){return p.id===doomed.id;}).alive === true);
check('surviving removes a mug (odds tighten)', r3.state.seats.find(function(p){return p.id===doomed.id;}).mugs === 5);
check('round ends after a pull', r3.state.phase === PHASE.ROUND_END);

let r4 = run(g3, {type:'PULL_MUG', playerId: doomed.id, mug: doomed.badMug});
check('the bad mug eliminates', r4.state.seats.find(function(p){return p.id===doomed.id;}).alive === false);
check('two-player game ends when one dies', r4.state.phase === PHASE.GAME_OVER);
check('the survivor wins', r4.state.winnerId && r4.state.winnerId !== doomed.id);

// ---------------------------------------------------------------- cheating
console.log('\ncheat resistance');
let g5 = createGame({seed: 99});
g5 = run(g5, {type:'JOIN', playerId:'x'}).state;
g5 = run(g5, {type:'JOIN', playerId:'y'}).state;
g5 = run(g5, {type:'START', playerId:'x'}).state;
const notTurn = g5.seats[(g5.turn + 1) % 2].id;
r = run(g5, {type:'PLAY_CARDS', playerId: notTurn, cardIds:[g5.seats[1].hand[0].id]});
check('cannot play out of turn', r.state.pile.length === 0);
const onTurn = g5.seats[g5.turn].id;
r = run(g5, {type:'PLAY_CARDS', playerId: onTurn, cardIds:['card-i-do-not-have']});
check('cannot play a card you do not hold', r.state.pile.length === 0 &&
      r.events.some(function(e){ return e.type==='rejected'; }));
r = run(g5, {type:'PLAY_CARDS', playerId: onTurn,
             cardIds: g5.seats[g5.turn].hand.slice(0,5).map(function(c){return c.id;})});
check('cannot play more than three cards', r.state.pile[0].cards.length === 3);

// ---------------------------------------------------------------- determinism
console.log('\ndeterminism');
function fullGame(seed){
  let s = createGame({seed});
  s = reduce(s, {type:'JOIN', playerId:'1'}).state;
  s = reduce(s, {type:'JOIN', playerId:'2'}).state;
  s = reduce(s, {type:'START', playerId:'1'}).state;
  return s.seats.map(function(p){ return p.hand.map(function(c){return c.rank;}).join(','); }).join('|')
       + '#' + s.tableRank;
}
check('same seed deals the same game', fullGame(123) === fullGame(123));
check('different seeds differ', fullGame(123) !== fullGame(124));

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
