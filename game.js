(() => {
  'use strict';
  const GOAL = 12;
  const MAX_BOOST = 7;
  const canvas = document.getElementById('game');
  const stage = document.getElementById('gameStage');
  const ctx = canvas.getContext('2d', { alpha: false });
  const $ = id => document.getElementById(id);
  const ui = {
    flowers: $('flowersCount'), boosts: $('boostCount'), best: $('bestCount'),
    progress: $('progressFill'), progressTrack: $('progressTrack'), progressText: $('progressCaption'),
    overlay: $('overlay'), card: $('overlayCard'), title: $('overlayTitle'),
    kicker: $('cardKicker'), desc: $('overlayText'), action: $('overlayBtn'),
    footnote: $('overlayFootnote'), sound: $('soundBtn'), pause: $('pauseBtn'),
    jump: $('jumpBtn'), toast: $('toast')
  };
  const dogImage = new Image();
  dogImage.src = 'assets/dog.webp';
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const between = (a, b) => a + Math.random() * (b - a);
  let width = 900, height = 540, dpr = 1;
  let mode = 'ready', lastFrame = 0, elapsed = 0, traveled = 0;
  let irises = [], clouds = [], particles = [], flowerClock = 0, cloudClock = 0;
  let collected = 0, boosts = 5, best = 0, toastUntil = 0, mute = true, audioContext = null;
  let dog = { x: 240, y: 270, vy: 0, tilt: 0 };
  const stars = Array.from({length: 38}, (_, i) => ({
    nx: ((i * 0.61803398875 + 0.13) % 1),
    ny: 0.04 + ((i * 0.351731 + 0.04) % 0.70),
    r: 0.9 + (i % 4) * 0.35,
    phase: i * 2.18
  }));
  try { best = Math.max(0, Number(localStorage.getItem('iris-flight-best') || 0) || 0); }
  catch { /* The game also works with storage disabled. */ }

  function dogWidth() { return width < 560 ? clamp(width * .30, 93, 123) : clamp(width * .162, 118, 167); }
  function dogHeight() { return dogWidth() * 0.546; }
  function groundY() { return height - 49; }
  function speed() { return clamp(width * .28, 150, 230) + Math.min(52, traveled * .009); }
  function setBest(value) {
    if (value <= best) return;
    best = value;
    try { localStorage.setItem('iris-flight-best', String(best)); } catch { /* Ignore private mode. */ }
  }
  function sizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const prevH = height;
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (mode === 'playing' || mode === 'paused') dog.y = clamp(dog.y * height / Math.max(1,prevH), 65, groundY()-30);
    else dog.y = height * .47;
    dog.x = width * (width < 560 ? .28 : .265);
    render();
  }
  function start() {
    mode = 'playing';
    traveled = 0; elapsed = 0; collected = 0; boosts = 5;
    irises = []; clouds = []; particles = [];
    dog = { x: width * (width < 560 ? .28 : .265), y: height * .45, vy: -95, tilt: 0 };
    flowerClock = 1.0; cloudClock = 1.65;
    spawnFlower(true);
    spawnCloud(); clouds[0].x = width * .88;
    ui.overlay.hidden = true;
    ui.pause.disabled = false;
    ui.jump.disabled = false;
    ui.pause.textContent = 'Ⅱ';
    ui.pause.setAttribute('aria-label', 'Пауза');
    ui.pause.title = 'Пауза';
    updateHud();
    sound(380, 0.09, 'sine', .035);
    if (!lastFrame) lastFrame = performance.now();
  }
  function updateHud() {
    ui.flowers.innerHTML = `${collected} <small>/ ${GOAL}</small>`;
    ui.boosts.textContent = String(boosts);
    ui.best.textContent = String(best);
    const progress = clamp(collected / GOAL * 100, 0, 100);
    ui.progress.style.width = `${progress}%`;
    ui.progressTrack.setAttribute('aria-valuenow', String(collected));
    ui.progressText.textContent = collected === GOAL ? 'БУКЕТ СОБРАН! ✿' : `ИРИСЫ ДЛЯ СЮРПРИЗА: ${collected} / ${GOAL} ✿`;
  }
  function overlay(kind) {
    const defs = {
      ready: {
        kicker: '✦ ТВОЁ ПРИКЛЮЧЕНИЕ НАЧИНАЕТСЯ ✦',
        title: 'Полетели за ирисами?',
        desc: 'Нажимай на экран или <b>пробел</b>, чтобы взлетать. Ирисы добавляют прыжки, а облака подбрасывают вверх!',
        action: 'Начать полёт', note: 'За 12 ирисов тебя ждёт маленький секрет ♡'
      },
      paused: {
        kicker: '✦ НЕМНОГО ПЕРЕДОХНЁМ ✦',
        title: 'Маленькая пауза',
        desc: `Букет уже пополнился на <b>${collected}</b> ирисов. Собачка готова лететь дальше!`,
        action: 'Продолжить полёт', note: 'Ирисы никуда не денутся ♡'
      },
      over: {
        kicker: '✦ ПУТЕШЕСТВИЕ ПРОДОЛЖИТСЯ ✦',
        title: collected >= 7 ? 'Какой чудесный букет!' : 'Попробуем ещё раз?',
        desc: `Ты собрала <b>${collected} ${flowerWord(collected)}</b>! Для секретного подарка нужно 12. Ещё один полёт — и всё получится.`,
        action: 'Лететь снова', note: 'Облака помогут! А ещё можно не тратить все прыжки сразу ✿'
      },
      won: {
        kicker: '✦ СЕКРЕТНОЕ ПОСЛАНИЕ ДОСТАВЛЕНО ✦',
        title: 'Ксюша, это для тебя ♡',
        desc: 'Ты собрала все <b>12 ирисов</b>, но самый прекрасный цветок здесь — <b>ты</b>. С днём рождения, моя любимая! Пусть рядом с тобой всегда будет любовь, уют, смех и много счастливых мгновений. <b>Я тебя очень люблю.</b> ✿',
        action: 'Ещё один полёт', note: 'Твой виртуальный букет навсегда с тобой ♡'
      }
    };
    const d = defs[kind];
    ui.kicker.textContent = d.kicker;
    ui.title.textContent = d.title;
    ui.desc.innerHTML = d.desc;
    ui.action.innerHTML = `${d.action} <span aria-hidden="true">↗</span>`;
    ui.footnote.textContent = d.note;
    ui.card.classList.toggle('is-secret', kind === 'won');
    ui.overlay.hidden = false;
    ui.jump.disabled = true;
    ui.pause.disabled = kind !== 'paused';
  }
  function flowerWord(n) {
    if (n % 10 === 1 && n % 100 !== 11) return 'ирис';
    if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return 'ириса';
    return 'ирисов';
  }
  function jump() {
    if (mode !== 'playing') return;
    if (boosts <= 0) {
      notify('Найди ирис или облачко ✿');
      sound(190, .055, 'sine', .014);
      return;
    }
    boosts--;
    dog.vy = clamp(Math.min(dog.vy, 30) - (width < 560 ? 328 : 347), -525, 430);
    dog.y = Math.max(dog.y, 72);
    emit(dog.x - dogWidth() * .30, dog.y + 18, '#fff5de', 8, 95);
    sound(440, .085, 'sine', .023);
    updateHud();
  }
  function notify(txt) {
    ui.toast.textContent = txt;
    ui.toast.classList.add('show');
    toastUntil = performance.now() + 1250;
  }
  function sound(freq, duration, type, gain) {
    if (mute) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const osc = audioContext.createOscillator();
      const vol = audioContext.createGain();
      const now = audioContext.currentTime;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(100, freq * .72), now + duration);
      vol.gain.setValueAtTime(gain, now);
      vol.gain.exponentialRampToValueAtTime(.0001, now + duration);
      osc.connect(vol); vol.connect(audioContext.destination);
      osc.start(now); osc.stop(now + duration + .01);
    } catch { /* Sound is optional. */ }
  }
  function emit(x, y, color, count = 10, power = 145) {
    for (let i = 0; i < count; i++) {
      const a = between(0, Math.PI * 2), v = between(power * .25, power);
      particles.push({ x, y, vx: Math.cos(a)*v, vy: Math.sin(a)*v, age: 0,
        life: between(.3,.8), radius: between(2,4.5), color,
        kind: Math.random() < .26 ? 'heart' : 'dot' });
    }
  }
  function spawnFlower(first = false) {
    const rad = width < 560 ? 18 : 21;
    const center = first ? height*.40 : dog.y + between(-54, 58);
    irises.push({x: first ? width * .80 : width + 36, y: clamp(center, 115, groundY()-68),
      rad, phase: between(0, 6.28), style: Math.floor(between(0, 3)), done:false });
  }
  function spawnCloud() {
    clouds.push({x: width + 76, y: clamp(dog.y + between(65, 150), 142, groundY()-38),
      w: between(width<560?83:108,width<560?128:173), phase: between(0, 6.28), used: false});
  }
  function collect(f) {
    f.done = true;
    collected++;
    boosts = Math.min(MAX_BOOST, boosts + 2);
    setBest(collected);
    updateHud();
    emit(f.x, f.y, '#f4ddff', 19, 190);
    emit(f.x, f.y, '#f1cf7f', 8, 160);
    notify(collected === GOAL ? 'Ура! Все ирисы собраны! ♡' : ['Прекрасно! ✿','Ещё один ирис! ♡','Для Ксюши! ✧'][collected % 3]);
    sound(690, .12, 'sine', .045);
    window.setTimeout(() => sound(925, .13, 'sine', .022), 85);
    if (collected >= GOAL) {
      mode = 'won';
      ui.pause.disabled = true;
      overlay('won');
    }
  }
  function pause() {
    if (mode === 'playing') { mode = 'paused'; overlay('paused'); ui.pause.textContent='▶'; ui.pause.disabled=false; }
    else if (mode === 'paused') { mode = 'playing'; ui.overlay.hidden=true; ui.jump.disabled=false;
      ui.pause.textContent = 'Ⅱ'; ui.pause.title='Пауза'; ui.pause.setAttribute('aria-label','Пауза'); lastFrame=performance.now(); }
  }
  function end() {
    if (mode !== 'playing') return;
    mode = 'over';
    ui.pause.disabled = true;
    sound(180, .19, 'sine', .038);
    overlay('over');
  }
  function update(dt) {
    elapsed += dt;
    const vx = speed();
    traveled += vx*dt;
    const prevY = dog.y;
    dog.vy = Math.min(dog.vy + dt * (width < 560 ? 680 : 710), 560);
    dog.y += dog.vy * dt;
    if (dog.y < 64) {dog.y = 64; dog.vy = Math.max(30, dog.vy);}
    dog.tilt += (clamp(dog.vy / 900, -.26, .28) - dog.tilt) * Math.min(1, 7*dt);
    flowerClock -= dt;
    cloudClock -= dt;
    if (flowerClock <= 0) { spawnFlower(); flowerClock = between(.95,1.27); }
    if (cloudClock <= 0) { spawnCloud(); cloudClock = between(1.62,2.4); }
    const r = dogWidth()*.27;
    for (const f of irises) {
      f.x -= vx*dt;
      f.phase += dt*2.1;
      if (f.x > dog.x && f.x < dog.x + 270) f.y += (dog.y - f.y) * dt * 2.0;
      const fy = f.y + Math.sin(f.phase)*5;
      if (!f.done && Math.hypot(f.x-dog.x, fy-dog.y) < r+f.rad*.84) collect(f);
    }
    irises = irises.filter(f => !f.done && f.x > -55);
    if (mode !== 'playing') return;
    for (const c of clouds) {
      c.x -= vx*dt;
      const top = c.y - 7;
      const radius = dogHeight()*.21;
      if (!c.used && dog.vy >= 0 && prevY+radius <= top+11 && dog.y+radius >= top &&
          dog.x + r*.8 > c.x-c.w*.45 && dog.x-r*.8 < c.x+c.w*.45) {
        dog.y = top-radius;
        dog.vy = -390;
        c.used = true;
        emit(dog.x, top, '#fffdfa', 14, 110);
        notify('Облачный прыжок ☁');
        sound(565,.13,'sine',.035);
      }
    }
    clouds = clouds.filter(c => c.x+c.w > -30);
    for (const p of particles) {
      p.age += dt; p.x += p.vx*dt; p.y += p.vy*dt;
      p.vy += 100*dt; p.vx *= (1-dt*.7);
    }
    particles = particles.filter(p => p.age < p.life);
    if (dog.y + dogHeight()*.31 >= groundY()) end();
  }
  function roundedRect(x,y,w,h,r) {
    ctx.beginPath(); ctx.roundRect(x,y,w,h,r);
  }
  function drawBackground(t) {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0,'#c5b9e0'); sky.addColorStop(.47,'#e4d5ea');
    sky.addColorStop(.80,'#ffe2db'); sky.addColorStop(1,'#fce1cd');
    ctx.fillStyle=sky; ctx.fillRect(0,0,width,height);
    // A soft sun behind the clouds, with a gentle halo.
    const sunX=width*.80, sunY=height*.23;
    const halo=ctx.createRadialGradient(sunX,sunY,3,sunX,sunY,Math.max(190,width*.40));
    halo.addColorStop(0,'#fffce7bc'); halo.addColorStop(.27,'#fef7e65e'); halo.addColorStop(1,'#fff5dc00');
    ctx.fillStyle=halo;ctx.fillRect(0,0,width,height);
    ctx.globalAlpha=.53;ctx.fillStyle='#fffcef';ctx.beginPath();ctx.arc(sunX,sunY,Math.min(44,width*.10),0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    for (const s of stars) {
      const xx = ((s.nx*width - traveled*.055) % (width+40) + width+40)%(width+40)-15;
      const yy = s.ny*height;
      ctx.globalAlpha = .18 + .30 * (.5 + .5*Math.sin(t*.95+s.phase));
      ctx.fillStyle='#fffefa';
      ctx.beginPath();ctx.arc(xx,yy,s.r,0,2*Math.PI);ctx.fill();
    }
    ctx.globalAlpha=1;
    // Layered faraway hills: parallax is independent from ground speed.
    waveHill(height*.84, 34, '#d3c7dc', .035, t, .5);
    waveHill(height*.90, 28, '#bfaece', .074, t, .52);
    waveHill(height*.97, 24, '#a9a0be', .11, t, .59);
    // Grass strip in front, ornamental flowers.
    ctx.fillStyle='#c5b8a8';ctx.fillRect(0,groundY()+5,width,height-groundY());
    ctx.fillStyle='#e1d2b3';ctx.fillRect(0,groundY()+5,width,4);
    for (let i=0;i<Math.ceil(width/46)+2;i++) {
      const x=((i*47 - traveled*.36)%(width+50)+(width+50))%(width+50)-12;
      const y=groundY()+8+(i%3)*6;
      ctx.strokeStyle='#927f93';ctx.globalAlpha=.46;ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(x,y+15);ctx.quadraticCurveTo(x+4,y+1,x+9,y-5);ctx.stroke();
      if (i%3===0) {ctx.fillStyle=i%2?'#fbe8f6':'#eee0b0';ctx.beginPath();ctx.arc(x+9,y-5,2.5,0,Math.PI*2);ctx.fill();}
    }
    ctx.globalAlpha=1;
    // Decorative distant clouds (not gameplay platforms).
    for (let i=0;i<5;i++) {
      const x=((i*253+85 - traveled*.13)%(width+340)+(width+340))%(width+340)-125;
      const y=height*(.18+(i%4)*.105);
      drawCloud(x,y,90+(i%2)*30,.24,0);
    }
  }
  function waveHill(baseY, amp, color, motion, t, freq) {
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,height);
    for(let x=0;x<=width+15;x+=15) {
      const y=baseY+Math.sin((x+traveled*motion)*.006+freq)*amp+
        Math.sin((x+traveled*motion)*.013+freq*2)*amp*.35;
      ctx.lineTo(x,y);
    }
    ctx.lineTo(width,height);ctx.closePath();ctx.fill();
  }
  function drawCloud(x,y,cloudW,opacity=1,phase=0) {
    ctx.save();ctx.translate(x,y+Math.sin(elapsed*1.3+phase)*2);
    ctx.globalAlpha=opacity;
    const scale=cloudW/125;
    ctx.scale(scale,scale);
    ctx.shadowColor='#594e8960';ctx.shadowBlur=opacity>.5?18:0;ctx.shadowOffsetY=8;
    const grad=ctx.createLinearGradient(0,-35,0,37);
    grad.addColorStop(0,'#fffcff');grad.addColorStop(1,'#dfd6f4');
    ctx.fillStyle=grad;
    ctx.beginPath();ctx.ellipse(-25,3,38,24,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(4,-13,34,35,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(34,2,32,24,0,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.ellipse(1,15,64,19,0,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
  function petal(direction, length, fat, color) {
    ctx.save();ctx.rotate(direction);ctx.fillStyle=color;
    ctx.beginPath();ctx.moveTo(0,0);
    ctx.bezierCurveTo(-fat*.55,-length*.48,-fat,-length*.95,0,-length);
    ctx.bezierCurveTo(fat,-length*.95,fat*.55,-length*.46,0,0);
    ctx.fill();ctx.restore();
  }
  function drawIris(f) {
    ctx.save();ctx.translate(f.x,f.y+Math.sin(f.phase)*5);
    const sc=f.rad/20;ctx.scale(sc,sc);
    ctx.rotate(Math.sin(f.phase*.5)*.06);
    ctx.shadowColor='#70529d55';ctx.shadowBlur=11;ctx.shadowOffsetY=3;
    ctx.strokeStyle='#648a7a';ctx.lineWidth=2;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(0,10);ctx.quadraticCurveTo(4,27,1,41);ctx.stroke();
    ctx.fillStyle='#7ba18d';
    ctx.beginPath();ctx.moveTo(1,30);ctx.quadraticCurveTo(-15,22,-15,16);ctx.quadraticCurveTo(-5,19,1,30);ctx.fill();
    ctx.beginPath();ctx.moveTo(2,35);ctx.quadraticCurveTo(16,23,17,16);ctx.quadraticCurveTo(6,21,2,35);ctx.fill();
    const vio=['#8269b4','#9474c5','#6f61ad'][f.style];
    const pale=['#c1a6e2','#d2b2e8','#b39ce4'][f.style];
    ctx.shadowColor='#7557a766';
    petal(-Math.PI/2,25,15,vio);
    petal(-Math.PI/2-.85,20,13,pale);
    petal(-Math.PI/2+.85,20,13,pale);
    petal(Math.PI/2-.5,19,17,vio);
    petal(Math.PI/2+.5,19,17,vio);
    petal(Math.PI/2,22,16,pale);
    ctx.shadowBlur=0;ctx.fillStyle='#f9d78d';
    ctx.beginPath();ctx.ellipse(0,-2,6,7,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f7f0ce';ctx.beginPath();ctx.arc(-2,-5,2,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
  function drawDog(t) {
    const w = dogWidth(), h = dogHeight();
    ctx.save();ctx.translate(dog.x,dog.y+Math.sin(t*6)*1.4);
    ctx.rotate(dog.tilt);
    const glow=ctx.createRadialGradient(0,0,0,0,0,w*.80);
    glow.addColorStop(0,'#fff7f6ab');glow.addColorStop(1,'#fff7f600');
    ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,w*.85,0,Math.PI*2);ctx.fill();
    if (dogImage.complete && dogImage.naturalWidth>0) {
      ctx.shadowColor='#5d44738c';ctx.shadowBlur=12;ctx.shadowOffsetY=8;
      ctx.drawImage(dogImage,-w*.54,-h*.52,w,h);
    } else {
      ctx.font=`${w*.55}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('🐶',0,0);
    }
    ctx.restore();
  }
  function drawParticles() {
    for (const p of particles) {
      ctx.save();ctx.globalAlpha = Math.max(0,1-p.age/p.life);
      ctx.fillStyle=p.color;ctx.translate(p.x,p.y);
      if (p.kind==='heart') {
        const r=p.radius;ctx.beginPath();ctx.moveTo(0,r*1.2);
        ctx.bezierCurveTo(-r*2,-r*.1,-r*1.8,-r*1.7,0,-r*.7);
        ctx.bezierCurveTo(r*1.8,-r*1.7,r*2,-r*.1,0,r*1.2);ctx.fill();
      } else {ctx.beginPath();ctx.arc(0,0,p.radius,0,Math.PI*2);ctx.fill();}
      ctx.restore();
    }
  }
  function render() {
    if (!width || !height) return;
    ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);
    drawBackground(elapsed);
    for (const c of clouds) drawCloud(c.x,c.y,c.w,c.used?.7:1,c.phase);
    for (const f of irises) drawIris(f);
    drawDog(elapsed);
    drawParticles();
    ctx.restore();
  }
  function frame(time) {
    const dt=Math.min((time-lastFrame)/1000 || 0, .034);
    lastFrame=time;
    if (mode==='playing') update(dt);
    // The scenery still moves a little before starting, but the player does not fall.
    if (mode==='ready') { elapsed+=dt*.5; dog.y=height*.47+Math.sin(elapsed*2)*6; }
    if (toastUntil && time>toastUntil) { ui.toast.classList.remove('show'); toastUntil=0; }
    render();
    requestAnimationFrame(frame);
  }
  ui.action.addEventListener('click', () => {
    if (mode==='paused') pause();
    else start();
  });
  ui.pause.addEventListener('click', e => {e.stopPropagation();pause();});
  ui.sound.addEventListener('click', e => {
    e.stopPropagation();mute=!mute;
    ui.sound.textContent=mute?'♫̸':'♫';
    ui.sound.title=mute?'Включить звук':'Выключить звук';
    ui.sound.setAttribute('aria-label',ui.sound.title);
    if (!mute) sound(590,.12,'sine',.035);
  });
  ui.jump.addEventListener('click', e => {e.stopPropagation();jump();});
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('button') || e.target.closest('.overlay') || e.target.closest('.hud') || e.target.closest('.progress-track')) return;
    jump();
  });
  window.addEventListener('keydown', e => {
    if (e.code==='Space'||e.code==='ArrowUp'||e.code==='KeyW') {
      if (e.target && /^(INPUT|TEXTAREA|BUTTON)$/.test(e.target.tagName)) return;
      e.preventDefault();
      if (e.repeat) return;
      if (mode==='ready'||mode==='over'||mode==='won') start();
      else if (mode==='playing') jump();
    }
    if (e.code==='Escape' && (mode==='playing'||mode==='paused')) {e.preventDefault();pause();}
  },{passive:false});
  document.addEventListener('visibilitychange', () => {if (document.hidden && mode==='playing') pause();});
  window.addEventListener('resize', sizeCanvas);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(sizeCanvas).observe(canvas);
  dogImage.addEventListener('load', render);
  sizeCanvas();
  updateHud();
  overlay('ready');
  requestAnimationFrame(frame);
})();
