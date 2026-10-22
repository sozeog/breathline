// 고글 인터랙션 — 1인칭 고글 시점 자동재생. 위쪽 순서를 누르면 그 장면으로 이동한다.
// 좌표는 모두 일러스트 대지(1920×1080) 기준.
const SCENE_MS = 7000;
const R = r => `left:${r[0]}px;top:${r[1]}px;width:${r[2]}px;height:${r[3]}px`;

const SCENES = [
  { id:'connect', buddyDir:-8, name:'CONNECT', desc:'기기·버디 연결 상태 확인', bg:'bg_connect.jpg', video:'connect.mp4', poster:'connect_poster.jpg', loop:true, bgR:[22.3,26.4,1865.3,1049.8],
    depth:0, temp:28.5, buddy:10, collected:7, dive:0, run:false, side:true,
    parts:[['panel_me',[105.4,217,429,157],1],['panel_buddy',[1409.4,217,403,157],1]] },
  { id:'divedata', buddyDir:-28, name:'DIVE DATA', desc:'BUDDY 버디의 위치 확인', bg:'bg_divedata.jpg', video:'divedata.mp4', poster:'divedata_poster.jpg', loop:true, bgR:[-153.2,-5.9,2040.5,1148.4], under:true,
    depth:6.4, temp:23.5, buddy:15, collected:7, dive:157, run:true, side:true,
    parts:[['buddy_tag',[1199.4,376.1,133.6,38.5],1.6]] },
  { id:'autoconnect', buddyDir:24, name:'AUTO CONNECT', desc:'이전 참여자의 현장 관찰을 현재 위치에 표시', bg:'bg_autoconnect.jpg', bgR:[16.7,26.4,1875.1,1055.3], under:true,
    depth:6.4, temp:23.5, buddy:15, collected:7, dive:169, run:true, side:true,
    parts:[['notice',[1060.8,436.5,380.8,202],2.2]] },
  { id:'trace', buddyDir:58, name:'TRACE & AUTO RECORD', desc:'픽업 동작을 감지해 대상과 수량을 임시 저장', bg:'bg_trace.jpg', video:'trace.mp4', poster:'trace_poster.jpg', bgR:[-11.5,-23.5,1977.1,1112.7], under:true,
    depth:6.4, temp:23.5, buddy:15, collected:6, collectTo:7, collectAt:5000, dive:181, run:true, side:true,
    parts:[['trace_bracket',[822.6,303.2,311.1,454.1],4],['trace_tag',[1113.5,259,268,133],4]] },
  { id:'surface', buddyDir:-12, name:'SURFACE', desc:'수면 휴식 시간과 이전 잠수 기록 확인', bg:'bg_surface.jpg', video:'surface.mp4', poster:'surface_poster.jpg', loop:true, bgR:[23.3,-14.4,1872.6,1053.9],
    depth:0, temp:23.5, buddy:1, collected:7, dive:227, run:false, side:true,
    parts:[['panel_me',[105.4,217,429,157],1],['panel_buddy',[1409.4,217,403,157],1],['surface_recover',[721.7,791.5,476.6,132.8],1]] },
  { id:'today', buddyDir:0, name:'TODAY 전송', desc:'오늘의 기록을 다음 참여자에게 전송', bg:'bg_today.jpg', video:'today_1080.mp4', poster:'today_poster.jpg', loop:true, bgR:[44.5,79.5,1817.4,1022.9],
    depth:0, temp:23.5, buddy:1, collected:7, dive:227, run:false, side:false, today:true,
    parts:[['today_card',[645.3,452.4,629.4,210.3],.8],['today_head',[759.5,401.7,401,103],.8],['today_track',[678.9,559.2,562.2,12.5],.8],['today_counts',[682.5,593.7,555,58],.8]] },
];

const $ = id => document.getElementById(id);
const stage = $('stage'), wrap = $('stageWrap'), scenesEl = $('scenes'), vlayer = $('vlayer');
const pad = n => String(n).padStart(2, '0');

// 장면 만들기
SCENES.forEach((s, i) => {
  const el = document.createElement('section');
  el.className = 'scene' + (s.under ? ' under' : '');
  el.style.setProperty('--dur', SCENE_MS / 1000 + 's');
  // 배경 사진·영상은 줄이지 않은 별도 층(#vlayer)에 실제 픽셀 크기로 둔다(아이패드 사파리 영상 크기 문제 회피)
  const bgset = document.createElement('div');
  bgset.className = 'bgset';
  bgset.innerHTML = `<img src="assets/${s.bg}" alt="" data-r="${s.bgR}">`;
  vlayer.appendChild(bgset);
  s.bgset = bgset; s.vid = null;
  el.innerHTML = `<div class="world">
      ${s.parts.filter(p => !p[0].startsWith('today')).map(p => `<img class="pop" src="assets/${p[0]}.png" alt="" style="${R(p[1])};--at:${p[2]}s">`).join('')}
    </div>
    ${s.parts.filter(p => p[0].startsWith('today')).map(p => `<img class="pop" src="assets/${p[0]}.png" alt="" style="${R(p[1])};--at:${p[2]}s">`).join('')}
    ${s.today ? `<div class="today-fill pop" style="--at:.8s" id="todayFill"></div><p class="today-pct pop" style="--at:.8s;position:absolute;line-height:1;white-space:nowrap" id="todayPct">기록 전송 중 0%</p>` : ''}`;
  scenesEl.appendChild(el);
  s.el = el;
});

const players = [0, 1].map(() => {
  const v = document.createElement('video');
  v.className = 'player'; v.muted = true; v.playsInline = true; v.preload = 'auto';
  v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
  vlayer.appendChild(v); return v;
});
let kNow = 1;
function placeR(n) { const r = n.dataset.r.split(',').map(Number); Object.assign(n.style, { left: r[0] * kNow + 'px', top: r[1] * kNow + 'px', width: r[2] * kNow + 'px', height: r[3] * kNow + 'px' }); }

// 순서 버튼
const steps = SCENES.map((s, i) => {
  const b = document.createElement('button');
  b.className = 'step';
  b.innerHTML = `<span>${pad(i + 1)}</span>${s.name}<i></i>`;
  b.addEventListener('click', () => go(i));
  $('steps').appendChild(b);
  return b;
});

// 화면 맞춤: 16:9 장면을 가로폭에 맞춘다.
// HUD·고글 틀은 1920×1080 무대를 통째로 줄이고, 배경 사진·영상은 계산한 실제 크기로 따로 놓는다
// (아이패드 사파리는 줄인 부모 안의 <video>를 제 크기로 못 그린다)
function fit() {
  const w = wrap.clientWidth, h = wrap.clientHeight, k = (innerWidth / innerHeight >= 1.5 ? Math.max : Math.min)(w / 1920, h / 1080); kNow = k;   // 노트북처럼 넓은 화면은 폭을 꽉 채우고 위아래를 살짝 자른다
  stage.style.transform = `translate(${-960 * k}px,${-540 * k}px) scale(${k})`;
  Object.assign(vlayer.style, { left: (w - 1920 * k) / 2 + 'px', top: (h - 1080 * k) / 2 + 'px', width: 1920 * k + 'px', height: 1080 * k + 'px' });
  vlayer.querySelectorAll('[data-r]').forEach(placeR);
}
addEventListener('resize', fit); addEventListener('orientationchange', () => setTimeout(fit, 300)); fit();

// 값: 부드럽게 따라가는 숫자들
const val = { depth: 0, temp: 28.5, buddy: 10, dive: 0, collected: 7, dir: 0 };
const want = { ...val };
let cur = -1, sceneAt = 0, diveBase = 0, collectDone = false, todayPct = 0;

function go(i) {
  if (i === cur) { sceneAt = performance.now(); restartAnim(SCENES[i]); return; }
  const prev = SCENES[cur];
  cur = i; const s = SCENES[i];
  SCENES.forEach((x, j) => { x.el.classList.toggle('on', j === i); x.bgset.classList.toggle('on', j === i); });
  restartAnim(s);
  sceneAt = performance.now();
  if (s.id === 'surface') playSfx(sfxRecover); else sfxRecover.pause();
  if (s.id === 'autoconnect') playSfx(bgDive); else bgDive.pause();   // 03은 사진이라 02 바닷속 소리를 깔아 준다
  diveBase = s.dive; collectDone = false; todayPct = 0;
  want.depth = s.depth; want.temp = s.temp; want.buddy = s.buddy;
  val.collected = s.collected; $('vCollected').textContent = pad(s.collected);
  if (!prev) { Object.assign(val, { depth: s.depth, temp: s.temp, buddy: s.buddy }); }
  $('sideL').classList.toggle('off', !s.side); $('sideR').classList.toggle('off', !s.side);
  steps.forEach((b, j) => { b.classList.toggle('on', j === i); b.classList.toggle('done', j < i); b.querySelector('i').style.width = j < i ? '100%' : '0'; });
  const foot = document.querySelector('.band-bottom');
  foot.classList.add('swap');
  setTimeout(() => { $('capNum').textContent = `${pad(i + 1)} / ${pad(SCENES.length)}`; $('capName').textContent = s.name; $('capDesc').textContent = s.desc; foot.classList.remove('swap'); }, 220);
}
// 같은 장면을 다시 보여 줄 때 애니메이션을 처음부터
// 사운드: 브라우저는 소리 있는 자동재생을 막으므로, 첫 터치 때 소리를 켠다
let soundOn = false;
function safePlay(v) {
  v.muted = !soundOn;
  const p = v.play();
  if (p && p.catch) p.catch(() => { if (!v.muted) { v.muted = true; v.play().catch(() => {}); } });
}
function enableSound(on) {
  soundOn = on;
  document.body.classList.toggle('sound-on', on);
  const curV = SCENES[cur] && SCENES[cur].vid;
  // iPad 사파리는 영상마다 터치로 한 번씩 허락받아야 해서, 터치 순간 모든 영상을 소리 켠 채로 깨웠다가 멈춘다
  if (on) players.forEach(v => { if (v === curV) return; if (!v._src) { v._src = 'connect.mp4'; v.src = 'assets/connect.mp4'; } v.muted = false; const p = v.play(); if (p && p.then) p.then(() => { if (v !== curVideo()) v.pause(); }).catch(() => {}); });
  if (curV) { curV.muted = !on; if (on) safePlay(curV); }
  // 효과음도 터치 순간 미리 허락받아 둔다(소리 없이 잠깐 재생 후 멈춤)
  if (on) { sfxRecover.muted = true; const q = sfxRecover.play(); if (q && q.then) q.then(() => { sfxRecover.pause(); sfxRecover.currentTime = 0; sfxRecover.muted = false; if (SCENES[cur].id === 'surface' && performance.now() - sceneAt < 1500) playSfx(sfxRecover); }).catch(() => { sfxRecover.muted = false; }); }
  else { sfxRecover.pause(); bgDive.pause(); }
  if (on) { bgDive.muted = true; const q2 = bgDive.play(); if (q2 && q2.then) q2.then(() => { bgDive.pause(); bgDive.currentTime = 0; bgDive.muted = false; if (SCENES[cur].id === 'autoconnect') playSfx(bgDive); }).catch(() => { bgDive.muted = false; }); }
}
function curVideo() { return SCENES[cur] && SCENES[cur].vid; }
// 효과음: SURFACE 장면이 시작될 때 회복 호흡 소리를 처음부터 한 번만
const bgDive = new Audio('assets/divedata_sound.m4a'); bgDive.preload = 'auto'; bgDive.loop = true;
const sfxRecover = new Audio('assets/recover_breath.m4a?v=2'); sfxRecover.preload = 'auto';
function playSfx(a) { if (!soundOn) return; a.pause(); try { a.currentTime = 0; } catch (e) {} const p = a.play(); if (p && p.catch) p.catch(() => {}); }
// 안내 화면 없이: 화면 어디든 처음 닿는 순간 소리를 켠다(브라우저 규칙상 그 전에는 소리 없이 재생)
function firstTouch(e) {
  removeEventListener('pointerdown', firstTouch, true);
  if (e.target.closest && e.target.closest('#snd')) return;   // 스피커 버튼은 자기 동작대로
  if (!soundOn) enableSound(true);
}
addEventListener('pointerdown', firstTouch, true);
function playVideo(s) {
  const out = players.find(p => p.classList.contains('on'));
  SCENES.forEach(x => { if (x !== s) x.vid = null; });
  const fadeOut = p => { if (!p) return; p.classList.remove('on'); setTimeout(() => { if (!p.classList.contains('on')) p.pause(); }, 950); };
  if (!s.video) { fadeOut(out); s.vid = null; return; }
  const v = players.find(p => p !== out) || players[0];
  v.dataset.r = s.bgR.join(','); placeR(v);
  v.loop = !!s.loop;
  if (v._src !== s.video) { v._src = s.video; v.src = 'assets/' + s.video; v.load(); }
  try { v.currentTime = 0; } catch (e) {}
  s.vid = v; safePlay(v);
  v.classList.add('on'); fadeOut(out);
}
function restartAnim(s) {
  playVideo(s);
  s.el.querySelectorAll('.pop,.world').forEach(n => { n.style.animation = 'none'; void n.offsetWidth; n.style.animation = ''; });
}

// 떠다니는 부유물(바닷속 장면)
const cv = $('motes'), cx = cv.getContext('2d');
const motes = Array.from({ length: 90 }, () => ({ x: Math.random() * 1920, y: Math.random() * 1080, r: .6 + Math.random() * 2.2, v: .15 + Math.random() * .45, p: Math.random() * 6.28 }));
let moteAlpha = 0;

const t0 = performance.now(), startClock = 10 * 3600 + 35 * 60;
function tick(now) {
  const s = SCENES[cur], el = now - sceneAt;
  // 자동재생
  if (el > SCENE_MS) go((cur + 1) % SCENES.length);
  steps[cur].querySelector('i').style.width = Math.min(100, el / SCENE_MS * 100) + '%';

  // 시계(10:35 AM부터 실제 시간만큼 흐름)
  const sec = startClock + Math.floor((now - t0) / 1000), hh = Math.floor(sec / 3600) % 24, mm = Math.floor(sec / 60) % 60;
  $('clock').textContent = `${(hh % 12) || 12}:${pad(mm)} ${hh < 12 ? 'AM' : 'PM'}`;
  // 나침반: 고개를 살짝 돌리는 듯 좌우로
  $('compass').style.transform = `translateX(${Math.sin(now / 2300) * 5 + Math.sin(now / 900) * 1.2}px)`;

  // 수심·수온·버디 거리
  const t = now / 1000;
  const dTarget = s.depth ? s.depth + Math.sin(t * .35) * .18 : 0;
  val.depth += (dTarget - val.depth) * .025;
  val.temp += (s.temp + (s.depth ? Math.sin(t * .2) * .06 : 0) - val.temp) * .03;
  const bTarget = s.buddy + (s.run ? Math.sin(t * .5) * 1.2 : 0);
  val.buddy += (bTarget - val.buddy) * .04;
  $('vDepth').textContent = Math.abs(val.depth).toFixed(1);
  $('vTemp').textContent = val.temp.toFixed(1);
  $('vBuddy').textContent = Math.max(1, Math.round(val.buddy));
  // 버디 방향 화살표: 버디가 있는 쪽을 가리키며, 서로 움직이는 만큼 계속 조금씩 돌아간다
  const wander = Math.sin(t * .45) * 22 + Math.sin(t * 1.3 + 1) * 7 + Math.max(0, Math.sin(t * .13) - .75) / .25 * 80;
  val.dir += ((s.buddyDir + wander) - val.dir) * .06;
  $('vDir').style.transform = `rotate(${val.dir.toFixed(1)}deg)`;

  // 다이빙 시간: 잠수 중에는 1초씩 증가
  const dv = s.run ? diveBase + Math.floor(el / 1000) : diveBase;
  $('vDive').textContent = `${pad(Math.floor(dv / 60))}:${pad(dv % 60)}`;

  // 영상: 막혔으면 다시 재생(끝난 뒤에는 마지막 장면에서 멈춘 채로 둔다)
  const vid = s.vid;
  if (vid && s.loop) { if (vid.paused && now - (vid._try || 0) > 600) { vid._try = now; safePlay(vid); } }
  else if (vid) {
    const d = vid.duration || 5.04, at = el / 1000;
    if (at >= d - .08) { if (vid.paused && vid.currentTime < d - .15) vid.currentTime = d - .04; }            // 끝: 마지막 장면에 고정
    else if (vid.paused && now - (vid._try || 0) > 600) {                                                     // 멈춰 있으면 장면 시간에 맞춰 이어서 재생
      vid._try = now;
      if (Math.abs(vid.currentTime - at) > .4) vid.currentTime = at;
      safePlay(vid);
    }
  }

  // 수거 카운트 +1
  if (s.collectTo && !collectDone && el > s.collectAt) {
    collectDone = true; const c = $('vCollected'); c.textContent = pad(s.collectTo);
    c.parentElement.classList.remove('bump'); void c.offsetWidth; c.parentElement.classList.add('bump');
  }

  // TODAY 전송률
  if (s.today) {
    todayPct = Math.max(0, Math.min(100, (el - 900) / 4600 * 100));
    const p = Math.floor(todayPct);
    $('todayPct').textContent = p >= 100 ? '기록 전송 완료 100%' : `기록 전송 중 ${p}%`;
    $('todayFill').style.width = 562.2 * todayPct / 100 + 'px';
  }

  // 부유물
  moteAlpha += ((s.under ? 1 : 0) - moteAlpha) * .04;
  cx.clearRect(0, 0, 1920, 1080);
  if (moteAlpha > .02) {
    cx.fillStyle = '#e8fbff';
    motes.forEach(m => {
      m.y -= m.v; m.x += Math.sin(t * .6 + m.p) * .25;
      if (m.y < -10) { m.y = 1090; m.x = Math.random() * 1920; }
      cx.globalAlpha = moteAlpha * (.25 + .35 * Math.sin(t + m.p) ** 2);
      cx.beginPath(); cx.arc(m.x, m.y, m.r, 0, 6.283); cx.fill();
    });
    cx.globalAlpha = 1;
  }
  requestAnimationFrame(tick);
}

// 확인용: ?scene=3 으로 특정 장면부터 시작
const q = new URLSearchParams(location.search), startScene = Math.max(0, Math.min(SCENES.length - 1, (+q.get('scene') || 1) - 1));
document.fonts.ready.then(() => { go(startScene); requestAnimationFrame(tick); });
