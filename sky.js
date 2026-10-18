// Hero night sky: a small 3D vignette of clouds, stars and a crescent moon.
// Decorative only. If WebGL or the CDN is unavailable the container simply
// never becomes visible and the hero looks as it did before.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const host = document.querySelector('.hero-sky');
if (host) {
  try { initSky(host); } catch (err) { console.warn('Night sky disabled:', err); }
}

function initSky(host) {
  const hero = host.closest('.hero') || document.body;
  const small = matchMedia('(max-width: 700px)').matches;
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');

  // ---------- Renderer, camera, lights ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.25 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
  const CAM_Z = 12;
  camera.position.set(0, 0, CAM_Z);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  // Lower, cooler fill than before so the moon keeps deep shadows; the stars
  // get most of their gold from the environment map, so they barely change.
  scene.add(new THREE.HemisphereLight(0xf5f0e9, 0x1a2c5a, 0.7));
  const key = new THREE.DirectionalLight(0xfff3e2, 1.7);
  key.position.set(5, 5.5, 4); // top-right, like the clouds' light
  const rim = new THREE.DirectionalLight(0xa8bcdc, 2.4);
  rim.position.set(-4, 2, -6);
  const moonlight = new THREE.DirectionalLight(0xe8eaff, 1.3); // raking, picks out the craters
  moonlight.position.set(6, 4.5, 1.5);
  scene.add(key, rim, moonlight);

  // Everything hangs off one root so the whole sculpture can turn towards the pointer.
  const root = new THREE.Group();
  scene.add(root);

  const disposables = [envTex];
  const track = (x) => { disposables.push(x); return x; };

  // ---------- Clouds: raymarched volumetric smoke ----------
  // Each bank is a box whose shader marches through a 3D density field: a few
  // soft ellipsoids give the overall shape, and tiling 3D noise (Worley billows
  // plus value-noise fbm) erodes them into smoky, billowing edges. A short march
  // towards the light gives self-shadowing, so tops facing the light glow cream
  // while the undersides sink into lavender and indigo.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  const LIGHT_DIR = new THREE.Vector3(0.55, 0.65, 0.4).normalize(); // from the top-right corner
  const moonBase = new THREE.Vector3(0.45, 0.55, -0.4);

  function cloudNoise(N = 48) {
    // R: tiling value-noise fbm. G: inverted Worley (round billows). Both repeat every N voxels.
    const data = new Uint8Array(N * N * N * 4);
    const L = 8; // value-noise lattice per tile
    const lat = new Float32Array(L * L * L).map(() => rand());
    const lv = (x, y, z, l) => lat[((z % l) * L + (y % l)) * L + (x % l)];
    const smooth = (t) => t * t * (3 - 2 * t);
    const vnoise = (x, y, z, l) => {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
      const u = smooth(x - xi), v = smooth(y - yi), w = smooth(z - zi);
      const c = (a, b, t) => a + (b - a) * t;
      const x1 = (xi + 1) % l, y1 = (yi + 1) % l, z1 = (zi + 1) % l;
      return c(
        c(c(lv(xi, yi, zi, l), lv(x1, yi, zi, l), u), c(lv(xi, y1, zi, l), lv(x1, y1, zi, l), u), v),
        c(c(lv(xi, yi, z1, l), lv(x1, yi, z1, l), u), c(lv(xi, y1, z1, l), lv(x1, y1, z1, l), u), v), w);
    };
    const C = 6; // Worley cells per tile
    const pts = new Float32Array(C * C * C * 3).map(() => rand());
    for (let z = 0; z < N; z++) {
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          // fbm: octaves at lattice sizes 4 and 8 keep it tileable
          const f = (vnoise((x / N) * 4, (y / N) * 4, (z / N) * 4, 4) * 0.62
            + vnoise((x / N) * 8, (y / N) * 8, (z / N) * 8, 8) * 0.38);
          // Worley: nearest feature point among the 27 surrounding cells (wrapping)
          const px = (x / N) * C, py = (y / N) * C, pz = (z / N) * C;
          const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz);
          let best = 9;
          for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
            const ix = cx + i, iy = cy + j, iz = cz + k;
            const o = ((((iz + C) % C) * C + ((iy + C) % C)) * C + ((ix + C) % C)) * 3;
            const dx = ix + pts[o] - px, dy = iy + pts[o + 1] - py, dz = iz + pts[o + 2] - pz;
            best = Math.min(best, dx * dx + dy * dy + dz * dz);
          }
          const worley = 1 - Math.min(1, Math.sqrt(best));
          const idx = ((z * N + y) * N + x) * 4;
          data[idx] = Math.round(f * 255);
          data[idx + 1] = Math.round(worley * 255);
          data[idx + 3] = 255;
        }
      }
    }
    const tex = new THREE.Data3DTexture(data, N, N, N);
    tex.format = THREE.RGBAFormat;
    tex.minFilter = tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    return track(tex);
  }

  const noiseTex = cloudNoise(small ? 32 : 48);
  const cloudTime = { value: 0 };
  const MAX_BLOBS = 6;

  const cloudVert = /* glsl */`
    varying vec3 vPos;
    varying vec4 vClip;
    void main() {
      vPos = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      vClip = gl_Position;
    }`;
  const cloudFrag = /* glsl */`
    precision highp sampler3D;
    uniform sampler3D uNoise;
    uniform mat4 uInvModel;
    uniform vec3 uSize;
    uniform vec3 uOrigin;
    uniform vec3 uLight;
    uniform vec3 uMoon;
    uniform vec4 uBlobs[${MAX_BLOBS}];
    uniform float uDensity;
    uniform float uTime;
    uniform float uSeed;
    varying vec3 vPos;
    varying vec4 vClip;

    float shape(vec3 p) {
      float s = -1.0;
      for (int i = 0; i < ${MAX_BLOBS}; i++) {
        vec4 b = uBlobs[i];
        if (b.w <= 0.0) break;
        vec3 q = (p - b.xyz) / (b.w * vec3(1.0, 0.62, 0.8));
        s = max(s, 1.0 - dot(q, q));
      }
      return s;
    }

    float density(vec3 p, bool detail) {
      float s = shape(p);
      if (s < -0.6) return 0.0;
      vec3 q = p * 0.3 + vec3(uTime * 0.012 + uSeed, uSeed * 0.37, uTime * 0.006);
      vec4 n = textureLod(uNoise, q, 0.0); // explicit LOD: no derivatives inside the loop
      float d = s + (n.g - 0.55) * 0.75 + (n.r - 0.5) * 0.95; // billows plus smoky fbm
      if (detail) {
        vec4 n2 = textureLod(uNoise, q * 2.9 + 0.31, 0.0);
        d += ((n2.r - 0.5) * 0.5 + (n2.g - 0.5) * 0.25) * (1.0 - clamp(d, 0.0, 1.0)); // erode the edges into wisps
      }
      return clamp(d - 0.12, 0.0, 1.0) * uDensity;
    }

    float ign(vec2 c) { return fract(52.9829189 * fract(dot(c, vec2(0.06711056, 0.00583715)))); }

    void main() {
      vec3 ro = (uInvModel * vec4(cameraPosition, 1.0)).xyz; // object space, box is [-0.5, 0.5]
      vec3 rd = normalize(vPos - ro);
      vec3 inv = 1.0 / rd;
      vec3 t0 = (-0.5 - ro) * inv, t1 = (0.5 - ro) * inv;
      vec3 tmin = min(t0, t1), tmax = max(t0, t1);
      float tn = max(max(max(tmin.x, tmin.y), tmin.z), 0.0);
      float tf = min(min(tmax.x, tmax.y), tmax.z);
      if (tf <= tn) discard;

      float dt = (tf - tn) / float(STEPS);
      float stepLen = dt * length(rd * uSize); // world-space length of one step
      float t = tn + dt * ign(gl_FragCoord.xy);

      vec3 col = vec3(0.0);
      float T = 1.0;
      for (int i = 0; i < STEPS; i++) {
        vec3 p = (ro + rd * t) * uSize;
        float d = density(p, true);
        if (d > 0.002) {
          // light march towards the top-right light for self-shadowing
          float sh = 0.0;
          vec3 lp = p;
          for (int j = 0; j < LIGHT_STEPS; j++) { lp += uLight * 0.16; sh += density(lp, false); }
          float lightT = exp(-sh * 0.16 * 6.0);
          float powder = 1.0 - exp(-d * 3.0);

          float h = clamp(p.y / uSize.y + 0.5, 0.0, 1.0);
          vec3 amb = mix(vec3(0.06, 0.1, 0.24), vec3(0.36, 0.37, 0.44), h);
          vec3 sun = vec3(0.96, 0.92, 0.88) * lightT * lightT * (0.45 + 0.55 * powder) * 1.15;
          vec3 wp = p + uOrigin;
          float moonGlow = exp(-dot(wp - uMoon, wp - uMoon) / 1.8);
          vec3 c = amb + sun + vec3(0.96, 0.9, 0.8) * moonGlow * 0.3 * lightT;

          float a = 1.0 - exp(-d * stepLen * 4.5);
          col += T * a * c;
          T *= 1.0 - a;
          if (T < 0.02) break;
        }
        t += dt;
      }

      // fade towards the rim of the night-sky circle
      float edge = 1.0 - smoothstep(0.62, 0.95, length(vClip.xy / vClip.w));
      float alpha = (1.0 - T) * edge;
      if (alpha < 0.003) discard;
      gl_FragColor = vec4(col * edge, alpha); // premultiplied
    }`;

  function makeCloud({ center, box, blobs, density }, i) {
    const blobArr = Array.from({ length: MAX_BLOBS }, (_, k) => new THREE.Vector4(...(blobs[k] || [0, 0, 0, 0])));
    const mat = track(new THREE.ShaderMaterial({
      defines: { STEPS: small ? 22 : 36, LIGHT_STEPS: small ? 3 : 4 },
      uniforms: {
        uNoise: { value: noiseTex },
        uInvModel: { value: new THREE.Matrix4() },
        uSize: { value: new THREE.Vector3(...box) },
        uOrigin: { value: new THREE.Vector3() },
        uLight: { value: LIGHT_DIR },
        uMoon: { value: moonBase },
        uBlobs: { value: blobArr },
        uDensity: { value: density },
        uTime: cloudTime,
        uSeed: { value: i * 0.23 },
      },
      vertexShader: cloudVert,
      fragmentShader: cloudFrag,
      transparent: true,
      premultipliedAlpha: true,
      depthWrite: false,
    }));
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(1, 1, 1)), mat);
    mesh.scale.set(...box);
    mesh.position.set(...center);
    mesh.onBeforeRender = () => {
      mat.uniforms.uInvModel.value.copy(mesh.matrixWorld).invert();
      mesh.getWorldPosition(mat.uniforms.uOrigin.value);
    };
    return mesh;
  }

  // Banks sit either wholly behind the moon or wholly in front of it, so the
  // boxes never cut through it. Blobs: [x, y, z, radius] in world units, local to the bank.
  const clouds = [
    { // faint veil far behind
      center: [0.2, 0.9, -2.9], box: [5.4, 2.4, 1.2], density: 0.35, drift: 0.12, speed: 0.03,
      blobs: [[-1.6, 0, 0, 1.0], [0, 0.3, 0, 1.25], [1.5, -0.1, 0, 1.0]],
    },
    { // upper-left bank, trailing into the moon's outer edge
      center: [-1.35, 0.85, -1.75], box: [3.0, 1.5, 1.1], density: 1.0, drift: 0.1, speed: 0.04,
      blobs: [[-0.65, -0.1, 0, 0.62], [0.1, 0.12, 0, 0.72], [0.8, -0.05, 0, 0.5], [-0.1, -0.22, 0.1, 0.55]],
    },
    { // bank that swallows the moon's lower tip
      center: [1.15, -0.7, 1.05], box: [3.1, 1.6, 1.3], density: 1.0, drift: 0.08, speed: 0.05,
      blobs: [[-0.85, -0.05, 0, 0.55], [-0.1, 0.16, 0, 0.75], [0.72, 0.0, 0, 0.62], [0.2, -0.22, 0.15, 0.6]],
    },
    { // big billowing bank along the bottom
      center: [-0.3, -1.7, 1.25], box: [4.4, 2.0, 1.3], density: 1.0, drift: 0.12, speed: 0.04,
      blobs: [[-1.35, -0.1, 0, 0.7], [-0.5, 0.2, 0, 0.9], [0.45, 0.3, 0.05, 0.95], [1.3, 0.0, 0, 0.7], [0, -0.28, 0.1, 0.8], [-0.95, -0.32, 0, 0.6]],
    },
  ].map((c, i) => {
    const mesh = makeCloud(c, i);
    root.add(mesh);
    return { mesh, base: new THREE.Vector3(...c.center), drift: c.drift, speed: c.speed, phase: i * 2.1 };
  });

  // ---------- Crescent moon: a solid lofted between two circles ----------
  // Silhouette = outer circle minus an offset inner circle, so the tips come to
  // true points. The cross-section is domed on the outer limb and pinched on the
  // inner edge, giving real thickness and a crisp inner crease.
  function crescentGeometry({ R = 1, d = 0.45, r = 0.88, H = 0.42, segT = 160, segU = 56 } = {}) {
    const inner = (th) => {
      const c = Math.cos(th);
      return d * c + Math.sqrt(Math.max(0, d * d * c * c - d * d + r * r));
    };
    let lo = 0, hi = Math.PI; // tip angle: where the inner circle meets the outer one
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (inner(m) > R) lo = m; else hi = m; }
    const th0 = hi;
    const wMax = R - inner(Math.PI);
    const craters = [[-0.72, 0.18, 0.09], [-0.55, -0.42, 0.06], [-0.3, 0.66, 0.05], [-0.82, -0.12, 0.045], [-0.42, -0.7, 0.04]];
    const { smoothstep } = THREE.MathUtils;

    const pos = [], uvs = [], col = [], idx = [];
    for (let i = 0; i <= segT; i++) {
      const s = i / segT;
      const th = th0 + (Math.PI * 2 - th0 * 2) * (0.5 - 0.5 * Math.cos(Math.PI * s)); // denser at the tips
      const rin = Math.min(R, inner(th));
      const w = R - rin;
      const thick = H * Math.pow(w / wMax, 0.85);
      for (let j = 0; j <= segU; j++) {
        const ph = (j / segU) * Math.PI * 2;
        const u = 0.5 - 0.5 * Math.cos(ph); // 0 = inner edge, 1 = outer limb
        const rho = rin + u * w;
        const x = Math.cos(th) * rho;
        const y = Math.sin(th) * rho;
        const sp = Math.sin(ph);
        let z = Math.sign(sp) * Math.pow(Math.abs(sp), 0.7) * thick * Math.pow(u, 0.3); // domed front and back
        if (z > 0) {
          for (const [cx, cy, cr] of craters) {
            const q = Math.hypot(x - cx, y - cy) / cr;
            if (q < 1) z -= 0.022 * (1 - q * q);
            else if (q < 1.35) z += 0.006 * Math.sin(((q - 1) / 0.35) * Math.PI);
          }
        }
        pos.push(x, y, z);
        uvs.push(x * 0.5 + 0.5, y * 0.5 + 0.5);
        // baked occlusion: darker towards the tips
        const ao = 0.75 + 0.25 * Math.min(1, (w / wMax) * 2);
        col.push(ao, ao, ao);
      }
    }
    for (let i = 0; i < segT; i++) {
      for (let j = 0; j < segU; j++) {
        const a = i * (segU + 1) + j;
        const b = a + segU + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function lunarCanvas() {
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#d6cdc6';
    g.fillRect(0, 0, S, S);
    const blob = (x, y, r, rgba) => {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, rgba);
      grad.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)'));
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    for (let i = 0; i < 16; i++) blob(rand() * S, rand() * S, 30 + rand() * 120, 'rgba(112,110,122,0.26)'); // maria
    for (let i = 0; i < 320; i++) {
      // a crater is a bowl: the wall facing the light (top-right) is bright, the far wall dark
      const x = rand() * S, y = rand() * S, r = 1.5 + Math.pow(rand(), 2.6) * 22;
      blob(x + r * 0.3, y - r * 0.3, r, 'rgba(70,68,82,0.2)');
      blob(x - r * 0.3, y + r * 0.3, r * 0.8, 'rgba(255,250,242,0.16)');
    }
    const img = g.getImageData(0, 0, S, S);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (rand() - 0.5) * 14;
      img.data[i] += v; img.data[i + 1] += v; img.data[i + 2] += v;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  const lunar = lunarCanvas();
  const lunarMap = track(new THREE.CanvasTexture(lunar));
  lunarMap.colorSpace = THREE.SRGBColorSpace;
  const lunarBump = track(new THREE.CanvasTexture(lunar));
  lunarBump.colorSpace = THREE.NoColorSpace;

  const moonMat = track(new THREE.MeshStandardMaterial({
    color: 0xf5f0e9,
    map: lunarMap,
    vertexColors: true,
    roughness: 0.92,
    metalness: 0,
    bumpMap: lunarBump,
    bumpScale: 0.45,
    emissive: 0x1d1e33,
    emissiveIntensity: 0.4,
    envMap: envTex,
    envMapIntensity: 0.15,
  }));
  // The scene lights are tuned for the stars, so the moon gets its own light:
  // from the top-right, soft enough that the craters read, falling to lavender at the outer limb,
  // with a soft swan-wing glow along the inner edge where the sunlit crescent ends.
  moonMat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = { value: new THREE.Vector3(0.5, 0.55, 0.67).normalize() };
    shader.vertexShader = 'varying vec2 vLocal;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n vLocal = position.xy;'
    );
    shader.fragmentShader = 'uniform vec3 uSunDir;\nvarying vec2 vLocal;\n' + shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `float sun = smoothstep(-0.35, 0.9, dot(normal, uSunDir));
       outgoingLight *= mix(vec3(0.3, 0.34, 0.48), vec3(1.06, 1.04, 1.0), sun);
       float fres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
       outgoingLight += vec3(0.72, 0.74, 0.92) * fres * 0.22;
       // distance from the inner circle (centre 0.45, radius 0.88) and from the outer limb
       float dIn = length(vLocal - vec2(0.45, 0.0)) - 0.88;
       float dOut = 1.0 - length(vLocal);
       float inner = (1.0 - smoothstep(0.0, 0.11, dIn)) * smoothstep(0.0, 0.1, dOut);
       outgoingLight += vec3(1.0, 0.95, 0.87) * inner * inner * 0.95;
       #include <opaque_fragment>`
    );
  };

  const moon = new THREE.Group();
  const moonMesh = new THREE.Mesh(track(crescentGeometry()), moonMat);
  // Opening faces right, as in a waxing crescent; turned slightly so its thickness shows.
  moonMesh.rotation.set(0.06, 0.28, -0.32);
  moon.add(moonMesh);

  function innerGlowGeometry({ R = 1, d = 0.45, r = 0.88, width = 0.5, seg = 120 } = {}) {
    // Tips: where the inner circle (centre d, radius r) meets the outer one.
    const cx = (R * R - r * r + d * d) / (2 * d);
    const psi0 = Math.atan2(Math.sqrt(Math.max(0, R * R - cx * cx)), cx - d);
    const pos = [], col = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const psi = psi0 + (Math.PI * 2 - psi0 * 2) * (i / seg);
      const taper = Math.pow(Math.sin(Math.PI * (i / seg)), 0.6);
      const c = Math.cos(psi), s = Math.sin(psi);
      const rOn = r - 0.006, rOff = r - width * taper;
      pos.push(d + c * rOn, s * rOn, 0.01, d + c * rOff, s * rOff, 0.01);
      col.push(1, 0.95, 0.86, 0.42 * taper, 1, 0.95, 0.86, 0);
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    return g;
  }
  const innerGlow = new THREE.Mesh(track(innerGlowGeometry()), track(new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, toneMapped: false,
  })));
  moonMesh.add(innerGlow);
  moon.scale.setScalar(1.5);
  moon.position.copy(moonBase);
  root.add(moon);

  // Restrained swan-wing halo behind the moon.
  function glowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return track(tex);
  }
  const glowTex = glowTexture();
  const halo = new THREE.Sprite(track(new THREE.SpriteMaterial({
    map: glowTex, color: 0xf2e8d8, transparent: true, opacity: 0.16, depthWrite: false,
  })));
  halo.scale.setScalar(3.4);
  halo.position.set(0.3, 0.25, -0.8);
  moon.add(halo);

  // ---------- Stars: faceted gold ones and softer, bevelled ivory ones ----------
  function facetedStar(outer = 1, inner = 0.44, depth = 0.34) {
    const rimPts = [];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? inner : outer;
      rimPts.push([Math.cos(a) * r, Math.sin(a) * r, 0]);
    }
    const pos = [];
    for (let i = 0; i < 10; i++) {
      const p = rimPts[i];
      const q = rimPts[(i + 1) % 10];
      pos.push(0, 0, depth, ...p, ...q);
      pos.push(0, 0, -depth, ...q, ...p);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals(); // non-indexed, so each facet stays crisp
    return g;
  }

  function puffyStar(outer = 1, inner = 0.5) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? inner : outer;
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
    }
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: 0.08, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.13, bevelSegments: 6, curveSegments: 1,
    });
    g.center();
    return g;
  }

  const starGeo = { faceted: track(facetedStar()), puffy: track(puffyStar()) };
  const starLooks = {
    gold: { color: 0xe0c58f, metalness: 0.6, roughness: 0.3, emissive: 0x564526, envMapIntensity: 1.0 }, // quicksand
    ivory: { color: 0xf5f0e9, metalness: 0, roughness: 0.78, emissive: 0x3a3630, envMapIntensity: 0.4 }, // swan wing
    pale: { color: 0xd9cbc2, metalness: 0.45, roughness: 0.35, emissive: 0x403832, envMapIntensity: 0.9 }, // shellstone
  };

  // [geometry, look, x, y, z, size, twinkles]
  const starLayout = [
    ['faceted', 'gold', -1.15, 0.55, 0.6, 0.26, true],
    ['puffy', 'ivory', 1.95, 1.75, -1.2, 0.2, false],
    ['faceted', 'pale', 0.05, 1.95, -1.8, 0.17, true],
    ['puffy', 'gold', -2.0, -0.35, -0.6, 0.15, false],
    ['faceted', 'gold', 2.05, -1.05, 1.0, 0.19, false],
    ['puffy', 'pale', 0.55, -0.55, 1.9, 0.12, true],
    ['faceted', 'ivory', -0.35, -2.05, -0.8, 0.13, false],
    ['faceted', 'gold', -2.25, 1.15, -2.6, 0.14, true],
    ['puffy', 'ivory', 1.25, 2.35, -3.0, 0.12, false],
  ];

  function glintTexture() {
    // a soft four-point sparkle
    const S = 128;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    for (const [w, h] of [[S / 2, 2.2], [2.2, S / 2]]) {
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h));
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(-w, -h, w * 2, h * 2);
    }
    const core = g.createRadialGradient(0, 0, 0, 0, 0, 14);
    core.addColorStop(0, 'rgba(255,255,255,0.9)');
    core.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = core;
    g.fillRect(-14, -14, 28, 28);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return track(tex);
  }
  const glintTex = glintTexture();

  const stars = starLayout
    .filter((_, i) => !small || i < 7)
    .map(([geo, look, x, y, z, size, twinkles], i) => {
      const mat = track(new THREE.MeshStandardMaterial({ ...starLooks[look], envMap: envTex, emissiveIntensity: 0.15 }));
      const mesh = new THREE.Mesh(starGeo[geo], mat);
      mesh.scale.setScalar(size * 1.25);
      mesh.position.set(x, y, z);
      mesh.rotation.set((i % 3) * 0.2 - 0.2, (i * 0.9) % 0.8 - 0.4, (i * 0.37) % 0.6 - 0.3);
      root.add(mesh);
      let glint = null;
      if (twinkles) {
        glint = new THREE.Sprite(track(new THREE.SpriteMaterial({
          map: glintTex, color: 0xfff6e8, transparent: true, opacity: 0, depthWrite: false,
          blending: THREE.AdditiveBlending,
        })));
        glint.scale.setScalar(size * 4.2);
        glint.position.set(x, y, z + 0.05);
        root.add(glint);
      }
      return {
        mesh, mat, twinkles, glint,
        base: new THREE.Vector3(x, y, z),
        baseRot: mesh.rotation.clone(),
        phase: i * 1.37,
        floatSpeed: 0.28 + ((i * 0.173) % 0.25),
        spin: (i % 2 ? 1 : -1) * (0.18 + ((i * 0.07) % 0.16)),
      };
    });

  // ---------- Dust: faint pinpricks for atmosphere (no lines, no network) ----------
  const dustCount = small ? 34 : 72;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (rand() - 0.5) * 6.4;
    dustPos[i * 3 + 1] = (rand() - 0.5) * 6.4;
    dustPos[i * 3 + 2] = -1 - rand() * 3.5;
  }
  const dustGeo = track(new THREE.BufferGeometry());
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, track(new THREE.PointsMaterial({
    map: glowTex, color: 0xf5efe4, size: 0.075, sizeAttenuation: true,
    transparent: true, opacity: 0.75, depthWrite: false,
  })));
  root.add(dust);

  // ---------- Sizing ----------
  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = CAM_Z * Math.max(1, 0.95 / camera.aspect); // keep the vignette's width in frame
    camera.updateProjectionMatrix();
    if (!running) renderFrame(lastT);
  }

  // ---------- Pointer: a gentle magnetic pull ----------
  // The pointer is measured from the scene's centre (in half-sizes of the
  // scene) and eased through tanh, so the pull is strongest near the scene and
  // saturates softly as the cursor travels across the rest of the hero.
  // x: -1 left … 1 right, y: -1 top … 1 bottom.
  const pointer = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
  const onMove = (e) => {
    const r = host.getBoundingClientRect();
    pointer.tx = Math.tanh((e.clientX - (r.left + r.width / 2)) / (r.width / 2));
    pointer.ty = Math.tanh((e.clientY - (r.top + r.height / 2)) / (r.height / 2));
  };
  const onLeave = () => { pointer.tx = 0; pointer.ty = 0; };
  // Touch: follow while a finger is down, then drift home (no hover needed).
  const onUp = (e) => { if (e.pointerType !== 'mouse') onLeave(); };

  // Spring towards the target: slightly under-damped, so the scene settles softly.
  const SPRING = 22;
  const DAMP = 2 * 0.85 * Math.sqrt(SPRING);
  const follow = (dt) => {
    pointer.vx += (SPRING * (pointer.tx - pointer.x) - DAMP * pointer.vx) * dt;
    pointer.vy += (SPRING * (pointer.ty - pointer.y) - DAMP * pointer.vy) * dt;
    pointer.x += pointer.vx * dt;
    pointer.y += pointer.vy * dt;
  };
  // Nearer layers are pulled further: 0 for the far stars (z ≈ -3), 1 at the front (z ≈ 2).
  const depthOf = (z) => THREE.MathUtils.clamp((z + 3) / 5, 0, 1);
  const pullX = (z) => pointer.x * (0.04 + 0.2 * depthOf(z));
  const pullY = (z) => -pointer.y * (0.03 + 0.15 * depthOf(z));

  // ---------- Animation ----------
  let lastT = 0;
  function renderFrame(t, dt = 0) {
    const s = t / 1000;
    follow(dt);

    // The whole sculpture turns to face the cursor (about 7° side to side,
    // 5° up and down) and drifts a little towards it; the camera slides the
    // other way, which adds a touch of perspective change.
    root.rotation.y = pointer.x * 0.13;
    root.rotation.x = pointer.y * 0.09;
    root.position.x = pointer.x * 0.06;
    root.position.y = -pointer.y * 0.05;
    camera.position.x = -pointer.x * 0.16;
    camera.position.y = pointer.y * 0.12;

    for (const c of clouds) {
      c.mesh.position.x = c.base.x + Math.sin(s * c.speed + c.phase) * c.drift + pullX(c.base.z);
      c.mesh.position.y = c.base.y + Math.sin(s * c.speed * 1.7 + c.phase) * 0.04 + pullY(c.base.z);
    }
    for (const st of stars) {
      st.mesh.position.y = st.base.y + Math.sin(s * st.floatSpeed + st.phase) * 0.07 + pullY(st.base.z);
      st.mesh.position.x = st.base.x + Math.cos(s * st.floatSpeed * 0.6 + st.phase) * 0.03 + pullX(st.base.z);
      st.mesh.rotation.y = st.baseRot.y + Math.sin(s * Math.abs(st.spin) + st.phase) * 0.55 * Math.sign(st.spin);
      st.mesh.rotation.z = st.baseRot.z + Math.sin(s * 0.4 + st.phase) * 0.12;
      if (st.twinkles) {
        const k = 0.5 + 0.5 * Math.sin(s * (0.7 + st.floatSpeed) + st.phase * 2);
        st.mat.emissiveIntensity = 0.12 + k * k * 0.85;
        st.glint.position.x = st.mesh.position.x;
        st.glint.position.y = st.mesh.position.y;
        st.glint.material.opacity = 0.12 + k * k * 0.5;
      }
    }
    moon.position.x = moonBase.x + pullX(moonBase.z);
    moon.position.y = moonBase.y + Math.sin(s * 0.13) * 0.035 + pullY(moonBase.z);
    moon.rotation.z = Math.sin(s * 0.09) * 0.025;
    halo.material.opacity = 0.15 + Math.sin(s * 0.3) * 0.025;
    cloudTime.value = s;
    dust.rotation.z = s * 0.006;
    dust.position.set(pullX(-2.75), pullY(-2.75), 0); // dust sits far back, z ≈ -1…-4.5

    renderer.render(scene, camera);
  }

  let running = false;
  let rafId = 0;
  let prev = 0;
  let inView = true;
  // Raymarching cost scales with pixels: if the first frames are slow, drop the resolution.
  let slowFrames = 0, sampled = 0;
  const adapt = (dt) => {
    if (sampled > 90) return;
    sampled++;
    if (dt > 0.03) slowFrames++;
    if (sampled === 90 && slowFrames > 45 && renderer.getPixelRatio() > 0.75) {
      renderer.setPixelRatio(Math.max(0.75, renderer.getPixelRatio() * 0.66));
      resize();
      sampled = slowFrames = 0;
    }
  };
  const loop = (t) => {
    const dt = Math.min((t - prev) / 1000, 0.05);
    adapt((t - prev) / 1000);
    prev = t;
    lastT = t;
    renderFrame(t, dt);
    rafId = requestAnimationFrame(loop);
  };
  const shouldRun = () => inView && !document.hidden && !motionQuery.matches;
  function update() {
    if (shouldRun() && !running) {
      running = true;
      prev = performance.now();
      rafId = requestAnimationFrame(loop);
    } else if (!shouldRun() && running) {
      running = false;
      cancelAnimationFrame(rafId);
    }
  }

  const ro = new ResizeObserver(resize);
  ro.observe(host);
  const io = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; update(); });
  io.observe(host);
  document.addEventListener('visibilitychange', update);
  motionQuery.addEventListener('change', () => {
    pointer.tx = pointer.ty = pointer.x = pointer.y = pointer.vx = pointer.vy = 0;
    update();
    if (!running) renderFrame(lastT);
  });
  hero.addEventListener('pointermove', onMove, { passive: true });
  hero.addEventListener('pointerdown', onMove, { passive: true });
  hero.addEventListener('pointerleave', onLeave);
  hero.addEventListener('pointerup', onUp);
  hero.addEventListener('pointercancel', onUp);

  function destroy() {
    running = false;
    cancelAnimationFrame(rafId);
    ro.disconnect();
    io.disconnect();
    document.removeEventListener('visibilitychange', update);
    hero.removeEventListener('pointermove', onMove);
    hero.removeEventListener('pointerdown', onMove);
    hero.removeEventListener('pointerleave', onLeave);
    hero.removeEventListener('pointerup', onUp);
    hero.removeEventListener('pointercancel', onUp);
    disposables.forEach((d) => d.dispose());
    renderer.dispose();
    renderer.domElement.remove();
    host.classList.remove('is-ready');
  }
  renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); destroy(); });

  resize();
  renderFrame(0);
  host.classList.add('is-ready');
  update();
  return destroy;
}
