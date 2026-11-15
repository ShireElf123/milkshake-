/* Whirl Shakes — the moving liquid.
 *
 * The hero backdrop is a photograph. This layer draws that same photograph again,
 * but only where the liquid is (a mask built by tools/build_assets.py), and nudges
 * the pixels about with a few sine waves so the pool sloshes, the crests sway and
 * light glints off the surface. Ripples run out across the pool when the glass
 * lands or when a finger taps the hero.
 *
 * It is plain WebGL 1 with one textured quad: no library, ~4 KB, and it degrades
 * quietly. No WebGL, a lost context, or reduced motion simply leaves the photograph.
 * Loaded after the page is up (assets/js/liquid.js), textures follow per flavour.
 *
 *   whirlLiquid.start(canvas, onLost) -> controller | null
 *     controller.show(i)        make flavour i the live one (loads its textures)
 *     controller.ripple(x, y, strength, soft)   ripple from a point, hero pixels
 *     controller.resize()       match the canvas to its box
 *     controller.setVisible(v)  pause drawing while the hero is off screen
 */
(() => {
  'use strict';

  const VERT = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }`;

  const FRAG = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uPhoto, uFlow;
    uniform vec2 uRes;
    uniform float uTime, uAmp;
    uniform vec4 uRip[3];          /* xy centre (uv), z start time, w strength; w = 0: unused */

    float wave(vec2 uv, float t) {
      return sin(uv.x * 7.0 + t * 0.90) * 0.55
           + sin(uv.x * 13.0 - t * 1.35 + uv.y * 5.0) * 0.30
           + sin((uv.x + uv.y * 0.6) * 23.0 + t * 1.90) * 0.15;
    }

    void main() {
      vec2 uv = vUv;
      float m = texture2D(uFlow, uv).r;
      float edge = smoothstep(0.02, 0.30, m) * uAmp;
      if (edge <= 0.003) { gl_FragColor = vec4(0.0); return; }

      float t = uTime;
      /* two crossing wave trains, flattened vertically: the surface sloshes sideways */
      vec2 off = vec2(wave(uv, t), wave(uv.yx * 1.3 + 0.7, t * 0.8)) * vec2(0.0060, 0.0026);
      /* ripples: a ring travelling out from each splash, with a bit of glint on its crest */
      float rip = 0.0;
      vec2 rdir = vec2(0.0);
      for (int i = 0; i < 3; i++) {
        vec4 R = uRip[i];
        if (R.w <= 0.0) continue;
        float age = t - R.z;
        if (age <= 0.0 || age > 2.8) continue;
        vec2 p = (uv - R.xy) * vec2(uRes.x / uRes.y, 1.0);
        float dist = length(p);
        float band = exp(-pow((dist - age * 0.42) * 13.0, 2.0));
        float decay = exp(-age * 1.5) * R.w;
        rip += sin((dist - age * 0.42) * 34.0) * band * decay;
        rdir += p / max(dist, 0.001) * band * decay;
      }
      off += rdir * 0.016 + vec2(0.0, rip * 0.004);

      /* near the edge of the mask, keep the displaced sample inside the liquid:
         pulling wall pixels across the surface would draw a hairline along it */
      float em = smoothstep(0.05, 0.6, m);
      off *= 0.3 + 0.7 * em;
      off.y -= max(off.y, 0.0) * (1.0 - em);

      vec3 col = texture2D(uPhoto, clamp(uv + off, 0.001, 0.999)).rgb;
      float glint = pow(max(wave(uv * 1.15 + vec2(t * 0.06, 0.0), t * 1.6), 0.0), 3.0) * 0.10
                  + max(rip, 0.0) * 0.22;
      col += glint * uAmp;
      gl_FragColor = vec4(col, edge);
    }`;

  function start(canvas, onLost) {
    let gl = null;
    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'low-power' })
        || canvas.getContext('experimental-webgl', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: false });
    } catch (e) { gl = null; }
    if (!gl) return null;

    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
    const prog = vs && fs && gl.createProgram();
    if (prog) { gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog); }
    if (!prog || !gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   /* one full-screen triangle */
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const U = {
      photo: gl.getUniformLocation(prog, 'uPhoto'),
      flow: gl.getUniformLocation(prog, 'uFlow'),
      res: gl.getUniformLocation(prog, 'uRes'),
      time: gl.getUniformLocation(prog, 'uTime'),
      amp: gl.getUniformLocation(prog, 'uAmp'),
      rip: gl.getUniformLocation(prog, 'uRip[0]')
    };
    gl.uniform1i(U.photo, 0);
    gl.uniform1i(U.flow, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    /* textures per flavour: [photo, flow mask] or null while loading */
    const sets = [];
    let live = -1, visible = true, amp = 0, t0 = performance.now() / 1000, time = 0, last = t0, drew = 0;
    const ripples = new Float32Array(12);           /* 3 × (x, y, start, strength) */
    let ripSlot = 0;

    const upload = img => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return tex;
    };

    function resize() {
      const dpr = Math.min(devicePixelRatio || 1, 1.25);         /* the waves are soft: no need for full retina */
      const w = Math.max(2, Math.round(canvas.clientWidth * dpr)), h = Math.max(2, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(U.res, w, h);
      }
    }

    function load(i, urls) {
      if (sets[i]) return;
      sets[i] = { ready: false };
      const imgs = [];
      let left = 2;
      urls.forEach((url, k) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          imgs[k] = img;
          if (--left) return;
          if (!gl || gl.isContextLost()) return;
          try {
            gl.activeTexture(gl.TEXTURE0);
            const photo = upload(imgs[0]);
            gl.activeTexture(gl.TEXTURE1);
            const flow = upload(imgs[1]);
            sets[i] = { ready: true, photo, flow };
            if (i === live) canvas.classList.add('is-live');
          } catch (e) {
            /* a sandboxed embed without allow-same-origin taints the pictures:
               uploading them then throws a SecurityError. Degrade exactly like
               a failed load — no liquid layer, the photograph stays still. */
            sets[i] = null;
          }
        };
        img.onerror = () => { sets[i] = null; };                  /* no mask, no layer: the photo stays */
        img.src = url;
      });
    }

    function frame(now) {
      requestAnimationFrame(frame);
      const t = now / 1000;
      const dt = Math.min(t - last, 0.1);
      last = t;
      if (!visible || document.hidden || gl.isContextLost()) return;
      const set = live >= 0 ? sets[live] : null;
      if (!set || !set.ready) return;
      /* the waves are slow: 30 frames a second is plenty, and half the cost */
      if (t - drew < 1 / 30) return;
      drew = t;
      time += dt;
      amp += (1 - amp) * Math.min(1, dt * 2.2);
      resize();
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, set.photo);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, set.flow);
      gl.uniform1f(U.time, time);
      gl.uniform1f(U.amp, amp);
      gl.uniform4fv(U.rip, ripples);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      window.__liquidDrawn = (window.__liquidDrawn || 0) + 1;   /* how many frames the liquid has drawn */
      window.__liquidTime = +time.toFixed(2);
    }

    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      canvas.classList.remove('is-live');
      if (onLost) onLost();
    });
    canvas.addEventListener('webglcontextrestored', () => { if (onLost) onLost(); });

    requestAnimationFrame(frame);

    return {
      /* urls: [photograph, flow mask] for flavour i */
      add(i, urls) { load(i, urls); },
      show(i) {
        live = i;
        const set = sets[i];
        canvas.classList.toggle('is-live', !!(set && set.ready));
        if (!set) amp = 0;
      },
      ripple(x, y, strength, soft) {
        const h = canvas.clientHeight || 1, w = canvas.clientWidth || 1;
        const s = soft ? strength * 0.4 : strength;
        ripples[ripSlot * 4] = x / w;
        ripples[ripSlot * 4 + 1] = 1 - y / h;
        ripples[ripSlot * 4 + 2] = time;
        ripples[ripSlot * 4 + 3] = s;
        ripSlot = (ripSlot + 1) % 3;
      },
      resize,
      setVisible(v) { visible = v; if (v) last = performance.now() / 1000; }
    };
  }

  window.whirlLiquid = { start };
})();
