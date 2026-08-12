(function(){
  'use strict';

  window.GONE_AWAY_EVENT_FIXTURE = {
    id: 'gone-away-pilot-quiet-witness-v2',
    title: 'Quiet Witness',
    subtitle: 'A murder mystery at the Magnanimis',
    targetRuntimeSeconds: 666,
    culprit: 'eugene',
    winner: 'elza',
    prize: {
      name:'Crystal Prize',
      copy:'Delivered to the winning agent wallet when they return to Midnight City.',
      demoStatus:'DEMO RECEIPT · DELIVERY QUEUED · NO TRANSFER EXECUTED'
    },
    room: {name:'Public Watching Lounge', code:'PORCH'},
    host: {
      id:'garmus',
      name:'Garmus Campoza',
      shortName:'Garmus',
      title:'Proprietor & Master of Ceremonies',
      still:'./assets/garmus/host-projection-still.png',
      welcomeReel:'./assets/garmus/reels/welcome-reel-01.mp4',
      welcomeDuration:26.596,
      welcomeVoiceTrimDb:13,
      caseReel:'./assets/garmus/reels/case-reel-02.mp4',
      caseDuration:26.7,
      caseVoiceTrimDb:13
    },
    agents: [
      {id:'mr_c', name:'Mr. C', role:'Host’s guest', trust:72, score:0, face:'feminine', look:{base:1,pants:2,tshirt:5,hair:16,hues:{pants:0,tshirt:0,hair:0}}},
      {id:'nodnarb', name:'Nodnarb', role:'Keyholder', trust:48, score:0, face:'masculine', look:{base:1,pants:1,tshirt:3,hair:2,hues:{pants:226,tshirt:331,hair:68}}},
      {id:'mikeyyy', name:'Mikeyyy', role:'Eyewitness', trust:65, score:0, face:'feminine', look:{base:3,pants:5,tshirt:7,beard:1,hat:7,hues:{pants:255,tshirt:125,beard:318,hat:334}}},
      {id:'eugene', name:'EugenE', role:'Collector', trust:80, score:0, face:'masculine', look:{base:1,pants:3,tshirt:7,coat:5,beard:1,hat:1,hues:{pants:72,tshirt:65,coat:29,beard:72,hat:72}}},
      {id:'ranger', name:'Ranger', role:'Engineer', trust:54, score:0, face:'masculine', look:{base:1,pants:3,tshirt:6,hair:10,hues:{pants:78,tshirt:309,hair:111}}},
      {id:'elza', name:'Elza', role:'Listener', trust:62, score:0, face:'feminine', look:{base:5,pants:5,tshirt:5,coat:3,hair:19,hues:{pants:0,tshirt:0,coat:288,hair:0}}}
    ],
    clues: {
      case_summary: {
        title:'Murder by the Pool',
        kicker:'10:15 PM · The Magnanimis',
        body:'Hotel guest Julian Vale is found dead beside the pool. All six agents were nearby.'
      },
      timeline: {
        title:'The Last 25 Minutes',
        kicker:'Hotel desk times',
        body:'9:50 · EugenE says he left Julian\n10:00 · Quiet Witness starts playing\n10:05 · Julian collects the red pool key\n10:15 · Julian is found'
      },
      record_docket: {
        title:'The Repeating Record',
        kicker:'10:00 PM · The lounge',
        body:'Quiet Witness played on a loop. Elza heard the same eight bars twice—with nobody at the player.'
      },
      key_log: {
        title:'The Red Pool Key',
        kicker:'10:05 PM · Front desk',
        body:'Julian received the red pool key at 10:05. EugenE claimed he saw that key at 9:50.'
      },
      mirror_reframe: {
        title:'The Mirror',
        kicker:'Witness corrected',
        body:'Mikeyyy saw a white jacket draped over a chair—not EugenE\'s face.'
      },
      sleeve_reveal: {
        title:'The False Alibi',
        kicker:'The trick revealed',
        body:'A jacket fooled the mirror. A looping record fooled the room. The red key exposed the time.'
      }
    },
    baselinePoll: {mr_c:8,nodnarb:15,mikeyyy:9,eugene:21,ranger:42,elza:5},
    chatSeed: [
      {name:'Lagoon regular', text:'The record feels like an alibi somebody built on purpose.'},
      {name:'Night guest', text:'The red key did not exist at 9:50. Watch the times.'},
      {name:'Porch table 4', text:'Elza is quietly climbing the detective board.'}
    ],
    scenes: [
      {
        id:'SC00_PRE_SHOW', label:'Guests Assemble', duration:30,
        beats:[
          {id:'SC00-B01', duration:30, cue:'stage.countdown', title:'The lounge is open'}
        ]
      },
      {
        id:'SC01_GARMUS_WELCOME', label:'The Opening Ceremony', duration:62,
        beats:[
          {id:'SC01-B01', duration:27, cue:'garmus.welcome'},
          {id:'SC01-B02', duration:4, cue:'agents.arrive'},
          {id:'SC01-B03', duration:27, cue:'garmus.case'},
          {id:'SC01-B04', duration:4, cue:'game.begin'}
        ]
      },
      {
        id:'SC02_CASE_OPEN', label:'The Case Opens', duration:20,
        prompt:{label:'The case', text:'Who murdered Julian Vale?'},
        beats:[
          {id:'SC02-B01', duration:10, cue:'clue.show', clue:'case_summary'},
          {id:'SC02-B02', duration:10, cue:'clue.show', clue:'timeline'}
        ]
      },
      {
        id:'SC03_FIRST_STATEMENTS', label:'First Statements', duration:105,
        prompt:{label:'Question for all six', text:'Where were you between 9:50 and 10:15?'},
        beats:[
          {id:'SC03-B01', duration:15, speaker:'mr_c', cue:'agent.forward', text:'I invited Julian. At ten I was waiting at the lagoon bar. Embarrassing, perhaps. Murderous, no.'},
          {id:'SC03-B02', duration:15, speaker:'nodnarb', cue:'agent.forward', text:'I borrowed the hotel master key to reach the office phone. I never opened the pool gate.'},
          {id:'SC03-B03', duration:15, speaker:'mikeyyy', cue:'agent.forward', text:'At five past ten I saw EugenE’s white jacket in the bar mirror. I thought he never left.'},
          {id:'SC03-B04', duration:15, speaker:'eugene', cue:'agent.forward', text:'I left Julian at nine fifty. His red pool key was in his pocket. At ten I put on Quiet Witness.'},
          {id:'SC03-B05', duration:15, speaker:'ranger', cue:'agent.forward', text:'The lights failed at ten oh seven. I was at the generator with grease on both hands.'},
          {id:'SC03-B06', duration:15, speaker:'elza', cue:'agent.forward', text:'I heard the same eight bars twice. The lounge sounded occupied. The record player did not.'},
          {id:'SC03-B07', duration:15, cue:'trust.change', score:{mr_c:2,nodnarb:1,mikeyyy:3,eugene:4,ranger:1,elza:6}, trust:{mr_c:2,nodnarb:-8,mikeyyy:5,eugene:4,ranger:-6,elza:6}, system:'Elza spots the first useful detail and takes the lead.'}
        ]
      },
      {
        id:'SC04_FIRST_CROSSFIRE', label:'Crossfire', duration:70,
        prompt:{label:'Crossfire', text:'Whose account breaks under pressure?'},
        beats:[
          {id:'SC04-B01', duration:10, speaker:'elza', target:'eugene', text:'The same eight bars played twice.'},
          {id:'SC04-B02', duration:10, speaker:'eugene', target:'elza', text:'Then the record was damaged.'},
          {id:'SC04-B03', duration:10, speaker:'ranger', target:'eugene', text:'A repeating record can perform unattended.'},
          {id:'SC04-B04', duration:10, speaker:'eugene', target:'ranger', text:'And a blackout gives an engineer ten useful minutes.'},
          {id:'SC04-B05', duration:10, speaker:'mikeyyy', target:'eugene', text:'I saw you in the mirror.'},
          {id:'SC04-B06', duration:10, speaker:'nodnarb', target:'mikeyyy', text:'You saw a white jacket and supplied the person.'},
          {id:'SC04-B07', duration:10, cue:'trust.change', score:{nodnarb:2,mikeyyy:0,eugene:3,ranger:3,elza:4}, trust:{nodnarb:-4,mikeyyy:2,eugene:3,ranger:-8,elza:6}, system:'The board tightens. Elza still leads.'}
        ]
      },
      {
        id:'SC05_AUDIENCE_PREDICTION', label:'Audience Prediction', duration:45,
        prompt:{label:'Audience question', text:'Who murdered Julian Vale?'},
        beats:[
          {id:'SC05-B01', duration:12, speaker:'garmus', text:'You have heard six tidy accounts. Choose who you believe murdered Julian. The Magnanimis is very forgiving of incorrect confidence.'},
          {id:'SC05-B02', duration:25, cue:'poll.open', system:'Audience prediction is open for twenty-five seconds.'},
          {id:'SC05-B03', duration:8, cue:'poll.lock', system:'Predictions locked. The room suspects Ranger.'}
        ]
      },
      {
        id:'SC06_EVIDENCE_TURN', label:'The Evidence Turns', duration:65,
        prompt:{label:'Evidence question', text:'What do the record and red key prove?'},
        beats:[
          {id:'SC06-B01', duration:9, cue:'clue.show', clue:'record_docket'},
          {id:'SC06-B02', duration:9, cue:'clue.show', clue:'key_log'},
          {id:'SC06-B03', duration:15, speaker:'garmus', text:'Two clean facts. The record repeated by itself. The red pool key was handed to Julian at five past ten.'},
          {id:'SC06-B04', duration:10, speaker:'ranger', text:'Then the music proves nobody was standing at the player.'},
          {id:'SC06-B05', duration:10, speaker:'elza', text:'And EugenE described a key that Julian did not have yet.'},
          {id:'SC06-B06', duration:12, cue:'trust.change', score:{nodnarb:2,mikeyyy:1,eugene:2,ranger:5,elza:10}, trust:{nodnarb:8,mikeyyy:-3,eugene:-15,ranger:20,elza:5}, system:'Elza connects both clues and opens a clear lead.'}
        ]
      },
      {
        id:'SC07_SECOND_INTERROGATION', label:'The Contradiction', duration:105,
        prompt:{label:'The contradiction', text:'Which alibi contradicts the hotel timeline?'},
        beats:[
          {id:'SC07-B01', duration:10, speaker:'garmus', target:'mikeyyy', text:'Mikeyyy, give the mirror another look.'},
          {id:'SC07-B02', duration:14, speaker:'mikeyyy', cue:'clue.show', clue:'mirror_reframe', text:'I saw white in the mirror. It could have been a jacket over the chair. I never saw his face.'},
          {id:'SC07-B03', duration:11, speaker:'mr_c', target:'eugene', text:'Then EugenE was not there. Only his alibi was.'},
          {id:'SC07-B04', duration:11, speaker:'eugene', target:'mikeyyy', text:'Or Mikeyyy has discovered doubt is safer than accusation.'},
          {id:'SC07-B05', duration:15, speaker:'nodnarb', target:'eugene', cue:'clue.show', clue:'key_log', text:'The desk says ten oh five. You claimed to see the red key at nine fifty.'},
          {id:'SC07-B06', duration:10, speaker:'eugene', text:'I was mistaken about the minute.'},
          {id:'SC07-B07', duration:10, speaker:'elza', target:'eugene', text:'You were not mistaken. You saw Julian after ten oh five.'},
          {id:'SC07-B08', duration:12, speaker:'ranger', target:'eugene', text:'Then you left the record playing and the jacket on the chair.'},
          {id:'SC07-B09', duration:12, cue:'trust.change', score:{mr_c:2,nodnarb:5,mikeyyy:4,eugene:0,ranger:4,elza:12}, trust:{mr_c:-3,nodnarb:6,mikeyyy:-10,eugene:-28,ranger:12,elza:8}, system:'Elza solves the timeline and becomes the agent to catch.'}
        ]
      },
      {
        id:'SC08_FINAL_DEDUCTION', label:'Final Deduction', duration:55,
        prompt:{label:'Final deduction', text:'Name the murderer—and explain the trick.'},
        beats:[
          {id:'SC08-B01', duration:10, cue:'clue.show', clue:'sleeve_reveal'},
          {id:'SC08-B02', duration:10, speaker:'mr_c', text:'The jacket fooled the mirror. The record fooled the room.'},
          {id:'SC08-B03', duration:12, speaker:'elza', target:'eugene', text:'But the red key told the truth. EugenE met Julian after ten oh five, then built an alibi that could play by itself.'},
          {id:'SC08-B04', duration:10, speaker:'garmus', text:'A final name from each of you, if you please.'},
          {id:'SC08-B05', duration:7, cue:'agents.ballot', system:'Five votes name EugenE. EugenE names Ranger.'},
          {id:'SC08-B06', duration:6, cue:'trust.change', score:{mr_c:5,nodnarb:5,mikeyyy:5,eugene:0,ranger:5,elza:15}, trust:{mr_c:1,nodnarb:1,mikeyyy:6,eugene:-36,ranger:5,elza:4}}
        ]
      },
      {
        id:'SC09_REVEAL', label:'The Reveal', duration:75,
        prompt:{label:'The verdict', text:'One alibi cannot survive the timeline.'},
        beats:[
          {id:'SC09-B01', duration:10, cue:'agents.accuse', target:'eugene', system:'The porch closes around EugenE.'},
          {id:'SC09-B02', duration:15, speaker:'garmus', text:'EugenE, you gave us too much. You saw Julian’s red key before the hotel had given it to him.'},
          {id:'SC09-B03', duration:16, speaker:'garmus', text:'A jacket occupied the mirror. Quiet Witness occupied the room. You were free to return to the pool.'},
          {id:'SC09-B04', duration:9, speaker:'garmus', cue:'reveal', target:'eugene', text:'You are the murderer.'},
          {id:'SC09-B05', duration:12, speaker:'eugene', text:'You have the trick correct. Julian knew a secret worth more than his silence. I made an unforgivable calculation.'},
          {id:'SC09-B06', duration:8, cue:'poll.reveal', system:'The room’s prediction is compared with the truth.'},
          {id:'SC09-B07', duration:12, speaker:'garmus', cue:'prize.award', target:'elza', text:'Elza saw through sound, reflection, and time. The Crystal Prize is hers—delivered to her wallet when she returns to Midnight City.'}
        ]
      },
      {
        id:'SC10_AFTERSHOW', label:'The Lounge Remains', duration:30,
        prompt:{label:'Lounge question', text:'When did you know?'},
        beats:[
          {id:'SC10-B01', duration:14, speaker:'garmus', text:'Splendidly done. The case is closed; the lounge is not. Stay, compare scores, and improve the story in retelling.'},
          {id:'SC10-B02', duration:8, cue:'garmus.fade', system:'The projection dissolves into the lagoon.'},
          {id:'SC10-B03', duration:8, cue:'agents.idle', system:'Aftershow · The watching lounge remains open.'}
        ]
      }
    ]
  };
})();
