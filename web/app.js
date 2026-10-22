import { FilesetResolver, GestureRecognizer } from './vendor/mediapipe/vision_bundle.mjs';
import { coverView, mountStage, unmountStage, setCoverHand, setCoverPointer, tapCairn, preloadKit, setKitOpen, setTodayReceived, setBuddyCheck, resetBuddy, setBalanceReady, onBalanceCommit, resetBalance, commitBalance, bumpToday, relayGrab, onRelayPlaced, resetRelay, setMineRecords, setFistMode, balanceFist, relayRelease } from './cover.js?v=20261022-ar3';

const app = document.querySelector('#app');
const camera = document.querySelector('#camera');
const handCursor = document.querySelector('#handCursor');
const handCursor2 = document.querySelector('#handCursor2');

const ROUTE = [
  ['申','신청'],['到','도착·키트'],['受','기록 받기'],['共','버디 판단'],
  ['海','잠수·기록'],['確','확인·선별'],['繼','전달']
];

const RECORDS = [
  {id:'plastic',kind:'수거',title:'플라스틱 용기 1개',meta:'B-1 · 11:36 · 버디 확인',glyph:'○'},
  {id:'net',kind:'위치',title:'부착 그물 · 건드리지 않음',meta:'C-2 · 수심 5.2m',glyph:'⌖'},
  {id:'visibility',kind:'바다',title:'시야 6m → 2m 저하',meta:'11:45 · B구역',glyph:'≈'},
  {id:'route',kind:'판단',title:'얕은 B구역으로 경로 변경',meta:'조류 강화 · 버디 합의',glyph:'↝'},
  {id:'return',kind:'판단',title:'시야 저하로 활동 종료',meta:'11:47 · 안전요원 공유',glyph:'↑'},
  {id:'time',kind:'활동',title:'잠수 기록 18분',meta:'최대 수심 5.2m',glyph:'◷'}
];

const state = {
  stage:0, mode:'mouse', cameraReady:false, modelReady:false, cameraError:'', handStatus:'loading', buddy:{you:false,buddy:false}, dive:{scene:0,phase:'scan',records:[],dwell:0,found:0,cross:0,side:''},
  coverProgress:.04, coverTarget:.04, coverLevel:0,
  hands:0, gesture:'', pointer:{x:0,y:0}, dwellTarget:null, dwellStart:0,
  decision:'', traces:new Set(), selected:new Set(), forged:false,
  recovery:{active:false,crossings:0,lastSide:'',deadline:0,target:10,duration:5000},
  handoff:{dragging:false,progress:0},
  archive:Number(localStorage.getItem('breathlineRelayArchive') || 18), toast:'', busy:false,
};

let recognizer = null;
let animationFrame = 0;
let lastVideoTime = -1;
let buddyStart = 0;
let recoveryTimer = 0;

function routebar(){
  const steps = ROUTE.map(([icon,label],i)=>`<button class="route-step gesture-target ${i===state.stage?'active':i<state.stage?'done':''}" data-action="goto" data-step="${i+1}" data-dwell="1000"><i>${i<state.stage?'✓':icon}</i><span>${label}</span></button>`).join('');
  const cameraText = state.mode==='camera'
    ? (state.cameraReady?`<b>손 ${state.hands}개 인식</b><br>${state.gesture||'움직임 인식 중'}`:`웹캠 ${state.modelReady?'준비':'로딩 중'}`)
    : '<b>마우스 체험</b><br>클릭으로 손동작 대체';
  return `<header class="routebar"><div class="brand">BREATHLINE<small>RELAY EXHIBITION PROTOTYPE</small></div><nav class="route" aria-label="캠페인 과정">${steps}</nav><div class="system-status">${cameraText}</div></header>`;
}

function cairn(newStone=false){
  const visible=Math.min(13,state.archive);
  const stones=Array.from({length:visible},(_,i)=>{
    const widths=[72,84,63,92,76,58,87,68];
    const w=widths[i%widths.length];
    return `<div class="cairn-stone ${newStone&&i===visible-1?'new':''}" style="width:${w}%">${i%4===0?'TRACE':''}</div>`;
  }).join('');
  return `<aside class="archive"><div class="archive-label">BEFORE YOU DIVE · FIELD ARCHIVE</div><div class="archive-count">${state.archive}<small> 누적 기록</small></div><div class="cairn">${stones}</div><div class="waiting-trace">● 다음 참가자의 TODAY로</div></aside>`;
}

function instruction(icon,title,sub){return `<div class="instruction"><div class="instruction-icon">${icon}</div><div><b>${title}</b><span>${sub}</span></div></div>`;}
function action(label,sub,action,extra=''){return `<button class="action gesture-target ${extra}" data-action="${action}"><strong>${label}</strong>${sub?`<small>${sub}</small>`:''}<span class="dwell"></span></button>`;}
function bg(src,contain=false){return `<img class="scene-bg ${contain?'contain':''}" src="assets/${src}" alt="">`}
function shell(main,{instructionHtml='',newStone=false}={}){return `<section class="experience">${routebar()}<div class="scene"><div class="scene-main">${main}</div>${cairn(newStone)}</div>${instructionHtml}${state.toast?`<div class="toast">${state.toast}</div>`:''}</section>`;}

function intro(){
  return coverView({archive:state.archive,toast:state.toast,hand:coverHandState()});
}

// ---- 밝은 무대 페이지 공통 (표지와 같은 톤) ----
// 화면 단계 → 캠페인 7단계 (04 버디 확인과 05 경로 판단은 같은 '버디 판단' 단계)
const STAGE_TO_STEP={1:1,2:2,3:3,4:4,5:4,6:5,7:6,8:7,9:7};
function lightTop(){
  const steps=ROUTE.map(([,label],i)=>{
    const idx=i+1, cur=STAGE_TO_STEP[state.stage]??state.stage, cls=idx===cur?'now':idx<cur?'done':'';
    return `<li class="${cls}"><button class="lp-step gesture-target" data-action="goto" data-step="${idx}" data-dwell="1000"><span>${String(idx).padStart(2,'0')}</span>${label}<i class="dwell"></i></button></li>`;
  }).join('');
  const input=state.mode==='camera'&&state.cameraReady?(state.hands?'손 인식 중':'손을 보여주세요'):'마우스 조작';
  return `<header class="lp-top"><div class="lp-nav"><button class="lp-back gesture-target" data-action="back" aria-label="이전 화면으로"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H5M11 5l-7 7 7 7"/></svg><span class="dwell"></span></button><button class="lp-back lp-home gesture-target" data-action="home" aria-label="처음 화면으로"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5M6.5 9.5V19h11V9.5"/></svg><span class="dwell"></span></button></div><ol class="lp-route" aria-label="캠페인 과정">${steps}</ol><div class="lp-meta"><span data-input-status>${input}</span><span>누적 기록 <b>${String(state.archive).padStart(3,'0')}</b></span></div></header>`;
}
function lightHint(title,sub){return `<p class="lp-hint"><i></i><span><b>${title}</b><small>${sub}</small></span></p>`;}
function lightShell(cls,main,hint){
  return `<section class="light-page ${cls}${state.toast?' has-toast':''}"><div class="lp-canvas" data-stage3d></div>${lightTop()}${main}${hint}<p class="lp-cairn-caption" data-cairn-caption>이전 참가자들의 기록이 쌓인 돌탑</p>${state.toast?`<div class="lp-toast">${state.toast}</div>`:''}</section>`;
}

function application(){
  // 2026년 7월 — 1일이 수요일
  const lead=3, days=31, live=12;
  const cells=[...Array(lead).fill(''),...Array.from({length:days},(_,i)=>i+1)];
  const dates=cells.map(d=>!d?'<span class="cal-empty"></span>':d===live
    ?`<button class="cal-day live gesture-target" data-action="application-confirm" aria-label="7월 12일 신청"><em>${d}</em><small>모집 중</small></button>`
    :`<span class="cal-day${d<live?' past':''}">${d}</span>`).join('');
  const main=`<div class="apply">
    <h2 class="lp-title">캠페인에 신청하고<br>현장으로 향합니다.</h2>
    <div class="cal">
      <div class="cal-head"><b>2026. 07</b><span>문섬 서측 · 수중 플로깅</span></div>
      <div class="cal-week"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>
      <div class="cal-grid">${dates}</div>
    </div>
    <button class="apply-pick gesture-target" data-action="application-confirm">
      <span class="pick-body"><b>7월 12일 일요일 · 문섬 서측</b><small>08:30 집결 · 버디 2인 1조로 활동합니다</small></span>
      <span class="pick-state"><span class="pick-go">신청</span><span class="pick-done">신청 완료</span></span>
      <span class="dwell"></span>
    </button>
  </div>`;
  const hint=state.mode==='camera'
    ?lightHint(state.mode==='camera'?'손을 12일 위에 대고 주먹을 쥐어 신청하세요':'12일을 눌러 신청하세요','개인정보 입력이나 결제는 없는 체험입니다')
    :lightHint('12일을 눌러 신청하세요','개인정보 입력이나 결제는 없는 체험입니다');
  return lightShell('page-apply',main,hint);
}

// 02 제품 정보 — 장비 브리프(breathline_equipment_concepts/equipment_system_brief.md) 기준
const KIT_INFO=[
  ['FIELD KIT','캠페인 참여자에게 제공되는 하나의 장비 세트. 육상 준비부터 수중 활동, 기록까지 필요한 제품을 담았다.'],
  ['EMERGENCY INFO TAG','참가자 번호와 비상 연락 정보를 담아, 긴급 상황에서 운영자가 필요한 정보를 확인할 수 있게 한다.'],
  ['OUT-OF-WATER WEAR','입수 전·후와 육상 프로그램에서 입는 단체 의상. 옛 해녀 잠수복의 감싸는 구조를 현대적으로 재해석했다.'],
  ['WETSUIT','수중 활동 중 체온을 보호하고 움직임을 돕는 잠수복.'],
  ['WANGNUN TRACE','수중 관찰과 수거 대상, 중요한 장면의 위치를 기록하는 고글. 기록은 앱에서 다시 확인하고 수정할 수 있다.'],
  ['DIVING FINS','물속에서 적은 움직임으로 이동할 수 있도록 돕는 프리다이빙 장비.'],
  ['WEIGHT BELT','입수 전 운영자와 무게를 확인해 착용하는 장비. 같은 버디끼리 동일한 색을 사용해 서로를 식별한다.'],
  ['TEWAK FLOAT','버디가 수면에서 잡고 쉬는 부력 장비. 위치를 알리고, 아래 수거망에 허용된 수거물을 임시 보관한다.'],
];

function arrival(){
  const open=state.kitOpen, arrived=state.kitArrived;
  // 제품 칸: 평소엔 이름만, 손이나 마우스를 대면 설명이 펼쳐진다
  const labels=KIT_INFO.map(([name,desc],i)=>`<div class="kit-cell gesture-target" data-dwell="9999999" data-kit-cell="${i}" style="--i:${i}"><div class="kit-name"><b><span>${String(i+1).padStart(2,'0')}</span>${name}</b><p>${desc}</p></div></div>`).join('');
  const main=`${arrived?'':'<video class="kit-video" src="assets/kit/munseom_arrival.mp4" autoplay muted playsinline data-kit-video></video>'}
  <video class="kit-video-card" src="assets/kit/munseom_arrival.mp4" autoplay muted loop playsinline aria-hidden="true"></video>
  <div class="kit-arrive-caption"><span>08:30</span>문섬 서측에 도착했습니다</div>
  <div class="kit-copy">
    <h2 class="lp-title">현장에 도착해<br>FIELD KIT를 받습니다.</h2>
    <p class="kit-video-caption">문섬 서측 · 집결지</p>
    <button class="lp-next gesture-target" data-action="receive-kit"><span><b>이전 참가자의 기록 받기</b><small>받은 장비를 확인했다면 다음으로</small></span><span class="lp-next-arrow">→</span><span class="dwell"></span></button>
  </div>
  <button class="kit-core gesture-target" data-action="open-kit" data-kit-core aria-label="키트 가방 받기"></button>
  <p class="kit-bag-hint" data-kit-bag-hint><i></i>${state.mode==='camera'?'손을 가방에 대고 주먹을 쥐면 키트를 받습니다':'가방을 눌러 키트를 받으세요'}</p>
  ${labels}`;
  // 가방을 받기 전 안내는 가방 바로 아래에 붙는다(kit-bag-hint). 받은 뒤에만 아래 안내를 쓴다.
  const hint=open?lightHint(state.mode==='camera'?'제품에 손을 대면 설명이 나옵니다':'제품에 마우스를 올리면 설명이 나옵니다','단체 의상과 웻슈트는 사이즈에 맞춰 따로 지급됩니다'):'';
  return lightShell(`page-kit${arrived?' is-arrived':''}${open?' is-open':''}`,main,hint);
}

// 03 이전 참가자의 기록 받기 — TODAY 돌을 받으면 앱에 기록이 들어오고, 왼쪽에 기록이 한 줄씩 풀린다
const TRACE=[['장소','문섬 서측'],['관찰','밀물로 서쪽 조류 강화','1시간 전 기록'],['이전 판단','입수 위험, 조류 약화까지 대기']];
function receive(){
  const got=state.traceReceived;
  const rows=TRACE.map(([k,v,when],i)=>`<div class="trace-row" style="--i:${i}"><dt>${k}</dt><dd>${v}${when?`<time>${when}</time>`:''}</dd></div>`).join('');
  const main=`<div class="rec-copy">
    <h2 class="lp-title">먼저 다른 사람의<br>현장 기록을 받습니다.</h2>
    <div class="rec-received">
      <p class="rec-from">이전 참가자가 남긴 기록</p>
      <dl class="trace-rows">${rows}</dl>
      <p class="rec-note">기록은 명령이 아니라, 오늘의 조류·시야·버디 상태와 비교해 볼 참고 자료입니다.</p>
      <button class="lp-next rec-next gesture-target" data-action="accept-trace"><span><b>버디와 함께 확인하기</b><small>받은 기록을 들고 다음 단계로</small></span><span class="lp-next-arrow">→</span><span class="dwell"></span></button>
    </div>
  </div>
  <button class="today-core gesture-target" data-action="take-record" data-today-core aria-label="TODAY 돌에서 기록 받기"></button>
  <p class="kit-bag-hint today-hint" data-today-hint><i></i>${state.mode==='camera'?'손을 돌에 대고 주먹을 쥐면 이전 기록을 받습니다':'돌을 눌러 이전 기록을 받으세요'}</p>`;
  return lightShell(`page-receive is-arrived${got?' is-received':''}`,main,'');
}

// 기록을 받는 순간: 돌이 한 바퀴 돌고, 왼쪽에 기록이 풀린다. 화면은 다시 그리지 않는다.
function takeRecord(){
  if(state.traceReceived)return;
  state.traceReceived=true;tone(700);setTodayReceived(true);
  document.querySelector('.page-receive')?.classList.add('is-received');
}

// 04 버디 확인 — 03에서 받은 기록을 참고하되, 오늘의 상태는 버디와 새로 확인한다
const BUDDY_LIST={
  you:['YOU','내 상태 알리기',['호흡·귀·추위·피로 상태를 버디에게 말하기','웻슈트·고글·오리발 착용 상태 확인하기']],
  buddy:['BUDDY','서로의 준비 확인하기',['버디의 상태를 듣고 조류·시야 함께 살피기','납벨트 색·버클·해제 방향 서로 확인하기']],
};
function buddy(){
  const b=state.buddy;
  const list=side=>{const [tag,title,items]=BUDDY_LIST[side];
    return `<div class="hand-list${b[side]?' checked':''}" data-hand-list="${side}"><p class="hand-tag"><b>${tag}</b>${title}</p><ul>${items.map(t=>`<li>${t}</li>`).join('')}</ul></div>`;};
  const main=`<div class="bud-copy">
    <h2 class="lp-title">이전 기록을 읽고,<br>우리 팀의 준비를 확인합니다.</h2>
    <div class="bud-ref">
      <p class="bud-ref-label">이전 참가자의 기록 · 1시간 전</p>
      <p class="bud-ref-text">밀물로 서측 조류 강화<br>입수를 미루고 대기</p>
      <p class="bud-ref-lead">이 기록은 이전 참가자가 관찰한 상황과 당시의 판단입니다.</p>
    </div>
    <p class="bud-foot">오늘의 입수 여부는 이 기록만으로 정하지 않습니다.<br>나와 버디의 몸 상태와 장비를 확인한 뒤 함께 판단합니다.</p>
    <button class="lp-next bud-next gesture-target" data-action="buddy-next"><span><b>오늘의 경로 정하기</b><small>확인한 상태로 팀의 판단을 내립니다</small></span><span class="lp-next-arrow">→</span><span class="dwell"></span></button>
  </div>
  <button class="hand-target" data-action="check-you" data-hand-stone="you" aria-label="YOU 확인"></button>
  <button class="hand-target" data-action="check-buddy" data-hand-stone="buddy" aria-label="BUDDY 확인"></button>
  <p class="bud-hint" data-buddy-hint>${state.mode==='camera'?'두 손을 각각 돌 위에 대고<br>주먹을 쥐어 주세요':'두 돌을 차례로<br>눌러 확인하세요'}</p>
  ${list('you')}${list('buddy')}`;
  return lightShell(`page-buddy is-arrived${b.you?' you-ok':''}${b.buddy?' buddy-ok':''}${b.you&&b.buddy?' is-connected':''}`,main,'');
}

function checkBuddy(side){
  if(state.buddy[side])return;
  state.buddy[side]=true;tone(side==='you'?560:660);setBuddyCheck(side,true);
  const page=document.querySelector('.page-buddy');if(!page)return;
  page.classList.add(`${side}-ok`);
  page.querySelector(`[data-hand-list="${side}"]`)?.classList.add('checked');
  if(state.buddy.you&&state.buddy.buddy){setTimeout(()=>tone(880),350);page.classList.add('is-connected');}
}

// 두 손을 각각 추적해, 어느 손이든 돌 위에서 주먹을 쥐면 그 돌이 확인된다
const handDwell={you:0,buddy:0};
function updateBuddyHands(points,fists=[]){
  const over={you:-1,buddy:-1};
  points.forEach((pt,i)=>{const el=document.elementFromPoint(pt.x,pt.y)?.closest?.('[data-hand-stone]');if(el)over[el.dataset.handStone]=i;});
  [handCursor,handCursor2].forEach(c=>{c.style.setProperty('--cursor-progress',0);c.classList.remove('aim');});
  ['you','buddy'].forEach(side=>{
    const el=document.querySelector(`[data-hand-stone="${side}"]`);
    if(over[side]<0||state.buddy[side]){el?.classList.remove('gaze');return;}
    el?.classList.add('gaze');
    const cur=over[side]===0?handCursor:handCursor2;
    cur.style.setProperty('--cursor-progress',100);cur.classList.add('aim');
    if(fists[over[side]]){gripCursor(cur);checkBuddy(side);}
  });
}

// 05 경로 판단 — 1시간 전 기록과 '지금'의 바다를 나란히 보고, 팀의 경로를 정한다. 두 선택 모두 기록된다.
const ROUTES={
  'choose-safe':{code:'B',title:'동측 얕은 구역으로 경로 변경',sub:'조류가 약한 쪽에서 짧게 활동합니다',record:'동측 얕은 구역으로 경로 변경'},
  'choose-original':{code:'C',title:'서측 계획 유지, 조류 약화까지 대기',sub:'조류가 약해지면 버디와 다시 확인하고 입수합니다',record:'서측 대기 후 버디와 재확인'},
};
function decide(){
  const picked=state.decision;
  const end=(action,side,i)=>{const r=ROUTES[action];
    return `<button class="bal-end ${side}${picked===r.code?' picked':''}" data-action="${action}"><span class="opt-index">0${i}</span><b>${r.title.replace(', ',',<br>').replace('구역으로 ','구역으로<br>')}</b><em>팀 판단으로 기록</em></button>`;};
  // 화면 전체의 파도 영상 위에 검은 막 → 그 위 한가운데 저울. 모든 글은 가운데 축에 맞춘다.
  const main=`<div class="route-sea" data-route-sea>
      <video src="assets/route/west_waves.mp4" autoplay muted loop playsinline aria-hidden="true"></video>
    </div>
    <div class="route-ctx"><p class="k">지금 · 문섬 서측</p><h2>서측 조류가 여전히 강합니다.</h2></div>
    ${end('choose-safe','left',1)}${end('choose-original','right',2)}
    <div class="bal-hold" data-bal-hold><i></i><span>${state.mode==='camera'?'주먹을 쥐면 확정':'잠시 머물면 확정'}</span></div>
    <div class="route-ask"><h3>지금의 바다를 확인하고, 오늘 팀의 행동을 결정하세요.</h3><p class="how"><i><svg viewBox="0 0 34 12" aria-hidden="true"><path d="M5 1 1 6l4 5M29 1l4 5-4 5M1 6h32"/></svg>${state.mode==='camera'?'손을 좌우로':'마우스를 좌우로'}</i>기울이고, ${state.mode==='camera'?'한쪽에서 주먹을 쥐어':'한쪽에 잠시 머물러'} 확정하세요.</p></div>`;
  return lightShell(`page-route${state.routeIntroDone?' is-band':''}${picked?' is-picked':''}`,main,'');
}

// 들어오면 파도 영상을 화면 가득 보여주다가, 2.5초 뒤 위쪽 띠로 올라가며 판단 영역이 드러난다
function bindRoute(){
  if(state.routeIntroDone)return;
  // 거친 파도를 2.5초 먼저 보여준 뒤 검은 막이 내려오고 저울이 올라온다
  setTimeout(()=>{if(state.stage!==5)return;state.routeIntroDone=true;document.querySelector('.page-route')?.classList.add('is-band');setTimeout(()=>{if(state.stage===5)setBalanceReady(true);},500);},2500);
}
function chooseRoute(action){
  if(state.decision||state.busy)return;
  const r=ROUTES[action];state.decision=r.code;state.busy=true;
  RECORDS.find(x=>x.id==='route').title=r.record;tone(660);
  const page=document.querySelector('.page-route');page?.classList.add('is-picked');
  page?.querySelector(`[data-action="${action}"]`)?.classList.add('picked');
  page?.classList.add('is-picked');
  setTimeout(()=>{state.busy=false;next(6);},1500);
}

// 06 잠수·기록 — 세 대상을 한 번에 보여주지 않고, 바다를 지나가며 하나씩 만난다.
// 대상마다 손동작과 남는 기록이 다르다: 수거(좌우로 당기기) / 위치만(다가가지 않고 머물기) / 환경·판단(손을 위로 = 복귀 신호)
const DIVE_SCENES=[
  {id:'plastic',bg:'video',find:[.5,.49],label:'떨어져 있는 플라스틱',kind:'수거 기록'},
  {id:'net',bg:'assets/dive/net_rock_with_net.png',find:[.54,.52],label:'바위에 붙은 그물',kind:'위치 기록'},
  {id:'visibility',bg:'assets/dive/net_rock_only.png',find:null,label:'시야 변화',kind:'환경·판단 기록'},
];
function diveRecordsHtml(){
  return state.dive.records.map(r=>`<li class="drec ${r.type}"><span>${r.kind}</span><b>${r.title}</b><small>${r.meta}</small></li>`).join('');
}
function dive(){
  const d=state.dive, sc=DIVE_SCENES[d.scene];
  const routeText=state.decision==='C'?'서측 · 조류 약화 후 입수':'동측 얕은 구역';
  const bg=sc.bg==='video'
    ?`<video class="dive-bg" src="assets/dive/pet_pickup.mp4" autoplay muted loop playsinline aria-hidden="true"></video>`
    :`<img class="dive-bg" src="${sc.bg}" alt="">`;
  const main=`<div class="dive-stage scene-${sc.id} phase-${d.phase}" data-dive-stage style="--fx:${sc.find?sc.find[0]*100:50}%;--fy:${sc.find?sc.find[1]*100:50}%">
      ${bg}
      <div class="dive-haze"></div>
      <div class="dive-dark" data-dive-dark></div>
      <div class="dive-find" data-dive-find><i></i><span data-dive-find-label>${sc.label}</span></div>
      <div class="dive-zone" data-dive-zone><i></i></div>
      <div class="dive-pull" data-dive-pull>
        <div class="pull-target l" data-pull-target="l"><i class="ring"></i><img src="assets/dive/hand_stone.png" alt=""><span class="chev">‹</span></div>
        <div class="pull-target r" data-pull-target="r"><i class="ring"></i><img src="assets/dive/hand_stone.png" alt=""><span class="chev">›</span></div>
      </div>
      ${sc.id==='plastic'?`<div class="ar-target" data-ar-target>
        <i class="c tl"></i><i class="c tr"></i><i class="c bl"></i><i class="c br"></i>
        <div class="ar-tag"><span class="ar-icon"><svg viewBox="0 0 24 34" aria-hidden="true"><path d="M9 1h6v4H9zM8 5l-4 6v21h16V11l-4-6M4 17h16M4 21h16M4 25h16"/></svg></span><span class="ar-tag-body"><b>페트병 추정 <em data-ar-plus></em></b><small data-ar-state>인식 중</small></span></div>
      </div>`:''}
      ${sc.id==='net'?`<div class="net-holo-wrap" data-net-holo><i class="net-holo"></i></div><i class="net-scan"></i>
      <div class="ar-target net-anchor" data-ar-target>
        <div class="ar-tag"><span class="ar-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M9 3l12 12M15 3l6 6M3 9l12 12M3 15l6 6M21 3L3 21M15 3L3 15M9 3L3 9M21 9L9 21M21 15l-6 6"/></svg></span><span class="ar-tag-body"><b>폐어망 추정</b><small data-ar-state>인식 중</small></span></div>
      </div>
      <button class="net-pin gesture-target" data-action="net-mark" data-dwell="1200" aria-label="그물 위치 표시"><i class="pin-fill"></i><svg viewBox="0 0 76 100" aria-hidden="true"><path d="M38 97C38 97 5 60 5 36A33 33 0 1 1 71 36C71 60 38 97 38 97Z"/></svg><b>MARK</b></button>
      <p class="net-coord" data-net-coord>33°13′N 126°34′E<br>DEPTH 5.2m</p>`:''}
      <button class="dive-up" data-action="dive-up" data-dive-up><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V5M5 11l7-7 7 7"/></svg><b>버디와 수면으로 복귀</b><small>${state.mode==='camera'?'손을 위로 올려 잠시 머무르세요':'여기를 누르세요'}</small><span class="dwell"></span></button>
      <div class="dive-vis" data-dive-vis><span>시야</span><b data-vis-num>6m</b></div>
    </div>
    <div class="ar-hud" aria-hidden="true">
      <div class="ar-left"><p><span>DEPTH</span><b data-ar-depth>4.8<small>m</small></b></p><p><span>DIVE TIME</span><b data-ar-time>00:00</b></p><p><span>TEMP</span><b>23.5<small>°C</small></b></p><p class="ar-route"><span>ROUTE</span><em>${routeText}</em></p></div>
      <div class="ar-compass"><span>NW</span><i></i><i></i><i></i><b>N</b><i></i><i></i><i></i><span>NE</span></div>
      <div class="ar-right"><p class="ar-count"><span>COLLECTED</span><b data-ar-collected>${String(state.dive.records.filter(r=>r.type==='collect'&&r.title!=='수거 보류').length).padStart(2,'0')}</b></p><p class="ar-buddy" data-ar-buddy-row><span>BUDDY</span><em><i></i>SOJIN <b data-ar-buddy>2m</b></em></p></div>
    </div>
    <button class="dive-start dive-start-pull gesture-target" data-action="dive-pull-start" data-dwell="1200" aria-label="좌우로 당기기 시작"><i class="palm-fill"></i><svg class="palm-line" viewBox="27 22 113 159" aria-hidden="true"><path d="M127.8,167.8c-6,6.2-14.4,8.9-22.9,10s-12.4,1-18.7.5c-11.5-.8-22.2-4.6-30.7-12.5s-6-6.4-8.3-10.3-5.2-10.1-6.9-15.6c-3.6-11.7-6.8-23.3-9.7-35.1c-.7-2.9.8-12.4,5-12.4c3.4,0,4.3,3.8,6.6,8.6c1.9,4,3.4,8,4.9,12.1l5.1,14,1.6,1.2h4c-.4-27.2-.3-54.2.8-81.5c0-3,2.2-6.2,5.4-7.3s4-.7,5.9,0,4.7,3.3,4.6,6.2l-.4,53c0,1.6,1.1,2.9,2.7,3s3-1,3-2.6l.4-68.5c0-2.5,1.2-4.5,3.4-5.6s6.4-1.4,9.2,0,3.4,2.9,3.4,5.2l.6,24.8.4,43.8c0,1.8,1.7,3.1,3.4,2.8s2.3-1.6,2.3-3.1l-.4-37.9-.7-24.2c0-2.4,1.2-4.5,3.3-5.6,3-1.7,6.7-1.3,9.5.7s3.2,3.7,3.3,6.3c1,20.3,1.4,40.6,1.5,60.9,0,1.4.7,2.5,2,2.9s3-.8,2.9-2.3l-.5-42c0-2.8,1.8-5.3,4.3-6.2s6.4.3,8.2,2.9,1.8,3.3,1.8,5.2v75.4c0,4.5-.4,8.9-1.2,13.4-1.3,7.2-4,14.4-9.1,19.7Z"/></svg><b>START</b></button>
    <div class="dive-guide"><b data-dive-title></b><small data-dive-sub></small><button class="dive-start vis-thumb gesture-target" data-action="dive-up" data-dwell="1200" aria-label="버디에게 상승 신호"><i class="palm-fill"></i><svg class="palm-line" viewBox="88 60 221 310" aria-hidden="true"><path d="M288.6,223.8c3.7,1.7,6.9,4.2,9.2,7.6,4.3,6.5,4.1,15.2.8,22.2-3,6.5-8.3,11.6-14.2,15.5,3.7,1.7,6.9,4.2,9.2,7.6,4.3,6.5,4.1,15.2.8,22.2-2.9,6.2-7.8,11.1-13.4,15,3.7,1.5,6.8,3.7,9,7,3.6,5.5,3.3,12.8.7,18.8-6.1,14.1-25.9,26.7-70.1,26.7h-72c-16,0-33.3-5.9-47.2-17.1-6-4.9-9.5-12.2-9.5-19.9v-122.6c0-7.2,3.1-14,8.3-18.9,16.3-15.1,27.7-39.6,33.8-60,8.7-29-7.8-57.8,16.5-63.5,24.3-5.7,36.1,15.5,40.6,28.4,10.3,29.5,7.4,63.3-7.5,90.7,35.5-7.5,54.4-9.2,87.7-9.2c13,0,24.3,2.2,30.6,11.6c4.3,6.5,4.1,15.2.8,22.2-3,6.5-8.3,11.6-14.2,15.5Z"/></svg><b>UP</b></button><p class="pull-stats"><span>남은 시간</span><b data-pull-time>6.0</b><span>초</span><i></i><b data-pull-count>0 / 5</b><span>왕복</span></p></div>
    <ol class="dive-records" data-dive-records>${diveRecordsHtml()}</ol>`;
  return lightShell('page-dive',main,'');
}

// 장면 진행 — 화면을 다시 그리지 않고 클래스·글만 바꾼다
const DIVE_TEXT={
  plastic:{scan:['손으로 바다를 비춰 보세요','바다 속에서 무엇이 있는지 먼저 찾습니다'],ready:['페트병을 찾았습니다','집게로 잡아 좌우로 흔들어 떼어냅니다'],found:['집게로 잡고 좌우로 빠르게 당기세요',''],done:['',''],stop:['버디와 확인하고 안전하게 중단했습니다','무리해서 회수하지 않는 것도 기록입니다']},
  net:{scan:['조금 더 나아가 바위 쪽을 비춰 보세요','무언가 바위에 걸려 있습니다'],found:['그물은 떼지 않습니다','생물과 엉켜 있어요. 위치만 표시해 두세요'],done:['','']},
  visibility:{watch:['시야가 흐려지고 있습니다','버디와의 거리가 멀어지고 있어요'],found:['버디에게 상승 신호를 보내세요','엄지를 위로 들어 올리세요'],done:['버디와 함께 천천히 상승합니다','']},
};
function diveEl(q){return document.querySelector(q);}
// 06에서도 상단 진도·시작 버튼은 일반 dwell 선택으로 처리
function diveTargets(x,y){
  if(document.elementFromPoint(x,y)?.closest?.('.gesture-target'))handlePointer(x,y);
  else if(state.dwellTarget)clearDwell();
}
function setDiveText(key){
  const sc=DIVE_SCENES[state.dive.scene],t=DIVE_TEXT[sc.id][key];if(!t)return;
  const tt=diveEl('[data-dive-title]'),ss=diveEl('[data-dive-sub]');if(tt)tt.textContent=t[0];if(ss)ss.textContent=t[1];
}
function setDivePhase(phase){
  state.dive.phase=phase;state.dive.phaseAt=performance.now();
  const st=diveEl('[data-dive-stage]');if(st)st.className=st.className.replace(/phase-\S+/,`phase-${phase}`);
  document.querySelector('.page-dive')?.classList.toggle('is-pulling',phase==='pull');
  document.querySelector('.page-dive')?.classList.toggle('is-ready',phase==='ready');
  document.querySelector('.page-dive')?.classList.toggle('is-signal',phase==='signal');
  document.querySelector('.page-dive')?.classList.toggle('is-done',phase==='done'&&['plastic','net'].includes(DIVE_SCENES[state.dive.scene].id));
  setDiveText(phase==='ready'?'ready':phase==='pull'?'found':phase==='keep'?'found':phase==='signal'?'found':phase);
}
function addDiveRecord(rec){
  state.dive.records.push(rec);
  const list=diveEl('[data-dive-records]');if(list)list.innerHTML=diveRecordsHtml();
  tone(rec.type==='collect'?760:rec.type==='place'?620:520);
}
function nextDiveScene(){
  state.dive.scene+=1;state.dive.phase=state.dive.scene===2?'watch':'scan';state.dive.dwell=0;state.dive.found=0;
  if(state.dive.scene>=DIVE_SCENES.length){next(7);return}
  render();
}
function startDive(){
  const d=state.dive;
  if(!d.startAt)d.startAt=performance.now();
  ensureNetMask().then(applyNetMask);
  const clock=()=>{if(state.stage!==6)return;const s=Math.floor((performance.now()-d.startAt)/1000);const el=diveEl('[data-ar-time]');if(el)el.textContent=`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;setTimeout(clock,250);};clock();
  setDiveText(d.phase==='pull'||d.phase==='keep'||d.phase==='signal'?'found':d.phase);
  if(DIVE_SCENES[d.scene].id==='visibility'&&d.phase==='watch')runVisibility();
  // 첫 장면에서 손(또는 마우스)이 들어오기 전엔 불빛을 화면 가운데 아래에 둔다
  diveMove(innerWidth*.5,innerHeight*.72,true);
}

// 손 위치로 모든 장면을 움직인다(마우스·손 공통)
function diveMove(x,y,silent){
  if(state.stage!==6)return;
  const d=state.dive, sc=DIVE_SCENES[d.scene], now=performance.now();
  const dark=diveEl('[data-dive-dark]');
  if(dark){dark.style.setProperty('--mx',`${x}px`);dark.style.setProperty('--my',`${y}px`);}
  if(silent)return;
  const fx=sc.find?sc.find[0]*innerWidth:0, fy=sc.find?sc.find[1]*innerHeight:0, dist=Math.hypot(x-fx,y-fy);
  // ① 비춰서 찾기: 불빛이 대상 위에 0.6초 머무르면 발견
  if(d.phase==='scan'&&sc.find){
    if(dist<170){d.found=d.found||now;if(now-d.found>600){setDivePhase(sc.id==='plastic'?'ready':'keep');tone(600);if(sc.id==='plastic')arRecognize();else if(sc.id==='net')netRecognize();}}
    else d.found=0;
    return;
  }
  // ② 플라스틱: 화면 왼쪽 ↔ 오른쪽을 오가는 횟수
  if(d.phase==='pull'){
    // 양옆 손모양 돌 중 켜진 쪽으로 손을 가져가면 반대쪽이 켜진다 — 한 번 오가면 1회
    const side=x<innerWidth*.4?'l':x>innerWidth*.6?'r':'';
    if(side&&side===d.want){d.cross+=1;d.want=side==='l'?'r':'l';tone(520+d.cross*30);
      setPullTarget(d.want);
      diveEl(`[data-pull-target="${side}"]`)?.classList.add('hit');setTimeout(()=>diveEl(`[data-pull-target="${side}"]`)?.classList.remove('hit'),350);
      const n=Math.floor(d.cross/2);const c=diveEl('[data-pull-count]');if(c)c.textContent=`${n} / 5`;
      diveEl('[data-dive-stage]')?.style.setProperty('--tug',side==='l'?-1:1);
      if(d.cross>=10)finishPull(true);}
    return;
  }
  // ③ 그물: 경계 안(가까이) = 건드리지 않기, 경계 바깥 가장자리에 머무르면 위치 핀
  if(d.phase==='keep'&&sc.id==='net')return; // 그물은 MARK 핀을 가리켜 머무르는 방식
  if(d.phase==='keep'){
    const st=diveEl('[data-dive-stage]');
    if(dist<150){st?.classList.add('too-near');setDiveText('near');d.dwell=0;return;}
    st?.classList.remove('too-near');
    if(dist<320){if(!d.dwell){d.dwell=now;setDiveText('found');}
      const p=Math.min(100,(now-d.dwell)/10);handCursor.style.setProperty('--cursor-progress',p);st?.style.setProperty('--pin',p/100);
      if(p>=100)placePin();}
    else{d.dwell=0;st?.style.setProperty('--pin',0);}
    return;
  }
  // ④ 시야: 엄지를 들어 버디에게 상승 신호
  if(d.phase==='signal'){
    // 손 트래킹: 엄지를 들면(Thumb Up) 아이콘이 차오른다. 마우스·포인터는 아이콘에 머무르기
    const btn=diveEl('.vis-thumb');if(!btn)return;
    if(state.gesture==='Thumb Up'){
      if(!d.dwell)d.dwell=now;const p=Math.min(100,(now-d.dwell)/9);btn.style.setProperty('--dwell',`${p}%`);btn.classList.add('gaze');
      if(p>=100)signalReturn();
    }else if(d.dwell){d.dwell=0;if(state.dwellTarget!==btn){btn.style.setProperty('--dwell','0%');btn.classList.remove('gaze');}}
  }
}

let pullTimer=0;
const PULL_MS=6000;
function setPullTarget(side){
  document.querySelectorAll('[data-pull-target]').forEach(el=>el.classList.toggle('on',el.dataset.pullTarget===side));
}
function startPull(){
  const d=state.dive;
  // 손이 있는 반대편부터 켠다
  const firstWant=(state.pointer.x||innerWidth/2)<innerWidth/2?'r':'l';
  Object.assign(d,{cross:0,side:'',want:firstWant,pullEnd:performance.now()+PULL_MS});
  setPullTarget(firstWant);
  clearTimeout(pullTimer);pullTimer=setTimeout(()=>{if(state.stage===6&&state.dive.phase==='pull')finishPull(false);},PULL_MS);
  const tick=()=>{if(state.stage!==6||state.dive.phase!=='pull')return;
    const left=Math.max(0,(state.dive.pullEnd-performance.now())/1000);const el=diveEl('[data-pull-time]');if(el)el.textContent=left.toFixed(1);
    requestAnimationFrame(tick);};
  requestAnimationFrame(tick);
}
// AR 고글: 대상을 인식하면 모서리 틀이 좁혀 들어오고 태그가 스르륵 나타난다
function arRecognize(){
  const t=diveEl('[data-ar-target]');if(!t)return;
  t.classList.add('on');
  // 인식하는 순간 영상은 마지막 프레임에 멈춘다
  const v=diveEl('.dive-bg');if(v&&v.tagName==='VIDEO'){v.loop=false;const stop=()=>{v.pause();v.currentTime=Math.max(0,(v.duration||5)-.05);};if(v.readyState>=1)stop();else v.addEventListener('loadedmetadata',stop,{once:true});}
  setTimeout(()=>{const s=diveEl('[data-ar-state]');if(s)s.textContent='픽업 감지 · 수거 대기';},500);
}
function finishPull(ok){
  clearTimeout(pullTimer);
  RECORDS.find(r=>r.id==='plastic').title=ok?'플라스틱 병 1개 수거':'플라스틱 수거 보류 · 버디 확인';
  addDiveRecord(ok?{type:'collect',kind:'수거 기록',title:'플라스틱 병 1개',meta:'떨어져 있던 폐기물 · 망에 보관'}:{type:'collect',kind:'수거 기록',title:'수거 보류',meta:'버디 확인 후 안전하게 중단'});
  setDivePhase(ok?'done':'stop');
  const plus=diveEl('[data-ar-plus]'),st=diveEl('[data-ar-state]'),col=diveEl('[data-ar-collected]');
  if(ok){
    // 게임 화면이 걷히고 HUD가 돌아온 뒤, COLLECTED가 눈앞에서 00 → 01로 넘어간다
    const total=String(state.dive.records.filter(r=>r.type==='collect'&&r.title!=='수거 보류').length).padStart(2,'0');
    if(st)st.textContent='픽업 감지 · 자동저장';
    setTimeout(()=>{if(state.stage===6&&col)countCollected(col,total,plus);},900);
    diveEl('[data-ar-target]')?.classList.add('saved');
  }
  else if(st)st.textContent='수거 보류 · 버디 확인';
  setTimeout(()=>{if(state.stage===6)nextDiveScene();},ok?4600:2400);
}
function countCollected(col,total,plus){
  const row=col.closest('p');row?.classList.add('counting');
  col.animate([{transform:'none',opacity:1},{transform:'translateY(-45%)',opacity:0}],{duration:380,easing:'cubic-bezier(.5,0,.8,.4)',fill:'forwards'}).onfinish=()=>{
    col.textContent=total;tone(760);
    if(plus){plus.textContent='+1';plus.animate([{transform:'translateY(60%) scale(.6)',opacity:0},{transform:'scale(1.5)',opacity:1,offset:.25,textShadow:'0 0 16px rgba(95,245,238,.9)'},{transform:'scale(1.5)',opacity:1,offset:.75,textShadow:'0 0 16px rgba(95,245,238,.9)'},{transform:'none',opacity:1}],{duration:1700,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});}
    col.animate([{transform:'translateY(45%) scale(1.35)',opacity:0},{transform:'scale(1.35)',opacity:1,offset:.25},{transform:'scale(1.35)',opacity:1,offset:.75},{transform:'none',opacity:1}],{duration:1700,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'});
    setTimeout(()=>row?.classList.remove('counting'),1900);
  };
}
function placePin(){
  const d=state.dive;if(d.phase!=='keep')return;
  handCursor.style.setProperty('--cursor-progress',0);clearDwell();
  addDiveRecord({type:'place',kind:'위치 기록',title:'바위에 붙은 그물',meta:'건드리지 않음 · 수심 5.2m'});
  setDivePhase('done');tone(620);
  const st=diveEl('[data-ar-state]');if(st)st.textContent='위치 기록 · 자동저장';
  setTimeout(()=>{if(state.stage===6)nextDiveScene();},4600);
}
// 그물: 두 사진(그물 있음/없음)의 차이로 그물 가닥만 뽑아 AR 홀로그램 마스크로 쓴다
const NET_POLY=[[690,210],[745,198],[850,250],[1000,345],[1150,475],[1200,600],[1310,700],[1500,780],[1650,900],[1705,1060],[1660,1150],[1550,1155],[1400,1085],[1250,935],[1150,905],[1050,850],[950,780],[880,700],[820,560],[760,440],[700,330],[680,260]].map(([u,v])=>[u*.96,v*.96]);
let netMaskUrl='',netMaskJob=null;
function ensureNetMask(){
  if(netMaskJob)return netMaskJob;
  const load=src=>new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=src;});
  netMaskJob=Promise.all([load('assets/dive/net_rock_with_net.png'),load('assets/dive/net_rock_only.png')]).then(([a,b])=>{
    const W=1920,H=1080,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d',{willReadFrequently:true});
    x.beginPath();NET_POLY.forEach(([u,v],i)=>i?x.lineTo(u,v):x.moveTo(u,v));x.closePath();x.filter='blur(24px)';x.fillStyle='#fff';x.fill();x.filter='none';
    const M=x.getImageData(0,0,W,H).data;x.clearRect(0,0,W,H);
    x.drawImage(a,0,0);const A=x.getImageData(0,0,W,H).data;x.drawImage(b,0,0);const B=x.getImageData(0,0,W,H).data;
    const out=x.createImageData(W,H),o=out.data;
    for(let i=0;i<A.length;i+=4){
      if(!M[i])continue;
      const la=A[i]*.3+A[i+1]*.59+A[i+2]*.11,lb=B[i]*.3+B[i+1]*.59+B[i+2]*.11;
      const mx=Math.max(A[i],A[i+1],A[i+2]),mn=Math.min(A[i],A[i+1],A[i+2]),sat=mx?(mx-mn)/mx:0;
      const v=(la-lb-20)*6*(1-Math.max(0,sat-.25)*2.2)*(M[i]/255);
      if(v>60){o[i]=o[i+1]=o[i+2]=255;o[i+3]=Math.min(255,(v-60)*1.4);}
    }
    x.putImageData(out,0,0);netMaskUrl=c.toDataURL('image/png');applyNetMask();
  }).catch(()=>{});
  return netMaskJob;
}
function applyNetMask(){
  const h=diveEl('.net-holo');if(!h||!netMaskUrl)return;
  h.style.webkitMaskImage=h.style.maskImage=`url(${netMaskUrl})`;
}
function netRecognize(){
  const t=diveEl('[data-ar-target]');if(t)t.classList.add('on');
  diveEl('[data-dive-stage]')?.classList.add('net-found');
  setTimeout(()=>{const s=diveEl('[data-ar-state]');if(s)s.textContent='생물 부착 · 수거 금지';},700);
}
function runVisibility(){
  // 4초 동안 시야 6m → 2m, 버디 거리 2m → 4m
  const st=diveEl('[data-dive-stage]'),num=diveEl('[data-vis-num]'),bud=diveEl('[data-ar-buddy]'),t0=performance.now();
  diveEl('[data-ar-buddy-row]')?.classList.add('warn');
  const step=()=>{if(state.stage!==6||state.dive.phase!=='watch')return;
    const k=Math.min(1,(performance.now()-t0)/4000);st?.style.setProperty('--murk',k.toFixed(3));
    if(num)num.textContent=Math.round(6-4*k);if(bud)bud.textContent=`${Math.round(2+2*k)}m`;
    if(k<1)requestAnimationFrame(step);else setTimeout(()=>{if(state.dive.phase==='watch')setDivePhase('signal');},600);};
  requestAnimationFrame(step);
}
function signalReturn(){
  const d=state.dive;if(d.phase!=='signal')return;
  handCursor.style.setProperty('--cursor-progress',0);clearDwell();tone(700);
  addDiveRecord({type:'judge',kind:'환경·판단 기록',title:'가시거리 6m → 2m · 복귀',meta:'버디와 함께 활동 종료'});
  setDivePhase('done');
  // 버디가 다가오고(4m → 1m), 함께 상승하며 수심이 0으로, 물이 맑아지고 밝아진다
  const st=diveEl('[data-dive-stage]'),dep=diveEl('[data-ar-depth]'),bud=diveEl('[data-ar-buddy]'),t0=performance.now();
  diveEl('[data-ar-buddy-row]')?.classList.remove('warn');st?.classList.add('ascend');
  const step=()=>{if(state.stage!==6)return;
    const k=Math.min(1,(performance.now()-t0)/4200),e=k*k*(3-2*k);
    if(bud)bud.textContent=`${Math.max(1,Math.round(4-3*Math.min(1,k*2.5)))}m`;
    if(dep)dep.innerHTML=`${(4.8*(1-e)).toFixed(1)}<small>m</small>`;
    st?.style.setProperty('--murk',(1-e).toFixed(3));st?.style.setProperty('--rise',e.toFixed(3));
    if(k<1)requestAnimationFrame(step);else setTimeout(()=>{if(state.stage===6)nextDiveScene();},900);};
  requestAnimationFrame(step);
}
// 06 확인·선별 — 03과 짝: 03은 이전 사람의 돌에서 기록을 받고, 06은 내 기록을 골라 다음 사람의 돌에 남긴다
// 기록마다 돌에 새겨질 문양 (assets/record/icons/icon-XX.svg)
const REC_MOTIF={plastic:'08',net:'04',visibility:'11',route:'05',return:'06',time:'07'};
// 돌 형태: 고른 기록이 관찰(가시거리·위치·수심) 위주면 매끈한 돌, 행동·판단(수거·경로·상승) 위주면 숨구멍 많은 돌. 같으면 처음 고른 기록 기준
const REC_ACT=new Set(['plastic','route','return']);
function mineType(ids){
  const act=ids.filter(id=>REC_ACT.has(id)).length,obs=ids.length-act;
  return act>obs?1:obs>act?0:(REC_ACT.has(ids[0])?1:0);
}
function syncMine(){const ids=[...state.selected];setMineRecords(ids.map(id=>({id,icon:REC_MOTIF[id]})),mineType(ids));}
function reviewRecords(){
  const dv=state.dive.records;
  const got=dv.find(r=>r.type==='collect');
  const route=state.decision==='C'?'서측 조류 약화 후 입수':'동측 얕은 구역으로 경로 변경';
  return [
    {id:'plastic',kind:'수거',title:got&&got.title==='수거 보류'?'플라스틱 수거 보류':'플라스틱 병 1개 수거',meta:got&&got.title==='수거 보류'?'버디 확인 후 안전하게 중단':'떨어져 있던 폐기물 · 망에 보관'},
    {id:'net',kind:'위치',title:'바위에 엉킨 폐어망',meta:'33°13′N 126°34′E · 수심 5.2m · 건드리지 않음'},
    {id:'visibility',kind:'바다',title:'가시거리 6m → 2m',meta:'버디와의 거리 4m까지 멀어짐'},
    {id:'route',kind:'판단',title:route,meta:'서측 조류 강함 · 팀 판단'},
    {id:'return',kind:'판단',title:'시야 저하로 함께 상승',meta:'엄지 신호로 버디와 합의'},
    {id:'time',kind:'활동',title:'최대 수심 4.8m',meta:'버디 SOJIN과 함께'},
  ];
}
function review(){
  const recs=reviewRecords(),n=state.selected.size;
  const rows=recs.map((r,i)=>`<button class="rv-row gesture-target${state.selected.has(r.id)?' on':''}" data-action="select-record" data-id="${r.id}" data-dwell="900" style="--i:${i}"><i class="rv-check"></i><i class="rv-motif" style="--m:url(assets/record/icons/icon-${REC_MOTIF[r.id]}.svg)"></i><span class="rv-kind">${r.kind}</span><span class="rv-body"><b>${r.title}</b><small>${r.meta}</small></span><span class="dwell"></span></button>`).join('');
  const main=`<div class="rec-copy rv-copy">
    <h2 class="lp-title">다음 팀에게 남길<br>기록을 고릅니다.</h2>
    <div class="rv-list">
      <p class="rv-head"><span>오늘 잠수에서 남은 기록</span><span><b data-rv-count>${n}</b> / 4</span></p>
      <div class="rv-rows">${rows}</div>
      <button class="lp-next rv-next gesture-target${n?' ready':''}" data-action="forge"><span><b>고른 기록을 돌에 새기기</b><small>다음 참가자가 판단에 쓸 것만 최대 4개</small></span><span class="lp-next-arrow">→</span><span class="dwell"></span></button>
    </div>
  </div>
  <p class="kit-bag-hint today-hint rv-stone-hint" data-today-hint><i></i><span data-rv-hint>${n?`${n}개의 기록이 이 돌에 새겨집니다`:'기록을 고르면 이 돌에 문양으로 새겨집니다'}</span></p>`;
  return lightShell('page-review is-arrived',main,'');
}
function toggleRecord(el){
  const id=el.dataset.id;
  if(state.selected.has(id)){state.selected.delete(id);bumpToday(-.5);}
  else if(state.selected.size<4){state.selected.add(id);bumpToday(1);}
  else{notifyInline('다음 팀에 남길 기록은 최대 4개입니다.');return}
  syncMine();
  tone(state.selected.has(id)?560:440);
  el.classList.toggle('on',state.selected.has(id));
  const n=state.selected.size,page=document.querySelector('.page-review');
  page?.querySelector('[data-rv-count]')&&(page.querySelector('[data-rv-count]').textContent=n);
  page?.querySelector('.rv-next')?.classList.toggle('ready',n>0);
  const h=page?.querySelector('[data-rv-hint]');if(h)h.textContent=n?`${n}개의 기록이 이 돌에 새겨집니다`:'기록을 고르면 이 돌에 문양으로 새겨집니다';
  page?.classList.toggle('is-full',n>=4);
}
// 다시 그리지 않고 잠깐 떴다 사라지는 알림
function notifyInline(text){
  const page=document.querySelector('.page-review');if(!page)return notify(text);
  let t=page.querySelector('.rv-toast');if(!t){t=document.createElement('p');t.className='rv-toast';page.appendChild(t);}
  t.textContent=text;t.classList.remove('show');void t.offsetWidth;t.classList.add('show');tone(300);
}

// 07 전달 — 내 돌을 잡아 돌탑 꼭대기에 올린다. 올린 돌은 다음 참가자의 TODAY가 된다
function pass(){
  const recs=reviewRecords().filter(r=>state.selected.has(r.id));
  const rows=recs.map((r,i)=>`<div class="trace-row rl-row" style="--i:${i}"><dt><i class="rv-motif" style="--m:url(assets/record/icons/icon-${REC_MOTIF[r.id]}.svg)"></i>${r.kind}</dt><dd>${r.title}</dd></div>`).join('');
  const main=`<div class="rec-copy rl-copy">
    <h2 class="lp-title">오늘의 기록을<br>돌탑 위에 올립니다.</h2>
    <div class="rl-list">
      <p class="rec-from">이 돌에 새긴 기록 ${recs.length}개</p>
      <dl class="trace-rows">${rows}</dl>
      <p class="rl-note">돌탑에 오른 기록은 다음 참가자가 <b>03 기록 받기</b>에서 TODAY로 받습니다.</p>
      <p class="rl-done" data-rl-done><i></i>다음 참가자의 TODAY가 되었습니다.</p>
    </div>
  </div>
  <button class="relay-core gesture-target" data-action="relay-grab" data-relay-core data-dwell="900" aria-label="내 기록 돌 잡기"></button>
  <div class="relay-target" data-relay-target aria-hidden="true"><i></i><span>여기에 올리기</span></div>
  <p class="kit-bag-hint relay-hint" data-relay-hint><i></i><span data-relay-hint-text>${state.mode==='camera'?'손을 돌에 대고 주먹을 쥐어 잡으세요':'돌을 눌러 잡으세요'}</span></p>
`;
  return lightShell(`page-relay is-arrived${state.forged?' is-placed':''}`,main,'');
}
function grabRelay(){
  if(state.forged)return;
  relayGrab();tone(620);clearDwell();
  const t=document.querySelector('[data-relay-hint-text]');if(t)t.textContent=state.mode==='camera'?'돌탑 꼭대기로 옮긴 뒤 손을 펴세요':'돌탑 꼭대기로 옮기세요';
}
function relayPlaced(){
  if(state.forged||state.stage!==8)return;
  state.forged=true;tone(760);
  document.querySelector('.page-relay')?.classList.add('is-placed');
  // 오른쪽 위 누적 기록이 하나 올라간다
  setTimeout(()=>{
    state.archive+=1;try{localStorage.setItem('breathlineRelayArchive',String(state.archive));}catch{}
    const b=document.querySelector('.page-relay .lp-meta b');
    if(b)countCollected(b,String(state.archive).padStart(3,'0'),null);
  },700);
  setTimeout(()=>{if(state.stage===8)next(9);},4200);
}

// 완료 — 방금 올린 돌이 돌탑 꼭대기에 남아 있고, 체험 전체가 한 줄로 정리된다
const END_IDLE=25;
function end(){
  const n=String(state.archive).padStart(3,'0');
  const steps=['신청','도착·키트','기록 받기','버디 판단','잠수·기록','확인·선별','전달'];
  const path=steps.map((t,i)=>`<li style="--i:${i}"><i></i><span>${String(i+1).padStart(2,'0')}</span>${t}</li>`).join('')+`<li class="next" style="--i:7"><i></i><span>NEXT</span>다음 참가자</li>`;
  const main=`<div class="rec-copy end-copy">
    <p class="end-kicker">BREATHLINE RELAY COMPLETE</p>
    <h2 class="lp-title">오늘의 기록이<br><b data-end-count>${n}</b>번째 돌이 되었습니다.</h2>
    <p class="end-lead">당신의 잠수는 여기서 끝나지만,<br>이 돌은 다음 참가자의 TODAY가 되어 다시 바다로 들어갑니다.</p>
    <ol class="end-path">${path}</ol>
    <button class="lp-next end-next gesture-target" data-action="restart"><span><b>다음 참가자 체험 시작</b><small><span data-end-idle>${END_IDLE}</span>초 뒤 자동으로 처음 화면으로 돌아갑니다</small></span><span class="lp-next-arrow">→</span><span class="dwell"></span></button>
  </div>`;
  return lightShell('page-end is-arrived',main,'');
}
let endTimer=0;
function startEndTimer(){
  clearInterval(endTimer);const t0=performance.now();
  endTimer=setInterval(()=>{
    if(state.stage!==9){clearInterval(endTimer);return;}
    const left=Math.max(0,END_IDLE-Math.floor((performance.now()-t0)/1000));
    const el=document.querySelector('[data-end-idle]');if(el)el.textContent=left;
    if(left<=0){clearInterval(endTimer);doAction('restart');}
  },250);
}

// 문단의 마지막 줄이 한두 단어만 떨어지지 않도록, 문단마다 폭을 조금씩 바꿔 가며
// 마지막 줄이 충분히 긴(폭의 55% 이상) 가장 넓은 폭을 고른다.
function lineWidths(el){
  const r=document.createRange();r.selectNodeContents(el);
  const rows={};for(const b of r.getClientRects()){const k=Math.round(b.top);rows[k]=(rows[k]||0)+b.width;}
  return Object.values(rows);
}
function balanceParagraphs(selector,{max=250,min=190,step=2,ratio=.55}={}){
  document.querySelectorAll(selector).forEach(p=>{
    let best=null;
    for(let w=max;w>=min;w-=step){
      p.style.width=`${w}px`;
      const rows=lineWidths(p);
      if(rows.length<2){best=w;break;}
      if(rows[rows.length-1]/w>=ratio){best=w;break;}
    }
    p.style.width=`${best??max}px`;
  });
}

// 02 도착 영상: 처음 한 번은 화면 전체로 재생하고, 끝나면 왼쪽 작은 창으로 줄어들어 반복 재생된다
function bindArrival(){
  const video=document.querySelector('[data-kit-video]');
  if(!video||state.kitArrived)return;
  const done=()=>{
    if(state.kitArrived||state.stage!==2)return;
    state.kitArrived=true;
    document.querySelector('.page-kit')?.classList.add('is-arrived');
    video.classList.add('is-card');
    // 줄어드는 전환이 끝나면 반복 재생용 영상으로 바꿔 끼운다
    setTimeout(()=>video.remove(),1400);
  };
  video.addEventListener('ended',done,{once:true});
  video.addEventListener('error',done,{once:true});
  setTimeout(done,6500);
}

// 새 밝은 톤으로 옮긴 페이지. 단계적으로 하나씩 늘려 간다.
const LIGHT_STAGES=new Set([1,2,3,4,5,6,7,8,9]);

function render(){
  const views=[intro,application,arrival,receive,buddy,decide,dive,review,pass,end];
  app.innerHTML=views[Math.min(state.stage,views.length-1)]();
  handCursor.classList.toggle('visible',state.cameraReady&&(state.mode==='camera'||state.stage===0));
  handCursor2.classList.toggle('visible',state.cameraReady&&state.mode==='camera'&&state.stage===4);
  document.body.classList.toggle('light-ui',state.stage===0||LIGHT_STAGES.has(state.stage));
  document.body.classList.toggle('dark-ui',state.stage===5||state.stage===6); // 어두운 바다 화면에선 손 커서를 흰색으로
  if(state.stage===0)mountStage('cover');
  else if(state.stage===6){unmountStage();startDive();}
  else if(state.stage===5){mountStage('balance');preloadKit();onBalanceCommit(chooseRoute);setBalanceReady(!!state.routeIntroDone);bindRoute();}
  else if(state.stage===4){mountStage('buddy');preloadKit();setBuddyCheck('you',state.buddy.you);setBuddyCheck('buddy',state.buddy.buddy);}
  else if(state.stage===9){syncMine();mountStage('relay');preloadKit();setTodayReceived(true);startEndTimer();}
  else if(state.stage===8){syncMine();if(!state.forged)resetRelay();mountStage('relay');preloadKit();setTodayReceived(true);onRelayPlaced(relayPlaced);}
  else if(state.stage===7){mountStage('review');preloadKit();setTodayReceived(true);syncMine();}
  else if(state.stage===3){mountStage('today');preloadKit();setTodayReceived(state.traceReceived);}
  else if(state.stage===2){mountStage('kit');preloadKit();setKitOpen(state.kitOpen);bindArrival();document.fonts.ready.then(()=>balanceParagraphs('.kit-name p'));}
  else if(LIGHT_STAGES.has(state.stage)){mountStage('cairn');preloadKit();}
  else unmountStage();
}

let coverFrame=0;
function initCoverInteraction(){
  if(!document.querySelector('.cover'))return;
  updateCoverVisuals(true);
}

function setCoverTargetFromPoint(x,y){
  if(state.stage!==0||!document.querySelector('.cover'))return;
  const top=82;
  const bottom=innerHeight-92;
  state.coverTarget=Math.max(0,Math.min(1,(bottom-y)/(bottom-top)));
  document.querySelector('.cover')?.style.setProperty('--pointer-x',`${(x/innerWidth-.5)*2}`);
  if(!coverFrame)coverFrame=requestAnimationFrame(animateCover);
}

function animateCover(){
  coverFrame=0;
  if(state.stage!==0||!document.querySelector('.cover'))return;
  const delta=state.coverTarget-state.coverProgress;
  state.coverProgress+=delta*.17;
  if(Math.abs(delta)<.002)state.coverProgress=state.coverTarget;
  updateCoverVisuals();
  if(Math.abs(state.coverTarget-state.coverProgress)>.001)coverFrame=requestAnimationFrame(animateCover);
}

function updateCoverVisuals(immediate=false){
  const cover=document.querySelector('.cover');
  if(!cover)return;
  const p=Math.max(0,Math.min(1,state.coverProgress));
  const level=Math.max(0,Math.min(8,Math.floor(p*8.4)));
  cover.style.setProperty('--cover-progress',p.toFixed(4));
  cover.style.setProperty('--stack-level',level);
  cover.classList.toggle('is-complete',level===8);
  cover.querySelector('[data-cover-count]').textContent=String(level).padStart(2,'0');
  cover.querySelector('[data-cover-percent]').textContent=String(Math.round(p*100)).padStart(2,'0');
  cover.querySelectorAll('.cover-stone').forEach(stone=>{
    const stoneLevel=Number(stone.dataset.level);
    const wasVisible=stone.classList.contains('is-visible');
    const visible=stoneLevel<=level;
    stone.classList.toggle('is-visible',visible);
    if(visible&&!wasVisible&&!immediate){
      stone.classList.remove('just-landed');
      void stone.offsetWidth;
      stone.classList.add('just-landed');
      setTimeout(()=>stone.classList.remove('just-landed'),520);
    }
  });
  cover.querySelectorAll('[data-tick]').forEach(tick=>tick.classList.toggle('active',Number(tick.dataset.tick)<=level));
  if(level!==state.coverLevel){
    state.coverLevel=level;
    if(!immediate&&level>0)tone(430+level*34);
  }
}

function next(stage){lastHandAt=performance.now();state.stage=stage;state.toast='';state.dwellTarget=null;state.dwellStart=0;tone(440);render();}
function notify(text){state.toast=text;render();setTimeout(()=>{if(state.toast===text){state.toast='';render();}},1800)}

function tone(freq=420){
  // 소리판 하나를 계속 쓴다(누를 때마다 새로 만들면 오래 켜 둘수록 쌓여서 소리·인식이 멈출 수 있다). TV 스피커에서도 들리게 크게
  try{const C=window.AudioContext||window.webkitAudioContext;const c=tone.ctx||(tone.ctx=new C());if(c.state!=='running')c.resume();const o=c.createOscillator();const g=c.createGain();o.frequency.value=freq;g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(.22,c.currentTime+.012);g.gain.exponentialRampToValueAtTime(.001,c.currentTime+.18);o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.2);}catch{}
}

// 표지에 들어오면 바로 손 인식을 준비한다. 실패하면 마우스가 그대로 대체 입력이 된다.
// 전시용 웹캠: 외장 웹캠(C920 등)이 연결돼 있으면 내장 카메라 대신 그것을 쓴다
async function openExhibitCamera(){
  const base={width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30}};
  let stream=await navigator.mediaDevices.getUserMedia({video:{...base,facingMode:'user'},audio:false});
  try{
    const cams=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');
    // C920(로지텍)이 있으면 그것, 없으면 맥 내장 카메라. 아이폰 연속성 카메라는 고르지 않는다
    const pick=cams.find(d=>/c920|logitech|hd pro webcam/i.test(d.label))||cams.find(d=>/facetime|built-in|내장/i.test(d.label));
    const cur=stream.getVideoTracks()[0]?.getSettings().deviceId;
    if(pick&&pick.deviceId!==cur){
      stream.getTracks().forEach(t=>t.stop());
      stream=await navigator.mediaDevices.getUserMedia({video:{...base,deviceId:{exact:pick.deviceId}},audio:false});
    }
  }catch(e){console.warn('camera pick',e);}
  return stream;
}
let handInit=null;
function initHandTracking(){
  if(handInit)return handInit;
  state.handStatus='loading';setCoverHand(coverHandState());
  handInit=(async()=>{
    try{
      if(!recognizer){
        const vision=await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm/',location.href).href);
        recognizer=await GestureRecognizer.createFromOptions(vision,{baseOptions:{modelAssetPath:new URL('./vendor/mediapipe/gesture_recognizer.task',location.href).href,delegate:'CPU'},runningMode:'VIDEO',numHands:2});
      }
      state.modelReady=true;
      const stream=await openExhibitCamera();
      camera.srcObject=stream;await camera.play();
      state.cameraReady=true;state.handStatus='ready';state.cameraError='';setFistMode(true);
      handCursor.classList.toggle('visible',state.mode==='camera'||state.stage===0);
      detectLoop();
    }catch(error){
      console.warn(error);state.cameraError=error.message;state.handStatus='failed';handInit=null;
    }
    setCoverHand(coverHandState());
    return state.cameraReady;
  })();
  return handInit;
}

function coverHandState(){
  if(state.handStatus==='failed')return 'failed';
  if(!state.cameraReady)return 'loading';
  return state.hands?'tracking':'ready';
}

async function startCamera(){
  if(state.busy)return;state.busy=true;
  const ok=state.cameraReady||await initHandTracking();
  state.busy=false;
  if(ok){state.mode='camera';next(1);}
  else{state.mode='mouse';notify('웹캠을 열 수 없어 마우스 모드로 진행합니다.');}
}

function stopCamera(){if(camera.srcObject){camera.srcObject.getTracks().forEach(t=>t.stop());camera.srcObject=null;}cancelAnimationFrame(animationFrame);state.cameraReady=false;state.hands=0;}

// 손이 안 보이고 화면 조작도 없이 20초가 지나면 처음 화면으로
const HAND_IDLE_MS=20000;let lastHandAt=performance.now();
["pointerdown","pointermove","keydown"].forEach(t=>addEventListener(t,()=>{lastHandAt=performance.now();},{passive:true,capture:true}));
// 자동 새로고침: 오래 켜 두면 손 인식이 멈추는 경우가 있어, 멈춘 걸 감지하거나 한 사람이 끝날 때마다 페이지를 새로 연다
const PAGE_AT=performance.now();let lastDetectAt=performance.now(),detectErrors=0;
function safeReload(reason){
  try{const last=+sessionStorage.getItem('breathlineReloadAt')||0;if(Date.now()-last<15000)return;sessionStorage.setItem('breathlineReloadAt',String(Date.now()));}catch{}
  console.warn('auto reload:',reason);document.body.style.transition='opacity .4s';document.body.style.opacity='0';setTimeout(()=>location.reload(),420);
}
setInterval(()=>{
  if(!state.cameraReady)return;
  const track=camera.srcObject?.getVideoTracks?.()[0];
  if(!track||track.readyState==='ended'||track.muted&&performance.now()-lastDetectAt>4000){safeReload('camera stopped');return;}
  if(performance.now()-lastDetectAt>6000)safeReload('detection stalled');                                      // 6초 넘게 인식이 안 돌면
  else if(state.stage===0&&!state.hands&&performance.now()-lastHandAt>30000&&performance.now()-PAGE_AT>15*60000)safeReload('refresh while idle'); // 표지에서 아무도 없을 때 15분마다
},2000);
function detectLoop(){
  if(!state.cameraReady||!recognizer)return;
  animationFrame=requestAnimationFrame(detectLoop);   // 아래에서 오류가 나도 인식이 계속 돈다
  try{detectStep();detectErrors=0;}catch(e){console.warn('detect',e);if(++detectErrors>45)safeReload('detect errors');}
}
function detectStep(){
  if(camera.currentTime!==lastVideoTime){
    lastVideoTime=camera.currentTime;lastDetectAt=performance.now();
    const result=recognizer.recognizeForVideo(camera,performance.now());
    const hadHands=state.hands;
    state.hands=result.landmarks?.length||0;
    if(state.stage===0&&!!hadHands!==!!state.hands)setCoverHand(coverHandState());
    handCursor.style.opacity=state.hands?1:0;
    state.gesture=result.gestures?.[0]?.[0]?.categoryName?.replaceAll('_',' ')||'';
    if(state.hands)lastHandAt=performance.now();
    else if(state.stage!==0&&performance.now()-lastHandAt>HAND_IDLE_MS){lastHandAt=performance.now();doAction('restart');}
    if(state.hands){
      const pp=smoothPoint(palmPoint(result.landmarks[0]));state.pointer.x=pp.x;state.pointer.y=pp.y;
      handCursor.style.transform=`translate3d(${state.pointer.x}px,${state.pointer.y}px,0)`;
      if(state.stage===0||LIGHT_STAGES.has(state.stage))setCoverPointer(state.pointer.x,state.pointer.y);
      if(state.stage===6){diveTargets(state.pointer.x,state.pointer.y);diveMove(state.pointer.x,state.pointer.y);}
      if(state.recovery.active)updateRecoveryPointer(state.pointer.x);
      else if(state.stage!==6)handlePointer(state.pointer.x,state.pointer.y); // 06은 장면마다 손동작이 달라 따로 처리
      const fist=isFist(result,0);
      // 04에서 손이 손돌 위에 있으면 손돌 확인(updateBuddyHands)이 맡고, 그 밖(경로 정하기 등)은 일반 선택
      const onHandStone=state.stage===4&&!!document.elementFromPoint(state.pointer.x,state.pointer.y)?.closest?.('[data-hand-stone]');
      if(fist&&!fistDown&&!onHandStone)onFist();
      if(!fist&&fistDown)onOpen();
      fistDown=fist;
    }else{clearDwell();if(fistDown){fistDown=false;onOpen();}}
    // 두 번째 손 커서
    const second=result.landmarks?.[1];
    if(second&&(state.stage===4)){const p2=palmPoint(second);handCursor2.style.transform=`translate3d(${p2.x}px,${p2.y}px,0)`;handCursor2.style.opacity=1;}
    else handCursor2.style.opacity=0;
    if(state.stage===4&&state.hands){
      const pts=result.landmarks.map(palmPoint);
      const fists=pts.map((_,i)=>{const f=isFist(result,i),edge=f&&!handFist[i];handFist[i]=f;return edge;});
      updateBuddyHands(pts,fists);
    }
    updateLiveStatus();
  }
}

function updateLiveStatus(){
  const status=document.querySelector('.system-status');
  if(status&&state.mode==='camera')status.innerHTML=state.cameraReady?`<b>손 ${state.hands}개 인식</b><br>${state.gesture||'움직임 인식 중'}`:`웹캠 준비 중`;
  const light=document.querySelector('[data-input-status]');
  if(light&&state.cameraReady){
    // 손 상태 아이콘: 손바닥(펼침) / 주먹 — 면 아이콘, 글자색을 그대로 따른다
    const html=state.hands?(fistDown?'<i class="hand-ico fist" aria-hidden="true"></i>주먹':'<i class="hand-ico palm" aria-hidden="true"></i>손 인식 중')+(DEBUG_FIST?` ${fistRatio.toFixed(2)}`:''):'손을 보여주세요';
    if(light.dataset.html!==html){light.innerHTML=html;light.dataset.html=html;}
  }
  else if(light&&state.mode==='camera')light.textContent='손 인식 준비 중';
}


// 손 트래킹 선택: 대상 위에 손바닥을 대면 커서 링이 차고(준비), 주먹을 쥐는 순간 선택된다
let lastAimEl=null,lastAimAt=0;
function handlePointer(x,y){
  const el=document.elementFromPoint(x,y)?.closest?.('.gesture-target');
  document.querySelectorAll('.gesture-target.gaze').forEach(n=>{if(n!==el)n.classList.remove('gaze')});
  if(!el||el.disabled){clearDwell();return;}
  el.classList.add('gaze');
  if(state.dwellTarget!==el){clearDwell();state.dwellTarget=el;el.classList.add('gaze');}
  lastAimEl=el;lastAimAt=performance.now();
  handCursor.style.setProperty('--cursor-progress',100);handCursor.classList.add('aim');
}
function gripCursor(cur=handCursor){cur.classList.remove('grip');void cur.offsetWidth;cur.classList.add('grip');}
// 주먹을 쥔 순간(펴진 손 → 주먹)
function onFist(){
  gripCursor();
  if(state.stage===5&&balanceFist())return;
  const el=state.dwellTarget||(performance.now()-lastAimAt<450?lastAimEl:null);
  if(!el||el.disabled||!el.isConnected)return;
  el.style.setProperty('--dwell','100%');
  clearDwell();
  setTimeout(()=>{el.style.setProperty('--dwell','0%');el.click();},110);
}
// 주먹을 편 순간 — 07에서 잡고 있던 돌을 내려놓는다
function onOpen(){
  if(state.stage!==8)return;
  const r=relayRelease();
  if(r==='dropped'){const t=document.querySelector('[data-relay-hint-text]');if(t)t.textContent='손을 돌에 대고 주먹을 쥐어 잡으세요';}
}
// 주먹 판정: 제스처 모델 점수 대신 손가락 관절 위치로 직접 본다(거리·각도에 덜 민감)
// 네 손가락 끝이 손바닥 중심 가까이 접혀 들어오면 주먹. 쥘 때·펼 때 기준을 달리 둬서 깜빡이지 않게 한다
const FIST_IN=.78, FIST_OUT=.98;
const DEBUG_FIST=new URLSearchParams(location.search).has('debug');
const fistLatch=[false,false];
let fistRatio=0;
function fistRatioOf(l){
  const W=innerWidth,H=innerHeight,P=i=>[l[i].x*W,l[i].y*H];
  const k=[0,5,9,17],c=k.reduce((a,i)=>{const p=P(i);return [a[0]+p[0]/4,a[1]+p[1]/4];},[0,0]);
  const w=P(0),m=P(9),size=Math.hypot(w[0]-m[0],w[1]-m[1])||1;
  const r=[8,12,16,20].map(t=>{const p=P(t);return Math.hypot(p[0]-c[0],p[1]-c[1])/size;});
  r.sort((a,b)=>a-b);
  return (r[0]+r[1]+r[2])/3; // 가장 많이 접힌 세 손가락 평균
}
function isFist(result,i){
  const l=result.landmarks?.[i];if(!l){fistLatch[i]=false;return false;}
  const r=fistRatioOf(l);if(i===0)fistRatio=r;
  const g=result.gestures?.[i]?.[0],model=!!g&&g.categoryName==='Closed_Fist'&&g.score>=.5;
  fistLatch[i]=fistLatch[i]?(r<FIST_OUT||model):(r<FIST_IN||model);
  return fistLatch[i];
}
// 손바닥 중심(손목·검지·중지·새끼 뿌리 평균) — 주먹을 쥐어도 위치가 거의 변하지 않는다
// 감도: 카메라 화면 전체가 아니라 가운데 영역(가로 22~78%, 세로 15~70%)만 화면 전체로 넓혀 쓴다
// → 부스 끝까지 가지 않아도, 작은 손 움직임으로 화면 끝까지 닿는다
const HAND_BOX={x0:.22,x1:.78,y0:.15,y1:.70};
const clamp01=v=>Math.max(0,Math.min(1,v));
function palmPoint(l){const k=[0,5,9,17];let x=0,y=0;k.forEach(i=>{x+=l[i].x;y+=l[i].y;});x/=4;y/=4;
  const u=clamp01(((1-x)-HAND_BOX.x0)/(HAND_BOX.x1-HAND_BOX.x0)), v=clamp01((y-HAND_BOX.y0)/(HAND_BOX.y1-HAND_BOX.y0));
  return {x:u*innerWidth,y:v*innerHeight};}
// 확대한 만큼 떨림도 커지므로 살짝 부드럽게 따라가게 한다(멀리 움직이면 빠르게, 가만히 있으면 떨림만 걸러짐)
let smooth=null;
function smoothPoint(p){if(!smooth){smooth={...p};return smooth;}const d=Math.hypot(p.x-smooth.x,p.y-smooth.y),a=d>120?.75:d>40?.5:.28;smooth.x+=(p.x-smooth.x)*a;smooth.y+=(p.y-smooth.y)*a;return smooth;}
let fistDown=false;const handFist=[false,false];

function clearDwell(){if(state.dwellTarget){state.dwellTarget.style.setProperty('--dwell','0%');state.dwellTarget.classList.remove('gaze')}state.dwellTarget=null;state.dwellStart=0;handCursor.style.setProperty('--cursor-progress',0);handCursor.classList.remove('aim');}

function startRecovery(){
  if(state.traces.has('plastic')||state.recovery.active)return;
  clearInterval(recoveryTimer);
  Object.assign(state.recovery,{active:true,crossings:0,lastSide:'',deadline:performance.now()+state.recovery.duration});
  clearDwell();tone(610);render();
initHandTracking();
  recoveryTimer=setInterval(()=>{
    if(!state.recovery.active){clearInterval(recoveryTimer);return;}
    const remain=Math.max(0,state.recovery.deadline-performance.now());
    const timeEl=document.querySelector('.recovery-time');if(timeEl)timeEl.textContent=(remain/1000).toFixed(1);
    if(remain<=0)finishRecovery(false);
  },80);
}

function updateRecoveryPointer(x){
  if(!state.recovery.active)return;
  let side='';
  if(x<innerWidth*.34)side='left';else if(x>innerWidth*.66)side='right';
  if(!side||side===state.recovery.lastSide)return;
  if(state.recovery.lastSide)state.recovery.crossings+=1;
  state.recovery.lastSide=side;tone(560+state.recovery.crossings*26);
  const count=document.querySelector('.recovery-count b');if(count)count.textContent=Math.floor(state.recovery.crossings/2);
  const bar=document.querySelector('.recovery-bar i');if(bar)bar.style.width=`${Math.min(100,state.recovery.crossings/state.recovery.target*100)}%`;
  const obj=document.querySelector('.recovery-object');if(obj)obj.classList.toggle('right',side==='right');
  if(state.recovery.crossings>=state.recovery.target)finishRecovery(true);
}

function finishRecovery(success){
  if(!state.recovery.active)return;
  state.recovery.active=false;clearInterval(recoveryTimer);
  if(success){state.traces.add('plastic');tone(880);notify('분리 폐기물 회수 완료 · 버디 확인 후 메시 파우치에 보관했습니다.');}
  else{state.recovery.crossings=0;state.recovery.lastSide='';tone(220);notify('시간이 끝났습니다. 분리된 플라스틱을 다시 선택해 재시도하세요.');}
}

function setHandoffProgress(progress){
  state.handoff.progress=Math.max(0,Math.min(1,progress));
  const stone=document.querySelector('.handoff-stone');if(stone)stone.style.left=`${8+state.handoff.progress*68}%`;
  const fill=document.querySelector('.handoff-progress i');if(fill)fill.style.width=`${state.handoff.progress*100}%`;
  if(state.handoff.progress>=.94)completeHandoff();
}

function updateHandoffPointer(x,y,isCamera=false){
  if(state.stage!==8||state.forged)return;
  const track=document.querySelector('.handoff-track');const stone=document.querySelector('.handoff-stone');
  if(!track||!stone)return;
  const tr=track.getBoundingClientRect();const sr=stone.getBoundingClientRect();
  if(isCamera&&!state.handoff.dragging){
    const overStone=x>=sr.left-24&&x<=sr.right+24&&y>=sr.top-35&&y<=sr.bottom+35;
    if(!overStone)return;state.handoff.dragging=true;tone(560);
  }
  if(!state.handoff.dragging)return;
  setHandoffProgress((x-(tr.left+tr.width*.12))/(tr.width*.72));
}

function completeHandoff(){
  if(state.forged)return;
  state.handoff.dragging=false;state.handoff.progress=1;tone(920);doAction('pass-stone');
}

const STEP_TO_STAGE={1:1,2:2,3:3,4:4,5:6,6:7,7:8};
const freshDive=()=>({scene:0,phase:'scan',records:[],dwell:0,found:0,cross:0,side:''});
function doAction(action,target){
  if(action==='dive-pull-start'){if(state.stage===6&&state.dive.phase==='ready'){clearDwell();setDivePhase('pull');startPull();tone(640);}return;}
  if(action==='relay-grab'){grabRelay();return;}
  if(action==='net-mark'){if(state.stage===6&&state.dive.phase==='keep')placePin();return;}
  if(action==='goto'){
    const to=STEP_TO_STAGE[Number(target?.dataset.step)];if(!to||to===state.stage)return;
    state.busy=false;
    if(state.stage===5)setBalanceReady(false);
    if(to<=5){state.decision='';resetBalance();}
    if(to===6||state.stage===6)state.dive=freshDive();
    next(to);return;
  }
  if(action==='back'){if(state.busy||state.stage<1)return;if(state.stage===6){state.decision='';resetBalance();}if(state.stage===5)setBalanceReady(false);next(state.stage-1);return}
  if(action==='start-camera'){startCamera();return}
  if(action==='start-mouse'){state.mode='mouse';setFistMode(false);stopCamera();handInit=null;next(1);return}
  if(action==='application-confirm'){
    if(state.busy)return;state.busy=true;
    document.querySelector('.page-apply')?.classList.add('is-confirmed');
    tone(660);tapCairn();
    setTimeout(()=>{state.busy=false;next(2);},1400);
    return;
  }
  if(action==='open-kit'){if(state.kitOpen)return;state.kitOpen=true;tone(620);setKitOpen(true);render();return}
  if(action==='receive-kit'){if(!state.kitOpen)return;next(3);return}
  if(action==='take-record'){takeRecord();return}
  if(action==='dive-up'){signalReturn();return}
  if(action==='accept-trace'){if(!state.traceReceived)return;next(4);return}
  if(action==='check-you'||action==='check-buddy'){checkBuddy(action.slice(6));return}
  if(action==='buddy-next'){if(!(state.buddy.you&&state.buddy.buddy))return;next(5);return}
  if(action==='choose-safe'||action==='choose-original'){if(!commitBalance(action))chooseRoute(action);return}
  if(action==='trace'){
    if(target.dataset.id==='plastic'&&!state.traces.has('plastic')){startRecovery();return}
    state.traces.add(target.dataset.id);tone(520+state.traces.size*70);render();return;
  }
  if(action==='surface'){next(7);return}
  if(action==='select-record'){toggleRecord(target);return;}
  if(action==='forge'){if(!state.selected.size){notifyInline('다음 팀에 남길 기록을 먼저 고르세요.');return}next(8);return}
  if(action==='pass-stone'){
    if(state.forged)return;state.forged=true;state.archive+=1;localStorage.setItem('breathlineRelayArchive',String(state.archive));next(9);return;
  }
  if(action==='home'){doAction('restart');return}
  if(action==='restart'){state.dive=freshDive();state.kitOpen=false;state.kitArrived=false;state.traceReceived=false;state.routeIntroDone=false;state.buddy={you:false,buddy:false};resetBuddy();state.decision='';state.traces.clear();state.selected.clear();state.forged=false;Object.assign(state.recovery,{active:false,crossings:0,lastSide:'',deadline:0});Object.assign(state.handoff,{dragging:false,progress:0});next(0);if(state.cameraReady)safeReload('next participant');return}
}

app.addEventListener('click',e=>{const target=e.target.closest('[data-action]');if(target&&!target.disabled)doAction(target.dataset.action,target)});
app.addEventListener('pointerdown',e=>{
  if(state.mode!=='mouse'||state.stage!==8||!e.target.closest('.handoff-stone'))return;
  state.handoff.dragging=true;e.target.closest('.handoff-stone').setPointerCapture?.(e.pointerId);tone(560);e.preventDefault();
});
window.addEventListener('pointermove',e=>{
  if(state.stage===0)setCoverTargetFromPoint(e.clientX,e.clientY);
  if(state.stage===6){state.pointer.x=e.clientX;state.pointer.y=e.clientY;diveMove(e.clientX,e.clientY);}
  if(state.mode==='mouse'&&state.recovery.active)updateRecoveryPointer(e.clientX);
  if(state.mode==='mouse'&&state.stage===8&&state.handoff.dragging)updateHandoffPointer(e.clientX,e.clientY);
});
window.addEventListener('pointerup',()=>{
  if(state.mode!=='mouse'||state.stage!==8||!state.handoff.dragging||state.forged)return;
  state.handoff.dragging=false;
  if(state.handoff.progress<.94){state.handoff.progress=0;notify('돌을 오른쪽 NEXT TODAY 지점까지 끝까지 밀어주세요.');}
});
window.addEventListener('beforeunload',stopCamera);
document.addEventListener('keydown',e=>{
  if(e.key.toLowerCase()==='f')document.documentElement.requestFullscreen?.();
  if(e.key==='Escape'&&document.fullscreenElement)document.exitFullscreen?.();
  if(state.stage===0&&(e.key==='ArrowUp'||e.key==='ArrowDown')){
    e.preventDefault();
    state.coverTarget=Math.max(0,Math.min(1,state.coverTarget+(e.key==='ArrowUp' ? .13 : -.13)));
    if(!coverFrame)coverFrame=requestAnimationFrame(animateCover);
  }
});

// 테스트용: ?stage=6 처럼 특정 단계로 바로 진입
const jumpStage=Number(new URLSearchParams(location.search).get('stage'));
if(jumpStage>0&&jumpStage<10)state.stage=jumpStage;
const jumpScene=Number(new URLSearchParams(location.search).get('scene'));
const jumpSel=new URLSearchParams(location.search).get('sel');
if(jumpSel)jumpSel.split(',').forEach(id=>state.selected.add(id));
if(jumpStage===6&&jumpScene>0&&jumpScene<DIVE_SCENES.length){state.dive.scene=jumpScene;state.dive.phase=jumpScene===2?'watch':'scan';}
render();

initHandTracking();
