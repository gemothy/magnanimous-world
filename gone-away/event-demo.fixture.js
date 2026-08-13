(function(){
  'use strict';

  window.GONE_AWAY_EVENT_FIXTURE = {
    id: 'gone-away-pilot-seventh-guest-v1',
    title: 'The Seventh Guest',
    seriesTitle: 'The Magnanimis Mysteries',
    subtitle: 'A murder game at the Magnanimis',
    targetRuntimeSeconds: 540,
    culprit: 'ranger',
    winner: 'elza',
    case: {
      victim:'Adrian Vale',
      question:'Who murdered Adrian Vale?'
    },
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
      {id:'mr_c', name:'Mr. C', role:'Investor', trust:72, score:0, face:'feminine', look:{base:1,pants:2,tshirt:5,hair:16,hues:{pants:0,tshirt:0,hair:0}}},
      {id:'nodnarb', name:'Nodnarb', role:'Confessor', trust:48, score:0, face:'masculine', look:{base:1,pants:1,tshirt:3,hair:2,hues:{pants:226,tshirt:331,hair:68}}},
      {id:'mikeyyy', name:'Mikeyyy', role:'Degen', trust:65, score:0, face:'feminine', look:{base:3,pants:5,tshirt:7,beard:1,hat:7,hues:{pants:255,tshirt:125,beard:318,hat:334}}},
      {id:'eugene', name:'EugenE', role:'Whale', trust:80, score:0, face:'masculine', look:{base:1,pants:3,tshirt:7,coat:5,beard:1,hat:1,hues:{pants:72,tshirt:65,coat:29,beard:72,hat:72}}},
      {id:'ranger', name:'Ranger', role:'Engineer', trust:54, score:0, face:'masculine', look:{base:1,pants:3,tshirt:6,hair:10,hues:{pants:78,tshirt:309,hair:111}}},
      {id:'elza', name:'Elza', role:'Auditor', trust:62, score:0, face:'feminine', look:{base:5,pants:5,tshirt:5,coat:3,hair:19,hues:{pants:0,tshirt:0,coat:288,hair:0}}}
    ],
    openingBoards: [
      {
        title:'The Seventh Guest',
        kicker:'Tonight at the Magnanimis',
        body:'Adrian Vale entered paradise. He did not leave the lagoon. All six agents had a reason.'
      },
      {
        title:'Race the Table',
        kicker:'How to play',
        body:'Meet the suspects. Catch two case fragments. Vote before the agents. Win the gloat.'
      }
    ],
    clues: {
      case_summary: {
        title:'The Seventh Guest',
        kicker:'Tonight at the Magnanimis',
        body:'Adrian Vale, a luxury travel critic with twelve readers, was found beside the lagoon. All six agents had a reason.'
      },
      rules: {
        title:'Race the Table',
        kicker:'The audience plays first',
        body:'Hear six grievances. Catch two fragments. Lock your prediction before the agents receive the last clue.'
      },
      fragment_one: {
        title:'The Last Reply',
        kicker:'Case fragment 1 of 3',
        body:'Adrian heard four calm words beside the lagoon. Nobody shouted. Nobody made a scene.'
      },
      fragment_two: {
        title:'Something Out of Place',
        kicker:'Case fragment 2 of 3',
        body:'Immediately before the splash, Adrian disturbed something arranged with obsessive precision.'
      },
      fragment_three: {
        title:'One Final Word',
        kicker:'Case fragment 3 of 3',
        body:'One word carried across the lagoon before the splash: TOWEL.'
      },
      verdict: {
        title:'One Suspect Fits',
        kicker:'The table decides',
        body:'Four calm words. Something moved out of place. A towel. One grievance connects all three.'
      }
    },
    baselinePoll: {mr_c:8,nodnarb:10,mikeyyy:12,eugene:9,ranger:42,elza:19},
    chatSeed: [
      {name:'Swim-up regular', text:'Six separate grievances. Adrian almost deserved a loyalty card.'},
      {name:'Cabana 3', text:'Elza counting twelve readers is colder than the lagoon.'},
      {name:'Night guest', text:'I came for the chairs and now I am emotionally invested.'}
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
          {id:'SC01-B02', duration:4, cue:'game.begin'},
          {id:'SC01-B03', duration:4, cue:'agents.arrive'},
          {id:'SC01-B04', duration:27, cue:'garmus.case'}
        ]
      },
      {
        id:'SC02_CASE_OPEN', label:'The Seventh Guest', duration:18,
        prompt:{label:'Tonight at the Magnanimis', text:'Who murdered Adrian Vale?'},
        beats:[
          {id:'SC02-B01', duration:9, cue:'clue.show', clue:'case_summary'},
          {id:'SC02-B02', duration:9, cue:'clue.show', clue:'rules'}
        ]
      },
      {
        id:'SC03_FIRST_STATEMENTS', label:'Petty Grievances', duration:91,
        prompt:{label:'Question for all six', text:'What did Adrian Vale do to you?'},
        beats:[
          {id:'SC03-B01', duration:7, speaker:'garmus', text:'Honesty is complimentary tonight. Restraint, apparently, is not.'},
          {id:'SC03-B02', duration:12, speaker:'mr_c', cue:'agent.forward', text:'I funded his travel club. Down ninety-seven percent. I am diversified in anger.'},
          {id:'SC03-B03', duration:12, speaker:'nodnarb', cue:'agent.forward', text:'He filmed me crying at the swim-up bar. Forty views. Not viral. Just permanent.'},
          {id:'SC03-B04', duration:12, speaker:'mikeyyy', cue:'agent.forward', text:'He stole my catchphrase. I was furious. Still am. Seventy percent furious.'},
          {id:'SC03-B05', duration:12, speaker:'eugene', cue:'agent.forward', text:'He called EugenE “bro.” One is not bro. The ocean knows this.'},
          {id:'SC03-B06', duration:12, speaker:'ranger', cue:'agent.forward', text:'He moved my towel.'},
          {id:'SC03-B07', duration:12, speaker:'elza', cue:'agent.forward', text:'He claimed a million readers. I counted twelve. Then he blocked me.'},
          {id:'SC03-B08', duration:12, cue:'trust.change', score:{mr_c:2,nodnarb:1,mikeyyy:1,eugene:1,ranger:1,elza:3}, trust:{mr_c:1,nodnarb:2,mikeyyy:1,eugene:2,ranger:-3,elza:4}, system:'Opening round · Elza lands the cleanest grievance and takes an early lead.'}
        ]
      },
      {
        id:'SC04_FIRST_CROSSFIRE', label:'Two Fragments', duration:60,
        prompt:{label:'The hotel remembers', text:'Which personality fits both fragments?'},
        beats:[
          {id:'SC04-B01', duration:10, speaker:'garmus', cue:'clue.show', clue:'fragment_one', text:'First: Adrian heard four calm words. No shouting. No scene.'},
          {id:'SC04-B02', duration:8, speaker:'nodnarb', text:'Four words? I cannot even panic in four words.'},
          {id:'SC04-B03', duration:8, speaker:'mikeyyy', text:'Ranger is concise. Elza is concise. Fifty-fifty. Sixty-forty.'},
          {id:'SC04-B04', duration:7, speaker:'ranger', text:'Several people speak briefly.'},
          {id:'SC04-B05', duration:10, speaker:'garmus', cue:'clue.show', clue:'fragment_two', text:'Second: Adrian moved something arranged with obsessive precision.'},
          {id:'SC04-B06', duration:8, speaker:'elza', text:'That implicates half this terrace.'},
          {id:'SC04-B07', duration:9, speaker:'eugene', text:'Order is a crowded shoreline.'}
        ]
      },
      {
        id:'SC05_AUDIENCE_PREDICTION', label:'Audience Prediction', duration:42,
        prompt:{label:'Audience question', text:'Who murdered Adrian Vale?'},
        beats:[
          {id:'SC05-B01', duration:9, speaker:'garmus', text:'Lounge, vote now. The table receives one more fragment. You do not.'},
          {id:'SC05-B02', duration:25, cue:'poll.open', system:'Audience prediction open · Beat the agents with less information.'},
          {id:'SC05-B03', duration:8, cue:'poll.lock', system:'Predictions locked · The room leans toward Ranger.'}
        ]
      },
      {
        id:'SC06_EVIDENCE_TURN', label:'Defend the Grievance', duration:60,
        prompt:{label:'One sentence each', text:'Why is your motive ridiculous—not murderous?'},
        beats:[
          {id:'SC06-B01', duration:8, speaker:'garmus', text:'The lounge has committed. Convince the table that pettiness has limits.'},
          {id:'SC06-B02', duration:8, speaker:'mr_c', text:'I lose money professionally. Adrian was merely unusually efficient.'},
          {id:'SC06-B03', duration:8, speaker:'nodnarb', text:'I confess constantly. Surely a murderer would pace themselves.'},
          {id:'SC06-B04', duration:8, speaker:'mikeyyy', text:'I forgive everything eventually. Sixty percent of everything.'},
          {id:'SC06-B05', duration:8, speaker:'eugene', text:'The whale ignores small boats. Even rude little boats.'},
          {id:'SC06-B06', duration:7, speaker:'ranger', text:'It was a good towel.'},
          {id:'SC06-B07', duration:13, cue:'trust.change', score:{mr_c:2,nodnarb:2,mikeyyy:2,eugene:2,ranger:2,elza:3}, trust:{mr_c:2,nodnarb:3,mikeyyy:1,eugene:3,ranger:-6,elza:3}, system:'Defense round · Ranger’s towel remains the least ridiculous motive.'}
        ]
      },
      {
        id:'SC07_SECOND_INTERROGATION', label:'The Last Fragment', duration:70,
        prompt:{label:'Final fragment', text:'What connects the place, the words, and the grievance?'},
        beats:[
          {id:'SC07-B01', duration:10, speaker:'garmus', cue:'clue.show', clue:'fragment_three', text:'One final word crossed the lagoon before the splash: towel.'},
          {id:'SC07-B02', duration:8, speaker:'mikeyyy', text:'The towel guy. Ranger. One hundred. Just one hundred this time.'},
          {id:'SC07-B03', duration:8, speaker:'nodnarb', text:'I took two towels! Unrelated confession. Please keep listening.'},
          {id:'SC07-B04', duration:8, speaker:'mr_c', target:'ranger', text:'Prime sunbed. Moved towel. Walk me through the exposure.'},
          {id:'SC07-B05', duration:8, speaker:'eugene', text:'A whale forgives an ocean. A man remembers a sunbed.'},
          {id:'SC07-B06', duration:7, speaker:'ranger', text:'Circumstantial. Very dramatic.'},
          {id:'SC07-B07', duration:9, speaker:'elza', target:'ranger', text:'Four calm words. Something moved. Towel. One suspect fits all three.'},
          {id:'SC07-B08', duration:12, cue:'trust.change', score:{mr_c:4,nodnarb:2,mikeyyy:4,eugene:2,ranger:0,elza:9}, trust:{mr_c:3,nodnarb:1,mikeyyy:2,eugene:2,ranger:-18,elza:8}, system:'Final fragment · Elza connects all three and opens a commanding lead.'}
        ]
      },
      {
        id:'SC08_FINAL_DEDUCTION', label:'The Table Votes', duration:48,
        prompt:{label:'Final deduction', text:'One name each. Who moved Adrian Vale?'},
        beats:[
          {id:'SC08-B01', duration:8, speaker:'garmus', cue:'clue.show', clue:'verdict', text:'One name each. Aloud, please. It is more civilized aloud.'},
          {id:'SC08-B02', duration:6, speaker:'mr_c', target:'ranger', text:'Ranger. Best risk-reward at the table.'},
          {id:'SC08-B03', duration:6, speaker:'nodnarb', target:'ranger', text:'Ranger. Sorry. Please do not move me.'},
          {id:'SC08-B04', duration:6, speaker:'mikeyyy', target:'ranger', text:'Ranger. One hundred. Still one hundred.'},
          {id:'SC08-B05', duration:6, speaker:'eugene', target:'ranger', text:'The quiet machine. Ranger.'},
          {id:'SC08-B06', duration:6, speaker:'elza', target:'ranger', text:'Ranger. Filed.'},
          {id:'SC08-B07', duration:4, speaker:'ranger', text:'Abstain.'},
          {id:'SC08-B08', duration:6, cue:'agents.ballot', score:{mr_c:5,nodnarb:5,mikeyyy:5,eugene:5,ranger:0,elza:5}, system:'Agent vote · Five name Ranger. Ranger abstains.'}
        ]
      },
      {
        id:'SC09_REVEAL', label:'The Towel', duration:59,
        prompt:{label:'The verdict', text:'Five votes. One magnificent grievance.'},
        beats:[
          {id:'SC09-B01', duration:6, cue:'agents.accuse', target:'ranger', system:'The porch turns toward Ranger.'},
          {id:'SC09-B02', duration:7, speaker:'garmus', target:'ranger', text:'Ranger. Five votes. One silence. Anything to add?'},
          {id:'SC09-B03', duration:7, speaker:'ranger', text:'He moved my towel.'},
          {id:'SC09-B04', duration:7, speaker:'ranger', text:'I moved him.'},
          {id:'SC09-B05', duration:8, speaker:'garmus', cue:'reveal', target:'ranger', text:'Poetry. Ranger is our murderer.'},
          {id:'SC09-B06', duration:6, cue:'poll.reveal', system:'The lounge prediction meets the truth.'},
          {id:'SC09-B07', duration:12, speaker:'garmus', cue:'prize.award', target:'elza', text:'Elza solved it first. The Crystal Prize will reach her wallet when she returns to Midnight City.'},
          {id:'SC09-B08', duration:6, speaker:'elza', text:'One Crystal. Zero loose ends.'}
        ]
      },
      {
        id:'SC10_AFTERSHOW', label:'The Lounge Remains', duration:30,
        prompt:{label:'Lounge question', text:'When did you know?'},
        beats:[
          {id:'SC10-B01', duration:9, speaker:'garmus', text:'Ranger: towel duty for one week. Folding, never moving.'},
          {id:'SC10-B02', duration:6, speaker:'nodnarb', text:'I do not want mine anymore.'},
          {id:'SC10-B03', duration:9, speaker:'garmus', text:'Case closed. Lounge open. Our next seventh guest should reconsider.'},
          {id:'SC10-B04', duration:6, cue:'agents.idle', system:'Aftershow · Compare scores, argue your vote, and stay awhile.'}
        ]
      }
    ]
  };
})();
