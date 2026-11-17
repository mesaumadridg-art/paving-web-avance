/* ============================================================================
   Paquete estructural · modelo 3D con AASHTO 1993
   Prisma isométrico con texturas procedurales por capa. Los espesores se
   calculan con la ecuación de diseño y se animan al mover el tránsito.
   ========================================================================== */
(function () {
  const canvas = document.getElementById('pavCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  /* ---- cálculo AASHTO --------------------------------------------------- */
  const A1 = 0.44, A2 = 0.14, A3 = 0.11;
  const ZR = -1.282, SO = 0.45, DPSI = 1.7, MR = 15000;

  function logW(SN) {
    return ZR * SO + 9.36 * Math.log10(SN + 1) - 0.20 +
      Math.log10(DPSI / (4.2 - 1.5)) / (0.40 + 1094 / Math.pow(SN + 1, 5.19)) +
      2.32 * Math.log10(MR) - 8.07;
  }
  function snRequerido(W18) {
    const obj = Math.log10(W18);
    let lo = 0.5, hi = 14;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (logW(mid) < obj) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
  const r2 = n => Math.round(n * 2) / 2;
  function repartir(SN) {
    const d1 = Math.min(10, Math.max(2, r2(SN * 0.45 / A1)));
    const d2 = Math.min(12, Math.max(6, r2((SN - A1 * d1) * 0.60 / A2)));
    const d3 = Math.min(14, Math.max(6, r2((SN - A1 * d1 - A2 * d2) / A3)));
    return [d1, d2, d3];
  }
  const fmt = (n, d) => n.toFixed(d === undefined ? 1 : d).replace('.', ',');

  /* ---- estado ----------------------------------------------------------- */
  const CAPAS = [
    { id: 'hma', nombre: 'Carpeta asfáltica', tipo: 'asfalto', a: A1 },
    { id: 'base', nombre: 'Base granular', tipo: 'base', a: A2 },
    { id: 'sub', nombre: 'Sub-base', tipo: 'subbase', a: A3 }
  ];

  let esp = { hma: 2.0, base: 6.0, sub: 6.0 };       // pulgadas mostradas
  let meta = { hma: 2.0, base: 6.0, sub: 6.0 };      // objetivo
  let separacion = 0;                                 // 0..1 animado
  let objetivoSep = 0;
  let angulo = Math.PI / 6;                           // 30°
  let arrastrando = false, xArr = 0, angBase = 0;
  let W = 0, H = 0;
  let animando = false;

  const ANCHO = 3.65;     // m, un carril
  const PROF = 2.20;      // m, profundidad del corte
  const PULG = 0.0254;
  const AIRE = 0.55;      // separación entre capas al explotar, en metros

  const $ = id => document.getElementById(id);

  /* ---- texturas --------------------------------------------------------- */
  function ruido(w, h, base, puntos, n, rmin, rmax) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const r = rmin + Math.random() * (rmax - rmin);
      g.fillStyle = puntos[(Math.random() * puntos.length) | 0];
      g.globalAlpha = 0.35 + Math.random() * 0.5;
      g.beginPath();
      // agregados: formas irregulares
      const lados = 5 + ((Math.random() * 3) | 0);
      for (let k = 0; k <= lados; k++) {
        const a = (k / lados) * Math.PI * 2;
        const rr = r * (0.6 + Math.random() * 0.5);
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
    return c;
  }

  function texturaAsfalto() {
    const c = document.createElement('canvas');
    c.width = c.height = 220;
    const g = c.getContext('2d');
    g.fillStyle = '#26292E';
    g.fillRect(0, 0, 220, 220);
    // agregado fino
    for (let i = 0; i < 2600; i++) {
      const x = Math.random() * 220, y = Math.random() * 220;
      const r = 0.5 + Math.random() * 1.6;
      const t = Math.random();
      g.fillStyle = t > 0.75 ? 'rgba(120,128,138,0.55)'
        : t > 0.4 ? 'rgba(70,76,84,0.6)' : 'rgba(18,20,24,0.7)';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // vetas de compactación
    g.strokeStyle = 'rgba(255,255,255,0.035)';
    g.lineWidth = 1;
    for (let i = 0; i < 14; i++) {
      const y = Math.random() * 220;
      g.beginPath(); g.moveTo(0, y); g.lineTo(220, y + (Math.random() - 0.5) * 6); g.stroke();
    }
    return c;
  }

  function texturaGranular(base, claro, oscuro, tam, n) {
    const c = document.createElement('canvas');
    c.width = c.height = 220;
    const g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, 220, 220);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 220, y = Math.random() * 220;
      const r = tam * (0.45 + Math.random() * 0.9);
      g.fillStyle = Math.random() > 0.5 ? claro : oscuro;
      g.globalAlpha = 0.5 + Math.random() * 0.45;
      g.beginPath();
      const l = 5 + ((Math.random() * 3) | 0);
      for (let k = 0; k <= l; k++) {
        const a = (k / l) * Math.PI * 2;
        const rr = r * (0.55 + Math.random() * 0.6);
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        k ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.closePath();
      g.fill();
    }
    g.globalAlpha = 1;
    return c;
  }

  function texturaSuelo() {
    const c = document.createElement('canvas');
    c.width = c.height = 220;
    const g = c.getContext('2d');
    g.fillStyle = '#5E4C3B';
    g.fillRect(0, 0, 220, 220);
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * 220, y = Math.random() * 220;
      g.fillStyle = Math.random() > 0.5 ? 'rgba(120,100,78,0.5)' : 'rgba(58,46,36,0.55)';
      g.beginPath(); g.arc(x, y, 0.7 + Math.random() * 2.2, 0, Math.PI * 2); g.fill();
    }
    // estratos
    g.strokeStyle = 'rgba(40,31,24,0.35)';
    for (let i = 0; i < 7; i++) {
      const y = (i + 0.5) * (220 / 7) + (Math.random() - 0.5) * 10;
      g.lineWidth = 1 + Math.random() * 2;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= 220; x += 22) g.lineTo(x, y + Math.sin(x / 30 + i) * 3);
      g.stroke();
    }
    return c;
  }

  const TEX = {
    asfalto: texturaAsfalto(),
    base: texturaGranular('#8A8478', '#B4AE9E', '#5E5950', 3.2, 420),
    subbase: texturaGranular('#A08D70', '#C2AE8C', '#75664F', 4.0, 340),
    suelo: texturaSuelo()
  };

  /* ---- proyección isométrica -------------------------------------------- */
  let ox = 0, oy = 0, esc = 1;

  function vx() { return [Math.cos(angulo), Math.sin(angulo) * 0.56]; }
  function vy() { return [-Math.cos(angulo), Math.sin(angulo) * 0.56]; }

  function proyectar(x, y, z) {
    const a = vx(), b = vy();
    return [
      ox + (x * a[0] + y * b[0]) * esc,
      oy + (x * a[1] + y * b[1]) * esc - z * esc
    ];
  }

  /* ---- dibujo de una cara con textura mapeada ---------------------------- */
  function caraTexturada(o, u, v, tex, sombra, anchoTex, altoTex) {
    // o = origen en pantalla, u y v = vectores unitarios del plano
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(o[0], o[1]);
    ctx.lineTo(o[0] + u[0] * anchoTex, o[1] + u[1] * anchoTex);
    ctx.lineTo(o[0] + u[0] * anchoTex + v[0] * altoTex, o[1] + u[1] * anchoTex + v[1] * altoTex);
    ctx.lineTo(o[0] + v[0] * altoTex, o[1] + v[1] * altoTex);
    ctx.closePath();
    ctx.clip();

    // mapear el patrón al paralelogramo
    const pat = ctx.createPattern(tex, 'repeat');
    // ajustar la escala del patrón al tamaño del área
    const m = new DOMMatrix();
    m.a = u[0]; m.b = u[1];
    m.c = v[0]; m.d = v[1];
    m.e = o[0]; m.f = o[1];
    pat.setTransform(m);
    ctx.fillStyle = pat;
    ctx.fillRect(-4000, -4000, 8000, 8000);

    if (sombra > 0) {
      ctx.fillStyle = `rgba(6,10,16,${sombra})`;
      ctx.fillRect(-4000, -4000, 8000, 8000);
    }
    ctx.restore();

    // borde
    ctx.beginPath();
    ctx.moveTo(o[0], o[1]);
    ctx.lineTo(o[0] + u[0] * anchoTex, o[1] + u[1] * anchoTex);
    ctx.lineTo(o[0] + u[0] * anchoTex + v[0] * altoTex, o[1] + u[1] * anchoTex + v[1] * altoTex);
    ctx.lineTo(o[0] + v[0] * altoTex, o[1] + v[1] * altoTex);
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /* ---- prisma de una capa ------------------------------------------------ */
  function prisma(z0, alto, tex, etiqueta, espesor) {
    const a = vx(), b = vy();
    // cara superior
    const oTop = proyectar(0, 0, z0 + alto);
    caraTexturada(oTop, [a[0], a[1]], [b[0], b[1]], tex, -0.06, ANCHO * esc, PROF * esc);

    // cara frontal (y = PROF)
    const oF = proyectar(0, PROF, z0);
    caraTexturada(oF, [a[0], a[1]], [0, -1], tex, 0.30, ANCHO * esc, alto * esc);

    // cara derecha (x = ANCHO)
    const oD = proyectar(ANCHO, 0, z0);
    caraTexturada(oD, [b[0], b[1]], [0, -1], tex, 0.48, PROF * esc, alto * esc);
  }

  /* ---- cotas ------------------------------------------------------------- */
  function cotas(capas) {
    ctx.save();
    ctx.font = '600 10px "JetBrains Mono", ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    let acum = 0;
    capas.forEach((c, i) => {
      const z0 = acum, z1 = acum + c.alto;
      acum = z1;
      const p = proyectar(ANCHO, PROF, (z0 + z1) / 2);
      const x = p[0] + 46;
      const y = p[1];
      // línea guía
      ctx.strokeStyle = 'rgba(16,28,44,0.30)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p[0] + 8, y);
      ctx.lineTo(x - 6, y);
      ctx.stroke();
      // punto de anclaje
      ctx.beginPath(); ctx.arc(p[0] + 8, y, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16,28,44,0.45)'; ctx.fill();
      // texto
      ctx.fillStyle = '#1E2A36';
      ctx.fillText(c.etiqueta, x, y - 3);
      ctx.fillStyle = '#7A5A18';
      ctx.font = '600 10px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText(c.espesor, x, y + 9);
      ctx.fillStyle = '#1E2A36';
      ctx.font = '600 10px "JetBrains Mono", ui-monospace, monospace';
    });
    ctx.restore();
  }

  /* ---- render ------------------------------------------------------------ */
  function sincronizar() {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const aw = Math.round(r.width * dpr), ah = Math.round(r.height * dpr);
    if (aw === canvas.width && ah === canvas.height && W === r.width) return;
    canvas.width = aw; canvas.height = ah;
    W = r.width; H = r.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function dibujar() {
    sincronizar();
    if (!W) return;
    ctx.clearRect(0, 0, W, H);

    // fondo con retícula técnica
    ctx.fillStyle = '#EDF1F4';
    ctx.fillRect(0, 0, W, H);
    const paso = 26;
    ctx.strokeStyle = 'rgba(16,28,44,0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < W; x += paso) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y < H; y += paso) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    // escala: alto total disponible
    const altoTotalM = (esp.hma + esp.base + esp.sub) * PULG + separacion * AIRE * 2 + 0.55;
    const anchoM = ANCHO + PROF;
    esc = Math.min(
      (W * 0.62) / anchoM,
      (H * 0.62) / altoTotalM
    );
    ox = W * 0.44;
    oy = H * 0.30 + (esp.hma + esp.base + esp.sub) * PULG * esc;

    // sombra en el suelo
    const a = vx(), b = vy();
    const oS = proyectar(0, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(oS[0], oS[1]);
    ctx.lineTo(oS[0] + a[0] * ANCHO * esc, oS[1] + a[1] * ANCHO * esc);
    ctx.lineTo(oS[0] + (a[0] + b[0]) * ANCHO * esc, oS[1] + (a[1] + b[1]) * ANCHO * esc);
    ctx.lineTo(oS[0] + b[0] * PROF * esc, oS[1] + b[1] * PROF * esc);
    ctx.closePath();
    ctx.fillStyle = 'rgba(16,28,44,0.10)';
    ctx.filter = 'blur(6px)';
    ctx.fill();
    ctx.filter = 'none';
    ctx.restore();

    // subrasante: bloque de suelo bajo el paquete
    const zSuelo = -0.30;
    prisma(zSuelo, 0.30, TEX.suelo, null, null);

    // capas del paquete, de abajo hacia arriba
    let z = 0;
    const lista = [];
    const orden = [
      { tipo: 'sub', tex: TEX.subbase, nombre: 'Sub-base', em: esp.sub },
      { tipo: 'base', tex: TEX.base, nombre: 'Base granular', em: esp.base },
      { tipo: 'hma', tex: TEX.asfalto, nombre: 'Carpeta asfáltica', em: esp.hma }
    ];
    const separaciones = [];
    orden.forEach((c, i) => {
      const alto = Math.max(0.035, c.em * PULG);
      separaciones.push(separacion * AIRE * i);
      lista.push({ alto, tipo: c.tipo, tex: c.tex, nombre: c.nombre, em: c.em, z: 0 });
    });

    let zAcc = 0;
    lista.forEach((c, i) => {
      c.z = zAcc + separaciones[i];
      zAcc += c.alto;
    });

    lista.forEach(c => {
      prisma(c.z, c.alto, c.tex, c.nombre, c.em);
    });

    // cotas de las tres capas
    let zc = 0;
    const capasCota = lista.slice().reverse().map((c, i) => {
      const zz = zc;
      zc += c.alto;
      return {
        alto: c.alto,
        z: zz,
        etiqueta: c.nombre,
        espesor: fmt(c.em) + '" · ' + fmt(c.em * 2.54, 1) + ' cm'
      };
    });
    // posición real de cada capa para la cota
    ctx.save();
    lista.forEach(c => {
      const p = proyectar(ANCHO, PROF, c.z + c.alto / 2);
      const x = p[0] + 44;
      const y = p[1];
      ctx.strokeStyle = 'rgba(16,28,44,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p[0] + 6, y); ctx.lineTo(x - 5, y);
      ctx.stroke();
      ctx.beginPath(); ctx.arc(p[0] + 6, y, 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16,28,44,0.4)'; ctx.fill();
      ctx.font = '600 9.5px "JetBrains Mono", ui-monospace, monospace';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#41505E';
      ctx.fillText(c.nombre, x, y - 5);
      ctx.fillStyle = '#8A5F0C';
      ctx.font = '700 10.5px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText(fmt(c.em) + '"  ' + fmt(c.em * 2.54, 1) + ' cm', x, y + 7);
    });
    ctx.restore();

    // etiqueta flotante del número estructural
    ctx.save();
    const pTop = proyectar(ANCHO / 2, PROF / 2, lista[2].z + lista[2].alto);
    ctx.font = '600 9px "JetBrains Mono", ui-monospace, monospace';
    const txt = 'SUPERFICIE DE RODADURA';
    const w2 = ctx.measureText(txt).width;
    ctx.beginPath();
    ctx.roundRect(pTop[0] - w2 / 2 - 7, pTop[1] - 30, w2 + 14, 18, 2);
    ctx.fillStyle = 'rgba(16,28,44,0.82)'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, pTop[0], pTop[1] - 21);
    ctx.restore();
  }

  /* ---- animación --------------------------------------------------------- */
  function animar() {
    const dz = 0.16;
    let cambio = false;
    ['hma', 'base', 'sub'].forEach(k => {
      const d = meta[k] - esp[k];
      if (Math.abs(d) > 0.01) { esp[k] += d * dz; cambio = true; }
      else esp[k] = meta[k];
    });
    const ds = objetivoSep - separacion;
    if (Math.abs(ds) > 0.005) { separacion += ds * 0.16; cambio = true; }
    else separacion = objetivoSep;

    dibujar();
    if (cambio || animando) requestAnimationFrame(animar);
  }

  function lanzar() {
    animando = true;
    requestAnimationFrame(animar);
  }

  /* ---- cálculo y conexión con el panel ----------------------------------- */
  function recalcular() {
    const v = +$('esal').value;
    const millones = 0.1 * Math.pow(500, v / 100);
    const SN = snRequerido(millones * 1e6);
    const [d1, d2, d3] = repartir(SN);

    meta = { hma: d1, base: d2, sub: d3 };

    if ($('snNum')) $('snNum').textContent = fmt(SN);
    if ($('esalNum')) {
      $('esalNum').textContent = millones < 10
        ? fmt(millones)
        : Math.round(millones).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
    if ($('pavTot')) {
      const tot = (d1 + d2 + d3) * 2.54;
      $('pavTot').textContent = fmt(tot, 0) + ' cm de estructura';
    }
    if ($('snTexto')) {
      const nivel = millones < 1 ? 'Tránsito ligero: estructura delgada, típica de vía secundaria.'
        : millones < 5 ? 'Tránsito moderado: corredor urbano o ruta departamental.'
        : millones < 15 ? 'Tránsito pesado: corredor principal con mezcla de camiones.'
        : 'Tránsito muy pesado: acceso portuario, minero o corredor de carga.';
      $('snTexto').textContent = nivel + ' Suelo de fundación con Mr 15.000 psi y 90 % de confiabilidad.';
    }
  }

  /* ---- tamaño ------------------------------------------------------------ */
  function ajustar() {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    W = r.width; H = r.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dibujar();
  }

  /* ---- eventos ----------------------------------------------------------- */
  if ($('esal')) {
    $('esal').addEventListener('input', () => { recalcular(); lanzar(); });
  }
  if ($('pavSep')) {
    $('pavSep').addEventListener('click', () => {
      objetivoSep = objetivoSep > 0.5 ? 0 : 1;
      $('pavSep').classList.toggle('on', objetivoSep > 0.5);
      $('pavSep').textContent = objetivoSep > 0.5 ? 'Unir capas' : 'Separar capas';
      lanzar();
    });
  }

  // arrastre para girar
  canvas.addEventListener('pointerdown', e => {
    arrastrando = true; xArr = e.clientX; angBase = angulo;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', e => {
    if (!arrastrando) return;
    angulo = Math.max(0.12, Math.min(0.92, angBase + (e.clientX - xArr) * 0.004));
    dibujar();
  });
  canvas.addEventListener('pointerup', () => {
    arrastrando = false;
    canvas.style.cursor = 'grab';
  });
  canvas.addEventListener('pointercancel', () => { arrastrando = false; });
  canvas.style.cursor = 'grab';

  window.addEventListener('resize', ajustar);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajustar);
  recalcular();
  esp = { hma: meta.hma, base: meta.base, sub: meta.sub };
  requestAnimationFrame(ajustar);
  setTimeout(ajustar, 250);
})();
