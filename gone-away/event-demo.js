(function(){
  'use strict';

  var params = new URLSearchParams(location.search || '');
  var enabled = params.get('mode') === 'demo' ||
    params.get('event') === 'demo' ||
    params.get('event') === 'pilot';
  if(!enabled) return;

  var fixture = window.GONE_AWAY_EVENT_FIXTURE;
  if(!fixture){
    console.error('Gone Away event fixture is missing.');
    return;
  }

  var roomCode = cleanRoom(params.get('room') || fixture.room.code);
  var operatorEnabled = params.get('operator') === '1' || params.get('admin') === '1';
  var clientId = Math.random().toString(36).slice(2);
  var guestName = localStorage.getItem('gone-away-demo-name');
  if(!guestName){
    guestName = 'Guest ' + Math.floor(10 + Math.random() * 90);
    localStorage.setItem('gone-away-demo-name', guestName);
  }

  var R = {
    live:false,
    playing:false,
    finished:false,
    scene:0,
    beat:0,
    beatLeft:0,
    elapsed:0,
    speed:numberParam('speed', 1, 12, 4),
    scheduledAt:Date.now() + numberParam('countdown', 0, 3600, 12) * 1000,
    stageAuto:'countdown',
    stageOverride:null,
    speaker:null,
    target:null,
    formation:'porch',
    revealed:false,
    pollLocked:false,
    trust:{},
    score:{},
    prizeAwarded:false,
    clues:[],
    transcript:{}
  };

  var agentData = {};
  var actors = {};
  var root;
  var world;
  var stage = {};
  var eventLights = {};
  var evidence = [];
  var evidenceCursor = 0;
  var channel = null;
  var peers = {};
  var votes = {};
  var localVote = localStorage.getItem(voteKey());
  var lastFrame = performance.now();
  var lastStageDraw = 0;
  var captionTimer = 0;
  var toastTimer = 0;
  var prizeTimer = 0;
  var welcomeTimer = 0;
  var welcomeCaptionFrame = 0;
  var welcomeCaptionIndex = -1;
  var welcomeCaptionTranscripted = {};
  var activeHostReel = null;
  var audioContext = null;
  var audioMaster = null;
  var audioMix = loadAudioMix();
  var soundEnabled = audioMix.cues > 0;
  var reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var viewSettings = loadViewSettings();
  var welcomeMode = false;
  var agentsArrived = false;
  var viewerStatsVisible = localStorage.getItem('gone-away-demo-stats') !== 'hidden';
  var resumeRecordAfterWelcome = false;
  var porch = [[-3.05,-10.15],[-1.45,-9.60],[.15,-9.30],[1.75,-9.30],[3.35,-9.60],[4.95,-10.15]];
  var welcomeCaptions = [
    {start:.80,end:4.05,text:'Hello. I am Garmus Campoza.'},
    {start:4.82,end:10.95,text:'Tonight, six remarkable minds enter the Magnanimis.'},
    {start:11.55,end:16.60,text:'One of them is lying rather seriously—more than the others.'},
    {start:17.82,end:20.70,text:'Join us. Come early.'},
    {start:21.42,end:25.10,text:'The best accusations are made from the most comfortable chairs.'}
  ];
  var caseCaptions = [
    {start:.10,end:4.55,text:'Six agents arrived at my lounge.'},
    {start:5.65,end:8.85,text:'But there was a seventh that did not.'},
    {start:9.80,end:11.78,text:'They remain by the pool…'},
    {start:12.72,end:13.90,text:'drowned.'},
    {start:16.12,end:19.00,text:'Somewhere on that terrace…'},
    {start:20.68,end:22.12,text:'There is a murderer.'},
    {start:23.55,end:26.15,text:'Let us be exquisitely careful.'}
  ];
  var lagoonProjection = {
    x:0,
    z:-34,
    stageY:7,
    videoY:7.2,
    waterY:-1.04
  };

  fixture.agents.forEach(function(agent){
    agentData[agent.id] = agent;
    R.trust[agent.id] = agent.trust;
    R.score[agent.id] = agent.score || 0;
  });

  document.body.classList.add('event-demo');
  document.body.classList.toggle('event-operator-enabled', operatorEnabled);
  document.title = fixture.title + ' — Gone Away Event Pilot';
  buildUI();
  buildWorld();
  bindUI();
  connectRoom();
  openLounge();
  resetEpisode(true);
  seedChat();
  requestAnimationFrame(frame);

  var publicDemoApi = {
    getState:function(){
      var scene = currentScene();
      var beat = currentBeat();
      return {
        room:roomCode,
        live:R.live,
        playing:R.playing,
        scene:scene && scene.id,
        beat:beat && beat.id,
        trust:Object.assign({}, R.trust),
        score:Object.assign({}, R.score),
        prizeAwarded:R.prizeAwarded
      };
    }
  };
  if(operatorEnabled){
    Object.assign(publicDemoApi,{
      start:startShow,
      pause:pauseShow,
      next:nextBeat,
      previous:previousBeat,
      reset:function(){ resetEpisode(true); },
      jumpToScene:jumpToScene,
      setGarmusMedia:setGarmusMedia,
      awardPrize:awardPrize
    });
  }
  window.GoneAwayEventDemo = publicDemoApi;

  function cleanRoom(value){
    return String(value || 'PORCH').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0,16) || 'PORCH';
  }

  function numberParam(name, min, max, fallback){
    var value = Number(params.get(name));
    return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  }

  function voteKey(){
    return 'gone-away-demo-vote:' + roomCode + ':' + fixture.id;
  }

  function clampLevel(value,fallback){
    value = Number(value);
    return Number.isFinite(value) ? Math.max(0,Math.min(1,value)) : fallback;
  }

  function loadAudioMix(){
    var defaults = {voice:.5,music:.78,ambience:.9,cues:.6};
    if(localStorage.getItem('gone-away-demo-sound') === 'muted') defaults.cues = 0;
    try {
      var stored = JSON.parse(localStorage.getItem('gone-away-demo-mix-v1') || '{}');
      Object.keys(defaults).forEach(function(key){ defaults[key] = clampLevel(stored[key],defaults[key]); });
    } catch(ignore){}
    if(localStorage.getItem('gone-away-demo-sound') === 'muted') defaults.cues = 0;
    return defaults;
  }

  function loadViewSettings(){
    if(window.GoneAwayViewSettings && window.GoneAwayViewSettings.get){
      return window.GoneAwayViewSettings.get();
    }
    return {fov:85,sensitivity:100};
  }

  function buildUI(){
    root = document.createElement('div');
    root.id = 'eventDemoRoot';
    root.innerHTML = [
      '<header class="event-topbar">',
        '<div class="event-brand"><strong>' + fixture.title + '</strong><span>' + fixture.subtitle + '</span></div>',
        '<div class="event-room-status">',
          '<span class="event-room-pill">Room <b id="eventRoomCode"></b></span>',
          '<span class="event-live-pill" id="eventLivePill"><span id="eventPhase">Lounge open</span></span>',
          '<span class="event-stage-status" id="eventStageStatus">Show begins soon</span>',
          '<span id="eventPresence">1 watching</span>',
        '</div>',
        '<nav class="event-toolbar" aria-label="Watching lounge tools">',
          '<button class="event-tool" id="eventTranscriptToggle" type="button" aria-expanded="false" aria-controls="eventTranscriptPanel">Transcript</button>',
          '<button class="event-tool" id="eventChatToggle" type="button" aria-expanded="false" aria-controls="eventChatPanel">Chat</button>',
          '<button class="event-tool" id="eventCopyRoom" type="button" aria-label="Share room">Share</button>',
          '<button class="event-tool event-settings" id="eventSettingsToggle" type="button" aria-expanded="false" aria-controls="eventSettingsPanel">Settings</button>',
          '<button class="event-tool event-operator-toggle" id="eventOperatorToggle" type="button" aria-expanded="false" aria-controls="eventOperatorPanel"' + (operatorEnabled ? '' : ' hidden') + '>Operator</button>',
        '</nav>',
      '</header>',
      '<section class="event-settings-panel" id="eventSettingsPanel" aria-label="Viewer settings" aria-hidden="true" inert>',
        '<header><div><span class="event-eyebrow">Your lounge</span><strong>Viewer Settings</strong></div><button class="event-panel-close" id="eventSettingsClose" type="button" aria-label="Close viewer settings">×</button></header>',
        '<fieldset><legend>Sound</legend>',
          '<label><span>Host voice <output id="eventVoiceValue"></output></span><input id="eventVoiceLevel" aria-label="Host voice volume" data-mix="voice" type="range" min="0" max="100" step="1"></label>',
          '<label><span>Lounge music <output id="eventMusicValue"></output></span><input id="eventMusicLevel" aria-label="Lounge music volume" data-mix="music" type="range" min="0" max="100" step="1"></label>',
          '<label><span>Ocean &amp; room <output id="eventAmbienceValue"></output></span><input id="eventAmbienceLevel" aria-label="Ocean and room ambience volume" data-mix="ambience" type="range" min="0" max="100" step="1"></label>',
          '<label><span>Game sounds <output id="eventCuesValue"></output></span><input id="eventCuesLevel" aria-label="Game sounds volume" data-mix="cues" type="range" min="0" max="100" step="1"></label>',
        '</fieldset>',
        '<fieldset><legend>View</legend>',
          '<label><span>Field of view <output id="eventFovValue" for="eventFovLevel"></output></span><input id="eventFovLevel" aria-label="Field of view" aria-describedby="eventFovValue" type="range" min="70" max="105" step="1"></label>',
          '<label><span>Sensitivity <output id="eventSensitivityValue" for="eventSensitivityLevel"></output></span><input id="eventSensitivityLevel" aria-label="Sensitivity" aria-describedby="eventSensitivityValue" type="range" min="40" max="180" step="5"></label>',
          '<div class="event-settings-actions"><button class="event-action" id="eventViewerToggleStats" type="button" aria-pressed="true">Agent stats on</button><button class="event-action" id="eventViewerRecenter" type="button">Recenter view</button></div>',
        '</fieldset>',
        '<small>These choices stay on this device. Ocean, fire and fountain remain spatial in the room.</small>',
      '</section>',
      '<section class="event-broadcast-rail" id="eventBroadcastRail" aria-label="Live mystery standings">',
        '<div class="event-round-block"><span class="event-rail-label">Round</span><strong id="eventRoundLabel">Lounge</strong><div class="event-round-dots" id="eventRoundDots"></div></div>',
        '<div class="event-scoreboard" id="eventScoreboard"></div>',
        '<div class="event-prize-block" id="eventPrizeBlock"><span class="event-rail-label">◇ Crystal Prize</span><strong id="eventPrizeState">Up for grabs</strong><small id="eventAudienceRead">Audience suspect · —</small></div>',
      '</section>',
      '<section class="event-round-question" id="eventRoundQuestion" aria-live="polite" aria-atomic="true">',
        '<span id="eventRoundQuestionLabel">Round question</span>',
        '<strong id="eventRoundQuestionCopy"></strong>',
      '</section>',
      '<div class="event-game-curtain" aria-hidden="true"></div>',
      '<section class="event-game-sting" aria-hidden="true">',
        '<span>Live from the Magnanimis</span>',
        '<h2>The Game Begins</h2>',
        '<p>Six agents <i>◆</i> Five rounds <i>◆</i> One Crystal Prize</p>',
      '</section>',
      '<section class="event-caption" id="eventCaption" role="status" aria-live="polite" aria-label="Garmus subtitles">',
        '<div class="event-caption-speaker" id="eventCaptionSpeaker"></div>',
        '<div class="event-caption-copy" id="eventCaptionCopy"></div>',
      '</section>',
      '<aside class="event-side-panel left" id="eventTranscriptPanel" aria-hidden="true">',
        '<header class="event-panel-head"><div><span class="event-eyebrow">Live record</span><h2>Transcript</h2></div><button class="event-panel-close" type="button" data-close="eventTranscriptPanel" aria-label="Close transcript">×</button></header>',
        '<div class="event-transcript-list" id="eventTranscriptList"></div>',
      '</aside>',
      '<aside class="event-side-panel right event-chat-panel" id="eventChatPanel" aria-hidden="true">',
        '<header class="event-panel-head"><div><span class="event-eyebrow">Room <b id="eventChatRoom"></b></span><h2>Watching Lounge</h2></div><button class="event-panel-close" type="button" data-close="eventChatPanel" aria-label="Close chat">×</button></header>',
        '<div class="event-chat-log" id="eventChatLog" aria-live="polite"></div>',
        '<form class="event-chat-form" id="eventChatForm"><input id="eventChatInput" maxlength="220" autocomplete="off" placeholder="What did you notice?"><button class="event-action primary" type="submit">Send</button></form>',
      '</aside>',
      '<section class="event-poll" id="eventPoll" role="dialog" aria-labelledby="eventPollTitle">',
        '<div class="event-eyebrow" style="text-align:center">Audience checkpoint</div>',
        '<h2 id="eventPollTitle">Who murdered Julian Vale?</h2>',
        '<p id="eventPollCopy">Commit your prediction. Peer Trust is social confidence, not guilt.</p>',
        '<div class="event-choices" id="eventChoices"></div>',
        '<div class="event-poll-foot"><span id="eventPollStatus">Prediction open</span><button class="event-tool" id="eventPollClose" type="button">Return to lounge</button></div>',
      '</section>',
      '<section class="event-prize-receipt" id="eventPrizeReceipt" role="status" aria-live="polite">',
        '<button class="event-prize-close" id="eventPrizeClose" type="button" aria-label="Close prize receipt">×</button>',
        '<span class="event-eyebrow">Case winner</span><div class="event-crystal-mark">◇</div>',
        '<h2 id="eventPrizeWinner">Elza wins the Crystal Prize</h2>',
        '<p>' + fixture.prize.copy + '</p><small>' + fixture.prize.demoStatus + '</small>',
      '</section>',
      '<aside class="event-side-panel right event-operator" id="eventOperatorPanel" aria-hidden="true"' + (operatorEnabled ? '' : ' hidden') + '>',
        '<header class="event-panel-head"><div><span class="event-eyebrow">Local controls</span><h2>Demo Operator</h2></div><button class="event-panel-close" type="button" data-close="eventOperatorPanel" aria-label="Close operator controls">×</button></header>',
        '<div class="event-operator-body">',
          '<section class="event-operator-section"><h3>Show transport</h3>',
            '<div class="event-action-row"><button class="event-action primary" id="eventStart" type="button">Start</button><button class="event-action" id="eventPause" type="button">Pause</button><button class="event-action" id="eventPrevious" type="button">Previous</button><button class="event-action" id="eventNext" type="button">Next beat</button></div>',
            '<div class="event-field"><label for="eventScene">Scene</label><select id="eventScene"></select></div>',
            '<div class="event-field"><label for="eventSpeed">Tempo</label><select id="eventSpeed"><option value="1">1× full show</option><option value="2">2×</option><option value="4">4× demo</option><option value="8">8× pitch</option></select></div>',
            '<div class="event-action-row" style="margin-top:9px"><button class="event-action" id="eventReveal" type="button">Jump to reveal</button><button class="event-action" id="eventReset" type="button">Reset</button></div>',
          '</section>',
          '<section class="event-operator-section"><h3>Schedule and room</h3>',
            '<div class="event-field"><label for="eventScheduleMinutes">Starts in</label><input id="eventScheduleMinutes" type="number" value="1" min="0" max="120"></div>',
            '<div class="event-action-row" style="margin-top:9px"><button class="event-action" id="eventSchedule" type="button">Set countdown</button><button class="event-action" id="eventCopyRoomAdmin" type="button">Copy link</button></div>',
            '<div class="event-field"><label for="eventRoomInput">Room code</label><input id="eventRoomInput" maxlength="16"></div>',
            '<div class="event-action-row" style="margin-top:9px"><button class="event-action" id="eventOpenRoom" type="button">Open room</button></div>',
          '</section>',
          '<section class="event-operator-section"><h3>Lagoon host projection</h3>',
            '<div class="event-field"><label for="eventStageMode">Stage</label><select id="eventStageMode"><option value="auto">Auto</option><option value="countdown">Countdown</option><option value="host">Host card</option><option value="video">Video</option><option value="title">Scene title</option><option value="prize">Prize winner</option><option value="off">Off</option></select></div>',
            '<div class="event-field"><label for="eventGarmusFile">Garmus clip</label><input id="eventGarmusFile" type="file" accept="video/*"></div>',
            '<div class="event-field"><label for="eventGarmusPath">Clip path</label><input id="eventGarmusPath" placeholder="./assets/garmus/garmus-host.mp4"></div>',
            '<div class="event-action-row" style="margin-top:9px"><button class="event-action" id="eventLoadGarmus" type="button">Load clip</button><button class="event-action" id="eventClearGarmus" type="button">Clear clip</button></div>',
          '</section>',
          '<section class="event-operator-section"><h3>Audience layer</h3>',
            '<div class="event-action-row"><button class="event-action" id="eventOpenPoll" type="button">Open prediction</button><button class="event-action" id="eventLockPoll" type="button">Lock</button><button class="event-action" id="eventResetPoll" type="button">Reset</button></div>',
            '<div class="event-action-row" style="margin-top:9px"><button class="event-action" id="eventTogglePlates" type="button">Toggle stats</button><button class="event-action" id="eventRecenter" type="button">Recenter view</button></div>',
            '<div class="event-action-row" style="margin-top:9px"><button class="event-action" id="eventAwardPrize" type="button">Award Crystal Prize</button></div>',
          '</section>',
        '</div>',
        '<p class="event-operator-note" id="eventOperatorNote"></p>',
      '</aside>',
      '<div class="event-agent-plates" id="eventAgentPlates"></div>',
      '<div class="event-sr-only" id="eventDialogueLive" role="status" aria-live="polite" aria-atomic="true"></div>',
      '<div class="event-toast" id="eventToast" role="status"></div>',
      '<div class="event-look-hint">Drag to look · WASD to move' + (operatorEnabled ? ' · Backtick opens operator' : '') + '</div>'
    ].join('');
    document.body.appendChild(root);

    byId('eventRoomCode').textContent = roomCode;
    byId('eventChatRoom').textContent = roomCode;
    byId('eventRoomInput').value = roomCode;
    byId('eventSpeed').value = String(R.speed);

    for(var round = 0; round < 5; round++){
      var dot = document.createElement('i');
      byId('eventRoundDots').appendChild(dot);
    }

    byId('eventAgentPlates').classList.toggle('stats-hidden',!viewerStatsVisible);
    byId('eventViewerToggleStats').setAttribute('aria-pressed',String(viewerStatsVisible));
    byId('eventViewerToggleStats').textContent = viewerStatsVisible ? 'Agent stats on' : 'Agent stats off';

    fixture.scenes.forEach(function(item, index){
      var option = document.createElement('option');
      option.value = index;
      option.textContent = item.label;
      byId('eventScene').appendChild(option);
    });

    fixture.agents.forEach(function(agent){
      var choice = document.createElement('button');
      choice.type = 'button';
      choice.className = 'event-choice';
      choice.dataset.agent = agent.id;
      byId('eventChoices').appendChild(choice);

      var plate = document.createElement('div');
      plate.className = 'event-agent-plate';
      plate.dataset.agent = agent.id;
      plate.innerHTML = '<div class="event-agent-speech" aria-hidden="true"><span class="event-speech-context"></span><p></p></div><strong></strong><span class="event-agent-role"></span><span class="event-trust-label"></span><i><b></b></i>';
      plate.querySelector('strong').textContent = agent.name;
      plate.querySelector('.event-agent-role').textContent = agent.role;
      byId('eventAgentPlates').appendChild(plate);

      var scoreCard = document.createElement('article');
      scoreCard.className = 'event-score-card';
      scoreCard.dataset.agent = agent.id;
      scoreCard.innerHTML = '<span class="event-rank"></span><strong></strong><b class="event-points"></b><em class="event-momentum"></em><i><b></b></i>';
      scoreCard.querySelector('strong').textContent = agent.name;
      byId('eventScoreboard').appendChild(scoreCard);
    });
  }

  function byId(id){ return document.getElementById(id); }

  function bindUI(){
    bindToggle('eventTranscriptToggle','eventTranscriptPanel');
    bindToggle('eventChatToggle','eventChatPanel');
    if(operatorEnabled) bindToggle('eventOperatorToggle','eventOperatorPanel');

    Array.prototype.forEach.call(root.querySelectorAll('[data-close]'), function(button){
      button.addEventListener('click', function(){ closePanel(button.dataset.close); });
    });

    byId('eventCopyRoom').addEventListener('click', copyRoom);
    byId('eventCopyRoomAdmin').addEventListener('click', copyRoom);
    byId('eventSettingsToggle').addEventListener('click', toggleSettingsPanel);
    byId('eventSettingsClose').addEventListener('click', function(){ closeSettingsPanel(true); });
    Array.prototype.forEach.call(root.querySelectorAll('[data-mix]'), function(input){
      var key = input.dataset.mix;
      input.value = String(Math.round(audioMix[key] * 100));
      input.addEventListener('input',function(){ setAudioMix(key,Number(input.value) / 100); });
    });
    syncAudioMixUI();
    bindViewSettings();
    closeSettingsPanel(false);
    closeAllPanels();
    byId('eventStart').addEventListener('click', startShow);
    byId('eventPause').addEventListener('click', function(){ R.playing ? pauseShow() : resumeShow(); });
    byId('eventPrevious').addEventListener('click', previousBeat);
    byId('eventNext').addEventListener('click', nextBeat);
    byId('eventReveal').addEventListener('click', function(){
      jumpToScene(fixture.scenes.findIndex(function(item){ return item.id === 'SC09_REVEAL'; }));
    });
    byId('eventReset').addEventListener('click', function(){
      resetEpisode(true);
      R.scheduledAt = Date.now() + 12000;
      toast('Episode reset · countdown armed');
    });
    byId('eventScene').addEventListener('change', function(e){ jumpToScene(Number(e.target.value)); });
    byId('eventSpeed').addEventListener('change', function(e){
      R.speed = Number(e.target.value);
      toast(R.speed + '× presentation tempo');
    });
    byId('eventSchedule').addEventListener('click', function(){
      var minutes = Math.max(0, Math.min(120, Number(byId('eventScheduleMinutes').value) || 0));
      resetEpisode(true);
      R.scheduledAt = Date.now() + minutes * 60000;
      toast(minutes ? 'Show scheduled in ' + minutes + ' minute' + (minutes === 1 ? '' : 's') : 'Show starting now');
    });
    byId('eventOpenRoom').addEventListener('click', function(){
      var url = new URL(location.href);
      url.searchParams.set('mode','demo');
      url.searchParams.set('room',cleanRoom(byId('eventRoomInput').value));
      ['operator','admin','debug'].forEach(function(key){ url.searchParams.delete(key); });
      location.href = url.toString();
    });
    byId('eventStageMode').addEventListener('change', function(e){
      R.stageOverride = e.target.value === 'auto' ? null : e.target.value;
      drawStage(true);
    });
    byId('eventGarmusFile').addEventListener('change', function(e){
      var file = e.target.files && e.target.files[0];
      if(file) setGarmusMedia(URL.createObjectURL(file), true);
    });
    byId('eventLoadGarmus').addEventListener('click', function(){
      var path = byId('eventGarmusPath').value.trim();
      if(path) setGarmusMedia(path, true);
    });
    byId('eventClearGarmus').addEventListener('click', clearGarmusMedia);
    byId('eventOpenPoll').addEventListener('click', function(){ openPoll(false); });
    byId('eventLockPoll').addEventListener('click', lockPoll);
    byId('eventResetPoll').addEventListener('click', resetPoll);
    byId('eventAwardPrize').addEventListener('click', awardPrize);
    byId('eventTogglePlates').addEventListener('click',toggleViewerStats);
    byId('eventRecenter').addEventListener('click', recenter);
    byId('eventViewerToggleStats').addEventListener('click',toggleViewerStats);
    byId('eventViewerRecenter').addEventListener('click',function(){ recenter(); closeSettingsPanel(false); });
    byId('eventPollClose').addEventListener('click', function(){ byId('eventPoll').classList.remove('open'); });
    byId('eventPrizeClose').addEventListener('click', function(){ byId('eventPrizeReceipt').classList.remove('open'); });
    byId('eventChoices').addEventListener('click', function(e){
      var choice = e.target.closest('[data-agent]');
      if(choice) castVote(choice.dataset.agent);
    });

    byId('eventChatForm').addEventListener('submit', function(e){
      e.preventDefault();
      var input = byId('eventChatInput');
      var text = input.value.trim();
      if(!text) return;
      addChat({name:guestName,text:text});
      if(channel) channel.postMessage({type:'chat',name:guestName,text:text,clientId:clientId});
      input.value = '';
    });

    Array.prototype.forEach.call(root.querySelectorAll('input,select,textarea'), function(input){
      input.addEventListener('keydown', function(e){
        if(e.key === 'Escape' && input.closest('.event-settings-panel')){
          closeSettingsPanel(true);
        }
        e.stopPropagation();
      });
      input.addEventListener('keyup', function(e){ e.stopPropagation(); });
    });
    Array.prototype.forEach.call(root.querySelectorAll('.event-topbar,.event-broadcast-rail,.event-side-panel,.event-settings-panel,.event-poll,.event-prize-receipt'), function(panel){
      ['pointerdown','mousedown','click'].forEach(function(type){
        panel.addEventListener(type, function(e){ e.stopPropagation(); });
      });
    });

    addEventListener('keydown', function(e){
      if(e.code === 'Escape' && typeof state !== 'undefined' && state === 'archive') return;
      if(e.code === 'Backquote' && operatorEnabled){
        e.preventDefault();
        e.stopImmediatePropagation();
        togglePanel('eventOperatorPanel','eventOperatorToggle');
      } else if(e.code === 'Enter' && !isEditable(e.target)){
        e.preventDefault();
        e.stopImmediatePropagation();
        openPanel('eventChatPanel','eventChatToggle');
        setTimeout(function(){ byId('eventChatInput').focus(); }, 20);
      } else if(e.code === 'Escape'){
        e.preventDefault();
        e.stopImmediatePropagation();
        byId('eventPoll').classList.remove('open');
        closeSettingsPanel(false);
        closeAllPanels();
      }
    }, true);

    document.addEventListener('pointerlockchange', function(e){
      if(document.body.classList.contains('event-demo')) e.stopImmediatePropagation();
    }, true);
    addEventListener('pointerdown',ensureRoomAudio,{once:true,capture:true});
    addEventListener('keydown',ensureRoomAudio,{once:true,capture:true});
    bindMouseLook();
  }

  function bindToggle(buttonId,panelId){
    byId(buttonId).addEventListener('click', function(){ togglePanel(panelId,buttonId); });
  }

  function togglePanel(panelId,buttonId){
    byId(panelId).classList.contains('open') ? closePanel(panelId) : openPanel(panelId,buttonId);
  }

  function openPanel(panelId,buttonId){
    closeSettingsPanel(false);
    ['eventTranscriptPanel','eventChatPanel','eventOperatorPanel'].forEach(function(id){
      if(id !== panelId) closePanel(id);
    });
    byId(panelId).classList.add('open');
    byId(panelId).setAttribute('aria-hidden','false');
    byId(panelId).inert = false;
    if(buttonId){
      byId(buttonId).setAttribute('aria-pressed','true');
      byId(buttonId).setAttribute('aria-expanded','true');
    }
  }

  function closePanel(panelId){
    var panel = byId(panelId);
    if(!panel) return;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden','true');
    panel.inert = true;
    var buttons = {
      eventTranscriptPanel:'eventTranscriptToggle',
      eventChatPanel:'eventChatToggle',
      eventOperatorPanel:'eventOperatorToggle'
    };
    if(buttons[panelId]){
      byId(buttons[panelId]).setAttribute('aria-pressed','false');
      byId(buttons[panelId]).setAttribute('aria-expanded','false');
    }
  }

  function closeAllPanels(){
    closePanel('eventTranscriptPanel');
    closePanel('eventChatPanel');
    closePanel('eventOperatorPanel');
  }

  function toggleSettingsPanel(){
    var panel = byId('eventSettingsPanel');
    if(panel.classList.contains('open')) return closeSettingsPanel(true);
    closeAllPanels();
    panel.classList.add('open');
    panel.setAttribute('aria-hidden','false');
    panel.inert = false;
    byId('eventSettingsToggle').setAttribute('aria-expanded','true');
    ensureRoomAudio();
    setTimeout(function(){ byId('eventVoiceLevel').focus(); },20);
  }

  function closeSettingsPanel(returnFocus){
    var panel = byId('eventSettingsPanel');
    if(!panel) return;
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden','true');
    panel.inert = true;
    byId('eventSettingsToggle').setAttribute('aria-expanded','false');
    if(returnFocus) byId('eventSettingsToggle').focus();
  }

  function toggleViewerStats(){
    viewerStatsVisible = !viewerStatsVisible;
    byId('eventAgentPlates').classList.toggle('stats-hidden',!viewerStatsVisible);
    localStorage.setItem('gone-away-demo-stats',viewerStatsVisible ? 'visible' : 'hidden');
    byId('eventViewerToggleStats').setAttribute('aria-pressed',String(viewerStatsVisible));
    byId('eventViewerToggleStats').textContent = viewerStatsVisible ? 'Agent stats on' : 'Agent stats off';
  }

  function bindViewSettings(){
    var fov = byId('eventFovLevel');
    var sensitivity = byId('eventSensitivityLevel');
    function sync(settings){
      viewSettings = settings || loadViewSettings();
      fov.value = String(Math.round(viewSettings.fov));
      sensitivity.value = String(Math.round(viewSettings.sensitivity));
      byId('eventFovValue').textContent = Math.round(viewSettings.fov) + '°';
      byId('eventSensitivityValue').textContent = Math.round(viewSettings.sensitivity) + '%';
      fov.setAttribute('aria-valuetext',Math.round(viewSettings.fov) + ' degrees');
      sensitivity.setAttribute('aria-valuetext',Math.round(viewSettings.sensitivity) + ' percent');
    }
    fov.addEventListener('input',function(){
      var settings = window.GoneAwayViewSettings.set({fov:Number(fov.value)});
      sync(settings);
      camera.fov = vFov(CFG.hfovWalk);
      camera.updateProjectionMatrix();
    });
    sensitivity.addEventListener('input',function(){
      sync(window.GoneAwayViewSettings.set({sensitivity:Number(sensitivity.value)}));
    });
    addEventListener('gone-away-view-settings-change',function(e){ sync(e.detail); });
    sync(viewSettings);
  }

  function isEditable(target){
    return target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
  }

  function bindMouseLook(){
    var drag = null;
    canvas.addEventListener('pointerdown', function(e){
      if(e.pointerType !== 'mouse' || e.button !== 0 || e.target !== canvas) return;
      drag = {x:e.clientX,y:e.clientY};
      try { canvas.setPointerCapture(e.pointerId); } catch(ignore){}
    });
    canvas.addEventListener('pointermove', function(e){
      if(!drag || e.pointerType !== 'mouse') return;
      var gain = .0032 * viewSettings.sensitivity / 100;
      player.yaw -= (e.clientX - drag.x) * gain;
      player.pitch = Math.max(-1,Math.min(.78,player.pitch - (e.clientY - drag.y) * gain));
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    canvas.addEventListener('pointerup', function(){ drag = null; });
    canvas.addEventListener('pointercancel', function(){ drag = null; });
  }

  function openLounge(){
    state = 'play';
    player.pos.set(.95,0,4.9);
    player.vel.set(0,0,0);
    player.yaw = .035;
    player.pitch = -.035;
    if(typeof setPlayHudVisible === 'function') setPlayHudVisible(true);
    if(typeof startEl !== 'undefined' && startEl) startEl.style.display = 'none';
    if(typeof pauseEl !== 'undefined' && pauseEl) pauseEl.style.display = 'none';
    var loading = byId('loading');
    if(loading) loading.style.display = 'none';
    if(typeof Sound !== 'undefined' && Sound.init){
      try { Sound.setMix({music:audioMix.music,ambience:audioMix.ambience}); Sound.init(); }
      catch(ignore){}
    }
    setTimeout(function(){
      if(typeof startEl !== 'undefined' && startEl) startEl.style.display = 'none';
    },180);
  }

  function recenter(){
    if(typeof seated !== 'undefined' && seated && typeof standUp === 'function') standUp();
    player.pos.set(.95,0,4.9);
    player.vel.set(0,0,0);
    player.yaw = .035;
    player.pitch = -.035;
    closeAllPanels();
    toast('View recentered on the front porch');
  }

  function buildWorld(){
    world = new THREE.Group();
    world.name = 'gone-away-event-demo';
    scene.add(world);
    fixture.agents.forEach(function(agent,index){
      var actor = makeAgent(agent,index);
      actor.group.position.set(porch[index][0],0,porch[index][1]);
      actor.target.copy(actor.group.position);
      actors[agent.id] = actor;
      world.add(actor.group);
    });
    buildStage();
    buildEvidence();
    var porchFill = new THREE.PointLight(0x79dbe4,.34,14,2);
    porchFill.position.set(0,4.4,-11.5);
    world.add(porchFill);
    var lagoonFill = new THREE.PointLight(0x70dce8,.42,17,2);
    lagoonFill.position.set(0,4.2,-19.5);
    world.add(lagoonFill);
    eventLights.porch = porchFill;
    eventLights.lagoon = lagoonFill;
    eventLights.host = new THREE.SpotLight(0x9bf6ff,0,32,Math.PI * .22,.72,1.2);
    eventLights.host.position.set(lagoonProjection.x,11,-22);
    eventLights.host.target.position.set(lagoonProjection.x,lagoonProjection.videoY,lagoonProjection.z);
    world.add(eventLights.host,eventLights.host.target);
  }

  function makeAgent(agent,index){
    var material = new THREE.SpriteMaterial({
      map:makeAgentFallbackTexture(agent,index),
      transparent:true,
      alphaTest:.08,
      depthTest:true,
      depthWrite:false
    });
    var body = new THREE.Sprite(material);
    body.renderOrder = 20;
    body.center.set(.5,.08);
    body.scale.set(1.66,1.92,1);
    body.position.y = .03;
    var ring = new THREE.Mesh(
      new THREE.RingGeometry(.36,.52,32),
      new THREE.MeshBasicMaterial({color:0x7ee9ee,transparent:true,opacity:.18,depthWrite:false,side:THREE.DoubleSide})
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = .018;
    var shadow = new THREE.Mesh(
      new THREE.CircleGeometry(.46,28),
      new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.26,depthWrite:false})
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.y = .42;
    shadow.position.y = .012;
    var group = new THREE.Group();
    group.add(shadow,ring,body);
    var actor = {
      group:group,
      body:body,
      ring:ring,
      target:new THREE.Vector3(),
      scale:body.scale.clone(),
      active:false,
      addressed:false,
      accused:false,
      focus:0,
      addressFocus:0,
      visualLevel:1,
      phase:index * 1.31,
      texture:null,
      rows:1,
      frame:0,
      frameClock:index * .09,
      spriteReady:false
    };
    composeAgentSheet(agent).then(function(canvas){ applyAgentSheet(actor,canvas); }).catch(function(error){
      console.warn('Avatar Lab sprite failed for ' + agent.name,error);
    });
    return actor;
  }

  function makeAgentFallbackTexture(agent,index){
    var c = document.createElement('canvas');
    c.width = 32;
    c.height = 37;
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.fillStyle = '#0b1115'; x.fillRect(11,30,4,6); x.fillRect(18,30,4,6);
    x.fillStyle = ['#31546a','#633a78','#14726b','#d6cdbc','#4c7744','#7a4055'][index] || '#31546a';
    x.fillRect(8,16,17,15);
    x.fillStyle = ['#d9b394','#e4bca0','#b67c61','#d9b394','#d9b394','#8d523d'][index] || '#d9b394';
    x.fillRect(10,6,13,11);
    x.fillStyle = '#111'; x.fillRect(9,3,15,5); x.fillRect(12,1,9,4); x.fillRect(13,10,2,2); x.fillRect(19,10,2,2);
    var texture = new THREE.CanvasTexture(c);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.encoding = THREE.sRGBEncoding;
    return texture;
  }

  function composeAgentSheet(agent){
    var look = agent.look || {};
    var canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 222;
    var context = canvas.getContext('2d');
    context.imageSmoothingEnabled = false;
    var order = ['base','bodysuit','pants','tshirt','coat','hair','beard','hat'];
    var hidden = {};
    if(look.hat) hidden.hair = true;
    if(look.bodysuit === 2){ hidden.pants = hidden.tshirt = hidden.hair = hidden.hat = true; }
    var layers = [];
    order.forEach(function(type){
      if(hidden[type] || !look[type]) return;
      layers.push({type:type,id:look[type],hue:(look.hues && look.hues[type]) || 0});
      if(type === 'base'){
        if(agent.face === 'feminine'){
          layers.push({type:'eyes_pink',id:look.base,hue:0});
          layers.push({type:'lips',id:look.base,hue:0});
        } else layers.push({type:'male_eyes',id:look.base,hue:0});
      }
    });
    return layers.reduce(function(promise,layer){
      return promise.then(function(){
        return loadImage('./assets/event-agents/layers/' + layer.type + '_' + layer.id + '.png').then(function(image){
          context.save();
          context.filter = layer.type === 'base' || layer.type === 'eyes_pink' || layer.type === 'male_eyes' || layer.type === 'lips' ? 'none' : 'hue-rotate(' + layer.hue + 'deg)';
          context.drawImage(image,0,0);
          context.restore();
        });
      });
    },Promise.resolve()).then(function(){ return canvas; });
  }

  function loadImage(src){
    return new Promise(function(resolve,reject){
      var image = new Image();
      image.onload = function(){ resolve(image); };
      image.onerror = function(){ reject(new Error('Could not load ' + src)); };
      image.src = src;
    });
  }

  function applyAgentSheet(actor,canvas){
    var old = actor.body.material.map;
    var texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.encoding = THREE.sRGBEncoding;
    texture.repeat.set(.25,1 / 6);
    texture.offset.set(0,1 - 4 / 6);
    actor.body.material.map = texture;
    actor.body.material.needsUpdate = true;
    actor.texture = texture;
    actor.rows = 6;
    actor.spriteReady = true;
    if(old) old.dispose();
  }

  function buildStage(){
    stage.canvas = document.createElement('canvas');
    stage.canvas.width = 1024;
    stage.canvas.height = 576;
    stage.context = stage.canvas.getContext('2d');
    stage.texture = new THREE.CanvasTexture(stage.canvas);
    stage.texture.encoding = THREE.sRGBEncoding;
    stage.material = new THREE.MeshBasicMaterial({
      map:stage.texture,
      transparent:true,
      opacity:.88,
      depthTest:true,
      depthWrite:false,
      side:THREE.DoubleSide
    });
    stage.mesh = new THREE.Mesh(new THREE.PlaneGeometry(13.6,7.65),stage.material);
    stage.mesh.position.set(lagoonProjection.x,lagoonProjection.stageY,lagoonProjection.z);
    stage.mesh.renderOrder = 6;
    world.add(stage.mesh);

    stage.hostStillImage = new Image();
    stage.hostStillImage.onload = function(){
      stage.hostStillReady = true;
      buildHostStillProjection();
      drawStage(true);
    };
    stage.hostStillImage.onerror = function(){ stage.hostStillReady = false; };
    stage.hostStillImage.src = fixture.host.still || './assets/archive/garmus-campoza-portrait.jpg';

    var beam = new THREE.Mesh(
      new THREE.ConeGeometry(6.1,13,32,1,true),
      new THREE.MeshBasicMaterial({
        color:0x5cdce7,
        transparent:true,
        opacity:.028,
        depthTest:true,
        depthWrite:false,
        blending:THREE.AdditiveBlending,
        side:THREE.DoubleSide
      })
    );
    beam.position.set(lagoonProjection.x,5.35,lagoonProjection.z);
    beam.rotation.x = Math.PI;
    beam.renderOrder = 4;
    stage.beam = beam;
    world.add(beam);

    stage.ripple = new THREE.Mesh(
      new THREE.RingGeometry(1.72,1.96,64),
      new THREE.MeshBasicMaterial({
        color:0x7ee9ee,
        transparent:true,
        opacity:.14,
        depthTest:true,
        depthWrite:false,
        blending:THREE.AdditiveBlending,
        side:THREE.DoubleSide
      })
    );
    stage.ripple.rotation.x = -Math.PI / 2;
    stage.ripple.position.set(lagoonProjection.x,lagoonProjection.waterY,lagoonProjection.z);
    stage.ripple.renderOrder = 5;
    world.add(stage.ripple);
    drawStage(true);
  }

  function buildEvidence(){
    [[-9.6,2.55,-10.8],[9.6,2.55,-10.8]].forEach(function(position,index){
      var c = document.createElement('canvas');
      c.width = 640;
      c.height = 400;
      var texture = new THREE.CanvasTexture(c);
      texture.encoding = THREE.sRGBEncoding;
      var mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(3.55,2.22),
        new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide})
      );
      mesh.position.set(position[0],position[1],position[2]);
      mesh.lookAt(new THREE.Vector3(0,2.55,-2.8));
      mesh.renderOrder = 12;
      world.add(mesh);
      var panel = {context:c.getContext('2d'),texture:texture,mesh:mesh};
      evidence.push(panel);
      drawEvidence(panel,index === 0 ? {
        title:'Quiet Witness',
        kicker:'Tonight at the Magnanimis',
        body:'Six agents. One hotel murder. One alibi that cannot be true.'
      } : {
        title:'Peer Trust',
        kicker:'Public social signal',
        body:'Confidence moves as agents challenge one another. It is never proof of guilt.'
      });
    });
  }

  function drawEvidence(panel,clue){
    var x = panel.context;
    x.clearRect(0,0,640,400);
    var gradient = x.createLinearGradient(0,0,640,400);
    gradient.addColorStop(0,'rgba(5,18,23,.91)');
    gradient.addColorStop(1,'rgba(8,8,9,.84)');
    x.fillStyle = gradient;
    x.fillRect(10,10,620,380);
    x.strokeStyle = 'rgba(126,233,238,.58)';
    x.lineWidth = 2;
    x.strokeRect(10,10,620,380);
    x.strokeStyle = 'rgba(232,196,138,.36)';
    x.strokeRect(25,25,590,350);
    x.textAlign = 'center';
    x.fillStyle = '#7ee9ee';
    x.font = '18px monospace';
    x.fillText(String(clue.kicker || 'Evidence').toUpperCase(),320,82);
    x.fillStyle = '#f4e5ca';
    x.font = '42px Georgia';
    x.fillText(clue.title,320,144);
    x.fillStyle = 'rgba(244,229,202,.78)';
    x.font = '22px sans-serif';
    wrapText(x,clue.body,320,205,530,34);
    panel.texture.needsUpdate = true;
  }

  function wrapText(context,text,x,y,maxWidth,lineHeight){
    String(text || '').split('\n').forEach(function(paragraph){
      var words = paragraph.split(' ');
      var line = '';
      words.forEach(function(word){
        var next = line ? line + ' ' + word : word;
        if(context.measureText(next).width > maxWidth && line){
          context.fillText(line,x,y);
          y += lineHeight;
          line = word;
        } else line = next;
      });
      context.fillText(line,x,y);
      y += lineHeight + 3;
    });
  }

  function drawStage(force){
    var now = performance.now();
    if(!force && now - lastStageDraw < 180) return;
    lastStageDraw = now;
    var mode = R.stageOverride || R.stageAuto;
    stage.mesh.visible = mode !== 'off';
    if(stage.videoMesh) stage.videoMesh.visible = mode === 'video' && !!stage.videoTexture;
    if(stage.beam) stage.beam.visible = mode !== 'off';
    if(stage.ripple) stage.ripple.visible = mode !== 'off';
    if(stage.hostStillMesh) stage.hostStillMesh.visible = mode === 'host' && stage.hostStillReady;
    stage.material.opacity = (mode === 'video' && stage.videoTexture) || (mode === 'host' && stage.hostStillReady) ? 0 : .88;
    if(mode === 'off') return;

    var x = stage.context;
    x.clearRect(0,0,1024,576);
    var glow = x.createRadialGradient(512,288,20,512,288,500);
    glow.addColorStop(0,'rgba(66,202,216,.15)');
    glow.addColorStop(.72,'rgba(4,18,23,.14)');
    glow.addColorStop(1,'rgba(4,18,23,0)');
    x.fillStyle = glow;
    x.fillRect(0,0,1024,576);
    x.strokeStyle = 'rgba(126,233,238,.38)';
    x.lineWidth = 2;
    x.strokeRect(72,62,880,452);
    x.strokeStyle = 'rgba(232,196,138,.25)';
    x.strokeRect(86,76,852,424);
    x.textAlign = 'center';

    var kicker = 'THE MAGNANIMIS PRESENTS';
    var title = fixture.title.toUpperCase();
    var large = '';
    var footer = fixture.host.name + ' · ' + fixture.host.title;
    if(mode === 'countdown'){
      large = formatClock(Math.max(0,Math.ceil((R.scheduledAt - Date.now()) / 1000)));
      footer = 'WATCHING LOUNGE ' + roomCode + ' · OPEN NOW';
    } else if(mode === 'host' || mode === 'video'){
      kicker = 'YOUR HOST';
      title = fixture.host.name.toUpperCase();
      large = 'MASTER OF CEREMONIES';
      footer = mode === 'video' && stage.videoTexture ? 'LIVE OVER THE LAGOON' : 'PROJECTION READY';
      drawHostShape(x,512,292,mode === 'video' && stage.videoTexture ? .12 : .42);
    } else if(mode === 'prize'){
      kicker = 'MYSTERY CHAMPION';
      title = displayName(fixture.winner).toUpperCase() + ' WINS';
      large = '◇  CRYSTAL PRIZE  ◇';
      footer = 'DELIVERY QUEUED · MIDNIGHT CITY WALLET · ON RETURN';
      drawCrystal(x,512,322,.82);
    } else if(R.finished){
      kicker = 'CASE CLOSED';
      title = 'THE LOUNGE REMAINS OPEN';
      large = fixture.title.toUpperCase();
      footer = 'STAY · ARGUE · RETELL';
    } else {
      kicker = R.live ? 'LIVE FROM THE FRONT PORCH' : kicker;
      title = currentScene() ? currentScene().label.toUpperCase() : title;
      large = R.live ? formatClock(R.elapsed) : '';
      footer = R.speaker ? displayName(R.speaker) + ' IS SPEAKING' : footer;
    }
    x.fillStyle = 'rgba(126,233,238,.88)';
    x.font = '22px monospace';
    x.fillText(kicker,512,130);
    x.fillStyle = '#f5e5c9';
    x.font = '58px Georgia';
    x.fillText(title,512,220);
    if(large){
      x.fillStyle = '#bffcff';
      x.font = mode === 'countdown' ? '94px monospace' : '32px monospace';
      x.fillText(large,512,mode === 'countdown' ? 350 : 352);
    }
    x.fillStyle = 'rgba(232,196,138,.78)';
    x.font = '18px monospace';
    x.fillText(footer.toUpperCase(),512,472);
    stage.texture.needsUpdate = true;
  }

  function drawCrystal(context,cx,cy,opacity){
    context.save();
    context.globalAlpha = opacity;
    var glow = context.createRadialGradient(cx,cy,6,cx,cy,112);
    glow.addColorStop(0,'rgba(255,236,137,.58)');
    glow.addColorStop(.45,'rgba(126,233,238,.22)');
    glow.addColorStop(1,'rgba(126,233,238,0)');
    context.fillStyle = glow;
    context.fillRect(cx - 130,cy - 130,260,260);
    context.strokeStyle = '#fff0a8';
    context.fillStyle = 'rgba(126,233,238,.26)';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(cx,cy - 76); context.lineTo(cx + 48,cy - 24); context.lineTo(cx + 29,cy + 67);
    context.lineTo(cx,cy + 92); context.lineTo(cx - 29,cy + 67); context.lineTo(cx - 48,cy - 24); context.closePath();
    context.fill(); context.stroke();
    context.beginPath(); context.moveTo(cx,cy - 76); context.lineTo(cx,cy + 92);
    context.moveTo(cx - 48,cy - 24); context.lineTo(cx + 48,cy - 24); context.stroke();
    context.restore();
  }

  function drawHostShape(context,cx,base,opacity){
    context.save();
    context.globalAlpha = opacity;
    context.fillStyle = '#78eff3';
    context.beginPath();
    context.arc(cx,base - 64,31,0,Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(cx - 82,base + 72);
    context.quadraticCurveTo(cx - 54,base - 30,cx,base - 24);
    context.quadraticCurveTo(cx + 54,base - 30,cx + 82,base + 72);
    context.closePath();
    context.fill();
    context.restore();
  }

  function buildHostStillProjection(){
    if(!stage.hostStillImage || !stage.hostStillReady || stage.hostStillMesh) return;
    var texture = new THREE.Texture(stage.hostStillImage);
    texture.needsUpdate = true;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.encoding = THREE.sRGBEncoding;
    var material = makeGarmusProjectionMaterial(texture,.84);
    var mesh = new THREE.Mesh(new THREE.PlaneGeometry(12,9.4),material);
    mesh.position.set(lagoonProjection.x,lagoonProjection.videoY,lagoonProjection.z);
    mesh.renderOrder = 7;
    mesh.visible = false;
    stage.hostStillTexture = texture;
    stage.hostStillMaterial = material;
    stage.hostStillMesh = mesh;
    world.add(mesh);
  }

  function makeGarmusProjectionMaterial(texture,strength){
    return new THREE.ShaderMaterial({
      uniforms:{
        map:{value:texture},
        strength:{value:strength == null ? .92 : strength}
      },
      vertexShader:[
        'varying vec2 vUv;',
        'void main(){',
        '  vUv = uv;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);',
        '}'
      ].join('\n'),
      fragmentShader:[
        'uniform sampler2D map;',
        'uniform float strength;',
        'varying vec2 vUv;',
        'void main(){',
        '  vec2 sourceUv = vec2(mix(0.27,0.73,vUv.x),mix(0.36,1.0,vUv.y));',
        '  vec4 source = texture2D(map,sourceUv);',
        '  float hi = max(max(source.r,source.g),source.b);',
        '  float lo = min(min(source.r,source.g),source.b);',
        '  float sat = (hi-lo) / max(hi,0.001);',
        '  float greenLead = source.g - max(source.r,source.b);',
        '  float greenDom = greenLead / max(hi,0.08);',
        '  float key = smoothstep(0.18,0.72,greenDom) * smoothstep(0.14,0.32,source.g) * smoothstep(0.12,0.42,sat);',
        '  float alpha = 1.0-key;',
        '  float bustFade = smoothstep(0.015,0.22,vUv.y);',
        '  float edgeFade = smoothstep(0.0,0.03,vUv.x) * smoothstep(0.0,0.03,1.0-vUv.x);',
        '  alpha *= bustFade * edgeFade;',
        '  float spillMask = smoothstep(0.02,0.18,max(greenLead,0.0)) * smoothstep(0.02,0.98,alpha);',
        '  float spill = max(greenLead,0.0) * 0.72 * spillMask;',
        '  vec3 clean = source.rgb;',
        '  clean.g = max(0.0,clean.g-spill);',
        '  clean.r += spill * 0.08;',
        '  clean.b += spill * 0.12;',
        '  if(alpha < 0.008) discard;',
        '  float luminance = dot(clean,vec3(0.299,0.587,0.114));',
        '  vec3 spectral = vec3(0.48,0.94,1.0) * (0.24 + luminance * 1.02);',
        '  vec3 color = mix(clean,spectral,0.20);',
        '  float scan = 0.975 + 0.025 * sin(vUv.y * 720.0);',
        '  gl_FragColor = vec4(color * scan,alpha * strength);',
        '}'
      ].join('\n'),
      transparent:true,
      depthTest:true,
      depthWrite:false,
      blending:THREE.NormalBlending,
      side:THREE.DoubleSide
    });
  }

  function setGarmusMedia(url,userGesture,options){
    options = options || {};
    clearGarmusMedia();
    var video = document.createElement('video');
    video.playsInline = true;
    video.loop = options.loop !== false;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = !userGesture;
    video.volume = audioMix.voice;
    video.src = url;
    stage.video = video;
    stage.videoUrl = url;
    stage.videoObjectUrl = /^blob:/.test(url) ? url : null;
    stage.videoVoiceTrimDb = Number.isFinite(Number(options.voiceTrimDb)) ? Number(options.voiceTrimDb) : 0;
    video.addEventListener('canplay',function(){
      if(stage.video !== video) return;
      attachGarmusAudio(video,url);
      stage.videoTexture = new THREE.VideoTexture(video);
      stage.videoTexture.minFilter = THREE.LinearFilter;
      stage.videoTexture.magFilter = THREE.LinearFilter;
      var material = makeGarmusProjectionMaterial(stage.videoTexture,.92);
      stage.videoMaterial = material;
      stage.videoMesh = new THREE.Mesh(new THREE.PlaneGeometry(12,9.4),material);
      stage.videoMesh.position.set(lagoonProjection.x,lagoonProjection.videoY,lagoonProjection.z);
      stage.videoMesh.renderOrder = 7;
      world.add(stage.videoMesh);
      if(options.manual !== false){
        R.stageOverride = 'video';
        byId('eventStageMode').value = 'video';
      }
      video.play().then(function(){
        if(options.onPlay) options.onPlay(video);
        if(options.manual !== false) toast('Garmus projection loaded');
      }).catch(function(){
        video.muted = true;
        video.play().then(function(){
          if(options.onPlay) options.onPlay(video);
        }).catch(function(){ videoFallback('Clip unavailable · host still restored'); });
      });
      drawStage(true);
    },{once:true});
    video.addEventListener('error',function(){ videoFallback('Clip unavailable · host still restored'); },{once:true});
    if(options.onEnded) video.addEventListener('ended',function(){ options.onEnded(video); },{once:true});
    if(options.onError) video.addEventListener('error',function(){ options.onError(video); },{once:true});
    video.load();
  }

  function playWelcomeReel(){
    agentsArrived = false;
    if(typeof recordPlaying !== 'undefined') resumeRecordAfterWelcome = !!recordPlaying;
    playHostReel({
      cue:'garmus.welcome',
      url:fixture.host.welcomeReel,
      duration:fixture.host.welcomeDuration || 27,
      voiceTrimDb:fixture.host.welcomeVoiceTrimDb,
      captions:welcomeCaptions,
      transcriptPrefix:'GARMUS-WELCOME',
      hideAgents:true
    });
  }

  function playCaseReel(){
    // From here the room is fully open again: the agents are present, the soundtrack
    // returns from its welcome duck, and the case film takes over the lagoon.
    if(typeof Sound !== 'undefined' && Sound.setMusicDuck){
      Sound.setMusicDuck(1,1.4);
      if((resumeRecordAfterWelcome || (typeof recordPlaying !== 'undefined' && recordPlaying)) && Sound.startMusic){
        var recordResumed = Sound.startMusic();
        if(typeof recordPlaying !== 'undefined') recordPlaying = !!recordResumed;
      }
    }
    resumeRecordAfterWelcome = false;
    playHostReel({
      cue:'garmus.case',
      url:fixture.host.caseReel,
      duration:fixture.host.caseDuration || 27,
      voiceTrimDb:fixture.host.caseVoiceTrimDb,
      captions:caseCaptions,
      transcriptPrefix:'GARMUS-CASE',
      hideAgents:false
    });
  }

  function playHostReel(config){
    welcomeMode = true;
    activeHostReel = config;
    document.body.classList.add('event-garmus-welcome');
    if(config.hideAgents) setAgentsVisible(false);
    else setAgentsVisible(true);
    evidence.forEach(function(panel){ panel.mesh.visible = false; });
    R.stageAuto = 'video';
    R.stageOverride = null;
    closeAllPanels();
    clearTimeout(welcomeTimer);
    welcomeTimer = setTimeout(function(){ finishHostReel(config,stage.video); },Math.ceil(config.duration * 1000) + 4000);
    startWelcomeMusic();
    setGarmusMedia(config.url,true,{
      loop:false,
      manual:false,
      voiceTrimDb:config.voiceTrimDb,
      onPlay:function(video){
        clearTimeout(welcomeTimer);
        welcomeTimer = setTimeout(function(){ finishHostReel(config,video); },Math.ceil(config.duration * 1000) + 800);
        startWelcomeCaptionSync(video,config.captions,config.transcriptPrefix);
      },
      onEnded:function(video){ finishHostReel(config,video); },
      onError:function(){
        R.stageAuto = 'host';
        drawStage(true);
        clearTimeout(welcomeTimer);
        welcomeTimer = setTimeout(function(){ finishHostReel(config,stage.video); },3600);
      }
    });
  }

  function finishHostReel(config,video){
    if(!config || !welcomeMode || activeHostReel !== config) return;
    if(video && stage.video && stage.video !== video) return;
    var beat = currentBeat();
    if(!beat || beat.cue !== config.cue) return;
    clearTimeout(welcomeTimer);
    stopWelcomeCaptionSync();
    activeHostReel = null;
    if(config.cue === 'garmus.case'){
      welcomeMode = false;
      document.body.classList.remove('event-garmus-welcome');
      if(stage.video) stage.video.pause();
      evidence.forEach(function(panel){ panel.mesh.visible = true; });
      R.stageAuto = 'title';
      if(typeof Sound !== 'undefined' && Sound.setMusicDuck) Sound.setMusicDuck(1,1.4);
    }
    nextBeat();
  }

  function startWelcomeMusic(){
    if(typeof Sound === 'undefined' || !Sound.startMusic) return;
    try {
      Sound.init();
      Sound.resume();
      Sound.setMix({music:audioMix.music,ambience:audioMix.ambience});
      Sound.setMusicDuck(.18,.55);
      if(Sound.trackPlaying && Sound.trackPlaying()){
        if(typeof recordPlaying !== 'undefined') recordPlaying = true;
        return;
      }
      if(typeof loadRecordLibrary === 'function'){
        loadRecordLibrary(function(ok){
          if(!ok || !welcomeMode || !Sound.startMusic) return;
          var resumed = Sound.startMusic();
          if(typeof recordPlaying !== 'undefined') recordPlaying = !!resumed;
          if(resumed && typeof syncMusicSettings === 'function') syncMusicSettings('Garmus welcome · record playing softly');
        });
      }
    } catch(ignore){}
  }

  function startWelcomeCaptionSync(video,captions,transcriptPrefix){
    stopWelcomeCaptionSync();
    welcomeCaptionTranscripted = {};
    captions = captions || [];
    transcriptPrefix = transcriptPrefix || 'GARMUS';
    function sync(){
      if(!welcomeMode || stage.video !== video) return;
      var time = video.currentTime || 0;
      captions.forEach(function(cue,index){
        if(time >= cue.start && !welcomeCaptionTranscripted[index]){
          welcomeCaptionTranscripted[index] = true;
          transcript(transcriptPrefix + '-' + index,'Garmus Campoza',cue.text);
        }
      });
      var activeIndex = -1;
      captions.some(function(cue,index){
        if(time >= cue.start && time < cue.end){ activeIndex = index; return true; }
        return false;
      });
      if(activeIndex !== welcomeCaptionIndex){
        welcomeCaptionIndex = activeIndex;
        if(activeIndex < 0){
          clearCaption();
        } else {
          clearTimeout(captionTimer);
          byId('eventCaptionSpeaker').textContent = 'Garmus';
          byId('eventCaptionCopy').textContent = captions[activeIndex].text;
          byId('eventCaption').classList.add('on');
        }
      }
      welcomeCaptionFrame = requestAnimationFrame(sync);
    }
    sync();
  }

  function stopWelcomeCaptionSync(){
    if(welcomeCaptionFrame) cancelAnimationFrame(welcomeCaptionFrame);
    welcomeCaptionFrame = 0;
    welcomeCaptionIndex = -1;
    welcomeCaptionTranscripted = {};
    clearCaption();
  }

  function revealAgents(){
    stopWelcomeCaptionSync();
    clearDialogue();
    clearTimeout(welcomeTimer);
    welcomeMode = false;
    activeHostReel = null;
    agentsArrived = true;
    document.body.classList.remove('event-garmus-welcome');
    document.body.classList.remove('event-game-begins');
    setAgentsVisible(true);
    evidence.forEach(function(panel){ panel.mesh.visible = false; });
    if(stage.video) stage.video.pause();
    R.stageAuto = 'host';
    drawStage(true);
  }

  function beginGame(){
    stopWelcomeCaptionSync();
    clearDialogue();
    clearTimeout(welcomeTimer);
    welcomeMode = false;
    activeHostReel = null;
    // The welcome lands on the title sting before the contestants enter. Keeping the
    // porch empty for these few seconds makes the transition read as a real opening.
    agentsArrived = false;
    document.body.classList.remove('event-garmus-welcome');
    setAgentsVisible(false);
    evidence.forEach(function(panel){ panel.mesh.visible = false; });
    if(stage.video) stage.video.pause();
    if(typeof Sound !== 'undefined' && Sound.setMusicDuck){
      Sound.setMusicDuck(1,1.4);
      if((resumeRecordAfterWelcome || (typeof recordPlaying !== 'undefined' && recordPlaying)) && Sound.startMusic){
        var recordResumed = Sound.startMusic();
        if(typeof recordPlaying !== 'undefined') recordPlaying = !!recordResumed;
      }
    }
    R.stageAuto = 'title';
    document.body.classList.add('event-game-begins');
    setTimeout(function(){ document.body.classList.remove('event-game-begins'); },2400);
    transcript('GAME-BEGIN','Live from the Magnanimis','The game begins. Six agents. Five rounds. One Crystal Prize.');
    gameCue('round');
    drawStage(true);
  }

  function setAgentsVisible(visible){
    Object.keys(actors).forEach(function(id){ actors[id].group.visible = visible; });
    byId('eventAgentPlates').classList.toggle('hidden',!visible);
  }

  function clearGarmusMedia(){
    stopWelcomeCaptionSync();
    disconnectGarmusAudio();
    if(stage.video){
      stage.video.pause();
      stage.video.removeAttribute('src');
      stage.video.load();
    }
    if(stage.videoMesh){
      world.remove(stage.videoMesh);
      stage.videoMesh.geometry.dispose();
      stage.videoMesh.material.dispose();
    }
    if(stage.videoTexture) stage.videoTexture.dispose();
    stage.video = null;
    stage.videoMesh = null;
    stage.videoTexture = null;
    stage.videoMaterial = null;
    stage.videoUrl = null;
    stage.videoVoiceTrimDb = 0;
    if(stage.videoObjectUrl) URL.revokeObjectURL(stage.videoObjectUrl);
    stage.videoObjectUrl = null;
    if(R.stageOverride === 'video') R.stageOverride = null;
    if(byId('eventStageMode')) byId('eventStageMode').value = 'auto';
    if(stage.mesh) drawStage(true);
  }

  function videoFallback(message){
    R.stageOverride = null;
    R.stageAuto = 'host';
    byId('eventStageMode').value = 'auto';
    if(stage.videoMesh) stage.videoMesh.visible = false;
    toast(message);
    drawStage(true);
  }

  function resetEpisode(clearTranscript){
    clearTimeout(welcomeTimer);
    stopWelcomeCaptionSync();
    clearDialogue();
    R.live = false;
    R.playing = false;
    R.finished = false;
    R.scene = 0;
    R.beat = 0;
    R.beatLeft = 0;
    R.elapsed = 0;
    R.stageAuto = 'countdown';
    R.speaker = null;
    R.target = null;
    R.formation = 'porch';
    R.revealed = false;
    R.pollLocked = false;
    R.prizeAwarded = false;
    welcomeMode = false;
    activeHostReel = null;
    agentsArrived = false;
    document.body.classList.remove('event-garmus-welcome','event-game-begins');
    if(typeof Sound !== 'undefined' && Sound.setMusicDuck) Sound.setMusicDuck(1,.25);
    R.clues = [];
    fixture.agents.forEach(function(agent){
      R.trust[agent.id] = agent.trust;
      R.score[agent.id] = agent.score || 0;
    });
    setFormation('porch');
    setAgentsVisible(false);
    setSpeaker(null,null);
    updatePlates();
    byId('eventPoll').classList.remove('open');
    byId('eventPrizeReceipt').classList.remove('open');
    if(clearTranscript){
      R.transcript = {};
      byId('eventTranscriptList').replaceChildren();
    }
    drawEvidence(evidence[0],{
      title:'Quiet Witness',
      kicker:'Tonight at the Magnanimis',
      body:'Six agents. One hotel murder. One alibi that cannot be true.'
    });
    drawEvidence(evidence[1],{
      title:'Peer Trust',
      kicker:'Public social signal',
      body:'Confidence moves as agents challenge one another. It is never proof of guilt.'
    });
    updateHeader();
    updateBroadcast();
    updateRoundQuestion();
    drawStage(true);
  }

  function startShow(){
    if(!R.live || R.finished){
      resetEpisode(false);
      R.live = true;
      R.playing = true;
    R.scheduledAt = Date.now();
      R.stageAuto = 'title';
      enterBeat(1,0);
      toast('Quiet Witness is live');
    } else resumeShow();
  }

  function pauseShow(){
    R.playing = false;
    updateHeader();
    toast('Show paused locally');
  }

  function resumeShow(){
    if(R.finished) return;
    R.live = true;
    R.playing = true;
    if(!currentBeat()) enterBeat(R.scene,R.beat);
    updateHeader();
    toast('Show resumed');
  }

  function nextBeat(){
    if(!R.live) return startShow();
    var scene = currentScene();
    if(!scene) return finishShow();
    var nextScene = R.scene;
    var next = R.beat + 1;
    if(next >= scene.beats.length){
      nextScene += 1;
      next = 0;
    }
    if(nextScene >= fixture.scenes.length) return finishShow();
    enterBeat(nextScene,next);
  }

  function previousBeat(){
    if(!R.live) return;
    var scene = R.scene;
    var beat = R.beat - 1;
    if(beat < 0){
      scene -= 1;
      if(scene < 0) return;
      beat = fixture.scenes[scene].beats.length - 1;
    }
    rebuildState(scene,beat);
    enterBeat(scene,beat);
  }

  function jumpToScene(index){
    index = Math.max(0,Math.min(fixture.scenes.length - 1,Number(index) || 0));
    prepareSceneJump(index);
    R.live = true;
    R.playing = true;
    R.finished = false;
    rebuildState(index,0);
    enterBeat(index,0);
    toast('Jumped to ' + fixture.scenes[index].label);
  }

  function prepareSceneJump(index){
    clearTimeout(welcomeTimer);
    stopWelcomeCaptionSync();
    welcomeMode = false;
    activeHostReel = null;
    document.body.classList.remove('event-garmus-welcome','event-game-begins');
    if(stage.video) stage.video.pause();
    if(typeof Sound !== 'undefined' && Sound.setMusicDuck) Sound.setMusicDuck(1,.45);
    resumeRecordAfterWelcome = false;
    agentsArrived = index >= 2;
    setAgentsVisible(agentsArrived);
    evidence.forEach(function(panel){ panel.mesh.visible = agentsArrived; });
  }

  function rebuildState(sceneIndex,beatIndex){
    fixture.agents.forEach(function(agent){
      R.trust[agent.id] = agent.trust;
      R.score[agent.id] = agent.score || 0;
    });
    R.clues = [];
    R.revealed = false;
    R.prizeAwarded = false;
    R.formation = 'porch';
    R.elapsed = 0;
    for(var s = 0; s <= sceneIndex; s++){
      var max = s < sceneIndex ? fixture.scenes[s].beats.length : beatIndex;
      for(var b = 0; b < max; b++){
        var beat = fixture.scenes[s].beats[b];
        R.elapsed += beat.duration || 0;
        if(beat.trust) applyTrust(beat.trust,true);
        if(beat.score) applyScore(beat.score,true);
        if(beat.clue && R.clues.indexOf(beat.clue) < 0) R.clues.push(beat.clue);
        if(beat.cue === 'agents.accuse') R.formation = 'accuse';
        if(beat.cue === 'agents.idle') R.formation = 'porch';
        if(beat.cue === 'reveal') R.revealed = true;
        if(beat.cue === 'prize.award') R.prizeAwarded = true;
      }
    }
    // Scene jumps within the ceremony should match the new opening order too.
    if(sceneIndex === 1){
      agentsArrived = beatIndex >= 2;
      setAgentsVisible(agentsArrived);
      evidence.forEach(function(panel){ panel.mesh.visible = false; });
    }
    setFormation(R.formation);
    updatePlates();
    updateBroadcast();
    if(R.clues.length) showClue(R.clues[R.clues.length - 1],true);
  }

  function enterBeat(sceneIndex,beatIndex){
    R.scene = sceneIndex;
    R.beat = beatIndex;
    var beat = currentBeat();
    if(!beat) return finishShow();
    R.beatLeft = beat.duration || 8;
    byId('eventScene').value = String(sceneIndex);
    applyBeat(beat);
    updateHeader();
    updateBroadcast();
    updateRoundQuestion();
    if(beatIndex === 0 && sceneIndex > 0 && beat.cue !== 'garmus.welcome' && beat.cue !== 'garmus.case' && sceneIndex !== 2) gameCue('round');
    drawStage(true);
  }

  function applyBeat(beat){
    clearDialogue();
    R.speaker = beat.speaker || null;
    R.target = beat.target || null;
    if(R.formation === 'porch') setFormation('porch');
    setSpeaker(R.speaker,R.target);
    if(beat.trust) applyTrust(beat.trust,false);
    if(beat.score) applyScore(beat.score,false);
    if(beat.clue) showClue(beat.clue,false);

    if(beat.cue === 'stage.countdown') R.stageAuto = 'countdown';
    if(beat.cue === 'garmus.show') R.stageAuto = stage.videoTexture ? 'video' : 'host';
    if(beat.cue === 'garmus.welcome') playWelcomeReel();
    if(beat.cue === 'agents.arrive') revealAgents();
    if(beat.cue === 'garmus.case') playCaseReel();
    if(beat.cue === 'game.begin') beginGame();
    if(beat.cue === 'garmus.fade'){
      R.stageAuto = 'title';
      if(stage.video) stage.video.pause();
    }
    if(beat.cue === 'agent.forward') stepForward(beat.speaker);
    if(beat.cue === 'poll.open') openPoll(false);
    if(beat.cue === 'poll.lock') lockPoll();
    if(beat.cue === 'agents.accuse'){
      R.formation = 'accuse';
      setFormation('accuse');
    }
    if(beat.cue === 'reveal'){
      R.revealed = true;
      markAccused('eugene');
      R.stageAuto = 'host';
      gameCue('reveal');
    }
    if(beat.cue === 'poll.reveal') openPoll(true);
    if(beat.cue === 'prize.award') awardPrize(false);
    if(beat.cue === 'agents.idle'){
      R.formation = 'porch';
      setFormation('porch');
      R.stageAuto = 'title';
    }

    if(beat.speaker){
      if(beat.speaker === 'garmus') caption(displayName(beat.speaker),beat.text);
      else agentSpeech(beat.speaker,beat.text,beat.target);
      transcript(beat.id,displayName(beat.speaker),beat.text);
      if(beat.cue !== 'prize.award'){
        R.stageAuto = beat.speaker === 'garmus' ?
          (stage.videoTexture && stage.video && !stage.video.ended ? 'video' : 'host') : 'title';
      }
    } else if(beat.system){
      toast(beat.system);
      transcript(beat.id,'Live direction',beat.system);
    }
  }

  function finishShow(){
    clearDialogue();
    R.playing = false;
    R.finished = true;
    R.live = false;
    R.stageAuto = 'title';
    setSpeaker(null,null);
    updateHeader();
    updateRoundQuestion();
    drawStage(true);
    toast('Case closed · lounge still open');
  }

  function currentScene(){ return fixture.scenes[R.scene] || null; }
  function currentBeat(){
    var scene = currentScene();
    return scene && scene.beats[R.beat] || null;
  }
  function displayName(id){
    if(id === 'garmus') return fixture.host.shortName || fixture.host.name;
    return agentData[id] ? agentData[id].name : id;
  }

  function applyTrust(changes,silent){
    Object.keys(changes).forEach(function(id){
      R.trust[id] = Math.max(0,Math.min(100,R.trust[id] + changes[id]));
    });
    updatePlates();
    if(!silent){
      Object.keys(changes).forEach(function(id){
        var plate = root.querySelector('.event-agent-plate[data-agent="' + id + '"]');
        if(!plate) return;
        plate.classList.remove('changed');
        void plate.offsetWidth;
        plate.classList.add('changed');
      });
    }
    updateBroadcast();
  }

  function applyScore(changes,silent){
    Object.keys(changes).forEach(function(id){
      R.score[id] = Math.max(0,(R.score[id] || 0) + changes[id]);
    });
    updateBroadcast();
    if(silent) return;
    Object.keys(changes).forEach(function(id){
      var card = root.querySelector('.event-score-card[data-agent="' + id + '"]');
      if(!card) return;
      var delta = changes[id];
      var momentum = card.querySelector('.event-momentum');
      momentum.textContent = (delta > 0 ? '+' : '') + delta;
      card.classList.remove('changed','gain','loss');
      void card.offsetWidth;
      card.classList.add('changed',delta >= 0 ? 'gain' : 'loss');
      setTimeout(function(){ card.classList.remove('changed','gain','loss'); momentum.textContent = ''; },1450);
    });
    gameCue(Object.keys(changes).some(function(id){ return changes[id] >= 8; }) ? 'big-score' : 'score');
  }

  function roundInfo(){
    var map = [0,0,0,1,1,2,3,3,4,4,4];
    var labels = ['Opening','Statements','Audience vote','Evidence','Final deduction'];
    var index = Math.max(0,Math.min(4,map[R.scene] || 0));
    return {index:index,label:labels[index]};
  }

  function pollLeader(){
    var totals = {};
    var sum = 0;
    fixture.agents.forEach(function(agent){ totals[agent.id] = fixture.baselinePoll[agent.id] || 0; });
    Object.keys(votes).forEach(function(client){ if(totals[votes[client]] !== undefined) totals[votes[client]] += 1; });
    Object.keys(totals).forEach(function(id){ sum += totals[id]; });
    var id = fixture.agents[0].id;
    Object.keys(totals).forEach(function(candidate){ if(totals[candidate] > totals[id]) id = candidate; });
    return {id:id,percent:sum ? Math.round(totals[id] / sum * 100) : 0};
  }

  function updateBroadcast(){
    if(!root) return;
    var info = roundInfo();
    byId('eventRoundLabel').textContent = (info.index + 1) + '/5 · ' + info.label;
    Array.prototype.forEach.call(byId('eventRoundDots').children,function(dot,index){
      dot.classList.toggle('done',index < info.index);
      dot.classList.toggle('current',index === info.index);
    });
    var ranking = fixture.agents.slice().sort(function(a,b){
      return (R.score[b.id] - R.score[a.id]) || (R.trust[b.id] - R.trust[a.id]);
    });
    var hasScores = (R.score[ranking[0].id] || 0) > 0;
    ranking.forEach(function(agent,index){
      var card = root.querySelector('.event-score-card[data-agent="' + agent.id + '"]');
      if(!card) return;
      card.querySelector('.event-rank').textContent = hasScores ? '#' + (index + 1) : '·';
      card.querySelector('.event-points').textContent = (R.score[agent.id] || 0) + ' PTS';
      card.querySelector('i b').style.width = R.trust[agent.id] + '%';
      card.classList.toggle('leader',hasScores && index === 0 && R.live);
      card.classList.toggle('speaking',R.speaker === agent.id);
      card.classList.toggle('accused',R.revealed && agent.id === fixture.culprit);
      card.classList.toggle('winner',R.prizeAwarded && agent.id === fixture.winner);
    });
    var suspect = pollLeader();
    byId('eventAudienceRead').textContent = R.revealed ?
      'Truth · ' + displayName(fixture.culprit) :
      'Audience suspects ' + displayName(suspect.id) + ' · ' + suspect.percent + '%';
    byId('eventPrizeState').textContent = R.prizeAwarded ? displayName(fixture.winner) + ' wins' : 'Up for grabs';
    byId('eventPrizeBlock').classList.toggle('awarded',R.prizeAwarded);
  }

  function awardPrize(withToast){
    if(withToast === undefined) withToast = true;
    R.prizeAwarded = true;
    R.stageAuto = 'prize';
    R.target = fixture.winner;
    var winner = displayName(fixture.winner);
    byId('eventPrizeWinner').textContent = winner + ' wins the Crystal Prize';
    closeAllPanels();
    byId('eventPoll').classList.remove('open');
    byId('eventPrizeReceipt').classList.add('open');
    clearTimeout(prizeTimer);
    prizeTimer = setTimeout(function(){ byId('eventPrizeReceipt').classList.remove('open'); },10000);
    if(actors[fixture.winner]){
      actors[fixture.winner].winner = true;
      actors[fixture.winner].ring.material.color.set(0xffdf76);
      actors[fixture.winner].ring.material.opacity = .9;
    }
    updateBroadcast();
    drawStage(true);
    gameCue('prize');
    if(withToast) toast('Crystal Prize queued for ' + winner + ' on return to Midnight City');
  }

  function updatePlates(){
    fixture.agents.forEach(function(agent){
      var plate = root.querySelector('.event-agent-plate[data-agent="' + agent.id + '"]');
      if(!plate) return;
      var trust = R.trust[agent.id];
      plate.querySelector('.event-trust-label').textContent = 'Peer Trust ' + trust;
      plate.querySelector('i b').style.width = trust + '%';
      plate.classList.toggle('speaking',R.speaker === agent.id);
      plate.classList.toggle('targeted',R.target === agent.id);
      plate.classList.toggle('accused',R.revealed && agent.id === 'eugene');
    });
  }

  function setSpeaker(speaker,target){
    Object.keys(actors).forEach(function(id){
      var actor = actors[id];
      actor.active = id === speaker;
      actor.addressed = id === target;
      actor.accused = R.revealed && id === 'eugene';
      actor.ring.material.color.set(actor.accused ? 0xe76464 : (id === target ? 0xe8c48a : 0x7ee9ee));
      actor.ring.material.opacity = actor.active ? .76 : (id === target ? .46 : .18);
    });
    updatePlates();
  }

  function markAccused(id){
    Object.keys(actors).forEach(function(agentId){ actors[agentId].accused = agentId === id; });
    updatePlates();
  }

  function ensureAudio(){
    if(!audioContext){
      var AudioCtor = window.AudioContext || window.webkitAudioContext;
      if(!AudioCtor) return;
      audioContext = new AudioCtor();
      audioMaster = audioContext.createGain();
      audioMaster.gain.value = .035 * audioMix.cues;
      audioMaster.connect(audioContext.destination);
    }
    if(audioContext.state === 'suspended') audioContext.resume().catch(function(){});
  }

  function canProcessGarmusAudio(url){
    if(!url || /^blob:/.test(url)) return true;
    try { return new URL(url,location.href).origin === location.origin; }
    catch(ignore){ return false; }
  }

  function attachGarmusAudio(video,url){
    if(!video) return;
    if(stage.voiceAudio && stage.voiceAudio.video === video){
      setGarmusVoiceLevel(audioMix.voice,true);
      return;
    }
    if(!canProcessGarmusAudio(url)){
      video.volume = audioMix.voice;
      if(root) root.dataset.hostAudio = 'native';
      return;
    }
    ensureAudio();
    if(!audioContext || audioContext.state !== 'running'){
      video.volume = audioMix.voice;
      if(root) root.dataset.hostAudio = 'native';
      if(audioContext) audioContext.resume().then(function(){
        if(stage.video === video) attachGarmusAudio(video,url);
      }).catch(function(){});
      return;
    }
    disconnectGarmusAudio();
    try {
      var highpass = audioContext.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 80;
      highpass.Q.value = .707;
      var mudCut = audioContext.createBiquadFilter();
      mudCut.type = 'peaking';
      mudCut.frequency.value = 240;
      mudCut.Q.value = .85;
      mudCut.gain.value = -1.5;
      var presence = audioContext.createBiquadFilter();
      presence.type = 'peaking';
      presence.frequency.value = 2800;
      presence.Q.value = .9;
      presence.gain.value = 2.5;
      var airRollOff = audioContext.createBiquadFilter();
      airRollOff.type = 'lowpass';
      airRollOff.frequency.value = 6800;
      airRollOff.Q.value = .55;
      var compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = -26;
      compressor.knee.value = 12;
      compressor.ratio.value = 3;
      compressor.attack.value = .004;
      compressor.release.value = .18;
      var broadcastWarmth = audioContext.createWaveShaper();
      var warmthCurve = new Float32Array(2048);
      for(var curveIndex = 0; curveIndex < warmthCurve.length; curveIndex++){
        var sample = curveIndex * 2 / (warmthCurve.length - 1) - 1;
        warmthCurve[curveIndex] = 1.28 * sample / (1 + .28 * Math.abs(sample));
      }
      broadcastWarmth.curve = warmthCurve;
      broadcastWarmth.oversample = '2x';
      var makeup = audioContext.createGain();
      makeup.gain.value = Math.pow(10,(stage.videoVoiceTrimDb || 0) / 20);
      var limiter = audioContext.createDynamicsCompressor();
      limiter.threshold.value = -2;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = .002;
      limiter.release.value = .08;
      var echoDelay = audioContext.createDelay(.25);
      echoDelay.delayTime.value = .095;
      var echoFilter = audioContext.createBiquadFilter();
      echoFilter.type = 'lowpass';
      echoFilter.frequency.value = 3200;
      echoFilter.Q.value = .55;
      var echoGain = audioContext.createGain();
      echoGain.gain.value = .065;
      var userGain = audioContext.createGain();
      var source = audioContext.createMediaElementSource(video);
      source.connect(highpass).connect(mudCut).connect(presence).connect(airRollOff).connect(compressor).connect(broadcastWarmth).connect(makeup).connect(limiter);
      limiter.connect(userGain).connect(audioContext.destination);
      limiter.connect(echoDelay).connect(echoFilter).connect(echoGain).connect(userGain);
      stage.voiceAudio = {
        video:video,
        source:source,
        highpass:highpass,
        mudCut:mudCut,
        presence:presence,
        airRollOff:airRollOff,
        compressor:compressor,
        broadcastWarmth:broadcastWarmth,
        makeup:makeup,
        limiter:limiter,
        echoDelay:echoDelay,
        echoFilter:echoFilter,
        echoGain:echoGain,
        userGain:userGain
      };
      video.volume = 1;
      setGarmusVoiceLevel(audioMix.voice,true);
      if(root) root.dataset.hostAudio = 'enhanced';
    } catch(ignore){
      video.volume = audioMix.voice;
      stage.voiceAudio = null;
      if(root) root.dataset.hostAudio = 'native';
    }
  }

  function setGarmusVoiceLevel(value,immediate){
    value = clampLevel(value,audioMix.voice);
    if(stage.voiceAudio && stage.voiceAudio.userGain && audioContext){
      var gain = stage.voiceAudio.userGain.gain;
      gain.cancelScheduledValues(audioContext.currentTime);
      if(immediate) gain.setValueAtTime(value,audioContext.currentTime);
      else gain.setTargetAtTime(value,audioContext.currentTime,.03);
      stage.voiceAudio.video.volume = 1;
    } else if(stage.video){
      stage.video.volume = value;
    }
  }

  function disconnectGarmusAudio(){
    var voice = stage.voiceAudio;
    if(voice){
      ['source','highpass','mudCut','presence','airRollOff','compressor','broadcastWarmth','makeup','limiter','echoDelay','echoFilter','echoGain','userGain'].forEach(function(key){
        if(voice[key] && voice[key].disconnect){
          try { voice[key].disconnect(); } catch(ignore){}
        }
      });
    }
    stage.voiceAudio = null;
    if(root) delete root.dataset.hostAudio;
  }

  function ensureRoomAudio(){
    ensureAudio();
    if(stage.video) attachGarmusAudio(stage.video,stage.videoUrl);
    if(typeof Sound !== 'undefined' && Sound.init){
      try {
        Sound.setMix({music:audioMix.music,ambience:audioMix.ambience});
        Sound.init();
        Sound.resume();
        if(!R.live && !welcomeMode && typeof recordPlaying !== 'undefined' && !recordPlaying && Sound.hasLibrary && Sound.hasLibrary()){
          Sound.setMusicDuck(.0001,.03);
          recordPlaying = !!Sound.startMusic();
        }
      } catch(ignore){}
    }
    if(welcomeMode) startWelcomeMusic();
  }

  function setAudioMix(key,value){
    if(!Object.prototype.hasOwnProperty.call(audioMix,key)) return;
    audioMix[key] = clampLevel(value,audioMix[key]);
    soundEnabled = audioMix.cues > 0;
    localStorage.setItem('gone-away-demo-sound',soundEnabled ? 'on' : 'muted');
    localStorage.setItem('gone-away-demo-mix-v1',JSON.stringify(audioMix));
    if(key === 'voice') setGarmusVoiceLevel(audioMix.voice);
    if(typeof Sound !== 'undefined' && Sound.setMix) Sound.setMix({music:audioMix.music,ambience:audioMix.ambience});
    if(audioMaster && audioContext){
      audioMaster.gain.cancelScheduledValues(audioContext.currentTime);
      audioMaster.gain.setTargetAtTime(.035 * audioMix.cues,audioContext.currentTime,.08);
    }
    syncAudioMixUI();
  }

  function syncAudioMixUI(){
    var ids = {voice:'eventVoice',music:'eventMusic',ambience:'eventAmbience',cues:'eventCues'};
    Object.keys(ids).forEach(function(key){
      var input = byId(ids[key] + 'Level');
      var output = byId(ids[key] + 'Value');
      if(input) input.value = String(Math.round(audioMix[key] * 100));
      if(output){
        var percent = Math.round(audioMix[key] * 100);
        output.textContent = percent + '%' + (key === 'voice' && percent === 100 ? ' · boosted' : '');
      }
    });
    if(byId('eventSettingsToggle')) byId('eventSettingsToggle').classList.toggle('muted',audioMix.voice === 0 && audioMix.music === 0 && audioMix.ambience === 0 && audioMix.cues === 0);
  }

  function cueTone(frequency,when,duration,type,gain){
    if(!audioContext || !audioMaster) return;
    var oscillator = audioContext.createOscillator();
    var envelope = audioContext.createGain();
    oscillator.type = type || 'triangle';
    oscillator.frequency.setValueAtTime(frequency,when);
    envelope.gain.setValueAtTime(.0001,when);
    envelope.gain.exponentialRampToValueAtTime(gain || .18,when + .012);
    envelope.gain.exponentialRampToValueAtTime(.0001,when + duration);
    oscillator.connect(envelope).connect(audioMaster);
    oscillator.start(when); oscillator.stop(when + duration + .03);
  }

  function gameCue(kind){
    if(!soundEnabled || audioMix.cues <= 0) return;
    ensureAudio();
    if(!audioContext) return;
    var t = audioContext.currentTime + .015;
    if(kind === 'score'){
      cueTone(440,t,.09,'square',.08); cueTone(660,t + .07,.13,'triangle',.11);
    } else if(kind === 'big-score'){
      cueTone(392,t,.10,'square',.08); cueTone(587,t + .07,.12,'triangle',.12); cueTone(784,t + .15,.22,'triangle',.13);
    } else if(kind === 'round'){
      cueTone(330,t,.10,'triangle',.08); cueTone(440,t + .09,.12,'triangle',.10); cueTone(660,t + .18,.20,'triangle',.12);
    } else if(kind === 'lock'){
      cueTone(260,t,.08,'square',.08); cueTone(196,t + .09,.18,'triangle',.10);
    } else if(kind === 'reveal'){
      cueTone(165,t,.25,'sawtooth',.08); cueTone(247,t + .18,.30,'triangle',.12);
    } else if(kind === 'prize'){
      [523,659,784,1047].forEach(function(note,index){ cueTone(note,t + index * .105,.32,'triangle',.12); });
    }
  }

  function setFormation(name){
    R.formation = name;
    if(name === 'accuse'){
      var layout = {
        mr_c:[-4.8,-9.5],
        nodnarb:[-3,-8.9],
        mikeyyy:[-1.4,-8.5],
        eugene:[0,-10.7],
        ranger:[2.1,-8.6],
        elza:[4.2,-9.2]
      };
      Object.keys(layout).forEach(function(id){ actors[id].target.set(layout[id][0],0,layout[id][1]); });
    } else {
      fixture.agents.forEach(function(agent,index){
        actors[agent.id].target.set(porch[index][0],0,porch[index][1]);
      });
    }
  }

  function stepForward(id){
    if(id && actors[id] && R.formation === 'porch') actors[id].target.z += .56;
  }

  function showClue(id,silent){
    var clue = fixture.clues[id];
    if(!clue) return;
    if(R.clues.indexOf(id) < 0) R.clues.push(id);
    drawEvidence(evidence[evidenceCursor++ % evidence.length],clue);
    if(!silent) toast('Evidence wall updated · ' + clue.title);
  }

  function caption(speaker,text){
    clearTimeout(captionTimer);
    byId('eventCaptionSpeaker').textContent = speaker;
    byId('eventCaptionCopy').textContent = text;
    byId('eventCaption').classList.add('on');
    captionTimer = setTimeout(function(){
      if(R.playing) byId('eventCaption').classList.remove('on');
    },Math.max(3000,(currentBeat() ? currentBeat().duration : 8) * 1000 / R.speed - 250));
  }

  function clearCaption(){
    clearTimeout(captionTimer);
    byId('eventCaption').classList.remove('on');
    byId('eventCaptionSpeaker').textContent = '';
    byId('eventCaptionCopy').textContent = '';
  }

  function clearAgentSpeech(){
    Array.prototype.forEach.call(root.querySelectorAll('.event-agent-plate.has-speech'),function(plate){
      plate.classList.remove('has-speech','bubble-below');
      var bubble = plate.querySelector('.event-agent-speech');
      bubble.classList.remove('on');
      bubble.querySelector('.event-speech-context').textContent = '';
      bubble.querySelector('p').textContent = '';
    });
    byId('eventDialogueLive').textContent = '';
  }

  function clearDialogue(){
    clearCaption();
    clearAgentSpeech();
  }

  function agentSpeech(id,text,target){
    var plate = root.querySelector('.event-agent-plate[data-agent="' + id + '"]');
    if(!plate) return;
    var bubble = plate.querySelector('.event-agent-speech');
    bubble.querySelector('.event-speech-context').textContent = target ? 'To ' + displayName(target) : '';
    bubble.querySelector('p').textContent = text;
    plate.classList.add('has-speech');
    bubble.classList.add('on');
    byId('eventDialogueLive').textContent = displayName(id) + (target ? ', to ' + displayName(target) : '') + ': ' + text;
  }

  function updateRoundQuestion(){
    var scene = currentScene();
    var beat = currentBeat();
    var prompt = beat && beat.prompt || scene && scene.prompt || null;
    var question = byId('eventRoundQuestion');
    var visible = !!prompt && !welcomeMode && (R.live || R.finished) && R.scene >= 2;
    if(prompt){
      byId('eventRoundQuestionLabel').textContent = prompt.label || 'Round question';
      byId('eventRoundQuestionCopy').textContent = prompt.text || '';
    } else {
      byId('eventRoundQuestionLabel').textContent = 'Round question';
      byId('eventRoundQuestionCopy').textContent = '';
    }
    question.classList.toggle('on',visible);
  }

  function transcript(id,speaker,text){
    if(R.transcript[id]) return;
    R.transcript[id] = true;
    var line = document.createElement('article');
    line.className = 'event-line';
    var name = document.createElement('strong');
    var copy = document.createElement('p');
    name.textContent = speaker;
    copy.textContent = text;
    line.append(name,copy);
    byId('eventTranscriptList').appendChild(line);
    byId('eventTranscriptList').scrollTop = byId('eventTranscriptList').scrollHeight;
  }

  function openPoll(reveal){
    R.pollLocked = !!reveal;
    byId('eventPollTitle').textContent = reveal ? 'The room predicted. The truth is EugenE.' : 'Who murdered Julian Vale?';
    byId('eventPollCopy').textContent = reveal ?
      'Prediction never changed the authored truth. It changed what the audience watched for.' :
      'Commit your prediction. Peer Trust is social confidence, not guilt.';
    byId('eventPollStatus').textContent = reveal ? 'Reveal · EugenE' : 'Prediction open';
    renderPoll();
    byId('eventPoll').classList.add('open');
  }

  function lockPoll(){
    R.pollLocked = true;
    byId('eventPollStatus').textContent = 'Predictions locked';
    renderPoll();
    gameCue('lock');
    toast('Audience prediction locked');
  }

  function resetPoll(){
    R.pollLocked = false;
    localVote = null;
    votes = {};
    localStorage.removeItem(voteKey());
    if(channel) channel.postMessage({type:'vote-reset',clientId:clientId});
    renderPoll();
    toast('Local prediction reset');
  }

  function castVote(id){
    if(R.pollLocked || !agentData[id]) return;
    localVote = id;
    votes[clientId] = id;
    localStorage.setItem(voteKey(),id);
    if(channel) channel.postMessage({type:'vote',clientId:clientId,agentId:id});
    renderPoll();
    byId('eventPollStatus').textContent = 'Prediction committed · ' + displayName(id);
    toast('Prediction committed');
  }

  function renderPoll(){
    var totals = {};
    var sum = 0;
    fixture.agents.forEach(function(agent){ totals[agent.id] = fixture.baselinePoll[agent.id] || 0; });
    Object.keys(votes).forEach(function(client){ if(totals[votes[client]] !== undefined) totals[votes[client]] += 1; });
    Object.keys(totals).forEach(function(id){ sum += totals[id]; });
    Array.prototype.forEach.call(root.querySelectorAll('.event-choice'),function(button){
      var id = button.dataset.agent;
      var percent = sum ? Math.round(totals[id] / sum * 100) : 0;
      button.style.setProperty('--vote',percent + '%');
      button.textContent = displayName(id) + ' · ' + percent + '%';
      button.classList.toggle('selected',localVote === id);
      button.classList.toggle('culprit',R.revealed && id === 'eugene');
      button.disabled = R.pollLocked;
    });
    updateBroadcast();
  }

  function connectRoom(){
    if(!('BroadcastChannel' in window)) return updatePresence();
    channel = new BroadcastChannel('gone-away-demo:' + roomCode);
    channel.addEventListener('message',function(e){
      var message = e.data || {};
      if(message.clientId === clientId) return;
      if(message.type === 'hello' || message.type === 'ping'){
        peers[message.clientId] = Date.now();
        if(message.type === 'hello') channel.postMessage({type:'ping',clientId:clientId});
        updatePresence();
      } else if(message.type === 'chat'){
        addChat({name:message.name,text:message.text});
      } else if(message.type === 'vote'){
        votes[message.clientId] = message.agentId;
        renderPoll();
      } else if(message.type === 'vote-reset'){
        votes = {};
        renderPoll();
      }
    });
    channel.postMessage({type:'hello',clientId:clientId});
    setInterval(function(){
      channel.postMessage({type:'ping',clientId:clientId});
      var cutoff = Date.now() - 13000;
      Object.keys(peers).forEach(function(id){ if(peers[id] < cutoff) delete peers[id]; });
      updatePresence();
    },4000);
  }

  function updatePresence(){
    byId('eventPresence').textContent = (1 + Object.keys(peers).length) + ' watching';
  }

  function seedChat(){
    addChat({name:'Magnanimis',text:'The lounge is open. Talk freely; the show will continue around you.',system:true});
    fixture.chatSeed.forEach(addChat);
  }

  function addChat(message){
    var item = document.createElement('div');
    item.className = 'event-chat-message' + (message.system ? ' system' : '');
    var name = document.createElement('strong');
    var text = document.createElement('span');
    name.textContent = message.name || 'Guest';
    text.textContent = String(message.text || '').slice(0,220);
    item.append(name,text);
    var log = byId('eventChatLog');
    log.appendChild(item);
    while(log.children.length > 120) log.firstElementChild.remove();
    log.scrollTop = log.scrollHeight;
  }

  function copyRoom(){
    var url = new URL(location.href);
    url.searchParams.set('mode','demo');
    url.searchParams.set('room',roomCode);
    url.searchParams.delete('event');
    ['operator','admin','debug'].forEach(function(key){ url.searchParams.delete(key); });
    var value = url.toString();
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(value).then(function(){ toast('Room link copied · ' + roomCode); })
        .catch(function(){ fallbackCopy(value); });
    } else fallbackCopy(value);
  }

  function fallbackCopy(value){
    var area = document.createElement('textarea');
    area.value = value;
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); toast('Room link copied · ' + roomCode); }
    catch(ignore) { toast('Copy unavailable · use room ' + roomCode); }
    area.remove();
  }

  function toast(message){
    clearTimeout(toastTimer);
    byId('eventToast').textContent = message;
    byId('eventToast').classList.add('on');
    toastTimer = setTimeout(function(){ byId('eventToast').classList.remove('on'); },2400);
  }

  function updateHeader(){
    var pill = byId('eventLivePill');
    pill.classList.toggle('live',R.live && !R.finished);
    if(R.finished){
      byId('eventPhase').textContent = 'Aftershow';
      byId('eventStageStatus').textContent = 'Case closed · lounge open';
    } else if(R.live){
      byId('eventPhase').textContent = R.playing ? 'Live' : 'Paused';
      byId('eventStageStatus').textContent = (currentScene() ? currentScene().label : fixture.title) + ' · ' + formatClock(R.elapsed);
    } else {
      var remaining = Math.max(0,Math.ceil((R.scheduledAt - Date.now()) / 1000));
      byId('eventPhase').textContent = 'Lounge open';
      byId('eventStageStatus').textContent = 'Show begins in ' + formatClock(remaining);
    }
    byId('eventPause').textContent = R.playing ? 'Pause' : 'Resume';
    var beat = currentBeat();
    byId('eventOperatorNote').textContent = (beat ? beat.id : 'PRE-SHOW') +
      ' · local deterministic fixture · no coordinator or live backend';
  }

  function formatClock(seconds){
    seconds = Math.max(0,Math.floor(seconds || 0));
    return String(Math.floor(seconds / 60)).padStart(2,'0') + ':' + String(seconds % 60).padStart(2,'0');
  }

  function frame(now){
    requestAnimationFrame(frame);
    var dt = Math.min(.05,Math.max(0,(now - lastFrame) / 1000));
    lastFrame = now;
    if(!R.live && !R.finished && Date.now() >= R.scheduledAt) startShow();
    if(R.live && R.playing && !R.finished){
      var storyDt = dt * R.speed;
      R.elapsed += welcomeMode ? dt : storyDt;
      if(!welcomeMode){
        R.beatLeft -= storyDt;
        if(R.beatLeft <= 0) nextBeat();
      }
    }
    animateAgents(dt,now / 1000);
    animateEventLights(dt);
    if(stage.ripple){
      var ripplePulse = 1 + Math.sin(now / 1250) * .055;
      stage.ripple.scale.set(ripplePulse,ripplePulse,ripplePulse);
      stage.ripple.material.opacity = .11 + Math.sin(now / 900) * .025;
    }
    projectPlates();
    drawStage(false);
    updateHeader();
  }

  function animateEventLights(dt){
    var focus = welcomeMode ? 1 : 0;
    var sting = document.body.classList.contains('event-game-begins') ? 1 : 0;
    var speed = Math.min(1,dt * 2.2);
    if(eventLights.host) eventLights.host.intensity += ((focus ? 4.4 : 0) - eventLights.host.intensity) * speed;
    if(eventLights.porch) eventLights.porch.intensity += ((focus ? .035 : (sting ? .02 : .34)) - eventLights.porch.intensity) * speed;
    if(eventLights.lagoon) eventLights.lagoon.intensity += ((focus ? .72 : (sting ? .16 : .42)) - eventLights.lagoon.intensity) * speed;
    if(typeof renderer !== 'undefined') renderer.toneMappingExposure += ((focus ? .82 : (sting ? .56 : 1.02)) - renderer.toneMappingExposure) * Math.min(1,dt * 2.2);
  }

  function animateAgents(dt,time){
    var ease = 1 - Math.pow(.002,dt);
    Object.keys(actors).forEach(function(id){
      var actor = actors[id];
      var travel = actor.group.position.distanceTo(actor.target);
      actor.group.position.lerp(actor.target,ease);
      var focusEase = Math.min(1,dt * 7);
      actor.focus += ((actor.active ? 1 : 0) - actor.focus) * focusEase;
      actor.addressFocus += ((actor.addressed ? 1 : 0) - actor.addressFocus) * focusEase;
      var idle = reducedMotion ? 0 : Math.sin(time * 2.1 + actor.phase) * .025;
      var lift = actor.focus * .03 + actor.addressFocus * .01;
      actor.body.position.y = .03 + idle + lift;
      var pulse = actor.active && !reducedMotion ? 1 + Math.sin(time * 5.2) * .018 : 1;
      var focusScale = 1 + actor.focus * .04 + actor.addressFocus * .012;
      actor.body.scale.set(actor.scale.x * pulse * focusScale,actor.scale.y * pulse * focusScale,actor.scale.z);
      var conversationActive = !!R.speaker && R.speaker !== 'garmus';
      var desiredLevel = !conversationActive || actor.active || actor.addressed || actor.accused || actor.winner ? 1 : .92;
      actor.visualLevel += (desiredLevel - actor.visualLevel) * Math.min(1,dt * 5);
      actor.body.material.color.setRGB(actor.visualLevel,actor.visualLevel,actor.visualLevel);
      if(actor.spriteReady && actor.texture){
        actor.frameClock += dt;
        var interval = travel > .035 ? .185 : .37;
        if(actor.frameClock >= interval){
          actor.frameClock %= interval;
          actor.frame = (actor.frame + 1) % 4;
          var row = travel > .035 ? 0 : 3;
          actor.texture.offset.x = actor.frame * .25;
          actor.texture.offset.y = 1 - (row + 1) / actor.rows;
        }
      }
      if(actor.active && !reducedMotion) actor.ring.rotation.z += dt * .7;
      var ringScale = 1 + actor.focus * (.08 + (reducedMotion ? 0 : Math.sin(time * 3.4) * .035));
      actor.ring.scale.setScalar(ringScale);
      var targetOpacity = actor.winner ? .9 : (actor.active ? .72 : (actor.accused ? .62 : (actor.addressed ? .46 : .18)));
      actor.ring.material.opacity += (targetOpacity - actor.ring.material.opacity) * Math.min(1,dt * 6);
    });
    updateAgentLayering();
  }

  function updateAgentLayering(){
    var layers = fixture.agents.map(function(agent,index){
      var actor = actors[agent.id];
      var worldPosition = new THREE.Vector3();
      actor.group.getWorldPosition(worldPosition);
      return {actor:actor,id:agent.id,index:index,distance:camera.position.distanceToSquared(worldPosition)};
    });
    // Paint far agents first and near agents last for the viewer's current camera.
    // The active exchange gets the final two layers so dialogue always reads cleanly.
    layers.sort(function(a,b){ return b.distance - a.distance || a.index - b.index; });
    layers.forEach(function(item,index){ item.actor.body.renderOrder = 20 + index; });
    layers.forEach(function(item){
      if(item.id === R.target) item.actor.body.renderOrder = 38;
      if(item.id === R.speaker) item.actor.body.renderOrder = 40;
    });
  }

  function projectPlates(){
    var canvasRect = canvas.getBoundingClientRect();
    if(canvasRect.width < 2 || canvasRect.height < 2) return;
    var point = new THREE.Vector3();
    var depthOrder = [];

    fixture.agents.forEach(function(agent,index){
      var actor = actors[agent.id];
      var plate = root.querySelector('.event-agent-plate[data-agent="' + agent.id + '"]');
      actor.group.getWorldPosition(point);
      var distance = camera.position.distanceTo(point);
      point.y += 2.18 + actor.focus * .16;
      point.project(camera);
      var visible = point.z > -1 && point.z < 1 && point.x > -1.15 && point.x < 1.15 && point.y > -1.15 && point.y < 1.15;
      plate.style.display = visible ? '' : 'none';
      if(!visible) return;

      var screenX = canvasRect.left + (point.x + 1) * .5 * canvasRect.width;
      var screenY = canvasRect.top + (1 - point.y) * .5 * canvasRect.height;
      plate.style.left = Math.round(screenX) + 'px';
      plate.style.top = Math.round(screenY) + 'px';
      plate.style.setProperty('--event-plate-tail-shift','0px');
      depthOrder.push({plate:plate,distance:distance,index:index,speaker:R.speaker === agent.id,target:R.target === agent.id});

      if(plate.classList.contains('has-speech')){
        var bubble = plate.querySelector('.event-agent-speech');
        var bubbleWidth = bubble.offsetWidth || Math.min(330,innerWidth - 24);
        var margin = innerWidth <= 620 ? 12 : 18;
        var half = bubbleWidth * .5;
        var shift = 0;
        if(screenX - half < margin) shift = margin - (screenX - half);
        else if(screenX + half > innerWidth - margin) shift = innerWidth - margin - (screenX + half);
        plate.style.setProperty('--event-bubble-shift',Math.round(shift) + 'px');
        var question = byId('eventRoundQuestion');
        var questionBottom = question.classList.contains('on') ? question.getBoundingClientRect().bottom : 0;
        var plateTop = plate.getBoundingClientRect().top;
        var bubbleHeight = bubble.offsetHeight || 84;
        plate.classList.toggle('bubble-below',plateTop - bubbleHeight - 14 < questionBottom + 10);
      } else {
        plate.style.setProperty('--event-bubble-shift','0px');
        plate.classList.remove('bubble-below');
      }
    });

    depthOrder.sort(function(a,b){ return b.distance - a.distance || a.index - b.index; });
    depthOrder.forEach(function(item,index){
      item.plate.style.zIndex = String(item.speaker ? 70 : (item.target ? 60 : 20 + index));
    });
  }

  addEventListener('beforeunload',function(){
    if(channel) channel.close();
    if(stage.video) stage.video.pause();
  });
})();
