/* PAVING · lógica del prototipo
   1. Aparición al desplazar
   2. Calculador AASHTO 1993 (bisección sobre el número estructural)
   3. Visor del modelo digital del terreno
   4. Formulario de demostración
*/

/* ---------------------------------------------------- 1. revelado */
const io = new IntersectionObserver((entradas) => {
  entradas.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  });
}, { threshold: .14, rootMargin: '0px 0px -60px 0px' });
document.querySelectorAll('.rv').forEach(el => io.observe(el));

/* ---------------------------------------------------- 2. calculador */
const $ = id => document.getElementById(id);

const A1 = 0.44, A2 = 0.14, A3 = 0.11;   // coeficientes estructurales
const ZR = -1.282, SO = 0.45, DPSI = 1.7, MR = 15000;  // 90 %, 103 MPa (suelo aceptable)

/* Ecuación AASHTO 1993: log10(W18) en función de SN */
function logW(SN) {
  return (
    ZR * SO +
    9.36 * Math.log10(SN + 1) -
    0.20 +
    Math.log10(DPSI / (4.2 - 1.5)) / (0.40 + 1094 / Math.pow(SN + 1, 5.19)) +
    2.32 * Math.log10(MR) -
    8.07
  );
}

/* SN requerido para un tránsito dado, por bisección */
function snRequerido(W18) {
  const objetivo = Math.log10(W18);
  let lo = 0.5, hi = 14;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (logW(mid) < objetivo) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

const r2 = n => Math.round(n * 2) / 2;          // redondeo a media pulgada

function repartir(SN) {
  // carpeta: cubre cerca de la mitad del SN, entre 2" y 10"
  let d1 = Math.min(10, Math.max(2, r2(SN * 0.45 / A1)));
  let resto = SN - A1 * d1;
  // base granular: máximo práctico de 12"
  let d2 = Math.min(12, Math.max(6, r2(resto * 0.60 / A2)));
  let resto2 = SN - A1 * d1 - A2 * d2;
  // sub-base: absorbe el resto, entre 6" y 14"
  let d3 = Math.min(14, Math.max(6, r2(resto2 / A3)));
  return [d1, d2, d3];
}

const fmt = n => n.toFixed(1).replace('.', ',');

function actualizar() {
  const v = +$('esal').value;
  const millones = 0.1 * Math.pow(500, v / 100);   // 0,1 M … 50 M
  const W18 = millones * 1e6;

  $('esal').style.setProperty('--p', v + '%');
  $('esalNum').textContent = millones < 10
    ? millones.toFixed(1).replace('.', ',')
    : Math.round(millones).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  const SN = snRequerido(W18);
  $('snNum').textContent = fmt(SN);

  const [d1, d2, d3] = repartir(SN);
  $('eHma').textContent = fmt(d1) + '"';
  $('eBase').textContent = fmt(d2) + '"';
  $('eSub').textContent = fmt(d3) + '"';

  // alturas visuales proporcionales, con mínimos legibles
  const escala = 10;                       // px por pulgada, igual para todas las capas
  $('cHma').style.height = Math.max(22, d1 * escala) + 'px';
  $('cBase').style.height = Math.max(22, d2 * escala) + 'px';
  $('cSub').style.height = Math.max(22, d3 * escala) + 'px';

  // lectura de contexto
  const nivel = millones < 1 ? 'Tránsito ligero: estructura delgada, típica de vía secundaria.'
    : millones < 5 ? 'Tránsito moderado: corredor urbano o ruta departamental.'
    : millones < 15 ? 'Tránsito pesado: corredor principal con mezcla de camiones.'
    : 'Tránsito muy pesado: requiere verificación con conteo real y análisis de ejes.';
  $('snTexto').textContent = nivel + ' Suelo de fundación de 103 MPa (15.000 psi), 90 % de confiabilidad.';
}

$('esal').addEventListener('input', actualizar);
actualizar();

/* ---------------------------------------------------- 3. visor */
const video = $('mdt'), play = $('play'), fill = $('fill'), track = $('track'), tiempo = $('tiempo');
const icoPlay = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
const icoPausa = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';

function pintarTiempo() {
  const t = video.currentTime || 0;
  const d = video.duration || 0;
  const mm = s => String(Math.floor(s / 60)).padStart(2, '0');
  const ss = s => String(Math.floor(s % 60)).padStart(2, '0');
  tiempo.textContent = `${mm(t)}:${ss(t)} / ${mm(d)}:${ss(d)}`;
  fill.style.width = d ? (t / d * 100) + '%' : '0%';
}

play.addEventListener('click', () => {
  if (video.paused) { video.play(); $('icoPlay').outerHTML = icoPausa.replace('<svg', '<svg id="icoPlay"'); }
  else { video.pause(); $('icoPlay').outerHTML = icoPlay.replace('<svg', '<svg id="icoPlay"'); }
});
video.addEventListener('timeupdate', pintarTiempo);
video.addEventListener('loadedmetadata', pintarTiempo);
video.addEventListener('play', () => { $('icoPlay').outerHTML = icoPausa.replace('<svg', '<svg id="icoPlay"'); });
video.addEventListener('pause', () => { $('icoPlay').outerHTML = icoPlay.replace('<svg', '<svg id="icoPlay"'); });

function buscar(e) {
  const r = track.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
  const p = Math.min(1, Math.max(0, x / r.width));
  if (video.duration) video.currentTime = p * video.duration;
  pintarTiempo();
}
let arrastrando = false;
track.addEventListener('pointerdown', e => { arrastrando = true; buscar(e); });
window.addEventListener('pointermove', e => { if (arrastrando) buscar(e); });
window.addEventListener('pointerup', () => { arrastrando = false; });

/* carga diferida: el video solo se descarga cuando se va a ver */
const ioV = new IntersectionObserver(es => {
  es.forEach(e => {
    if (e.isIntersecting) {
      video.preload = 'metadata';
      if (!video.src) video.src = 'assets/mdt.mp4';
      ioV.unobserve(video);
    }
  });
}, { rootMargin: '240px' });
ioV.observe(video);

/* reproducción automática silenciosa al entrar en pantalla */
const ioAuto = new IntersectionObserver(es => {
  es.forEach(e => {
    if (e.isIntersecting && e.intersectionRatio > .45) video.play().catch(() => {});
    else if (!video.paused) video.pause();
  });
}, { threshold: [0, .45, .8] });
ioAuto.observe(video);

/* ---------------------------------------------------- 4. formulario */
$('form').addEventListener('submit', e => {
  e.preventDefault();
  $('nota').textContent = 'Demostración: el formulario no envía datos. En la versión final ' +
    'llegará al correo de la empresa con confirmación al usuario.';
  $('nota').style.color = '#FBB03B';
});

/* ---------------------------------------------------- menú móvil */
document.querySelector('.burger').addEventListener('click', () => {
  const n = document.querySelector('.nav-links');
  const abierto = n.style.display === 'flex';
  n.style.display = abierto ? 'none' : 'flex';
  n.style.position = 'absolute'; n.style.top = '66px'; n.style.left = '0'; n.style.right = '0';
  n.style.flexDirection = 'column'; n.style.background = '#F4F6F7';
  n.style.padding = '18px 24px'; n.style.gap = '14px';
  n.style.borderBottom = '1px solid rgba(16,28,44,.12)';
});
