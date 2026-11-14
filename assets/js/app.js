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
    fruit: name => `assets/img/fruit/${name}.webp`
  };
  const productById = id => D.products.find(p => p.id === id);
  const tileOf = p => p.tile || D.flavours[p.flavour].tile;
  const themeMeta = $('meta[name="theme-color"]');
  const setTheme = colour => themeMeta && themeMeta.setAttribute('content', colour);
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

  $('#scenes').innerHTML = S.map((s, i) => `<div class="scene${i ? '' : ' is-active'}" data-bg="${src.scene(s.flavour)}"></div>`).join('');
  $('#words').innerHTML = S.map((s, i) => `<div class="word-wrap"><span class="word${i ? '' : ' is-active'}" style="color:${D.flavours[s.flavour].ink}">${esc(s.word)}<i></i></span></div>`).join('');
  $('#jar-float').innerHTML = S.map((s, i) => `<img class="${i ? '' : 'is-active'}" data-src="${src.shake(s.flavour)}" alt="" decoding="async">`).join('');
  const scenes = $$('.scene', hero), words = $$('.word', hero), jars = $$('#jar-float img');

  /* slide 1 loads straight away, the rest once the page has finished loading */
  function loadSlide(i) {
    const scene = scenes[i], jar = jars[i];
    if (scene.dataset.bg) { setBackground(scene, scene.dataset.bg); delete scene.dataset.bg; }
    if (jar.dataset.src) { jar.src = jar.dataset.src; delete jar.dataset.src; }
  }
  function loadAllSlides() {
    S.forEach((s, i) => { loadSlide(i); s.fruit.forEach(f => { new Image().src = src.fruit(f[0]); }); });
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

  function renderFruit(slide, animate) {
    const box = $('#fruit');
    if (gsap) gsap.killTweensOf($$('.fruit, img', box));
    box.innerHTML = slide.fruit.map(([name, x, y, size, rot, depth, blur, flip]) =>
      `<i class="fruit${depth >= 1 ? ' is-front' : depth < 0.5 ? ' is-far' : ''}" data-depth="${depth}" style="left:${x}%;top:${y}%;--w:clamp(${Math.round(size * 5)}px,${size}vw,${Math.round(size * 21)}px);--blur:${blur || 0}px${flip ? ';transform:scaleX(-1)' : ''}">` +
      `<img src="${src.fruit(name)}" alt="" style="transform:rotate(${rot}deg)"></i>`).join('');
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
    $('#hcard-thumb img').src = src.shake(s.flavour);
    $('#hcard-thumb').href = $('#hcard-view').href = '#/product/' + p.id;
    $('#hcard-view').setAttribute('aria-label', 'View ' + p.name);
    /* non-breaking spaces, so the gaps between repeats are not collapsed */
    $('#ring-label').dataset.unit = (s.badge.label.toUpperCase() + ' · ').replace(/ /g, '\u00a0');
    $('#ring-value').textContent = s.badge.value;
    $('#ring-icon').setAttribute('href', '#i-' + s.flavour);
    hero.style.backgroundColor = f.tile;
    if (page === 'home') setTheme(f.tile);
    placeTags();
    flowRing();
    renderFruit(s, animate);
  }

  function parallax() {
    if (!motion) return;
    gsap.to('#jar-px', { rotation: px * 4, x: px * 24, duration: 1.2, overwrite: 'auto' });
    gsap.to('#fruit .fruit', { x: (i, el) => -px * 90 * el.dataset.depth, y: (i, el) => -py * 36 * el.dataset.depth, duration: 1.4, overwrite: 'auto' });
  }

  const FADE = '#tags, .hcard__body, .hcard__thumb, #ring-text, #ring-value, .ring__icon';
  function go(dir, target) {
    if (busy) return;
    const old = cur;
    const next = target == null ? (cur + dir + S.length) % S.length : target;
    if (next === old) return;
    cur = next;
    loadSlide(cur);
    const swapJar = () => jars.forEach((j, i) => j.classList.toggle('is-active', i === cur));
    const settle = () => {
      scenes.forEach((sc, i) => { sc.classList.toggle('is-active', i === cur); if (gsap) gsap.set(sc, { clearProps: 'opacity,zIndex' }); });
      busy = false;
    };
    if (!motion) {
      words.forEach((w, i) => w.classList.toggle('is-active', i === cur));
      swapJar(); fill(cur, false); settle();
      return;
    }
    busy = true;
    const leaving = $$('#fruit img');
    gsap.killTweensOf(leaving);
    gsap.set(scenes[cur], { zIndex: 2, opacity: 0 });
    gsap.timeline({ onComplete: settle })
      .to(scenes[cur], { opacity: 1, duration: 0.85, ease: 'power1.inOut' }, 0)
      .to('#jar-move', { y: 70, scale: 0.82, autoAlpha: 0, duration: 0.35, ease: 'power2.in' }, 0)
      .to(leaving, { y: -180, opacity: 0, rotation: '+=50', duration: 0.45, stagger: 0.04, ease: 'power2.in' }, 0)
      .to(words[old], { xPercent: -110 * dir, duration: 0.85, ease: 'power3.inOut' }, 0)
      .fromTo(words[cur], { autoAlpha: 1, xPercent: 110 * dir }, { xPercent: 0, duration: 0.85, ease: 'power3.inOut' }, 0)
      .to(FADE, { opacity: 0, duration: 0.25 }, 0)
      .call(() => { swapJar(); fill(cur, true); }, null, 0.5)
      .to(FADE, { opacity: 1, duration: 0.4 }, 0.55)
      .to('#jar-move', { y: 0, scale: 1, autoAlpha: 1, duration: 0.8, ease: 'back.out(1.8)' }, 0.55)
      .set(words[old], { autoAlpha: 0 }, 0.9);
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
    $('#marquee').innerHTML = 'Shake it up <i>★</i> Real fruit <i>★</i> Thick &amp; creamy <i>★</i> Made fresh <i>★</i> '.repeat(8);
    $('#flavour-grid').innerHTML = D.products.filter(p => p.cat === 'Singles').map((p, i) => card(p, i)).join('');
    $('#stat-kcal').textContent = D.nutrition.kcal;
    $('#stat-ml').textContent = D.nutrition.ml;
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
  const view = { id: null, pack: 0, sub: false, qty: 1 };
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
  function renderProduct(id) {
    const p = productById(id) || D.products[0];
    Object.assign(view, { id: p.id, pack: 0, sub: false, qty: 1 });
    $('#product-view').innerHTML = `<div class="gallery" style="--tile:${tileOf(p)}"><img src="${src.shake(p.flavour)}" alt="${esc(p.name)} milkshake" width="647" height="1116"></div><div id="product-info"></div>`;
    renderProductInfo();
    return p;
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

  function renderCart() {
    const { freeShippingFrom: FREE, shippingFee, discountCode, discountRate } = D.shop;
    const units = cart.lines.reduce((n, l) => n + l.qty, 0);
    const subtotal = cart.lines.reduce((n, l) => n + lineUnit(l) * l.qty, 0);
    const discount = cart.code ? subtotal * discountRate : 0;
    const total = subtotal - discount;
    const freeShip = total >= FREE || !cart.lines.length;

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
      <div class="total total--grand"><span>Total</span><span>${money(total + (freeShip ? 0 : shippingFee))}</span></div>`;
    $('#checkout-note').textContent = note.checkout;
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
    checkout: () => { note.checkout = 'Checkout isn’t connected yet. This is a demo store.'; renderCart(); }
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
    setTheme(key === 'home' ? D.flavours[S[cur].flavour].tile : '#fff4ec');
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
  $('.logo').setAttribute('aria-label', D.brand + ' home');
  $$('#free-from, #free-from-2').forEach(el => { el.textContent = money(D.shop.freeShippingFrom); });
  $('#code-hint').textContent = D.shop.discountCode;
  $('#code-input').placeholder = `Discount code (try ${D.shop.discountCode})`;

  initHome();
  initShop();
  initHero();
  initNav();
  initPlay();
  renderCart();
  route();

  const relayout = raf(() => { fit(); layoutStack(); updateHeader(); });
  addEventListener('resize', relayout);
  addEventListener('scroll', raf(paintStack), { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
  if (document.readyState === 'complete') { loadAllSlides(); relayout(); }
  else addEventListener('load', () => { loadAllSlides(); relayout(); }, { once: true });
})();
