// End-to-end over real websockets: one television, two phones, a full round played
// through the actual protocol. Catches the things the pure-reducer test cannot —
// identity spoofing, view leakage on the wire, and turn routing.
import { WebSocket } from 'ws';

const URL = 'ws://localhost:' + (process.env.PORT || 7777);
let pass = 0, fail = 0;
const check = function(name, cond, detail){
  if(cond){ pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  -> ' + detail : '')); }
};

function open(){
  return new Promise(function(res, rej){
    const ws = new WebSocket(URL);
    ws.inbox = [];
    ws.on('message', function(d){ ws.inbox.push(JSON.parse(d.toString())); });
    ws.on('open', function(){ res(ws); });
    ws.on('error', rej);
  });
}
const send = function(ws, o){ ws.send(JSON.stringify(o)); };
const wait = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
function latest(ws, type){
  for(let i = ws.inbox.length - 1; i >= 0; i--) if(ws.inbox[i].type === type) return ws.inbox[i];
  return null;
}

console.log('\nLIAR\'S LOUNGE — end to end\n');

const tv = await open();
send(tv, {type:'HOST_SCREEN'});
await wait(150);
const hosting = latest(tv, 'hosting');
check('television is given a table code', !!hosting && /^[A-Z]{4}$/.test(hosting.code), hosting && hosting.code);
const code = hosting.code;

console.log('\njoining');
const a = await open(); send(a, {type:'JOIN', code, playerId:'A', name:'Ada',  avatar:'🌺'});
await wait(120);
const b = await open(); send(b, {type:'JOIN', code, playerId:'B', name:'Bo',   avatar:'🗿'});
await wait(180);

check('both phones seated', latest(tv,'state').view.seats.length === 2);
check('first to join is host', latest(a,'state').you.isHost === true);
check('second is not host', latest(b,'state').you.isHost === false);

console.log('\nwhat the television is allowed to see');
const tvState = latest(tv, 'state');
check('television gets no `you` block', tvState.you === undefined);
const tvWire = JSON.stringify(tvState);
check('no card ranks on the television wire', !/"rank"\s*:/.test(tvWire));
check('no bad-mug position on the wire', tvWire.indexOf('badMug') === -1);
check('television still gets hand counts', tvState.view.seats.every(function(p){ return typeof p.handCount === 'number'; }));

console.log('\nwhat a phone is allowed to see');
send(a, {type:'ACTION', action:{type:'START'}});
await wait(200);
const aState = latest(a, 'state');
check('you receive your own five cards', aState.you.you.hand.length === 5);
const aWire = JSON.stringify(aState.you);
check('you do not receive the other player\'s hand', !/"B"/.test(aWire));
check('game is under way', latest(tv,'state').view.phase === 'play');

console.log('\nidentity cannot be spoofed');
const turnId = latest(tv,'state').view.turnId;
const offTurn = turnId === 'A' ? b : a;
const offId   = turnId === 'A' ? 'B' : 'A';
const pileBefore = latest(tv,'state').view.pileCount;
// the off-turn phone claims to be the player whose turn it is
const victimHand = (offTurn === a ? latest(a,'state') : latest(b,'state')).you.you.hand;
send(offTurn, {type:'ACTION', action:{type:'PLAY_CARDS', playerId: turnId, cardIds:[victimHand[0].id]}});
await wait(180);
check('a phone cannot act as another player', latest(tv,'state').view.pileCount === pileBefore,
      'pile went ' + pileBefore + ' -> ' + latest(tv,'state').view.pileCount);

console.log('\nplaying a hand');
const onTurn = turnId === 'A' ? a : b;
const hand = latest(onTurn,'state').you.you.hand;
send(onTurn, {type:'ACTION', action:{type:'PLAY_CARDS', cardIds:[hand[0].id, hand[1].id]}});
await wait(180);
let st = latest(tv,'state');
check('two cards are on the table', st.view.pileCount === 2);
check('the turn passed', st.view.turnId !== turnId);
check('television was told a play happened', (latest(tv,'state').events||[]).some(function(e){ return e.type==='played'; }));
check('the player\'s hand shrank', latest(onTurn,'state').you.you.hand.length === 3);

console.log('\ncalling a liar');
const caller = st.view.turnId === 'A' ? a : b;
send(caller, {type:'ACTION', action:{type:'CHALLENGE'}});
await wait(200);
st = latest(tv,'state');
check('a reckoning began', st.view.phase === 'reckoning', st.view.phase);
check('the cards were revealed to the television', !!st.view.challenge && Array.isArray(st.view.challenge.cards));
check('somebody was found to be wrong', !!st.view.reckoning && !!st.view.reckoning.playerId);

console.log('\nthe bar');
const loserId = st.view.reckoning.playerId;
const loser = loserId === 'A' ? a : b;
check('only the loser is told to pull', latest(loser,'state').you.mustPull === true);
const other = loserId === 'A' ? b : a;
check('the other player is not', latest(other,'state').you.mustPull === false);
// the loser cannot dodge by having someone else pull for them
send(other, {type:'ACTION', action:{type:'PULL_MUG', mug: 0}});
await wait(150);
check('another player cannot pull on your behalf', latest(tv,'state').view.phase === 'reckoning');

send(loser, {type:'ACTION', action:{type:'PULL_MUG', mug: 3}});
await wait(200);
st = latest(tv,'state');
check('the pull resolved', st.view.phase === 'roundEnd' || st.view.phase === 'gameOver', st.view.phase);
check('television got a mug event to dramatise', (st.events||[]).some(function(e){ return e.type==='mug'; }));

console.log('\ndisconnects');
b.close();
await wait(250);
st = latest(tv,'state');
const bSeat = st.view.seats.find(function(p){ return p.id === 'B'; });
check('a mid-game seat is held, not deleted', !!bSeat, 'seat vanished — a dropped phone would end the game');
check('the seat is flagged disconnected', bSeat && bSeat.connected === false);

tv.close(); a.close();
console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
