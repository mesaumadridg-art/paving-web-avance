/* ============================================================================
   Simulador de radios de giro · PAVING
   Barrido de un bus interurbano de 12 m sobre una curva de 90°, calculado con
   el modelo de Ackermann. Todo en metros y convertido a píxeles al dibujar.
   ========================================================================== */
(function () {
  const canvas = document.getElementById('busCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  /* ---- geometría del vehículo (metros) ---------------------------------- */
  const BUS = {
    batalla: 6.50,   // entre ejes
    volDel: 2.60,    // voladizo delantero
    volTra: 2.90,    // voladizo trasero
    ancho: 2.55,
    get largo() { return this.batalla + this.volDel + this.volTra; }  // 12,00 m
  };
  const VIA = 7.30;        // calzada de dos carriles
  const RECTA_IN = 2.0;    // aproximación
  const RECTA_OUT = 3.4;   // salida
  const ARCO = Math.PI / 2;

  /* ---- estado ----------------------------------------------------------- */
  let R = 9.0;             // radio del eje trasero
  let t = 0;               // avance 0..1
  let jugando = false;
  let ultimo = 0;
  let mostrarHuella = true;
  let W = 0, H = 0, esc = 1, cx = 0, cy = 0;

  const $ = id => document.getElementById(id);
  const fmt = (v, d = 1) => v.toFixed(d).replace('.', ',');

  /* ---- cinemática ------------------------------------------------------- */
  function largoTramo() { return RECTA_IN + ARCO * R + RECTA_OUT; }

  // devuelve la posición del centro del eje trasero y la orientación
  function pose(tt) {
    const s = Math.min(1, Math.max(0, tt)) * largoTramo();
    if (s <= RECTA_IN) {
      return { x: -RECTA_IN + s, y: 0, phi: 0, theta: 0 };
    }
    const s2 = s - RECTA_IN;
    if (s2 <= ARCO * R) {
      const th = s2 / R;
      return {
        x: R * Math.sin(th),
        y: -R + R * Math.cos(th),
        phi: -th,
        theta: th
      };
    }
    const s3 = s2 - ARCO * R;
    return { x: R, y: -R - s3, phi: -ARCO, theta: ARCO };
  }

  // las cuatro esquinas del bus en el mundo
  function esquinas(p) {
    const dx = Math.cos(p.phi), dy = Math.sin(p.phi);
    const nx = -Math.sin(p.phi), ny = Math.cos(p.phi);   // normal derecha
    const w2 = BUS.ancho / 2;
    const fr = BUS.batalla + BUS.volDel;                  // morro desde el eje trasero
    const rr = BUS.volTra;
    return [
      { x: p.x + dx * fr + nx * w2, y: p.y + dy * fr + ny * w2 },   // delantera derecha
      { x: p.x + dx * fr - nx * w2, y: p.y + dy * fr - ny * w2 },   // delantera izquierda
      { x: p.x - dx * rr - nx * w2, y: p.y - dy * rr - ny * w2 },   // trasera izquierda
      { x: p.x - dx * rr + nx * w2, y: p.y - dy * rr + ny * w2 }    // trasera derecha
    ];
  }

  // centro de giro (solo tiene sentido en el arco)
  const centroGiro = () => ({ x: 0, y: -R });

  // posición restringida al tramo curvo, que es donde se mide el barrido
  function poseArco(u) {
    const th = Math.min(1, Math.max(0, u)) * ARCO;
    return { x: R * Math.sin(th), y: -R + R * Math.cos(th), phi: -th, theta: th };
  }
  // ¿el avance actual cae dentro del arco?
  function enArco(tt) {
    const s = tt * largoTramo();
    return s > RECTA_IN && s < RECTA_IN + ARCO * R;
  }

  /* ---- mediciones ------------------------------------------------------- */
  function medir() {
    const c = centroGiro();
    let rMin = Infinity, rMax = -Infinity;
    const N = 220;
    for (let i = 0; i <= N; i++) {
      const p = poseArco(i / N);
      esquinas(p).forEach(e => {
        const d = Math.hypot(e.x - c.x, e.y - c.y);
        if (d < rMin) rMin = d;
        if (d > rMax) rMax = d;
      });
    }
    const barrido = rMax - rMin;
    return {
      interior: rMin,
      exterior: rMax,
      barrido,
      sobreancho: Math.max(0, barrido - BUS.ancho)
    };
  }

  /* ---- envolvente convexa (monotone chain) ------------------------------ */
  function envolvente(pts) {
    const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    if (p.length < 3) return p;
    const cruz = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const bajo = [], alto = [];
    for (const q of p) {
      while (bajo.length >= 2 && cruz(bajo[bajo.length - 2], bajo[bajo.length - 1], q) <= 0) bajo.pop();
      bajo.push(q);
    }
    for (let i = p.length - 1; i >= 0; i--) {
      const q = p[i];
      while (alto.length >= 2 && cruz(alto[alto.length - 2], alto[alto.length - 1], q) <= 0) alto.pop();
      alto.push(q);
    }
    bajo.pop(); alto.pop();
    return bajo.concat(alto);
  }

  /* ---- encuadre --------------------------------------------------------- */
  function encuadrar() {
    const pts = [];
    for (let i = 0; i <= 40; i++) pts.push(pose(i / 40));
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    pts.forEach(p => esquinas(p).forEach(e => {
      b.x0 = Math.min(b.x0, e.x); b.y0 = Math.min(b.y0, e.y);
      b.x1 = Math.max(b.x1, e.x); b.y1 = Math.max(b.y1, e.y);
    }));
    const m = VIA / 2 + 1.2;
    b.x0 -= m; b.y0 -= m; b.x1 += m; b.y1 += m;

    const pad = 16;
    esc = Math.min((W - pad * 2) / (b.x1 - b.x0), (H - pad * 2) / (b.y1 - b.y0));
    cx = (b.x0 + b.x1) / 2;
    cy = (b.y0 + b.y1) / 2;
  }

  const px = (x, y) => [(x - cx) * esc + W / 2, (y - cy) * esc + H / 2];

  /* ---- patrón de rayado para la huella ---------------------------------- */
  let patron = null;
  function obtenerPatron() {
    if (patron) return patron;
    const c = document.createElement('canvas');
    c.width = c.height = 9;
    const g2 = c.getContext('2d');
    g2.strokeStyle = 'rgba(251,176,59,0.30)';
    g2.lineWidth = 1.1;
    g2.beginPath(); g2.moveTo(-1, 10); g2.lineTo(10, -1); g2.stroke();
    g2.beginPath(); g2.moveTo(-1, 1); g2.lineTo(1, -1); g2.stroke();
    patron = ctx.createPattern(c, 'repeat');
    return patron;
  }

  /* ---- dibujo ----------------------------------------------------------- */
  function fondo() {
    ctx.fillStyle = '#0C1219';
    ctx.fillRect(0, 0, W, H);

    // retícula técnica cada 2 m
    const paso = 2 * esc;
    if (paso < 6) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = (W / 2) % paso; x < W; x += paso) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = (H / 2) % paso; y < H; y += paso) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }

  function via() {
    // polilínea del centro del bus
    const pts = [];
    const N = 160;
    for (let i = 0; i <= N; i++) {
      const p = pose(i / N);
      const c = Math.cos(p.phi), s = Math.sin(p.phi);
      const off = BUS.batalla / 2 + BUS.volDel / 2;
      pts.push(px(p.x + c * off, p.y + s * off));
    }
    const trazar = () => {
      ctx.beginPath();
      pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    };

    ctx.lineCap = 'butt';
    ctx.lineJoin = 'round';

    // borde exterior de la calzada
    ctx.strokeStyle = 'rgba(255,255,255,0.30)';
    ctx.lineWidth = VIA * esc + 3;
    trazar(); ctx.stroke();

    // superficie asfáltica
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#3E4C5C');
    grad.addColorStop(0.5, '#36434F');
    grad.addColorStop(1, '#2C3844');
    ctx.strokeStyle = grad;
    ctx.lineWidth = VIA * esc;
    trazar(); ctx.stroke();

    // líneas de borde
    ctx.save();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.4;
    [-VIA / 2 + 0.25, VIA / 2 - 0.25].forEach(d => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const c = Math.cos(0), s2 = Math.sin(0);
        // desplazamiento perpendicular a la polilínea
        const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
        const dx = next[0] - prev[0], dy = next[1] - prev[1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const x = p[0] + nx * d * esc, y = p[1] + ny * d * esc;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke();
    });
    ctx.restore();

    // eje central discontinuo
    ctx.save();
    ctx.setLineDash([10, 12]);
    ctx.strokeStyle = 'rgba(251,176,59,0.55)';
    ctx.lineWidth = 1.5;
    trazar(); ctx.stroke();
    ctx.restore();
  }

  function huella(hasta) {
    if (!mostrarHuella || hasta <= 0.001) return;
    const N = 90;
    const max = Math.ceil(N * hasta);
    const todas = [];
    for (let i = 0; i <= max; i++) {
      const p = pose((i / N));
      esquinas(p).forEach(e => todas.push(e));
    }
    const hull = envolvente(todas);
    if (hull.length < 3) return;

    ctx.beginPath();
    hull.forEach((e, i) => {
      const [x, y] = px(e.x, e.y);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(251,176,59,0.055)';
    ctx.fill();
    ctx.fillStyle = obtenerPatron();
    ctx.fill();
    ctx.strokeStyle = 'rgba(251,176,59,0.72)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // trayectorias de los ejes
    ctx.save();
    ctx.setLineDash([4, 5]);
    [[BUS.batalla + BUS.volDel, 'rgba(255,255,255,0.42)'], [-BUS.volTra, 'rgba(255,255,255,0.28)']]
      .forEach(([off, col]) => {
        ctx.beginPath();
        for (let i = 0; i <= max; i++) {
          const p = pose(i / N);
          const c = Math.cos(p.phi), s = Math.sin(p.phi);
          const [x, y] = px(p.x + c * off, p.y + s * off);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.1;
        ctx.stroke();
      });
    ctx.restore();
  }

  function etiqueta(x, y, txt, col) {
    ctx.save();
    ctx.font = '600 10px "JetBrains Mono", ui-monospace, monospace';
    const w = ctx.measureText(txt).width;
    ctx.beginPath();
    ctx.roundRect(x - w / 2 - 5, y - 8.5, w + 10, 17, 2);
    ctx.fillStyle = 'rgba(8,12,18,0.88)';
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y);
    ctx.restore();
  }

  function cotas(p) {
    if (!enArco(t)) return;
    const c = centroGiro();
    const [ocx, ocy] = px(c.x, c.y);
    const esq = esquinas(p);
    const d = esq.map(e => Math.hypot(e.x - c.x, e.y - c.y));
    let iMax = 0, iMin = 0;
    d.forEach((v, i) => { if (v > d[iMax]) iMax = i; if (v < d[iMin]) iMin = i; });

    const linea = (e, col, dash) => {
      const [x, y] = px(e.x, e.y);
      ctx.save();
      ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(ocx, ocy); ctx.lineTo(x, y);
      ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
    };

    linea(esq[iMax], 'rgba(251,176,59,0.85)', [5, 4]);
    linea(esq[iMin], 'rgba(130,205,255,0.8)', [5, 4]);

    // etiquetas en el punto medio de cada radio
    const medio = (e) => {
      const [x, y] = px(e.x, e.y);
      return [(ocx + x) / 2, (ocy + y) / 2];
    };
    const [ex, ey] = medio(esq[iMax]);
    const [ix, iy] = medio(esq[iMin]);
    etiqueta(ex, ey, 'R ext ' + fmt(d[iMax]) + ' m', 'rgba(251,176,59,0.95)');
    etiqueta(ix, iy, 'R int ' + fmt(d[iMin]) + ' m', 'rgba(130,205,255,0.95)');

    // pivote
    ctx.beginPath(); ctx.arc(ocx, ocy, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
    ctx.beginPath(); ctx.arc(ocx, ocy, 7.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.34)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.save();
    ctx.font = '600 9.5px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.textAlign = 'center';
    ctx.fillText('CENTRO DE GIRO', ocx, ocy + 22);
    ctx.restore();
  }

  function dibujarBus(p) {
    const [bx, by] = px(p.x, p.y);
    const s = esc;
    const L = BUS.largo * s, Wd = BUS.ancho * s;
    const x0 = -BUS.volTra * s;
    const delta = Math.atan(BUS.batalla / R);

    // resplandor
    ctx.save();
    const rr = Math.max(L, Wd) * 0.75;
    const halo = ctx.createRadialGradient(bx, by, 0, bx, by, rr);
    halo.addColorStop(0, 'rgba(251,176,59,0.12)');
    halo.addColorStop(1, 'rgba(251,176,59,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(bx, by, rr, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // sombra
    ctx.save();
    ctx.translate(bx + 4, by + 5); ctx.rotate(p.phi);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.roundRect(x0, -Wd / 2, L, Wd, 8); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(p.phi);

    // ---- ruedas primero, para que asomen por debajo del borde ----
    const rueda = (x, y, girada) => {
      ctx.save();
      ctx.translate(x, y);
      if (girada) ctx.rotate(delta);
      ctx.beginPath();
      ctx.roundRect(-0.52 * s, -0.26 * s, 1.04 * s, 0.52 * s, 3);
      ctx.fillStyle = '#06090D';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    };
    const fuera = Wd / 2 + 0.06 * s;
    rueda(0, -fuera, false);
    rueda(0, fuera, false);
    rueda(BUS.batalla * s, -fuera, true);
    rueda(BUS.batalla * s, fuera, true);

    // ---- carrocería ----
    const g = ctx.createLinearGradient(0, -Wd / 2, 0, Wd / 2);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.45, '#F3F7FA');
    g.addColorStop(1, '#C4CFD9');
    ctx.beginPath();
    ctx.roundRect(x0, -Wd / 2, L, Wd, 9);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.3; ctx.stroke();

    // ---- techo: paños y eje longitudinal ----
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0 + 0.34 * s, -Wd / 2 + 0.22 * s, L - 0.68 * s, Wd - 0.44 * s, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.fill();
    // costillas del techo
    ctx.strokeStyle = 'rgba(16,28,44,0.07)';
    ctx.lineWidth = 1;
    const nCost = 9;
    for (let i = 1; i < nCost; i++) {
      const cx2 = x0 + 0.34 * s + (L - 0.68 * s) * (i / nCost);
      ctx.beginPath();
      ctx.moveTo(cx2, -Wd / 2 + 0.30 * s);
      ctx.lineTo(cx2, Wd / 2 - 0.30 * s);
      ctx.stroke();
    }
    ctx.restore();

    // ---- parabrisas y luneta (bandas transversales) ----
    ctx.fillStyle = '#111A24';
    // parabrisas: franja en el morro, ligeramente curvada
    ctx.beginPath();
    ctx.roundRect(x0 + L - 0.92 * s, -Wd / 2 + 0.13 * s, 0.44 * s, Wd - 0.26 * s, 4);
    ctx.fill();
    // luneta trasera
    ctx.beginPath();
    ctx.roundRect(x0 + 0.30 * s, -Wd / 2 + 0.20 * s, 0.30 * s, Wd - 0.40 * s, 3);
    ctx.fillStyle = 'rgba(17,26,36,0.85)';
    ctx.fill();

    // ---- puertas (una delantera, una central) ----
    ctx.fillStyle = 'rgba(16,28,44,0.16)';
    [x0 + L * 0.30, x0 + L * 0.52].forEach(dx => {
      ctx.fillRect(dx, Wd / 2 - 0.16 * s, L * 0.055, 0.14 * s);
    });

    // ---- franja de marca en el morro ----
    ctx.fillStyle = '#FBB03B';
    ctx.fillRect(x0 + L - 1.15 * s, -Wd / 2 + 0.03 * s, 0.22 * s, Wd - 0.06 * s);

    // ---- sentido de marcha ----
    ctx.save();
    ctx.strokeStyle = 'rgba(20,32,45,0.62)';
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    for (let k = 0; k < 2; k++) {
      const cx3 = x0 + L - 1.45 * s - k * 0.40 * s;
      ctx.beginPath();
      ctx.moveTo(cx3 - 0.10 * s, -Wd / 2 + 0.62 * s);
      ctx.lineTo(cx3 + 0.14 * s, 0);
      ctx.lineTo(cx3 - 0.10 * s, Wd / 2 - 0.62 * s);
      ctx.stroke();
    }
    ctx.restore();

    // ---- líneas de eje marcadas ----
    ctx.save();
    ctx.strokeStyle = 'rgba(16,28,44,0.22)';
    ctx.lineWidth = 1.4;
    [0, BUS.batalla].forEach(ex => {
      ctx.beginPath();
      ctx.moveTo(x0 + (ex + BUS.volTra) * s + (ex === 0 ? 0 : 0), -Wd / 2 + 0.05 * s);
      ctx.lineTo(x0 + (ex + BUS.volTra) * s, Wd / 2 - 0.05 * s);
      ctx.stroke();
    });
    ctx.restore();

    // ---- espejos ----
    ctx.fillStyle = '#111A24';
    [-1, 1].forEach(sd => {
      const my = sd * (Wd / 2 + 0.14 * s);
      ctx.beginPath();
      ctx.roundRect(x0 + L - 1.30 * s, my - 0.09 * s, 0.22 * s, 0.18 * s, 2);
      ctx.fill();
    });

    ctx.restore();
  }

  /* barra de escala */
  function escala() {
    const metros = 5;
    const largo = metros * esc;
    if (largo > W * 0.45) return;
    const x = 18, y = 48;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 2); ctx.lineTo(x + largo, y + 2); ctx.lineTo(x + largo, y - 4);
    ctx.stroke();
    ctx.font = '500 8.5px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textBaseline = 'bottom';
    ctx.fillText(metros + ' m', x + largo + 8, y + 4);
    ctx.restore();
  }

  /* leyenda del dibujo */
  function leyenda() {
    if (W < 560) return;   // en pantallas angostas la leyenda se solapa
    const items = [
      ['#FBB03B', 'HUELLA BARRIDA', false],
      ['#82CDFF', 'RADIO INTERIOR', true],
      ['rgba(255,255,255,0.9)', 'MORRO', true]
    ];
    ctx.save();
    ctx.font = '500 8.5px "JetBrains Mono", ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    const gap = 18, sw = 12, off = 17;
    let total = 0;
    items.forEach(([, txt]) => { total += sw + off + ctx.measureText(txt).width + gap; });
    total -= gap;
    const y0 = 23;
    let x2 = Math.max(16, W - total - 18);
    // marco
    ctx.beginPath();
    ctx.roundRect(x2 - 10, y0 - 13, total + 20, 26, 3);
    ctx.fillStyle = 'rgba(8,12,18,0.72)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1; ctx.stroke();
    items.forEach(([col, txt, dash]) => {
      ctx.save();
      if (dash) ctx.setLineDash([3, 3]);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x2, y0); ctx.lineTo(x2 + sw, y0); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.fillText(txt, x2 + off, y0);
      x2 += sw + off + ctx.measureText(txt).width + gap;
    });
    ctx.restore();
  }

  function pintar() {
    if (!W) return;
    fondo();
    via();
    const p = pose(t);
    huella(t);
    if (mostrarHuella) cotas(p);
    dibujarBus(p);
    leyenda();
    escala();

    const m = medir();
    if ($('vR')) $('vR').textContent = fmt(R) + ' m';
    if ($('vExt')) $('vExt').textContent = fmt(m.exterior) + ' m';
    if ($('vAncho')) $('vAncho').textContent = fmt(m.barrido) + ' m';
    if ($('vSobre')) $('vSobre').textContent = fmt(m.sobreancho) + ' m';
    if ($('vR2')) $('vR2').textContent = fmt(R) + ' m';
  }

  /* ---- tamaño ----------------------------------------------------------- */
  function ajustar() {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    W = r.width; H = r.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    encuadrar();
    pintar();
  }

  /* ---- animación -------------------------------------------------------- */
  let arranque = 0;
  function bucle(ts) {
    if (!jugando) return;
    if (!arranque) arranque = ts;
    const dur = 5200;
    t = Math.min(1, (ts - arranque) / dur);
    if ($('simT')) $('simT').value = Math.round(t * 1000);
    pintar();
    if (t >= 1) { jugando = false; arranque = 0; actualizarBoton(); return; }
    requestAnimationFrame(bucle);
  }

  function actualizarBoton() {
    const b = $('simPlay');
    if (!b) return;
    b.setAttribute('aria-label', jugando ? 'Pausar' : 'Reproducir');
    b.innerHTML = jugando
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  }

  function alternar() {
    if (jugando) { jugando = false; actualizarBoton(); return; }
    if (t >= 1) t = 0;
    jugando = true; arranque = 0;
    actualizarBoton();
    requestAnimationFrame(bucle);
  }

  /* ---- eventos ---------------------------------------------------------- */
  if ($('simPlay')) $('simPlay').addEventListener('click', alternar);
  if ($('simT')) $('simT').addEventListener('input', e => {
    jugando = false; actualizarBoton();
    t = +e.target.value / 1000;
    pintar();
  });
  if ($('simR')) $('simR').addEventListener('input', e => {
    R = +e.target.value;
    encuadrar();
    pintar();
  });
  if ($('simReset')) $('simReset').addEventListener('click', () => {
    jugando = false; t = 0; arranque = 0;
    if ($('simT')) $('simT').value = 0;
    actualizarBoton(); pintar();
  });

  const obs = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting && t === 0 && !jugando) alternar(); });
  }, { threshold: 0.4 });
  obs.observe(canvas);

  window.addEventListener('resize', ajustar);
  // el canvas no tiene tamaño hasta que el layout está listo
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajustar);
  requestAnimationFrame(ajustar);
  setTimeout(ajustar, 250);
})();
