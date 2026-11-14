/* Whirl Shakes — behaviour.
 * Plain script, no build step. Content lives in data.js (window.WHIRL).
 * GSAP drives the hero transitions; without it (or with reduced motion on)
 * every state change still happens, just instantly.
 *
 *   1 helpers      2 hero carousel   3 home sections   4 shop
 *   5 product page 6 cart            7 router & header 8 stacking cards
 *   9 fruit physics                 10 start-up
 */
(() => {
  'use strict';

  const D = window.WHIRL;
  if (!D) return;
  const gsap = window.gsap;

  /* ───────── 1. Helpers ───────── */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => D.shop.currency + Math.round(n).toLocaleString(D.shop.locale);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motion = !!gsap && !reduce;
  const canHover = matchMedia('(hover: hover)').matches;
  const src = {
    shake: flavour => `assets/img/shakes/${flavour}.webp`,
    scene: flavour => `assets/img/scenes/${flavour}.webp`,
    flow: flavour => `assets/img/scenes/${flavour}-flow.webp`,
    served: flavour => `assets/img/served/${flavour}.webp`,
    /* small picture of a flavour: the served shot where there is one, else the glass itself */
    thumb: flavour => D.flavours[flavour].served ? `assets/img/served/${flavour}-thumb.webp` : `assets/img/shakes/${flavour}.webp`,
    fruit: name => `assets/img/fruit/${name}.webp`
  };
  /* blend two #rrggbb colours: mix('#000000', '#ffffff', 0.25) is a dark grey */
  const mix = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
  const productById = id => D.products.find(p => p.id === id);
  const tileOf = p => p.tile || D.flavours[p.flavour].tile;
  const themeMeta = $('meta[name="theme-color"]');
  const setTheme = colour => themeMeta && themeMeta.setAttribute('content', colour);
  /* the whole page follows the active flavour: data.js owns the colours, the
     stylesheet only holds fallbacks for when the script has not run yet */
  const rootStyle = document.documentElement.style;
  function applyTheme(f) {
    rootStyle.setProperty('--accent', f.tile);
    rootStyle.setProperty('--soft', f.soft);
    rootStyle.setProperty('--deep', f.deep);
    setTheme(f.tile);
  }
  function neutralTheme() {
    const t = D.theme || {};
    rootStyle.setProperty('--accent', t.accent || '#9a5cc4');
    rootStyle.setProperty('--soft', t.soft || '#f3e3ff');
    setTheme('#fff4ec');
  }
  const raf = fn => { let queued = false; return () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; fn(); }); } }; };

  /* A picture that fails to load (a dropped connection, say) is fetched again, twice at most.
     If it still fails it is hidden, so no broken-picture icon shows. */
  const RETRIES = 2;
  const bare = url => url.split('?')[0];
  const retryUrl = (url, n) => `${bare(url)}?retry=${n}`;
  document.addEventListener('error', e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.getAttribute('src')) return;
    const url = bare(img.getAttribute('src'));
    const tries = img.dataset.failed === url ? +img.dataset.tries : 0;   // counted per picture: some elements are reused
    if (tries >= RETRIES) { img.classList.add('is-missing'); return; }
    img.dataset.failed = url;
    img.dataset.tries = tries + 1;
    setTimeout(() => { if (bare(img.getAttribute('src') || '') === url) img.src = retryUrl(url, tries + 1); }, 700 * (tries + 1));
  }, true);
  document.addEventListener('load', e => { if (e.target instanceof HTMLImageElement) e.target.classList.remove('is-missing'); }, true);

  /* backgrounds have no error event of their own, so an Image watches the same file */
  function setBackground(el, url, tries = 0) {
    const src = tries ? retryUrl(url, tries) : url;
    el.style.backgroundImage = `url("${src}")`;
    const probe = new Image();
    probe.onerror = () => { if (tries < RETRIES) setTimeout(() => setBackground(el, url, tries + 1), 700 * (tries + 1)); };
    probe.src = src;
  }

  /* re-rendering a block replaces its buttons; keep keyboard focus on the same control */
  const keepFocus = render => {
    const key = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : null;
    render();
    if (key) { const el = $(`[data-key="${key}"]`); if (el) el.focus(); }
  };

  /* ───────── 2. Hero carousel ───────── */
  const hero = $('#hero');
  const S = D.slides;
  const WORD_FILL = 1.03;                    // the headline spans a touch more than the full width
  const LOW_LETTERS = /[acegmnopqrsuvwxyz]+/g;   // letters that stay under the x-height line
  let face = { cap: 0.67, x: 0.5, tall: 0.73 };  // cap, x and ascender height of the display face (em); measured in fit()
  const layout = [];                             // per headline: font size, baseline and its runs of low letters
  let cur = 0, busy = false, heroSeen = true, hold = false, auto = true, timer = 0;
  let px = 0, py = 0;
  let liquid = null;                             // the moving backdrop (liquid.js), once it has loaded
  let pieces = [], pushing = false;              // the fruit on screen, and whether the push simulation is running
  const ptr = { x: 0, y: 0, vx: 0, vy: 0, t: 0, wake: 0, on: false };   // mouse or finger over the hero, in hero pixels

  $('#scenes').innerHTML = S.map((s, i) => `<div class="scene${i ? '' : ' is-active'}" data-bg="${src.scene(s.flavour)}"></div>`).join('') + '<canvas class="liquid" id="liquid" aria-hidden="true"></canvas><i class="foam" id="foam"></i>';
  $('#words').innerHTML = S.map((s, i) => `<div class="word-wrap"><span class="word${i ? '' : ' is-active'}" style="color:${D.flavours[s.flavour].ink}">${esc(s.word)}<i></i></span></div>`).join('');
  $('#jar-float').innerHTML = S.map((s, i) => `<img class="${i ? '' : 'is-active'}" data-src="${src.shake(s.flavour)}" alt="" decoding="async">`).join('');
  const scenes = $$('.scene', hero), words = $$('.word', hero), jars = $$('#jar-float img');
  const foam = $('#foam'), drops = $('#drops');

  /* slide 1 loads straight away, the rest once the page has finished loading */
  function loadSlide(i) {
    const scene = scenes[i], jar = jars[i];
    if (scene.dataset.bg) { setBackground(scene, scene.dataset.bg); delete scene.dataset.bg; }
    if (jar.dataset.src) { jar.src = jar.dataset.src; delete jar.dataset.src; }
  }
  function loadAllSlides() {
    S.forEach((s, i) => { loadSlide(i); new Image().src = src.thumb(s.flavour); s.fruit.forEach(f => { new Image().src = src.fruit(f[0]); }); });
  }

  /* Size every headline so it runs edge to edge and note where its letters end up.
     The tags are then tucked into the word itself: above a run of low letters
     (the "rape" of Grapeline), beside the capital and clear of the glass. */
  function fit() {
    const W = hero.clientWidth, H = hero.clientHeight;
    if (!W || !H) return;
    const small = W < 760;
    try {
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `400 200px ${getComputedStyle(words[0]).fontFamily}`;
      const rise = text => ctx.measureText(text).actualBoundingBoxAscent / 200;
      const cap = rise('H'), x = rise('x'), tall = rise('lfi');
      if (cap > 0 && x > 0) face = { cap, x, tall: Math.max(tall, cap) };
    } catch (e) { /* keep the defaults */ }
    const top = hero.getBoundingClientRect().top, range = document.createRange();
    words.forEach((w, i) => {
      w.style.fontSize = '100px';
      const natural = w.offsetWidth || 1;
      const size = Math.min(100 * W * WORD_FILL / natural, H * (small ? 0.3 : 0.44));
      w.style.fontSize = size.toFixed(1) + 'px';
      /* measured boxes include the slide transform; shift them to where the word rests (centred) */
      const shift = (W - w.offsetWidth) / 2 - w.getBoundingClientRect().left;
      const text = w.firstChild, runs = [];
      for (const m of text.data.matchAll(LOW_LETTERS)) {
        range.setStart(text, m.index); range.setEnd(text, m.index + m[0].length);
        const box = range.getBoundingClientRect();
        runs.push({ left: box.left + shift, right: box.right + shift });
      }
      layout[i] = { size, runs, baseline: w.lastChild.getBoundingClientRect().bottom - top };
    });
    hero.style.setProperty('--card-h', $('#hcard').offsetHeight + 'px');
    placeTags();
    flowRing();
  }
  function placeTags() {
    const tags = $('#tags'), W = hero.clientWidth, L = layout[cur];
    if (W < 760 || !L) { tags.style.left = tags.style.right = tags.style.top = ''; return; }   // small screens: the CSS spot under the header
    const onRight = S[cur].tagsSide === 'right';
    const width = tags.offsetWidth, height = tags.offsetHeight;
    const pad = $('#hcard').offsetLeft, mid = W / 2, gap = L.size * 0.045;
    const glass = $('#jar-move').offsetWidth * 0.235;      // half the width the shake takes up at this height
    let x = null, y = L.baseline - face.x * L.size - gap * 0.8 - height;
    for (const run of onRight ? [...L.runs].reverse() : L.runs) {
      const from = Math.max(run.left + gap, onRight ? mid + glass : pad);
      const to = Math.min(run.right - gap, onRight ? W - pad : mid - glass);
      if (to - from >= width) { x = onRight ? to - width : from; break; }
    }
    if (x === null) {   // no room inside this word: sit just above it instead
      const inset = Math.max(pad, W * 0.17 - 110);
      x = onRight ? W - inset - width : inset;
      y = L.baseline - face.tall * L.size - gap - height;
    }
    tags.style.left = Math.round(x) + 'px';
    tags.style.right = 'auto';
    tags.style.top = Math.max(92, Math.round(y)) + 'px';
  }
  /* repeat the badge label along its arch, then let it drift around like a ticker */
  let ringTween = null;
  function flowRing() {
    const label = $('#ring-label'), unit = label.dataset.unit;
    if (!unit) return;
    let period = 0, track = 0;
    try {
      label.textContent = unit;
      const one = label.getComputedTextLength();
      label.textContent = unit + unit;
      period = label.getComputedTextLength() - one;
      track = $('#ring-path').getTotalLength();
    } catch (e) { /* not rendered (page hidden): try again on the next layout */ }
    if (ringTween) { ringTween.kill(); ringTween = null; }
    label.setAttribute('startOffset', '0');
    if (!(period > 0)) return;
    label.textContent = unit.repeat(Math.ceil(track / period) + 2);
    if (motion) ringTween = gsap.fromTo(label, { attr: { startOffset: 0 } }, { attr: { startOffset: -period }, duration: period / 7, ease: 'none', repeat: -1, paused: !heroSeen });
  }

  /* Each piece is three nested elements, so three movements can run without fighting:
     the outer one follows the mouse (parallax), the middle one is pushed about (pushFruit)
     and the picture itself bobs up and down for as long as the slide is showing. */
  function renderFruit(slide, animate) {
    const box = $('#fruit');
    if (gsap) gsap.killTweensOf($$('.fruit, img', box));
    box.innerHTML = slide.fruit.map(([name, x, y, size, rot, depth, blur, flip]) =>
      `<i class="fruit${depth >= 1 ? ' is-front' : depth < 0.5 ? ' is-far' : ''}" data-depth="${depth}" style="left:${x}%;top:${y}%;--w:clamp(${Math.round(size * 5)}px,${size}vw,${Math.round(size * 21)}px);--blur:${blur || 0}px${flip ? ';transform:scaleX(-1)' : ''}">` +
      `<b><img src="${src.fruit(name)}" alt="" style="transform:rotate(${rot}deg)"></b></i>`).join('');
    pieces = $$('.fruit', box).map((el, k) => {
      const [, x, y, size, , depth, , flip] = slide.fruit[k];
      return { el, inner: el.firstElementChild, x, y, size, weight: clamp(depth, 0.45, 1.3), flip: flip ? -1 : 1, ox: 0, oy: 0, vx: 0, vy: 0, r: 0, vr: 0 };
    });
    if (!motion) return;
    const imgs = $$('img', box);
    if (animate) gsap.from(imgs, { y: 160, opacity: 0, rotation: '+=70', scale: 0.4, stagger: 0.08, duration: 1, ease: 'back.out(1.5)' });
    imgs.forEach((el, k) => gsap.to(el, { y: '+=18', rotation: '+=8', duration: 2.4 + k * 0.45, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 1.6 + k * 0.08 }));
    parallax();
  }

  /* everything on the slide that is text: tags, card, badge */
  function fill(i, animate) {
    const s = S[i], f = D.flavours[s.flavour], p = productById(s.product);
    const tags = $('#tags');
    tags.innerHTML = s.tags.map(t => `<li>${esc(t)}</li>`).join('');
    tags.classList.toggle('is-right', s.tagsSide === 'right');
    $('#hcard-name').textContent = p.name;
    $('#hcard-text').textContent = s.text;
    $('#hcard-thumb img').src = src.thumb(s.flavour);
    $('#hcard-thumb').href = $('#hcard-view').href = '#/product/' + p.id;
    $('#hcard-view').setAttribute('aria-label', 'View ' + p.name);
    /* non-breaking spaces, so the gaps between repeats are not collapsed */
    $('#ring-label').dataset.unit = (s.badge.label.toUpperCase() + ' · ').replace(/ /g, '\u00a0');
    $('#ring-value').textContent = s.badge.value;
    $('#ring-icon').setAttribute('href', '#i-' + s.flavour);
    hero.style.backgroundColor = f.tile;
    if (page === 'home') { applyTheme(f); fillStory(); }
    placeTags();
    flowRing();
    renderFruit(s, animate);
  }

  /* Three steps, one pinned panel: the picture and the counter follow the step
     being read, and the rail shows how far through the story you are. */
  const storySteps = $$('#story-steps li');
  let storyOn = 0;
  function fillStory() {
    const s = S[cur], imgs = $$('.story__img');
    if (imgs.length < 3) return;
    imgs[0].src = src.fruit(s.fruit[0][0]);
    imgs[1].src = src.shake(s.flavour);
    imgs[2].src = D.flavours[s.flavour].served ? src.served(s.flavour) : src.shake(s.flavour);
  }
  function paintStory() {
    if (!storySteps.length || !storySteps[0].offsetParent) return;
    const mid = innerHeight * 0.5;
    let best = 0, bd = Infinity;
    storySteps.forEach((li, i) => { const r = li.getBoundingClientRect(); const d = Math.abs((r.top + r.bottom) / 2 - mid); if (d < bd) { bd = d; best = i; } });
    const wrap = storySteps[0].parentElement.getBoundingClientRect();
    $('#story-rail').style.height = (clamp((mid - wrap.top) / Math.max(wrap.height, 1), 0, 1) * 100).toFixed(1) + '%';
    if (best === storyOn) return;
    storyOn = best;
    storySteps.forEach((li, i) => li.classList.toggle('is-on', i === best));
    $$('.story__img').forEach((im, i) => im.classList.toggle('is-active', i === best));
    const num = $('#story-num');
    num.textContent = '0' + (best + 1);
    if (motion) gsap.fromTo(num, { y: 16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.45, ease: 'power2.out' });
  }

  function parallax() {
    if (!motion) return;
    gsap.to('#jar-px', { rotation: px * 4, x: px * 24, duration: 1.2, overwrite: 'auto' });
    gsap.to('#fruit .fruit', { x: (i, el) => -px * 90 * el.dataset.depth, y: (i, el) => -py * 36 * el.dataset.depth, duration: 1.4, overwrite: 'auto' });
  }

  /* Fruit you can push. A piece near the mouse or a finger is shoved away from it and
     set spinning, then a soft spring floats it back to where it belongs. Runs only
     while something is actually moving. */
  const PUSH = { force: 5200, drag: 5.5, spin: 1.5, tilt: 0.05, spring: 38, damping: 5.2, springR: 30, dampingR: 4.2 };
  function nudge(clientX, clientY, fresh) {
    const box = hero.getBoundingClientRect(), now = performance.now();
    const x = clientX - box.left, y = clientY - box.top, dt = now - ptr.t;
    if (!fresh && ptr.on && dt < 120) {
      const k = 1000 / Math.max(dt, 8);
      ptr.vx = clamp((ptr.vx + (x - ptr.x) * k) / 2, -3000, 3000);
      ptr.vy = clamp((ptr.vy + (y - ptr.y) * k) / 2, -3000, 3000);
    } else ptr.vx = ptr.vy = 0;
    /* a moving pointer leaves a faint wake in the liquid; a tap makes a proper ripple */
    if (liquid && (fresh || (now - ptr.wake > 240 && Math.hypot(ptr.vx, ptr.vy) > 140))) { ptr.wake = now; liquid.ripple(x, y, fresh ? 0.8 : 0.35, true); }
    ptr.x = x; ptr.y = y; ptr.t = now; ptr.on = true;
    if (!pushing) { pushing = true; gsap.ticker.add(pushFruit); }
  }
  function pushFruit(time, delta) {
    const dt = Math.min(delta, 80) / 1000, W = hero.clientWidth, H = hero.clientHeight;   /* capped, but not so tight that a slow frame rate puts the spring in slow motion */
    let moving = false;
    for (const f of pieces) {
      let ax = 0, ay = 0, ar = 0;
      if (ptr.on) {
        const size = clamp(f.size * W / 100, f.size * 5, f.size * 21), reach = size * 0.5 + W * 0.05 + 40;
        const dx = f.x / 100 * W + gsap.getProperty(f.el, 'x') + f.ox - ptr.x;
        const dy = f.y / 100 * H + gsap.getProperty(f.el, 'y') + f.oy - ptr.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < reach) {
          const near = 1 - d / reach, shove = near * near * PUSH.force * f.weight;
          ax = dx / d * shove + ptr.vx * near * PUSH.drag * f.weight;
          ay = dy / d * shove + ptr.vy * near * PUSH.drag * f.weight;
          ar = (dx * ptr.vy - dy * ptr.vx) / d * near * PUSH.spin + dx / d * shove * PUSH.tilt;   // a glancing pass spins it
        }
      }
      f.vx += (ax - PUSH.spring * f.ox - PUSH.damping * f.vx) * dt;
      f.vy += (ay - PUSH.spring * f.oy - PUSH.damping * f.vy) * dt;
      f.vr += (ar - PUSH.springR * f.r - PUSH.dampingR * f.vr) * dt;
      f.ox += f.vx * dt; f.oy += f.vy * dt; f.r = clamp(f.r + f.vr * dt, -75, 75);
      let far = Math.hypot(f.ox, f.oy), limit = W * 0.11 + 30;
      if (far > limit) { f.ox *= limit / far; f.oy *= limit / far; }
      if (far > 0.25 || Math.abs(f.r) > 0.15 || Math.abs(f.vx) + Math.abs(f.vy) > 4 || Math.abs(f.vr) > 2) moving = true;
      else { f.ox = f.oy = f.r = f.vx = f.vy = f.vr = 0; far = 0; }   /* at rest: truly zero, so the style clears */
      /* a mirrored piece (see `flip`) has a mirrored inside, so its push is mirrored back */
      f.inner.style.transform = far > 0.01 || Math.abs(f.r) > 0.01
        ? `translate3d(${(f.ox * f.flip).toFixed(2)}px,${f.oy.toFixed(2)}px,0) rotate(${(f.r * f.flip).toFixed(2)}deg)` : '';
    }
    ptr.vx *= 0.82; ptr.vy *= 0.82;   // the pointer's speed dies away unless it keeps moving
    if (!moving) { pushing = false; gsap.ticker.remove(pushFruit); }
  }

  /* The colour flood: the new backdrop spreads out from the glass as a wobbling blob of
     liquid, with a pale band of foam running ahead of it. Both are clip-path polygons. */
  const BLOB_POINTS = 72;
  function blob(x, y, r, t, band) {
    let points = '';
    for (let i = 0; i < BLOB_POINTS; i++) {
      const a = i / BLOB_POINTS * Math.PI * 2;
      const wobble = 1 + 0.05 * Math.sin(a * 3 + t * 2.2) + 0.03 * Math.sin(a * 5 - t * 3.1 + 1.7) + 0.014 * Math.sin(a * 9 + t * 4.6 + 4);
      const rr = r * wobble + band * (0.6 + 0.4 * Math.sin(a * 4 + t * 3 + 2));
      points += `${i ? ',' : ''}${(x + Math.cos(a) * rr).toFixed(1)}px ${(y + Math.sin(a) * rr).toFixed(1)}px`;
    }
    return `polygon(${points})`;
  }
  const clip = (el, shape) => { el.style.webkitClipPath = el.style.clipPath = shape; };
  /* where the glass stands, in hero pixels (its layout box: the transitions only transform it) */
  function glassBox() {
    const box = $('.hero__jar'), h = box.offsetHeight;
    return { x: hero.clientWidth / 2, top: box.offsetTop, w: h * 647 / 1116, h };
  }

  /* Splash drops: as the new shake lands it throws off a burst of drops in its own colour.
     Each one flies a simple arc under gravity, stretched along its path, and fades as it falls. */
  function splash() {
    const H = hero.clientHeight, unit = Math.max(0.6, H / 1080), gravity = 2300 * unit, glass = glassBox();
    const cream = D.flavours[S[cur].flavour].cream, light = mix(cream, '#ffffff', 0.62), dark = mix(cream, '#000000', 0.28);
    const rnd = (a, b) => a + Math.random() * (b - a);
    const set = Array.from({ length: hero.clientWidth < 760 ? 10 : 18 }, (_, k) => {
      const side = k % 2 ? 1 : -1, back = k % 5 < 2, lean = rnd(0.2, 1.2), speed = rnd(520, 1150) * unit;
      const size = rnd(7, 19) * unit * (back ? 0.8 : 1);
      const el = document.createElement('i');
      el.className = 'drop' + (back ? ' is-back' : '');
      el.style.cssText = `width:${size.toFixed(1)}px;height:${size.toFixed(1)}px;margin:${(-size / 2).toFixed(1)}px;background:radial-gradient(circle at 34% 30%,${light} 0 12%,${cream} 48%,${dark} 100%)`;
      drops.appendChild(el);
      return { el, x: glass.x + side * rnd(0.04, 0.24) * glass.w, y: glass.top + rnd(0.14, 0.42) * glass.h, vx: side * speed * Math.sin(lean), vy: -speed * Math.cos(lean), life: rnd(0.75, 1.15), wait: rnd(0, 0.09) };
    });
    const clock = { t: 0 };
    gsap.to(clock, {
      t: 1.3, duration: 1.3, ease: 'none',
      onUpdate() {
        for (const d of set) {
          const t = clock.t - d.wait, age = t / d.life;
          if (t <= 0) continue;
          if (age >= 1) { d.el.style.opacity = 0; continue; }
          const vy = d.vy + gravity * t, stretch = 1 + Math.min(0.9, Math.hypot(d.vx, vy) / (1500 * unit));
          d.el.style.opacity = age < 0.65 ? 1 : (1 - age) / 0.35;
          d.el.style.transform = `translate3d(${(d.x + d.vx * t).toFixed(1)}px,${(d.y + d.vy * t + gravity * t * t / 2).toFixed(1)}px,0) rotate(${(Math.atan2(vy, d.vx) * 180 / Math.PI - 90).toFixed(1)}deg) scale(${(1 / Math.sqrt(stretch)).toFixed(3)},${stretch.toFixed(3)})`;
        }
      },
      onComplete() { set.forEach(d => d.el.remove()); }
    });
  }

  const FADE = '#tags, .hcard__body, .hcard__thumb, #ring-text, #ring-value, .ring__icon';
  function go(dir, target) {
    if (busy) return;
    const old = cur;
    const next = target == null ? (cur + dir + S.length) % S.length : target;
    if (next === old) return;
    cur = next;
    loadSlide(cur);
    const jar = $('#jar-move'), H = hero.clientHeight;
    const swapJar = () => jars.forEach((j, i) => j.classList.toggle('is-active', i === cur));
    /* the new backdrop is fully in: make it the active scene and hand it to the moving liquid */
    const settle = () => {
      scenes.forEach((sc, i) => { sc.classList.toggle('is-active', i === cur); sc.style.opacity = sc.style.zIndex = ''; clip(sc, ''); });
      foam.style.visibility = '';
      jar.style.clipPath = '';
      if (liquid) liquid.show(cur);
    };
    if (!motion) {
      words.forEach((w, i) => w.classList.toggle('is-active', i === cur));
      swapJar(); fill(cur, false); settle();
      return;
    }
    busy = true;
    const leaving = $$('#fruit img');
    gsap.killTweensOf(leaving);

    /* the old shake sinks small into the pool behind a rising waterline, the new
       one climbs back out of it — the glass never simply fades away */
    const rest = glassBox();
    const poolY = H * 0.76, restBottom = rest.top + rest.h;
    const cutJar = line => { const r = jar.getBoundingClientRect(); jar.style.clipPath = `inset(-40px -40px ${clamp(r.bottom - line, 0, r.height + 80).toFixed(1)}px -40px)`; };
    const sink = { p: 0 }, rise = { q: 1 };
    gsap.set(jar, { y: 0, scale: 1, opacity: 1, visibility: 'visible' });   // start clean: nothing left over from the last change

    const glass = glassBox(), fx = glass.x, fy = glass.top + glass.h * 0.56;
    const reach = Math.hypot(Math.max(fx, hero.clientWidth - fx), Math.max(fy, hero.clientHeight - fy)) * 1.12;   // past the far corner, wobble included
    const flood = { p: 0 };
    const tl = gsap.timeline({ onComplete: () => { busy = false; } });
    const paintFlood = () => {
      const r = reach * flood.p, t = tl.time();
      clip(scenes[cur], blob(fx, fy, r, t, 0));
      clip(foam, blob(fx, fy, r, t, reach * 0.024 * Math.min(1, flood.p * 8)));
    };
    foam.style.background = mix(D.flavours[S[cur].flavour].cream, '#ffffff', 0.6);
    paintFlood();
    scenes[cur].style.opacity = 1; scenes[cur].style.zIndex = 3;
    foam.style.visibility = 'visible';

    tl.to(flood, { p: 1, duration: 1, ease: 'power2.out', onUpdate: paintFlood, onComplete: settle }, 0.05)
      .to(jar, { y: H * 0.62, scale: 0.55, duration: 0.5, ease: 'power2.in' }, 0)
      .to(sink, { p: 1, duration: 0.5, ease: 'power1.in', onUpdate: () => cutJar(restBottom + (poolY - restBottom) * Math.min(1, sink.p * 1.35)) }, 0)
      .to(jar, { opacity: 0, duration: 0.1 }, 0.34)
      .to(leaving, { y: -180, opacity: 0, rotation: '+=50', duration: 0.45, stagger: 0.04, ease: 'power2.in' }, 0)
      .to(words[old], { xPercent: -110 * dir, duration: 0.85, ease: 'power3.inOut' }, 0)
      .fromTo(words[cur], { autoAlpha: 1, xPercent: 110 * dir }, { xPercent: 0, duration: 0.85, ease: 'power3.inOut' }, 0)
      .to(FADE, { opacity: 0, duration: 0.25 }, 0)
      .call(() => { swapJar(); fill(cur, true); }, null, 0.5)
      .to(FADE, { opacity: 1, duration: 0.4 }, 0.55)
      .to(jar, { opacity: 1, duration: 0.18, ease: 'none' }, 0.5)
      .to(jar, { y: 0, scale: 1, duration: 0.85, ease: 'back.out(1.5)' }, 0.5)
      .to(rise, { q: 0, duration: 0.85, ease: 'power2.out', onUpdate: () => cutJar(poolY + (restBottom - poolY) * (1 - rise.q)) }, 0.5)
      .call(() => { jar.style.clipPath = ''; }, null, 1.38)
      .call(splash, null, 0.8)
      .set(words[old], { autoAlpha: 0 }, 0.9)
      /* the glass drops back from its overshoot: a ripple runs out across the pool from its foot */
      .call(() => { if (liquid) liquid.ripple(glass.x, glass.top + glass.h * 0.97, 1); }, null, 1.12);
  }

  /* autoplay: only while the hero is actually being looked at, and only until
     someone pages through the slides themselves (then they are in charge) */
  const canAutoplay = () => auto && !reduce && page === 'home' && heroSeen && !hold && !document.hidden && !cartOpen;
  function step(dir) {
    if (busy) return;
    auto = false;
    clearInterval(timer);
    go(dir);
    $('#hero-status').textContent = `Flavour ${cur + 1} of ${S.length}: ${productById(S[cur].product).name}`;
  }

  function initHero() {
    if (motion) {
      gsap.set(words, { autoAlpha: 0, xPercent: 110 });
      gsap.set(words[0], { autoAlpha: 1, xPercent: 0 });
      gsap.to('#jar-float', { y: -14, rotation: 2, duration: 2.8, yoyo: true, repeat: -1, ease: 'sine.inOut' });
      if (canHover) hero.addEventListener('pointermove', e => { px = e.clientX / innerWidth - 0.5; py = e.clientY / innerHeight - 0.5; parallax(); }, { passive: true });
      /* pushing the fruit: a mouse as it moves, a finger as it touches down and drags */
      const lift = () => { ptr.on = false; };
      hero.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') nudge(e.clientX, e.clientY, false); }, { passive: true });
      hero.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') nudge(e.clientX, e.clientY, true); }, { passive: true });
      hero.addEventListener('pointerleave', lift);
      hero.addEventListener('touchstart', e => nudge(e.touches[0].clientX, e.touches[0].clientY, true), { passive: true });
      hero.addEventListener('touchmove', e => nudge(e.touches[0].clientX, e.touches[0].clientY, false), { passive: true });
      hero.addEventListener('touchend', lift, { passive: true });
      hero.addEventListener('touchcancel', lift, { passive: true });
    }
    loadSlide(0);
    fill(0, false);
    fit();

    $('#next').addEventListener('click', () => step(1));
    $('#prev').addEventListener('click', () => step(-1));
    $('#hcard-add').addEventListener('click', () => addToCart(S[cur].product));

    /* pause while someone is reading the card or tabbing through the hero */
    const card = $('#hcard');
    card.addEventListener('pointerenter', () => { hold = true; });
    card.addEventListener('pointerleave', () => { hold = false; });
    hero.addEventListener('focusin', () => { hold = true; });
    hero.addEventListener('focusout', () => { hold = false; });

    /* swipe */
    let sx = 0, sy = 0;
    hero.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    hero.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
    }, { passive: true });

    /* arrow keys, when the hero is on screen and nobody is typing */
    addEventListener('keydown', e => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (page !== 'home' || !heroSeen || cartOpen || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
      step(e.key === 'ArrowRight' ? 1 : -1);
    });

    if ('IntersectionObserver' in window) new IntersectionObserver(es => {
      heroSeen = es[0].isIntersecting;
      if (ringTween) ringTween.paused(!heroSeen);
      if (liquid) liquid.setVisible(heroSeen);
    }, { threshold: 0.35 }).observe(hero);
    timer = setInterval(() => { if (canAutoplay()) go(1); }, 6000);
  }

  /* ───────── 3. Home sections ───────── */
  const card = (p, i, extra = '') => `<article class="pcard${extra}" style="--tile:${tileOf(p)};--i:${i}">
    <a class="pcard__media" href="#/product/${p.id}" tabindex="-1" aria-hidden="true">${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}<span class="pcard__float"><img src="${src.shake(p.flavour)}" alt="" loading="lazy" width="647" height="1116"></span></a>
    <div class="pcard__body">
      <h3><a href="#/product/${p.id}">${esc(p.name)}</a></h3>
      <small>${esc(p.sub)} · <span class="rating">${icon('star')}${p.rating.toFixed(1)}</span></small>
      <div class="pcard__row"><span class="price">${money(p.price)}${p.was ? `<s>${money(p.was)}</s>` : ''}</span>
        <button class="btn btn--dark" type="button" data-act="add" data-id="${p.id}" aria-label="Add ${esc(p.name)} to cart">Add</button></div>
    </div></article>`;

  function initHome() {
    const line = 'Shake it up <i>★</i> Real fruit <i>★</i> Thick &amp; creamy <i>★</i> Made fresh <i>★</i> '.repeat(8);
    $('#marquee').innerHTML = line;
    $('#marquee-echo').innerHTML = line;
    $('#flavour-grid').innerHTML = D.products.filter(p => p.cat === 'Singles').map((p, i) => card(p, i)).join('');
    $('#stat-kcal').textContent = D.nutrition.kcal;
    $('#stat-ml').textContent = D.nutrition.ml;
    /* the 300ml tile counts up the first time it scrolls into view */
    if (motion && 'IntersectionObserver' in window) $$('b[data-count]').forEach(b => {
      new IntersectionObserver((es, ob) => {
        if (!es[0].isIntersecting) return;
        ob.disconnect();
        const to = +b.dataset.count, suffix = b.dataset.suffix || '', o = { n: 0 };
        gsap.to(o, { n: to, duration: 1.1, ease: 'power2.out', onUpdate: () => { b.textContent = Math.round(o.n) + suffix; } });
      }, { threshold: 0.6 }).observe(b);
    });
  }

  /* ───────── 4. Shop ───────── */
  const shop = { cat: 'All', sort: '', q: '' };
  const cats = ['All', ...new Set(D.products.map(p => p.cat))];

  function renderShop() {
    $$('#chips button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === shop.cat)));
    const q = shop.q.trim().toLowerCase();
    let list = D.products.filter(p => (shop.cat === 'All' || p.cat === shop.cat) &&
      (!q || `${p.name} ${p.sub} ${p.cat} ${D.flavours[p.flavour].label}`.toLowerCase().includes(q)));
    if (shop.sort === 'lo') list = [...list].sort((a, b) => a.price - b.price);
    if (shop.sort === 'hi') list = [...list].sort((a, b) => b.price - a.price);
    $('#shop-grid').innerHTML = list.map((p, i) => card(p, i, ' rise')).join('');
    $('#shop-empty').hidden = list.length > 0;
  }
  function initShop() {
    $('#chips').innerHTML = cats.map(c => `<button type="button" data-act="cat" data-cat="${c}" aria-pressed="${c === shop.cat}">${c}</button>`).join('');
    $('#shop-search').addEventListener('input', e => { shop.q = e.target.value; renderShop(); });
    $('#shop-sort').addEventListener('change', e => { shop.sort = e.target.value; renderShop(); });
  }

  /* ───────── 5. Product page ───────── */
  const view = { id: null, pack: 0, sub: false, qty: 1, shot: 0 };
  const linePrice = (p, pack, sub) => {
    const k = D.shop.packs[pack];
    return Math.round(p.price * k.size * (1 - k.off)) * (sub ? 1 - D.shop.subscribeRate : 1);
  };

  function renderProductInfo() {
    const p = productById(view.id);
    const total = linePrice(p, view.pack, view.sub) * view.qty;
    const pct = Math.round(D.shop.subscribeRate * 100);
    /* multi-packs only make sense for single shakes, and the subscription cannot be subscribed to again */
    const packs = p.cat !== 'Singles' ? '' : `
      <h2 id="pack-label">Pack size</h2>
      <div class="options" role="group" aria-labelledby="pack-label">${D.shop.packs.map((k, i) =>
        `<button type="button" data-act="pack" data-pack="${i}" data-key="pack-${i}" aria-pressed="${i === view.pack}"><b>${esc(k.label)}</b><small>${money(linePrice(p, i, false))}</small></button>`).join('')}</div>`;
    const purchase = p.cat === 'Subscriptions' ? '' : `
      <h2 id="buy-label">Purchase</h2>
      <div class="options" role="group" aria-labelledby="buy-label">
        <button type="button" data-act="sub" data-sub="0" data-key="sub-0" aria-pressed="${!view.sub}">One-time</button>
        <button type="button" data-act="sub" data-sub="1" data-key="sub-1" aria-pressed="${view.sub}">Subscribe &amp; save ${pct}%</button>
      </div>`;
    $('#product-info').innerHTML = `
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/shop">Shop</a><span aria-hidden="true">/</span><span>${esc(p.cat)}</span></nav>
      <small class="rating">${icon('star')}${p.rating.toFixed(1)} · 1,200+ reviews (placeholder)</small>
      <h1 class="display">${esc(p.name)}</h1>
      <div class="price pd__price" aria-live="polite">${money(total)}${p.was && !view.pack && !view.sub ? `<s>${money(p.was * view.qty)}</s>` : ''}</div>
      <p class="pd__lede">${esc(p.sub)}. Thick, creamy and made with real fruit (placeholder copy).</p>${packs}${purchase}
      <div class="buy">
        <div class="qty"><button type="button" data-act="qty" data-d="-1" data-key="qty-minus" aria-label="Decrease quantity">${icon('minus')}</button><span aria-live="polite" aria-label="Quantity">${view.qty}</span><button type="button" data-act="qty" data-d="1" data-key="qty-plus" aria-label="Increase quantity">${icon('plus')}</button></div>
        <button class="btn btn--dark" type="button" data-act="add-view" data-key="add-view">Add to cart · ${money(total)}</button>
      </div>
      <details open><summary>Nutrition</summary><p>Per ${D.nutrition.ml}ml cup: ${D.nutrition.kcal} kcal (placeholder values). Replace with the real nutrition panel.</p></details>
      <details><summary>Ingredients</summary><p>Real fruit, milk and cream base (placeholder list).</p></details>
      <details><summary>Allergens</summary><p>Contains milk (placeholder). Confirm before launch.</p></details>`;
  }
  /* The two photos are cut to the same frame, glass on glass, so one fades into the other. */
  function renderProduct(id) {
    const p = productById(id) || D.products[0];
    Object.assign(view, { id: p.id, pack: 0, sub: false, qty: 1, shot: 0 });
    applyTheme(D.flavours[p.flavour]);
    const shots = [{ url: src.shake(p.flavour), thumb: src.shake(p.flavour), alt: `${p.name} milkshake`, label: 'Show the splash photo' }];
    if (D.flavours[p.flavour].served) shots.push({ url: src.served(p.flavour), thumb: src.thumb(p.flavour), alt: `${p.name}, served with whipped cream and a straw`, label: 'Show the shake as it is served' });
    $('#product-view').innerHTML = `<div class="gallery" style="--tile:${tileOf(p)}">
        <div class="gallery__stage">${shots.map((sh, i) => `<img${i ? '' : ' class="is-active"'} src="${sh.url}" alt="${esc(sh.alt)}" width="647" height="1116"${i ? ' aria-hidden="true"' : ''}>`).join('')}</div>
        ${shots.length > 1 ? `<div class="gallery__thumbs" role="group" aria-label="Photos">${shots.map((sh, i) => `<button type="button" data-act="shot" data-shot="${i}" aria-pressed="${!i}" aria-label="${sh.label}"><img src="${sh.thumb}" alt="" width="186" height="320"></button>`).join('')}</div>` : ''}
      </div><div id="product-info"></div>`;
    renderProductInfo();
    return p;
  }
  function showShot(i) {
    view.shot = i;
    $$('.gallery__stage img').forEach((img, k) => { img.classList.toggle('is-active', k === i); img.setAttribute('aria-hidden', String(k !== i)); });
    $$('.gallery__thumbs button').forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
  }

  /* ───────── 6. Cart ───────── */
  const STORE = 'whirl-cart-v1';
  const cart = { lines: [], code: false };
  let cartOpen = false, lastFocus = null;
  const behindCart = $$('#header, #main, #contact');   // made inert while the drawer is open, so focus stays inside it
  const note = { code: '', codeTone: '', checkout: '' };

  try {
    const saved = JSON.parse(localStorage.getItem(STORE));
    if (saved && Array.isArray(saved.lines)) {
      cart.lines = saved.lines
        .filter(l => l && productById(l.id) && D.shop.packs[l.pack] && l.qty > 0)
        .map(l => ({ id: l.id, pack: l.pack | 0, sub: !!l.sub, qty: clamp(l.qty | 0, 1, 99) }));
      cart.code = !!saved.code;
    }
  } catch (e) { /* storage blocked or corrupt: start with an empty cart */ }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(cart)); } catch (e) { /* ignore */ } };

  const lineName = l => productById(l.id).name + (l.pack ? ' ' + D.shop.packs[l.pack].label : '') + (l.sub ? ' (subscription)' : '');
  const lineUnit = l => linePrice(productById(l.id), l.pack, l.sub);

  function addToCart(id, qty = 1, pack = 0, sub = false) {
    if (!productById(id)) return;
    const line = cart.lines.find(l => l.id === id && l.pack === pack && l.sub === sub);
    if (line) line.qty = clamp(line.qty + qty, 1, 99); else cart.lines.push({ id, pack, sub, qty: clamp(qty, 1, 99) });
    note.checkout = '';
    save(); renderCart(); openCart();
    const count = $('#cart-count');
    count.classList.remove('is-bump'); void count.offsetWidth; count.classList.add('is-bump');
  }

  function totals() {
    const subtotal = cart.lines.reduce((n, l) => n + lineUnit(l) * l.qty, 0);
    const discount = cart.code ? subtotal * D.shop.discountRate : 0;
    const total = subtotal - discount;                                    // what counts towards free shipping
    const freeShip = total >= D.shop.freeShippingFrom || !cart.lines.length;
    return { subtotal, discount, total, freeShip, due: total + (freeShip ? 0 : D.shop.shippingFee) };
  }

  /* Ordering goes through WhatsApp: the cart is written out as a message to the shop's number.
     Nothing is sent until the customer presses send in WhatsApp. */
  const waNumber = String(D.shop.whatsapp || '').replace(/\D/g, '').replace(/^0+/, '');
  function orderMessage() {
    const t = totals();
    return [
      `Hi ${D.brand}! I’d like to order:`,
      '',
      ...cart.lines.map(l => `• ${l.qty} × ${lineName(l)} — ${money(lineUnit(l) * l.qty)}`),
      '',
      `Subtotal: ${money(t.subtotal)}`,
      ...(cart.code ? [`${D.shop.discountCode} discount: −${money(t.discount)}`] : []),
      `Shipping: ${t.freeShip ? 'Free' : money(D.shop.shippingFee)}`,
      `*Total: ${money(t.due)}*`,
      '',
      'My name: ',
      'Deliver to: '
    ].join('\n');
  }
  const orderLink = () => `https://wa.me/${waNumber}?text=${encodeURIComponent(orderMessage())}`;
  /* opened as a real link, which browsers (and the in-app browsers of social apps) do not block */
  function openLink(url) {
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function renderCart() {
    const { freeShippingFrom: FREE, shippingFee, discountCode } = D.shop;
    const units = cart.lines.reduce((n, l) => n + l.qty, 0);
    const { subtotal, discount, total, freeShip, due } = totals();

    $('#cart-count').textContent = units;
    $('#cart-count').hidden = !units;
    $('#cart-btn').setAttribute('aria-label', units ? `Open cart, ${units} item${units === 1 ? '' : 's'}` : 'Open cart');

    $('#cart-items').innerHTML = cart.lines.length ? cart.lines.map((l, i) => {
      const p = productById(l.id);
      return `<div class="line"><span class="line__thumb" style="--tile:${tileOf(p)}"><img src="${src.shake(p.flavour)}" alt=""></span>
        <div class="line__body"><b>${esc(lineName(l))}</b>${money(lineUnit(l))}
          <div class="qty qty--sm"><button type="button" data-act="line-qty" data-i="${i}" data-d="-1" data-key="line-${i}-minus" aria-label="Decrease quantity">${icon('minus')}</button><span>${l.qty}</span><button type="button" data-act="line-qty" data-i="${i}" data-d="1" data-key="line-${i}-plus" aria-label="Increase quantity">${icon('plus')}</button></div></div>
        <button class="line__remove" type="button" data-act="line-remove" data-i="${i}" aria-label="Remove ${esc(lineName(l))}">${icon('close')}</button></div>`;
    }).join('') : `<div class="cart__empty"><p>Your cart is empty.</p><a class="btn btn--dark" href="#/shop" data-act="close-cart">Browse shakes</a></div>`;

    $('#cart-ship').innerHTML = `<small>${total >= FREE ? 'You’ve unlocked free shipping' : `Add ${money(FREE - total)} for free shipping`}</small>
      <div class="bar" role="presentation"><i style="width:${clamp(total / FREE * 100, 0, 100)}%"></i></div>`;
    const codeNote = $('#code-note');
    codeNote.textContent = note.code;
    codeNote.className = 'note' + (note.codeTone ? ' is-' + note.codeTone : '');
    $('#cart-totals').innerHTML = `<div class="total"><span>Subtotal</span><span>${money(subtotal)}</span></div>
      ${cart.code ? `<div class="total"><span>${esc(discountCode)} <button class="link" type="button" data-act="code-remove">remove</button></span><span>−${money(discount)}</span></div>` : ''}
      <div class="total"><span>Shipping</span><span>${freeShip ? 'Free' : money(shippingFee)}</span></div>
      <div class="total total--grand"><span>Total</span><span>${money(due)}</span></div>`;
    /* until the shop's number is filled in (data.js), say so: WhatsApp will ask for a contact */
    $('#checkout-note').textContent = note.checkout || (!waNumber && cart.lines.length ? 'Demo: no shop number is set yet, so WhatsApp will ask who to send your order to.' : '');
    $('#checkout').disabled = !cart.lines.length;
  }

  function applyCode() {
    const input = $('#code-input'), value = input.value.trim().toUpperCase();
    if (!value) { note.code = 'Enter a code first.'; note.codeTone = 'bad'; }
    else if (value === D.shop.discountCode.toUpperCase()) { cart.code = true; note.code = `${D.shop.discountCode} applied: ${Math.round(D.shop.discountRate * 100)}% off.`; note.codeTone = 'good'; input.value = ''; }
    else { note.code = 'That code isn’t valid.'; note.codeTone = 'bad'; }
    save(); renderCart();
  }

  function openCart() {
    if (cartOpen) return;
    cartOpen = true;
    lastFocus = document.activeElement;
    const el = $('#cart');
    el.inert = false; el.removeAttribute('aria-hidden');
    el.classList.add('is-open'); $('#overlay').classList.add('is-open');
    behindCart.forEach(part => { part.inert = true; });
    setTimeout(() => $('#cart-close').focus({ preventScroll: true }), 60);
  }
  function closeCart() {
    if (!cartOpen) return;
    cartOpen = false;
    const el = $('#cart');
    el.classList.remove('is-open'); $('#overlay').classList.remove('is-open');
    el.inert = true; el.setAttribute('aria-hidden', 'true');
    behindCart.forEach(part => { part.inert = false; });
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
  }

  /* one click handler for every data-act control */
  const actions = {
    add: el => addToCart(el.dataset.id),
    'add-view': () => addToCart(view.id, view.qty, view.pack, view.sub),
    pack: el => { view.pack = +el.dataset.pack; keepFocus(renderProductInfo); },
    sub: el => { view.sub = el.dataset.sub === '1'; keepFocus(renderProductInfo); },
    qty: el => { view.qty = clamp(view.qty + +el.dataset.d, 1, 99); keepFocus(renderProductInfo); },
    cat: el => { shop.cat = el.dataset.cat; renderShop(); },
    'reset-shop': () => { shop.cat = 'All'; shop.q = ''; shop.sort = ''; $('#shop-search').value = ''; $('#shop-sort').value = ''; renderShop(); },
    'line-qty': el => { const l = cart.lines[+el.dataset.i]; if (!l) return; l.qty += +el.dataset.d; if (l.qty < 1) cart.lines.splice(+el.dataset.i, 1); l.qty = Math.min(l.qty, 99); save(); keepFocus(renderCart); },
    'line-remove': el => { cart.lines.splice(+el.dataset.i, 1); save(); renderCart(); $('#cart-close').focus(); },
    'code-remove': () => { cart.code = false; note.code = ''; note.codeTone = ''; save(); renderCart(); },
    'close-cart': closeCart,
    shot: el => showShot(+el.dataset.shot),
    checkout: () => {
      if (!cart.lines.length) return;
      openLink(orderLink());
      note.checkout = waNumber ? 'WhatsApp is opening with your order. Press send there to place it.' : 'WhatsApp is opening with your order. Choose a chat, then press send.';
      renderCart();
    }
  };

  /* ───────── 7. Router & header ───────── */
  const header = $('#header');
  const pages = { home: $('#home'), shop: $('#shop'), product: $('#product') };
  let page = null, firstRoute = true, pendingScroll = null, pendingFocus = false;

  const parseHash = () => {
    const [, a = '', b = ''] = location.hash.split('/');
    return a === 'shop' ? ['shop'] : a === 'product' ? ['product', b] : ['home'];
  };
  const scrollToId = id => { const t = document.getElementById(id); if (t) t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); };

  const updateHeader = () => header.classList.toggle('is-solid', page !== 'home' || window.scrollY > hero.offsetHeight - 84);
  const shakes = $('#shakes');
  const setShakes = open => { shakes.classList.toggle('is-open', open); $('#shakes-toggle').setAttribute('aria-expanded', String(open)); };
  const closeMenu = () => { header.classList.remove('is-menu-open'); $('#menu-btn').setAttribute('aria-expanded', 'false'); setShakes(false); };

  function swap() {
    const [key, id] = parseHash();
    page = key;
    Object.keys(pages).forEach(k => { pages[k].hidden = k !== key; });
    $$('#nav [data-page]').forEach(el => {
      const on = el.dataset.page === key || (key === 'product' && el.dataset.page === 'shop');
      const link = el.matches('a') ? el : $('a', el);
      el.classList.toggle('is-active', on);
      if (on) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    closeMenu();
    window.scrollTo(0, 0);
    let title = `${D.brand} Shakes — thick, creamy milkshakes made with real fruit`;
    if (key === 'shop') { renderShop(); title = `Shop — ${D.brand} Shakes`; }
    if (key === 'product') title = `${renderProduct(id).name} — ${D.brand} Shakes`;
    document.title = title;
    if (key === 'home') { applyTheme(D.flavours[S[cur].flavour]); fillStory(); }
    else if (key === 'shop') neutralTheme();
    /* the product page themes itself from its own flavour, in renderProduct */
    observeReveals(pages[key]);
    updateHeader();
    if (key === 'home') { fit(); layoutStack(); }
    if (pendingScroll) { const target = pendingScroll; pendingScroll = null; requestAnimationFrame(() => scrollToId(target)); }
    if (pendingFocus) { pendingFocus = false; setTimeout(() => $('#shop-search').focus(), 80); }
  }
  function route() {
    if (firstRoute || !motion) { firstRoute = false; swap(); return; }
    gsap.timeline()
      .set('#wipe', { display: 'block', yPercent: 100 })
      .to('#wipe', { yPercent: 0, duration: 0.45, ease: 'power3.in' })
      .call(swap)
      .to('#wipe', { yPercent: -100, duration: 0.55, ease: 'power3.out' })
      .set('#wipe', { display: 'none' });
  }

  /* fade sections in as they scroll into view */
  const revealer = !reduce && 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('is-in'); revealer.unobserve(e.target); } }), { threshold: 0.15 })
    : null;
  function observeReveals(root) {
    if (!revealer) return;
    $$('.section h2, .stats > div, .pcard:not(.rise)', root).forEach(el => {
      if (el.classList.contains('reveal')) return;
      el.classList.add('reveal');
      revealer.observe(el);
    });
  }

  function initNav() {
    document.addEventListener('click', e => {
      const act = e.target.closest('[data-act]');
      if (act && actions[act.dataset.act]) { actions[act.dataset.act](act); return; }

      const jump = e.target.closest('a[data-scroll]');
      if (jump) {
        e.preventDefault(); closeMenu();
        const target = document.getElementById(jump.dataset.scroll);
        if (target && !target.closest('[hidden]')) scrollToId(jump.dataset.scroll);
        else { pendingScroll = jump.dataset.scroll; location.hash = '#/'; }
        return;
      }
      const link = e.target.closest('a[href^="#/"]');
      if (link) {
        if (cartOpen) closeCart();
        /* a link to the page we are already on: just go back to the top */
        if (link.getAttribute('href') === (location.hash || '#/')) { e.preventDefault(); closeMenu(); window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); }
        return;
      }
      if (header.classList.contains('is-menu-open') && !e.target.closest('#nav, #menu-btn')) closeMenu();
    });

    $('#menu-btn').addEventListener('click', () => {
      const open = header.classList.toggle('is-menu-open');
      $('#menu-btn').setAttribute('aria-expanded', String(open));
    });

    /* "Our Shakes" flavour list: opens on hover, or from its arrow button (keyboard and touch) */
    $('#shakes-menu').innerHTML = D.products.filter(p => p.cat === 'Singles').map(p =>
      `<a href="#/product/${p.id}"><i style="background:${tileOf(p)}"></i>${esc(p.name)}<small>${money(p.price)}</small></a>`).join('') +
      `<a class="nav__all" href="#/shop">Shop everything${icon('arrow-ur')}</a>`;
    if (canHover) {
      shakes.addEventListener('pointerenter', () => setShakes(true));
      shakes.addEventListener('pointerleave', () => setShakes(false));
    }
    /* a mouse click on the arrow keeps the hover-opened list open; keyboard and touch toggle it */
    $('#shakes-toggle').addEventListener('click', e => setShakes(canHover && e.detail ? true : !shakes.classList.contains('is-open')));
    shakes.addEventListener('focusout', e => { if (!shakes.contains(e.relatedTarget)) setShakes(false); });
    $('#shakes-menu').addEventListener('click', () => setShakes(false));
    $('#search-btn').addEventListener('click', () => {
      if (page === 'shop') { $('#shop-search').focus(); scrollToId('shop'); }
      else { pendingFocus = true; location.hash = '#/shop'; }
    });
    $('#cart-btn').addEventListener('click', openCart);
    $('#cart-close').addEventListener('click', closeCart);
    $('#overlay').addEventListener('click', closeCart);
    $('#code-form').addEventListener('submit', e => { e.preventDefault(); applyCode(); });
    addEventListener('keydown', e => { if (e.key === 'Escape') { if (cartOpen) closeCart(); else closeMenu(); } });
    addEventListener('scroll', raf(updateHeader), { passive: true });
    addEventListener('hashchange', route);
  }

  /* ───────── 8. Stacking cards ─────────
     On wide screens each home section pins to the top while the next one slides
     over it; the covered card shrinks and dims in step with the scroll. */
  const stack = $$('.stack');
  const wideStack = matchMedia('(min-width: 900px)');
  function layoutStack() {
    /* a card taller than the window pins once its bottom edge is in view, so nothing is cut off */
    stack.forEach(s => { s.style.top = wideStack.matches ? Math.min(0, innerHeight - s.offsetHeight) + 'px' : ''; });
    paintStack();
  }
  function paintStack() {
    const active = wideStack.matches && !reduce && page === 'home';
    stack.forEach((s, i) => {
      const next = stack[i + 1];
      if (!next) return;
      const covered = active ? clamp(1 - next.getBoundingClientRect().top / innerHeight, 0, 1) : 0;
      s.style.transform = covered ? `scale(${(1 - 0.07 * covered).toFixed(4)})` : '';
      s.style.filter = covered ? `brightness(${(1 - 0.42 * covered).toFixed(3)})` : '';
    });
  }

  /* ───────── 9. Fruit physics ─────────
     Fruit drops into the last band, piles up and can be grabbed and thrown.
     Matter.js is only fetched when the band is about to scroll into view. */
  const loadScript = url => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });

  function initPlay() {
    const band = $('#play'), hint = $('#play-hint');
    if (reduce || !('IntersectionObserver' in window)) { hint.hidden = true; return; }
    if (!canHover) hint.hidden = true;
    new IntersectionObserver((entries, observer) => {
      if (!entries[0].isIntersecting) return;
      observer.disconnect();
      loadScript('assets/vendor/matter.min.js').then(() => runPlay(band)).catch(() => { hint.hidden = true; });
    }, { rootMargin: '400px' }).observe(band);
  }

  function runPlay(band) {
    const { Engine, Runner, Bodies, Composite, Mouse, MouseConstraint, Body } = window.Matter;
    const canvas = $('#play-canvas'), ctx = canvas.getContext('2d');
    const engine = Engine.create();
    engine.gravity.y = 1.1;
    const names = [...new Set(S.flatMap(s => s.fruit.map(f => f[0])))];
    const images = names.map(n => { const im = new Image(); im.src = src.fruit(n); return im; });
    const pieces = [];
    let W = 0, H = 0, dpr = 1, walls = [], running = false, spawned = false;

    function size() {
      W = band.clientWidth; H = band.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      Composite.remove(engine.world, walls);
      walls = [
        Bodies.rectangle(W / 2, H + 40, W * 3, 80, { isStatic: true }),
        Bodies.rectangle(-40, H / 2, 80, H * 3, { isStatic: true }),
        Bodies.rectangle(W + 40, H / 2, 80, H * 3, { isStatic: true })
      ];
      Composite.add(engine.world, walls);
    }
    function drop() {
      const im = images[Math.floor(Math.random() * images.length)];
      const w = clamp(W * 0.09, 64, 130) * (0.7 + Math.random() * 0.6);
      const h = w * (im.naturalHeight || 1) / (im.naturalWidth || 1);
      const body = Bodies.circle(60 + Math.random() * Math.max(1, W - 120), -100, (w + h) * 0.21, { restitution: 0.5, friction: 0.3 });
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.3);
      pieces.push({ body, im, w, h });
      Composite.add(engine.world, body);
    }
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      for (const p of pieces) {
        if (!p.im.complete || !p.im.naturalWidth) continue;
        ctx.save();
        ctx.translate(p.body.position.x, p.body.position.y);
        ctx.rotate(p.body.angle);
        ctx.drawImage(p.im, -p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (running) requestAnimationFrame(draw);
    }

    size();
    addEventListener('resize', raf(size));
    if (canHover) {
      const mouse = Mouse.create(band);
      /* Matter cancels wheel and touch events on its element; hand page scrolling back */
      band.removeEventListener('wheel', mouse.mousewheel);
      band.removeEventListener('touchstart', mouse.mousedown);
      band.removeEventListener('touchmove', mouse.mousemove);
      band.removeEventListener('touchend', mouse.mouseup);
      Composite.add(engine.world, MouseConstraint.create(engine, { mouse, constraint: { stiffness: 0.2, render: { visible: false } } }));
    }
    const runner = Runner.create();
    new IntersectionObserver(entries => {
      const visible = entries[0].isIntersecting;
      if (visible && !running) {
        running = true;
        Runner.run(runner, engine);
        draw();
        if (!spawned) {
          spawned = true;
          let n = 0;
          const total = W < 700 ? 12 : 20;
          const feed = setInterval(() => { drop(); if (++n >= total) clearInterval(feed); }, 150);
        }
      } else if (!visible && running) {
        running = false;
        Runner.stop(runner);
      }
    }, { threshold: 0.3 }).observe(band);
  }

  /* ───────── 10. Start-up ───────── */
  $$('[data-brand]').forEach(el => { el.textContent = D.brand; });
  $$('[data-tag]').forEach(el => { el.textContent = D.socialTag || '#ShakeItUp'; });
  {
    const t = D.theme || {};
    for (const [key, varName] of [['ink', '--ink'], ['cream', '--cream'], ['alert', '--alert'], ['accent', '--accent'], ['soft', '--soft'], ['star', '--star']])
      if (t[key]) rootStyle.setProperty(varName, t[key]);
    const tag = D.tagline || 'thick, creamy milkshakes made with real fruit';
    const md = $('meta[name="description"]');
    if (md) md.setAttribute('content', `${D.brand} Shakes: ${tag}.`);
    const ogd = $('meta[property="og:description"]');
    if (ogd) ogd.setAttribute('content', tag.charAt(0).toUpperCase() + tag.slice(1) + '.');
    const ogt = $('meta[property="og:title"]');
    if (ogt) ogt.setAttribute('content', `${D.brand} Shakes`);
  }
  $('.logo').setAttribute('aria-label', D.brand + ' home');
  $$('#free-from, #free-from-2').forEach(el => { el.textContent = money(D.shop.freeShippingFrom); });
  $('#code-hint').textContent = D.shop.discountCode;
  $('#code-input').placeholder = `Discount code (try ${D.shop.discountCode})`;

  /* The moving liquid is the one part that loads late on purpose: the hero is complete
     without it, and the photograph simply stays still if it cannot run. */
  function initLiquid() {
    if (!motion) return;
    loadScript('assets/js/liquid.js').then(() => {
      liquid = window.whirlLiquid && window.whirlLiquid.start($('#liquid'), () => { liquid = null; });
      if (!liquid) return;
      S.forEach((s, i) => liquid.add(i, [src.scene(s.flavour), src.flow(s.flavour)]));
      liquid.show(cur);
    }).catch(() => { liquid = null; });
  }

  initHome();
  initShop();
  initHero();
  initNav();
  initPlay();
  initLiquid();
  renderCart();
  route();

  const paintScroll = raf(() => {
    paintStack();
    paintStory();
    /* the two marquee rows drift apart a little as you scroll into the page */
    if (motion && scrollY < innerHeight * 1.6) {
      $('#marquee').style.translate = `0 ${(scrollY * 0.05).toFixed(1)}px`;
      $('#marquee-echo').style.translate = `0 ${(-scrollY * 0.035).toFixed(1)}px`;
    }
  });
  const relayout = raf(() => { fit(); layoutStack(); updateHeader(); paintStory(); });
  addEventListener('resize', relayout);
  addEventListener('scroll', paintScroll, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  if (document.readyState === 'complete') { loadAllSlides(); relayout(); }
  else addEventListener('load', () => { loadAllSlides(); relayout(); }, { once: true });
})();
