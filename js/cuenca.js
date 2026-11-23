/* PAVING · cuenca de deflexion medida con deflectometro de impacto (FWD)
   Modelo esquematico de dos capas: la curva decae con dos longitudes caracteristicas,
   una superficial y otra de base. No es un ensayo: es la forma de la cuenca.
*/
(function () {
  const cv = document.getElementById('fwdCanvas');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const slider = document.getElementById('fwdR');
  const outD0 = document.getElementById('fwdD0');
  const outExt = document.getElementById('fwdExt');
  const outCap = document.getElementById('fwdCap');

  // separacion real de los geofonos de un FWD de 9 sensores, en mm
  const SENS = [0, 200, 300, 450, 600, 900, 1200, 1500, 1800, 2100];
  const RMAX = 2100;

  /* soporte: 0 = base debil, 1 = base rigida */
  function perfil(soporte) {
    const D0 = 660 - 500 * soporte;          // deflexion maxima, micrometros
    const L1 = 175 + 55 * soporte;           // largo caracteristico superficial
    const L2 = 1150 - 560 * soporte;         // largo caracteristico de la base
    const a = 0.52 + 0.14 * soporte;
    const f = r => D0 * (a * Math.exp(-r / L1) + (1 - a) * Math.exp(-r / L2));
    return { D0, f };
  }

  function extension(f, D0) {
    // radio donde la deflexion cae al 50 %
    let lo = 0, hi = RMAX;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (f(m) > D0 / 2) lo = m; else hi = m;
    }
    return lo;
  }

  let soporte = 78 / 100;

  function sincronizar() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pintar(w, h);
  }

  function pintar(W, H) {
    ctx.clearRect(0, 0, W, H);
    const { D0, f } = perfil(soporte);
    const mL = 52, mR = 24, mT = 30, mB = 46;
    const areaW = W - mL - mR, areaH = H - mT - mB;
    // el techo se ajusta al orden de magnitud: la cuenca ocupa cerca del 70 % del alto
    const Dmax = Math.max(400, Math.ceil((D0 * 1.35) / 100) * 100);
    const paso = Dmax <= 500 ? 100 : 200;
    const x = r => mL + (r / RMAX) * areaW;
    const y = d => mT + areaH - (d / Dmax) * areaH;

    // ---- rejilla horizontal
    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let d = 0; d <= Dmax; d += paso) {
      const yy = y(d);
      ctx.strokeStyle = d === 0 ? 'rgba(16,28,44,.30)' : 'rgba(16,28,44,.09)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mL, yy); ctx.lineTo(W - mR, yy); ctx.stroke();
      ctx.fillStyle = '#6B767F';
      ctx.fillText(d === 0 ? '0' : d, mL - 10, yy);
    }

    // ---- rejilla vertical
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let r = 0; r <= RMAX; r += 300) {
      const xx = x(r);
      ctx.strokeStyle = 'rgba(16,28,44,.06)';
      ctx.beginPath(); ctx.moveTo(xx, mT); ctx.lineTo(xx, mT + areaH); ctx.stroke();
      ctx.fillStyle = '#6B767F';
      ctx.fillText(r === 0 ? '0' : r, xx, mT + areaH + 8);
    }

    // ---- rotulos de ejes
    ctx.fillStyle = '#8A5F0C';
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('DEFLEXIÓN · µm', mL, 9);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('DISTANCIA AL CENTRO DE CARGA · mm', W - mR, H - 6);

    // ---- area bajo la curva
    const grad = ctx.createLinearGradient(0, mT, 0, mT + areaH);
    grad.addColorStop(0, 'rgba(251,176,59,.34)');
    grad.addColorStop(1, 'rgba(251,176,59,.03)');
    ctx.beginPath();
    ctx.moveTo(x(0), y(0));
    for (let r = 0; r <= RMAX; r += 8) ctx.lineTo(x(r), y(f(r)));
    ctx.lineTo(x(RMAX), y(0));
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // ---- curva
    ctx.beginPath();
    for (let r = 0; r <= RMAX; r += 4) {
      const px = x(r), py = y(f(r));
      if (r === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = '#B87A12';
    ctx.lineWidth = 2.6;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // ---- sensores
    SENS.forEach((r, i) => {
      const d = f(r);
      const px = x(r), py = y(d);
      ctx.beginPath();
      ctx.arc(px, py, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.strokeStyle = '#B87A12';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // si la etiqueta caeria bajo el eje, se sube: los puntos lejanos ya estan al ras
      const cabeAbajo = (py + 15) < (mT + areaH - 4);
      const arriba = (i % 2 === 0) || !cabeAbajo;
      const etq = 'D' + i;
      ctx.font = (i === 0 ? '700 ' : '600 ') + '9.5px "JetBrains Mono", monospace';
      ctx.textAlign = i === 0 ? 'left' : (i === SENS.length - 1 ? 'right' : 'center');
      ctx.textBaseline = arriba ? 'bottom' : 'top';
      const lx = px + (i === 0 ? -3 : 0), ly = py + (arriba ? -9 : 15);
      // halo blanco para que la etiqueta se lea sobre la curva y el relleno
      ctx.lineWidth = 3.4;
      ctx.strokeStyle = 'rgba(255,255,255,.92)';
      ctx.lineJoin = 'round';
      ctx.strokeText(etq, lx, ly);
      ctx.fillStyle = i === 0 ? '#7A520A' : '#3C4852';
      ctx.fillText(etq, lx, ly);
    });

    // ---- lectura de la deflexion maxima
    const py0 = y(D0);
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(mL, py0); ctx.lineTo(x(0), py0);
    ctx.strokeStyle = 'rgba(184,122,18,.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#1D262D';
    ctx.font = '700 16px "Archivo", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(Math.round(D0) + ' µm', x(0) + 46, py0 - 7);

    // ---- textos de lectura
    if (outD0) outD0.textContent = Math.round(D0) + ' µm';
    if (outExt) outExt.textContent = Math.round(extension(f, D0)) + ' mm';
    if (outCap) outCap.textContent = soporte > .72 ? 'alta' : (soporte > .42 ? 'media' : 'baja');
  }

  slider.addEventListener('input', () => {
    soporte = slider.value / 100;
    sincronizar();
  });

  if ('ResizeObserver' in window) new ResizeObserver(sincronizar).observe(cv);
  window.addEventListener('resize', sincronizar);
  setTimeout(sincronizar, 60);
  sincronizar();
})();
