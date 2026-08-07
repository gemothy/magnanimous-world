// Seats three bots at a live table so the television can be watched through a real
// hand. Not a test — a driver, for looking at the thing.
//   node server/demo-table.mjs <CODE> [step]
// step: 'join' | 'start' | 'play' | 'challenge' | 'pull'
import { WebSocket } from 'ws';

const URL  = 'ws://localhost:' + (process.env.PORT || 7777);
const CODE = (process.argv[2] || '').toUpperCase();
const STEP = process.argv[3] || 'all';
if(!CODE){ console.error('usage: node server/demo-table.mjs <CODE> [step]'); process.exit(1); }

const BOTS = [
  {id:'bot-ada',  name:'Ada',   avatar:'🌺'},
  {id:'bot-rune', name:'Rune',  avatar:'🗿'},
  {id:'bot-vale', name:'Vale',  avatar:'🦩'}
];

const wait = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
const socks = {};

function open(bot){
  return new Promise(function(res){
    const ws = new WebSocket(URL);
    ws.state = null;
    ws.on('message', function(d){
      const m = JSON.parse(d.toString());
      if(m.type === 'state') ws.state = m;
      if(m.type === 'error') console.log('  ! ' + bot.name + ': ' + m.reason);
    });
    ws.on('open', function(){
      ws.send(JSON.stringify({type:'JOIN', code: CODE, playerId: bot.id, name: bot.name, avatar: bot.avatar}));
      res(ws);
    });
  });
}
const act = function(ws, action){ ws.send(JSON.stringify({type:'ACTION', action})); };

for(const b of BOTS){ socks[b.id] = await open(b); await wait(220); }
console.log('seated: ' + BOTS.map(function(b){ return b.name; }).join(', '));
if(STEP === 'join') process.exit(0);

await wait(400);
act(socks['bot-ada'], {type:'START'});
await wait(500);
console.log('dealt. table calls for ' + socks['bot-ada'].state.view.tableRank);
if(STEP === 'start') process.exit(0);

// whoever is on turn lays two cards
function onTurn(){
  const v = socks['bot-ada'].state.view;
  return BOTS.find(function(b){ return b.id === v.turnId; });
}
let t = onTurn();
let hand = socks[t.id].state.you.you.hand;
act(socks[t.id], {type:'PLAY_CARDS', cardIds:[hand[0].id, hand[1].id]});
await wait(500);
console.log(t.name + ' laid two.');
if(STEP === 'play') process.exit(0);

// the next player calls it
t = onTurn();
act(socks[t.id], {type:'CHALLENGE'});
await wait(600);
const v = socks['bot-ada'].state.view;
console.log(t.name + ' called liar. verdict: ' + (v.challenge.liar ? 'A LIE' : 'THE TRUTH')
            + ' — ' + (BOTS.find(function(b){return b.id===v.reckoning.playerId;})||{name:'?'}).name + ' goes to the bar.');
if(STEP === 'challenge') process.exit(0);

await wait(2200);
const loser = v.reckoning.playerId;
act(socks[loser], {type:'PULL_MUG', mug: 2});
await wait(800);
console.log('pulled. phase now: ' + socks['bot-ada'].state.view.phase);
await wait(30000);
process.exit(0);
