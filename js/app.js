/* PAVING · lógica del prototipo
   1. Aparición al desplazar
   2. Visor del modelo digital del terreno
   3. Formulario de demostración
   4. Progreso de lectura y aparición escalonada
   El calculador AASHTO vive en js/paquete.js (modelo 3D).
*/

const $ = id => document.getElementById(id);

/* ---------------------------------------------------- 1. revelado */
const io = new IntersectionObserver((entradas) => {
  entradas.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  });
}, { threshold: .14, rootMargin: '0px 0px -60px 0px' });
document.querySelectorAll('.rv').forEach(el => io.observe(el));

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

/* ---------------------------------------------------- 5. relato con scroll */
(function () {
  const pasos = [...document.querySelectorAll('.paso')];
  if (!pasos.length) return;
  const imgs = [0, 1, 2].map(i => document.getElementById('sc-img-' + i));
  const tag = document.getElementById('sc-tag');
  const etiquetas = ['FASE 01 · RECONOCIMIENTO', 'FASE 02 · MODELO DIGITAL', 'FASE 03 · TRAZADO Y ESTRUCTURA'];

  function activar(i) {
    imgs.forEach((im, k) => im && im.classList.toggle('on', k === i));
    pasos.forEach((p, k) => p.classList.toggle('on', k === i));
    if (tag) tag.textContent = etiquetas[i];
  }

  const obs = new IntersectionObserver(entradas => {
    entradas.forEach(e => {
      if (e.isIntersecting) activar(+e.target.dataset.i);
    });
  }, { rootMargin: '-46% 0px -46% 0px', threshold: 0 });

  pasos.forEach(p => obs.observe(p));
  activar(0);
})();

/* ---------------------------------------------------- 7. comparador de condición */
(function () {
  const input = document.getElementById('comp');
  if (!input) return;
  const layer = document.getElementById('compLayer');
  const handle = document.getElementById('compHandle');
  const fichas = [...document.querySelectorAll('.comp-ficha')];

  function mover() {
    const v = +input.value;
    layer.style.clipPath = `inset(0 0 0 ${v}%)`;
    handle.style.left = v + '%';
    // divisor a la izquierda → se ve la condición B; a la derecha → la A
    const lado = v < 50 ? 'b' : 'a';
    fichas.forEach(f => f.classList.toggle('on', f.dataset.lado === lado));
  }
  input.addEventListener('input', mover);

  /* ---- arrastre directo: en el teléfono el pulgar del range es invisible y hay que
     acertarle; aquí se toma cualquier punto de la imagen ---- */
  const stage = document.querySelector('.comp-stage');
  let arrastrando = false;

  function fijar(clientX) {
    const r = stage.getBoundingClientRect();
    const v = Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100));
    input.value = v;
    mover();
  }

  stage.addEventListener('pointerdown', e => {
    arrastrando = true;
    if (stage.setPointerCapture) { try { stage.setPointerCapture(e.pointerId); } catch (_) {} }
    fijar(e.clientX);
    e.preventDefault();
  });
  stage.addEventListener('pointermove', e => { if (arrastrando) fijar(e.clientX); });
  stage.addEventListener('pointerup', () => { arrastrando = false; });
  stage.addEventListener('pointercancel', () => { arrastrando = false; });
  stage.addEventListener('pointerleave', () => { arrastrando = false; });
  mover();
})();

/* ---------------------------------------------------- 8. progreso de lectura */
(function () {
  const bar = document.getElementById('prog');
  if (!bar) return;
  let raf = 0;
  function pintar() {
    raf = 0;
    const alto = document.documentElement.scrollHeight - window.innerHeight;
    const p = alto > 0 ? window.scrollY / alto : 0;
    bar.style.width = (Math.min(1, Math.max(0, p)) * 100).toFixed(2) + '%';
  }
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(pintar); }, { passive: true });
  window.addEventListener('resize', pintar);
  pintar();
})();

/* ---------------------------------------------------- 9. parallax de portada */
(function () {
  const hero = document.getElementById('inicio');
  if (!hero) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const img = hero.querySelector('.hero-media img');
  const cont = hero.querySelector('.hero-in');
  if (!img) return;
  let raf = 0;
  function pintar() {
    raf = 0;
    const y = window.scrollY;
    const alto = hero.offsetHeight || 1;
    if (y > alto * 1.2) return;
    const f = Math.min(1, y / alto);
    img.style.transform = 'translate3d(0,' + (y * 0.26).toFixed(1) + 'px,0) scale(1.06)';
    if (cont) {
      cont.style.transform = 'translate3d(0,' + (y * 0.10).toFixed(1) + 'px,0)';
      cont.style.opacity = (1 - f * 0.85).toFixed(3);
    }
  }
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(pintar); }, { passive: true });
  pintar();
})();

/* ---------------------------------------------------- 10. aparición escalonada */
(function () {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const grupos = document.querySelectorAll('.pilares, .proys, .metricas, .tablero, .pedido, .cap-lista, .giro-datos');
  const io = new IntersectionObserver(entradas => {
    entradas.forEach(e => {
      if (!e.isIntersecting) return;
      const hijos = [...e.target.children];
      hijos.forEach((c, i) => {
        c.animate(
          [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }],
          { duration: 620, delay: i * 80, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both' }
        );
      });
      io.unobserve(e.target);
    });
  }, { threshold: 0.12 });
  grupos.forEach(g => io.observe(g));
})();
