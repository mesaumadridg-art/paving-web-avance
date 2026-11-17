/* ============================================================================
   Simulador de radios de giro · PAVING
   Intersección en T: el bus baja por el acceso y gira a la izquierda para
   incorporarse a la vía principal. Dos vistas — planta técnica y seguimiento
   frontal en 3D — con la envolvente calculada por Ackermann.
   Todo en metros; la planta usa escala ortogonal y la 3D perspectiva real.
   ========================================================================== */
(function () {
  const canvas = document.getElementById('busCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  /* ---- vehículo (metros) ------------------------------------------------ */
  const BUS = {
    batalla: 6.50,
    volDel: 2.60,
    volTra: 2.90,
    ancho: 2.55,
    alto: 3.30,
    get largo() { return this.batalla + this.volDel + this.volTra; }   // 12,00
  };
  const DC = (BUS.batalla + BUS.volDel - BUS.volTra) / 2;  // centro ↔ eje trasero
  const VIA = 7.30;
  const CARRIL = VIA / 2;
  const RECTA_IN = 7.0;
  const RECTA_OUT = 11.0;
  const ARCO = Math.PI / 2;

  let R = 15.0;
  let t = 0;
  let jugando = false;
  let vista = 'planta';
  let empalme = 6.5;         // chaflán de la esquina interior, en metros
  let W = 0, H = 0, esc = 1, cx = 0, cy = 0;

  const $ = id => document.getElementById(id);
  const fmt = (v, d = 1) => v.toFixed(d).replace('.', ',');

  /* ---- cinemática -------------------------------------------------------
     Acceso vertical en x = 0, sentido +Y. Giro a la izquierda con centro en
     (R, 0). La vía principal corre en y = R.
     ---------------------------------------------------------------------- */
  const largoTramo = () => RECTA_IN + ARCO * R + RECTA_OUT;

  function pose(tt) {
    const s = Math.min(1, Math.max(0, tt)) * largoTramo();
    if (s <= RECTA_IN) {
      return { x: 0, y: -RECTA_IN + s, phi: Math.PI / 2, theta: 0 };
    }
    const s2 = s - RECTA_IN;
    if (s2 <= ARCO * R) {
      const th = s2 / R;
      const a = Math.PI - th;
      return { x: R + R * Math.cos(a), y: R * Math.sin(a), phi: Math.PI / 2 - th, theta: th };
    }
    const s3 = s2 - ARCO * R;
    return { x: R + s3, y: R, phi: 0, theta: ARCO };
  }

  function poseArco(u) {
    const th = Math.min(1, Math.max(0, u)) * ARCO;
    const a = Math.PI - th;
    return { x: R + R * Math.cos(a), y: R * Math.sin(a), phi: Math.PI / 2 - th, theta: th };
  }

  function enArco(tt) {
    const s = tt * largoTramo();
    return s > RECTA_IN && s < RECTA_IN + ARCO * R;
  }

  const centroGiro = () => ({ x: R, y: 0 });

  /* ---- evaluación de la calzada -----------------------------------------
     Un punto está en la calzada si cae dentro de alguna de las dos franjas.
     El empalme rellena la esquina interior: allí el margen extra es el 70 %
     de su valor, porque el chaflán es curvo y solo cubre el cuadrante.
     ---------------------------------------------------------------------- */
  function dentroDeCalzada(x, y) {
    // franja principal
    if (Math.abs(y - R) <= CARRIL) return true;
    // franja del acceso
    if (Math.abs(x) <= CARRIL && y <= R - CARRIL) return true;
    // chaflán de la esquina: área bajo la curva cuadrática
    if (x >= CARRIL && x <= CARRIL + empalme && y <= R - CARRIL && y >= R - CARRIL - empalme) {
      const t2 = (x - CARRIL) / empalme;
      const yCurva = (R - CARRIL) - empalme * (1 - Math.sqrt(t2)) * (1 - Math.sqrt(t2));
      if (y >= yCurva) return true;
    }
    return false;
  }

  /* profundidad de la invasión: cuánto falta para entrar en la calzada */
  function excesoDe(x, y) {
    if (dentroDeCalzada(x, y)) return 0;
    const d = Math.min(Math.abs(x), Math.abs(y - R)) - CARRIL;
    // en la esquina, el chaflán reduce la falta
    if (x > 0 && y < R && empalme > 0) {
      const t2 = Math.max(0, Math.min(1, (x - CARRIL) / empalme));
      const yCurva = (R - CARRIL) - empalme * (1 - Math.sqrt(t2)) * (1 - Math.sqrt(t2));
      const falta = yCurva - y;
      return Math.max(0, Math.min(d, falta));
    }
    return Math.max(0, d);
  }

  function evaluar() {
    const N = 160;
    let peor = 0, punto = null, cuantas = 0, total = 0;
    let peorRueda = 0, ruedaMala = null;
    for (let i = 0; i <= N; i++) {
      const p = pose(i / N);
      esquinas(p).forEach(e => {
        total++;
        const ex = excesoDe(e.x, e.y);
        if (ex > 0.02) cuantas++;
        if (ex > peor) { peor = ex; punto = e; }
      });
      ruedas(p).forEach(r => {
        const ex = excesoDe(r.x, r.y);
        if (ex > peorRueda) { peorRueda = ex; ruedaMala = r; }
      });
    }
    return {
      exceso: Math.max(peor, peorRueda),
      excesoCarroceria: peor,
      excesoRuedas: peorRueda,
      punto, rueda: ruedaMala,
      fraccion: total ? cuantas / total : 0
    };
  }

  function ruedas(p) {
    const dx = Math.cos(p.phi), dy = Math.sin(p.phi);
    const nx = -Math.sin(p.phi), ny = Math.cos(p.phi);
    const fuera = BUS.ancho / 2 - 0.06;   // plano de la rueda
    const pts = [];
    [0, BUS.batalla].forEach(ex => {
      [1, -1].forEach(sd => {
        pts.push({
          x: p.x + dx * ex + nx * fuera * sd,
          y: p.y + dy * ex + ny * fuera * sd
        });
      });
    });
    return pts;
  }

  function esquinas(p) {
    const dx = Math.cos(p.phi), dy = Math.sin(p.phi);
    const nx = -Math.sin(p.phi), ny = Math.cos(p.phi);
    const w2 = BUS.ancho / 2, fr = BUS.batalla + BUS.volDel, rr = BUS.volTra;
    return [
      { x: p.x + dx * fr + nx * w2, y: p.y + dy * fr + ny * w2 },
      { x: p.x + dx * fr - nx * w2, y: p.y + dy * fr - ny * w2 },
      { x: p.x - dx * rr - nx * w2, y: p.y - dy * rr - ny * w2 },
      { x: p.x - dx * rr + nx * w2, y: p.y - dy * rr + ny * w2 }
    ];
  }

  function medir() {
    const c = centroGiro();
    let rMin = Infinity, rMax = -Infinity;
    const N = 240;
    for (let i = 0; i <= N; i++) {
      esquinas(poseArco(i / N)).forEach(e => {
        const d = Math.hypot(e.x - c.x, e.y - c.y);
        if (d < rMin) rMin = d;
        if (d > rMax) rMax = d;
      });
    }
    const barrido = rMax - rMin;
    return { interior: rMin, exterior: rMax, barrido, sobreancho: Math.max(0, barrido - BUS.ancho) };
  }

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

  function encuadrar() {
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const add = (x, y) => {
      b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y);
      b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y);
    };
    for (let i = 0; i <= 40; i++) esquinas(pose(i / 40)).forEach(e => add(e.x, e.y));
    add(-VIA - 4, R - VIA / 2); add(R + RECTA_OUT, R + VIA / 2);
    add(-VIA / 2, -RECTA_IN); add(VIA / 2, R + VIA / 2);
    const m = 1.8;
    b.x0 -= m; b.y0 -= m; b.x1 += m; b.y1 += m;
    const pad = 16;
    esc = Math.min((W - pad * 2) / (b.x1 - b.x0), (H - pad * 2) / (b.y1 - b.y0));
    cx = (b.x0 + b.x1) / 2;
    cy = (b.y0 + b.y1) / 2;
  }

  const px = (x, y) => [(x - cx) * esc + W / 2, (y - cy) * esc + H / 2];

  let patronCache = null;
  function patron() {
    if (patronCache) return patronCache;
    const c = document.createElement('canvas');
    c.width = c.height = 9;
    const g2 = c.getContext('2d');
    g2.strokeStyle = 'rgba(251,176,59,0.26)';
    g2.lineWidth = 1.1;
    g2.beginPath(); g2.moveTo(-1, 10); g2.lineTo(10, -1); g2.stroke();
    patronCache = ctx.createPattern(c, 'repeat');
    return patronCache;
  }

  /* ======================================================================
     PLANTA
     ====================================================================== */
  function fondoPlanta() {
    ctx.fillStyle = '#0C1219';
    ctx.fillRect(0, 0, W, H);
    const paso = 2 * esc;
    if (paso < 7) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = (W / 2) % paso; x < W; x += paso) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = (H / 2) % paso; y < H; y += paso) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }

  function calzada() {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#56687D');
    g.addColorStop(0.5, '#455466');
    g.addColorStop(1, '#384454');

    const banda = (x0, y0, x1, y1) => {
      const p0 = px(x0, y0), p1 = px(x1, y1);
      ctx.strokeStyle = 'rgba(255,255,255,0.40)';
      ctx.lineWidth = VIA * esc + 4;
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
      ctx.strokeStyle = g;
      ctx.lineWidth = VIA * esc;
      ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    };

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'butt';

    // vía principal y acceso hasta el borde norte de la principal
    banda(-VIA - 6, R, R + RECTA_OUT + 6, R);
    banda(0, -RECTA_IN - 4, 0, R - VIA / 2);

    // empalme de la esquina interior: rellena el chaflán
    if (empalme > 0.04) {
      const p0 = px(CARRIL, R - CARRIL);
      const p1 = px(CARRIL, R - CARRIL - empalme);
      const p2 = px(CARRIL + empalme, R - CARRIL);
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.quadraticCurveTo(p0[0], p0[1], p2[0], p2[1]);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    // bordillos
    ctx.strokeStyle = 'rgba(255,255,255,0.58)';
    ctx.lineWidth = 1.5;
    // borde sur de la principal
    [[-VIA - 6, R + CARRIL], [R + RECTA_OUT + 6, R + CARRIL]].forEach(() => {});
    let q0 = px(-VIA - 6, R + CARRIL), q1 = px(R + RECTA_OUT + 6, R + CARRIL);
    ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
    // borde norte de la principal, desde el acceso hacia el este
    q0 = px(VIA / 2, R - CARRIL); q1 = px(R + RECTA_OUT + 6, R - CARRIL);
    ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
    // borde oeste del acceso
    q0 = px(-CARRIL, -RECTA_IN - 4); q1 = px(-CARRIL, R + CARRIL);
    ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
    // borde este del acceso, hasta el empalme
    q0 = px(CARRIL, -RECTA_IN - 4); q1 = px(CARRIL, R - CARRIL - empalme);
    ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();

    // eje central discontinuo
    ctx.save();
    ctx.setLineDash([10, 12]);
    ctx.strokeStyle = 'rgba(251,176,59,0.50)';
    ctx.lineWidth = 1.5;
    q0 = px(-VIA - 6, R); q1 = px(R + RECTA_OUT + 6, R);
    ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
    q0 = px(0, -RECTA_IN - 4); q1 = px(0, R - CARRIL);
    ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
    ctx.restore();

    ctx.restore();
  }
  function huellaPlanta(hasta) {
    if (hasta <= 0.001) return;
    const N = 90, max = Math.ceil(N * hasta);
    const todas = [];
    for (let i = 0; i <= max; i++) esquinas(pose(i / N)).forEach(e => todas.push(e));
    const hull = envolvente(todas);
    if (hull.length < 3) return;

    ctx.beginPath();
    hull.forEach((e, i) => { const [x, y] = px(e.x, e.y); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
    ctx.fillStyle = 'rgba(251,176,59,0.05)';
    ctx.fill();
    ctx.fillStyle = patron();
    ctx.fill();
    ctx.strokeStyle = 'rgba(251,176,59,0.78)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.save();
    ctx.setLineDash([4, 5]);
    [[BUS.batalla + BUS.volDel, 'rgba(255,255,255,0.5)'], [-BUS.volTra, 'rgba(255,255,255,0.28)']]
      .forEach(([off, col]) => {
        ctx.beginPath();
        for (let i = 0; i <= max; i++) {
          const p = pose(i / N);
          const c = Math.cos(p.phi), s = Math.sin(p.phi);
          const [x, y] = px(p.x + c * off, p.y + s * off);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.strokeStyle = col; ctx.lineWidth = 1.15; ctx.stroke();
      });
    ctx.restore();
  }

  function etiqueta2D(x, y, txt, col, tam) {
    tam = tam || 10;
    ctx.save();
    ctx.font = '600 ' + tam + 'px "JetBrains Mono", ui-monospace, monospace';
    const w = ctx.measureText(txt).width;
    ctx.beginPath();
    ctx.roundRect(x - w / 2 - 5, y - tam * 0.85, w + 10, tam * 1.7, 2);
    ctx.fillStyle = 'rgba(8,12,18,0.9)';
    ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = col;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y);
    ctx.restore();
  }

  function cotasPlanta(p) {
    if (!enArco(t)) return;
    const c = centroGiro();
    const [ocx, ocy] = px(c.x, c.y);
    const esq = esquinas(p);
    const d = esq.map(e => Math.hypot(e.x - c.x, e.y - c.y));
    let iMax = 0, iMin = 0;
    d.forEach((v, i) => { if (v > d[iMax]) iMax = i; if (v < d[iMin]) iMin = i; });

    const linea = (e, col) => {
      const [x, y] = px(e.x, e.y);
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.moveTo(ocx, ocy); ctx.lineTo(x, y);
      ctx.strokeStyle = col; ctx.lineWidth = 1.1; ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.arc(x, y, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
    };
    linea(esq[iMax], 'rgba(251,176,59,0.9)');
    linea(esq[iMin], 'rgba(130,205,255,0.85)');

    const medio = e => {
      const [x, y] = px(e.x, e.y);
      return [(ocx + x) / 2, (ocy + y) / 2];
    };
    const em = medio(esq[iMax]), im = medio(esq[iMin]);
    etiqueta2D(em[0], em[1], 'R ext ' + fmt(d[iMax]) + ' m', 'rgba(251,176,59,0.95)');
    etiqueta2D(im[0], im[1], 'R int ' + fmt(d[iMin]) + ' m', 'rgba(130,205,255,0.95)');

    ctx.beginPath(); ctx.arc(ocx, ocy, 3.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    ctx.beginPath(); ctx.arc(ocx, ocy, 8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.34)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.save();
    ctx.font = '600 9.5px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.textAlign = 'center';
    ctx.fillText('CENTRO DE GIRO', ocx, ocy + 23);
    ctx.restore();
  }

  function cotasCalzada() {
    const y = R + CARRIL + 3.2;
    const p0 = px(-CARRIL, y), p1 = px(CARRIL, y);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    [p0, p1].forEach(q => {
      ctx.beginPath(); ctx.moveTo(q[0], q[1] - 5); ctx.lineTo(q[0], q[1] + 5); ctx.stroke();
    });
    ctx.restore();
    etiqueta2D((p0[0] + p1[0]) / 2, p0[1] - 13, fmt(VIA, 2) + ' m', 'rgba(255,255,255,0.82)', 9.5);

    const y2 = y + 13;
    const q0 = px(-CARRIL, y2), q1 = px(0, y2);
    ctx.save();
    ctx.strokeStyle = 'rgba(130,205,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke();
    ctx.restore();
    etiqueta2D((q0[0] + q1[0]) / 2, q0[1] - 11, 'carril ' + fmt(CARRIL, 2), 'rgba(130,205,255,0.85)', 9);
  }

  function dibujarBusPlanta(p) {
    const pt = px(p.x, p.y);
    const bx = pt[0], by = pt[1];
    const s = esc;
    const L = BUS.largo * s, Wd = BUS.ancho * s;
    const x0 = -BUS.volTra * s;
    const delta = Math.atan(BUS.batalla / R);

    ctx.save();
    const rr = Math.max(L, Wd) * 0.72;
    const halo = ctx.createRadialGradient(bx, by, 0, bx, by, rr);
    halo.addColorStop(0, 'rgba(251,176,59,0.13)');
    halo.addColorStop(1, 'rgba(251,176,59,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(bx, by, rr, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(bx + 4, by + 5); ctx.rotate(p.phi);
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.roundRect(x0, -Wd / 2, L, Wd, 9); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(bx, by);
    ctx.rotate(p.phi);

    const rueda = (x, y, girada) => {
      ctx.save(); ctx.translate(x, y); if (girada) ctx.rotate(delta);
      ctx.beginPath(); ctx.roundRect(-0.52 * s, -0.26 * s, 1.04 * s, 0.52 * s, 3);
      ctx.fillStyle = '#06090D'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.restore();
    };
    const fuera = Wd / 2 + 0.06 * s;
    rueda(0, -fuera, false); rueda(0, fuera, false);
    rueda(BUS.batalla * s, -fuera, true); rueda(BUS.batalla * s, fuera, true);

    const g = ctx.createLinearGradient(0, -Wd / 2, 0, Wd / 2);
    g.addColorStop(0, '#FFFFFF'); g.addColorStop(0.45, '#F3F7FA'); g.addColorStop(1, '#C4CFD9');
    ctx.beginPath(); ctx.roundRect(x0, -Wd / 2, L, Wd, 9);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.3; ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0 + 0.34 * s, -Wd / 2 + 0.22 * s, L - 0.68 * s, Wd - 0.44 * s, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.62)'; ctx.fill();
    ctx.strokeStyle = 'rgba(16,28,44,0.07)'; ctx.lineWidth = 1;
    for (let i = 1; i < 9; i++) {
      const cxx = x0 + 0.34 * s + (L - 0.68 * s) * (i / 9);
      ctx.beginPath();
      ctx.moveTo(cxx, -Wd / 2 + 0.30 * s); ctx.lineTo(cxx, Wd / 2 - 0.30 * s);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = '#111A24';
    ctx.beginPath(); ctx.roundRect(x0 + L - 0.92 * s, -Wd / 2 + 0.13 * s, 0.44 * s, Wd - 0.26 * s, 4); ctx.fill();
    ctx.beginPath(); ctx.roundRect(x0 + 0.30 * s, -Wd / 2 + 0.20 * s, 0.30 * s, Wd - 0.40 * s, 3);
    ctx.fillStyle = 'rgba(17,26,36,0.85)'; ctx.fill();

    ctx.fillStyle = 'rgba(16,28,44,0.16)';
    [x0 + L * 0.30, x0 + L * 0.52].forEach(dx => {
      ctx.fillRect(dx, Wd / 2 - 0.16 * s, L * 0.055, 0.14 * s);
    });

    ctx.fillStyle = '#FBB03B';
    ctx.fillRect(x0 + L - 1.15 * s, -Wd / 2 + 0.03 * s, 0.22 * s, Wd - 0.06 * s);

    ctx.save();
    ctx.strokeStyle = 'rgba(20,32,45,0.62)'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    for (let k = 0; k < 2; k++) {
      const cx3 = x0 + L - 1.45 * s - k * 0.40 * s;
      ctx.beginPath();
      ctx.moveTo(cx3 - 0.10 * s, -Wd / 2 + 0.62 * s);
      ctx.lineTo(cx3 + 0.14 * s, 0);
      ctx.lineTo(cx3 - 0.10 * s, Wd / 2 - 0.62 * s);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = 'rgba(16,28,44,0.28)';
    ctx.fillRect(x0 + L - 1.12 * s, -Wd / 2 + 0.02 * s, 0.22 * s, Wd - 0.04 * s);

    ctx.fillStyle = '#111A24';
    [-1, 1].forEach(sd => {
      const my = sd * (Wd / 2 + 0.14 * s);
      ctx.beginPath(); ctx.roundRect(x0 + L - 1.30 * s, my - 0.09 * s, 0.22 * s, 0.18 * s, 2); ctx.fill();
    });

    ctx.restore();
  }

  function marcarConflictos() {
    const N = 90, max = Math.ceil(N * Math.max(0.02, t));
    let n = 0;
    for (let i = 0; i <= max; i++) {
      const p = pose(i / N);
      esquinas(p).forEach(e => {
        if (excesoDe(e.x, e.y) <= 0.02) return;
        const q = px(e.x, e.y);
        ctx.beginPath();
        ctx.arc(q[0], q[1], 2.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(228,84,66,0.9)';
        ctx.fill();
        n++;
      });
      ruedas(p).forEach(r => {
        if (excesoDe(r.x, r.y) <= 0.02) return;
        const q = px(r.x, r.y);
        ctx.beginPath();
        ctx.arc(q[0], q[1], 3.4, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(228,84,66,0.95)';
        ctx.lineWidth = 1.8;
        ctx.stroke();
        n++;
      });
    }
    return n;
  }

  function leyendaPlanta() {
    if (W < 600) return;
    const items = [
      ['#FBB03B', 'HUELLA', false],
      ['#82CDFF', 'R. INTERIOR', true],
      ['rgba(255,255,255,0.9)', 'MORRO', true],
      ['#F28C28', 'R. EXTERIOR', true]
    ];
    ctx.save();
    ctx.font = '500 8.5px "JetBrains Mono", ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    const gap = 14, sw = 11, off = 16;
    let total = 0;
    items.forEach(it => { total += sw + off + ctx.measureText(it[1]).width + gap; });
    total -= gap;
    const y0 = 23;
    let x2 = Math.max(16, W - total - 16);
    ctx.beginPath();
    ctx.roundRect(x2 - 9, y0 - 12, total + 18, 24, 3);
    ctx.fillStyle = 'rgba(8,12,18,0.72)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1; ctx.stroke();
    items.forEach(it => {
      const col = it[0], txt = it[1], dash = it[2];
      ctx.save();
      if (dash) ctx.setLineDash([3, 3]);
      ctx.strokeStyle = col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x2, y0); ctx.lineTo(x2 + sw, y0); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.fillText(txt, x2 + off, y0);
      x2 += sw + off + ctx.measureText(txt).width + gap;
    });
    ctx.restore();
  }

  function escalaGrafica() {
    const metros = 5, largo = metros * esc;
    if (largo > W * 0.4) return;
    const x = 18, y = 46;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 2); ctx.lineTo(x + largo, y + 2); ctx.lineTo(x + largo, y - 4);
    ctx.stroke();
    for (let i = 1; i < metros; i++) {
      const xx = x + (largo * i) / metros;
      ctx.beginPath(); ctx.moveTo(xx, y - 2); ctx.lineTo(xx, y + 2); ctx.stroke();
    }
    ctx.font = '500 8.5px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textBaseline = 'bottom'; ctx.textAlign = 'center';
    ctx.fillText('0', x, y + 14);
    ctx.fillText(metros + ' m', x + largo, y + 14);
    ctx.textAlign = 'left';
    ctx.restore();
  }

  /* ======================================================================
     3D · seguimiento frontal
     ====================================================================== */
  const V = {
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
    dot: (a, b) => a.x * b.x + a.y * b.y + a.z * b.z,
    cross: (a, b) => ({
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    }),
    norm: a => {
      const l = Math.hypot(a.x, a.y, a.z) || 1;
      return { x: a.x / l, y: a.y / l, z: a.z / l };
    }
  };

  let cam = null;
  const caras = [];
  const carasTop = [];   // detalles del morro que siempre van encima

  function crearCamara(p) {
    const c = Math.cos(p.phi), s = Math.sin(p.phi);
    const morro = { x: p.x + c * (BUS.batalla + BUS.volDel), y: p.y + s * (BUS.batalla + BUS.volDel) };
    const centro = { x: p.x + c * DC, y: p.y + s * DC };
    const dist = W < 520 ? 11.5 : 9.5;
    const pos = { x: morro.x + c * dist, y: morro.y + s * dist, z: 3.9 };
    const target = { x: centro.x, y: centro.y, z: 1.30 };
    const f = V.norm(V.sub(target, pos));
    const r = V.norm(V.cross(f, { x: 0, y: 0, z: 1 }));
    const u = V.cross(r, f);
    const foco = (H / 2) / Math.tan((46 * Math.PI / 180) / 2);
    return { pos: pos, f: f, r: r, u: u, foco: foco };
  }

  function proy(p3) {
    const d = V.sub(p3, cam.pos);
    const z = V.dot(d, cam.f);
    if (z < 1.4) return null;                 // recorta el plano de la cámara
    const x = V.dot(d, cam.r);
    const y = V.dot(d, cam.u);
    const sx = W / 2 + (x * cam.foco) / z;
    const sy = H / 2 - (y * cam.foco) / z;
    // descarta proyecciones degeneradas que taparían la escena
    if (!isFinite(sx) || !isFinite(sy)) return null;
    if (Math.abs(sx - W / 2) > W * 3 || Math.abs(sy - H / 2) > H * 3) return null;
    return [sx, sy, z];
  }

  function cara(pts3, color, top) {
    const pr = pts3.map(proy);
    if (pr.some(q => !q)) return;
    const prof = pr.reduce((a, q) => a + q[2], 0) / pr.length;
    (top ? carasTop : caras).push({ pr: pr, color: color, prof: prof });
  }

  function caja(cx2, cy2, z0, largo, ancho, alto, ang, color, solo, top) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const hx = largo / 2, hy = ancho / 2;
    const P = (dx, dy, dz) => ({
      x: cx2 + dx * c - dy * s,
      y: cy2 + dx * s + dy * c,
      z: z0 + dz
    });
    const v = [
      P(-hx, -hy, 0), P(hx, -hy, 0), P(hx, hy, 0), P(-hx, hy, 0),
      P(-hx, -hy, alto), P(hx, -hy, alto), P(hx, hy, alto), P(-hx, hy, alto)
    ];
    const tono = f => {
      const m = color.match(/[0-9a-f]{2}/gi).map(h => Math.max(0, Math.min(255, Math.round(parseInt(h, 16) * f))));
      return 'rgb(' + m[0] + ',' + m[1] + ',' + m[2] + ')';
    };
    const F = [
      { v: [v[4], v[5], v[6], v[7]], f: 1.0 },
      { v: [v[0], v[1], v[5], v[4]], f: 0.74 },
      { v: [v[3], v[2], v[6], v[7]], f: 0.74 },
      { v: [v[0], v[3], v[7], v[4]], f: 0.60 },
      { v: [v[1], v[2], v[6], v[5]], f: 0.86 }
    ];
    const idx = solo || [0, 1, 2, 3, 4];
    idx.forEach(i => cara(F[i].v, tono(F[i].f), top));
  }

  function dibujar3D(p) {
    caras.length = 0;
    carasTop.length = 0;
    cam = crearCamara(p);

    const cielo = ctx.createLinearGradient(0, 0, 0, H);
    cielo.addColorStop(0, '#080D14');
    cielo.addColorStop(0.5, '#122030');
    cielo.addColorStop(1, '#0A1017');
    ctx.fillStyle = cielo;
    ctx.fillRect(0, 0, W, H);

    const suelo = ctx.createLinearGradient(0, H * 0.48, 0, H);
    suelo.addColorStop(0, '#1B2734');
    suelo.addColorStop(1, '#0D141C');
    ctx.fillStyle = suelo;
    ctx.fillRect(0, Math.round(H * 0.48), W, H);

    const N = 120, mitad = VIA / 2;
    for (let i = 0; i < N; i++) {
      const p0 = pose(i / N), p1 = pose((i + 1) / N);
      const c0 = Math.cos(p0.phi), s0 = Math.sin(p0.phi);
      const c1 = Math.cos(p1.phi), s1 = Math.sin(p1.phi);
      cara([
        { x: p0.x - s0 * mitad, y: p0.y + c0 * mitad, z: 0 },
        { x: p0.x + s0 * mitad, y: p0.y - c0 * mitad, z: 0 },
        { x: p1.x + s1 * mitad, y: p1.y - c1 * mitad, z: 0 },
        { x: p1.x - s1 * mitad, y: p1.y + c1 * mitad, z: 0 }
      ], i % 2 ? '#2B3745' : '#313E4D');
    }

    const ang = p.phi;
    const cxx = p.x + Math.cos(ang) * DC;
    const cyy = p.y + Math.sin(ang) * DC;

    // carrocería
    caja(cxx, cyy, 0.36, BUS.largo, BUS.ancho, BUS.alto - 0.36, ang, '#EEF3F7');
    // parabrisas, pegado al morro
    const pwx = cxx + Math.cos(ang) * 5.93, pwy = cyy + Math.sin(ang) * 5.93;
    caja(pwx, pwy, 1.72, 0.06, BUS.ancho - 0.30, 1.30, ang, '#182430', [4], true);
    // franja ámbar de marca bajo el parabrisas
    caja(cxx + Math.cos(ang) * 5.97, cyy + Math.sin(ang) * 5.97, 1.30,
         0.05, BUS.ancho - 0.06, 0.34, ang, '#FBB03B', [4], true);
    // faros
    [-1, 1].forEach(sd => {
      const fx = cxx + Math.cos(ang) * 5.96 - Math.sin(ang) * sd * 0.86;
      const fy = cyy + Math.sin(ang) * 5.96 + Math.cos(ang) * sd * 0.86;
      caja(fx, fy, 0.74, 0.05, 0.52, 0.24, ang, '#F6E4B8', [4], true);
    });
    // defensa
    caja(cxx + Math.cos(ang) * 5.96, cyy + Math.sin(ang) * 5.96, 0.28,
         0.08, BUS.ancho - 0.02, 0.30, ang, '#5A6773', [4], true);

    const delta = Math.atan(BUS.batalla / R);
    [[3.4, false], [-3.1, true]].forEach(par => {
      const off = par[0], gira = par[1];
      [-1, 1].forEach(sd => {
        const wx = cxx + Math.cos(ang) * off - Math.sin(ang) * sd * (BUS.ancho / 2 - 0.18);
        const wy = cyy + Math.sin(ang) * off + Math.cos(ang) * sd * (BUS.ancho / 2 - 0.18);
        caja(wx, wy, 0, 1.05, 0.50, 0.92, ang + (gira ? delta : 0), '#0A0F15');
      });
    });

    const pintarCara = c => {
      ctx.beginPath();
      c.pr.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
      ctx.closePath();
      ctx.fillStyle = c.color;
      ctx.fill();
    };
    caras.sort((a, b) => b.prof - a.prof);
    caras.forEach(pintarCara);
    // detalles del morro, siempre por delante
    carasTop.sort((a, b) => b.prof - a.prof);
    carasTop.forEach(pintarCara);

    const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.9);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  function leyenda3D() {
    if (W < 520) return;
    const txt = 'SEGUIMIENTO FRONTAL';
    ctx.save();
    ctx.font = '500 8.5px "JetBrains Mono", ui-monospace, monospace';
    const w = ctx.measureText(txt).width;
    ctx.beginPath();
    ctx.roundRect(W - w - 26, 12, w + 18, 22, 3);
    ctx.fillStyle = 'rgba(8,12,18,0.7)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, W - w - 17, 23);
    ctx.restore();
  }

  /* ======================================================================
     PINTADO
     ====================================================================== */
  function sincronizar() {
    const r = canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const aw = Math.round(r.width * dpr), ah = Math.round(r.height * dpr);
    if (aw === canvas.width && ah === canvas.height && W === r.width) return;
    canvas.width = aw; canvas.height = ah;
    W = r.width; H = r.height;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    encuadrar();
  }

  function pintar() {
    sincronizar();
    if (!W) return;
    const p = pose(t);

    if (vista === '3d') {
      dibujar3D(p);
      leyenda3D();
    } else {
      fondoPlanta();
      calzada();
      huellaPlanta(t);
      marcarConflictos();
      if (enArco(t)) cotasPlanta(p);
      dibujarBusPlanta(p);
      leyendaPlanta();
      escalaGrafica();
      cotasCalzada();
    }

    const m = medir();
    const ev = evaluar();
    if ($('vVeredicto')) {
      const cumple = ev.exceso < 0.05;
      $('vVeredicto').textContent = cumple ? 'Cabe' : 'No cabe';
      $('vVeredicto').className = 'veredicto-val ' + (cumple ? 'ok' : 'no');
      if ($('vDetalle')) {
        if (cumple) {
          $('vDetalle').textContent = 'Ninguna rueda ni esquina sale del firme en todo el giro.';
        } else if (ev.excesoRuedas > 0.04 && ev.excesoRuedas >= ev.excesoCarroceria) {
          $('vDetalle').textContent = 'Las ruedas salen del firme ' + fmt(ev.excesoRuedas, 2) + ' m.';
        } else if (ev.excesoCarroceria > 0.04) {
          $('vDetalle').textContent = 'La carrocería barre ' + fmt(ev.excesoCarroceria, 2) + ' m fuera del borde.';
        } else {
          $('vDetalle').textContent = 'Se sale ' + fmt(ev.exceso, 2) + ' m de la calzada.';
        }
      }
    }
    if ($('vEmp')) $('vEmp').textContent = fmt(empalme, 1) + ' m';
    if ($('vR')) $('vR').textContent = fmt(R) + ' m';
    if ($('vExt')) $('vExt').textContent = fmt(m.exterior) + ' m';
    if ($('vInt')) $('vInt').textContent = fmt(m.interior) + ' m';
    if ($('vAncho')) $('vAncho').textContent = fmt(m.barrido) + ' m';
    if ($('vSobre')) $('vSobre').textContent = fmt(m.sobreancho) + ' m';
    if ($('vR2')) $('vR2').textContent = fmt(R) + ' m';
  }

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

  let arranque = 0;
  function bucle(ts) {
    if (!jugando) return;
    if (!arranque) arranque = ts;
    t = Math.min(1, (ts - arranque) / 6500);
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

  function cambiarVista(v) {
    vista = v;
    const bs = document.querySelectorAll('.sim-vista');
    for (let i = 0; i < bs.length; i++) bs[i].classList.toggle('on', bs[i].dataset.vista === v);
    pintar();
  }

  if ($('simPlay')) $('simPlay').addEventListener('click', alternar);
  if ($('simT')) $('simT').addEventListener('input', e => {
    jugando = false; actualizarBoton();
    t = +e.target.value / 1000;
    pintar();
  });
  if ($('simR')) $('simR').addEventListener('input', e => {
    R = +e.target.value; encuadrar(); pintar();
  });
  if ($('simE')) $('simE').addEventListener('input', e => {
    empalme = +e.target.value; pintar();
  });
  if ($('simReset')) $('simReset').addEventListener('click', () => {
    jugando = false; t = 0; arranque = 0;
    if ($('simT')) $('simT').value = 0;
    actualizarBoton(); pintar();
  });
  const vistas = document.querySelectorAll('.sim-vista');
  for (let i = 0; i < vistas.length; i++) {
    (function (b) {
      b.addEventListener('click', () => cambiarVista(b.dataset.vista));
    })(vistas[i]);
  }

  const obs = new IntersectionObserver(es => {
    es.forEach(e => { if (e.isIntersecting && t === 0 && !jugando) alternar(); });
  }, { threshold: 0.4 });
  obs.observe(canvas);

  window.addEventListener('resize', ajustar);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajustar);
  requestAnimationFrame(ajustar);
  setTimeout(ajustar, 250);
})();
