'use strict';

const $ = (id) => document.getElementById(id);
const FUNDIDO_FINAL = 30000; // ms de fundido antes de terminar la sesión

const prefs = Object.assign(
  { volAmbiente: 70, volMusica: 60, minutos: 60, campana: true },
  JSON.parse(localStorage.getItem('calma') || '{}')
);
const guardar = () => localStorage.setItem('calma', JSON.stringify(prefs));

const estado = {
  ambiente: null,        // id del ambiente elegido
  ambienteSuena: false,
  ambienteCargando: false,
  musica: null,          // id de la categoría de música elegida
  pista: 0,
  musicaSuena: false,
  finEn: null,           // marca de tiempo en la que acaba la sesión
  restante: null,        // ms que quedaban al pausar
  terminada: false,
  aviso: '',
};

const sonando = () => estado.ambienteSuena || estado.musicaSuena;
const curva = (v) => (v / 100) ** 2; // el oído percibe el volumen de forma no lineal

// ───────────────────────── Motor de ambientes ─────────────────────────

// El sonido sale siempre por un <audio> normal: es lo que Android reconoce
// como música (control en la pantalla de bloqueo, sigue con la pantalla apagada).
// El AudioContext solo se usa para preparar los bucles, nunca para sonar.
let ctx;
let fuente = null;      // { el, nivel } del ambiente que suena
let fundidoFinal = 1;   // baja de 1 a 0 al acabar la sesión
let turno = 0;          // descarta cargas que ya no interesan
const pistas = new Map(); // id → URL del bucle ya preparado
let urlCampana = null;

function motor() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  ctx.suspend(); // decodificar funciona igual y no gasta batería
}

function aWav(buf) {
  const canales = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const bytes = n * canales * 2;
  const v = new DataView(new ArrayBuffer(44 + bytes));
  const texto = (pos, t) => [...t].forEach((ch, i) => v.setUint8(pos + i, ch.charCodeAt(0)));
  texto(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); texto(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, canales, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * canales * 2, true);
  v.setUint16(32, canales * 2, true); v.setUint16(34, 16, true);
  texto(36, 'data'); v.setUint32(40, bytes, true);
  const muestras = new Int16Array(v.buffer, 44, n * canales);
  for (let c = 0; c < canales; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) muestras[i * canales + c] = Math.max(-1, Math.min(1, d[i])) * 32767;
  }
  return URL.createObjectURL(new Blob([v], { type: 'audio/wav' }));
}

function ponerVolumen(f) {
  f.el.volume = Math.max(0, Math.min(1, curva(prefs.volAmbiente) * f.nivel * (f.factor ?? fundidoFinal)));
}

function rampa(f, hasta, seg, alAcabar) {
  clearInterval(f.reloj);
  const desde = f.nivel, t0 = performance.now();
  const paso = () => {
    const k = seg > 0 ? Math.min(1, (performance.now() - t0) / (seg * 1000)) : 1;
    f.nivel = desde + (hasta - desde) * k;
    ponerVolumen(f);
    if (k >= 1) { clearInterval(f.reloj); if (alAcabar) alAcabar(); }
  };
  f.reloj = setInterval(paso, 40);
  paso();
}

// Funde el final de la grabación con su principio para que el bucle no se note.
function hacerBucle(buf) {
  const sr = buf.sampleRate;
  const recorte = Math.floor(0.2 * sr);
  const cruce = Math.floor(3 * sr);
  const largo = buf.length - 2 * recorte;
  const n = largo - cruce;
  const out = ctx.createBuffer(buf.numberOfChannels, n, sr);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const s = buf.getChannelData(c).subarray(recorte, recorte + largo);
    const o = out.getChannelData(c);
    o.set(s.subarray(0, n));
    for (let i = 0; i < cruce; i++) {
      const t = (i / cruce) * Math.PI / 2;
      o[i] = s[i] * Math.sin(t) + s[n + i] * Math.cos(t);
    }
  }
  return out;
}

function normalizar(buf, rmsObjetivo) {
  let suma = 0, total = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i += 7) { suma += d[i] * d[i]; total++; }
  }
  const k = rmsObjetivo / (Math.sqrt(suma / total) || 1);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = Math.max(-1, Math.min(1, d[i] * k));
  }
  return buf;
}

function ruidoMarron(seg) {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(2, seg * sr, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let ultimo = 0;
    for (let i = 0; i < d.length; i++) {
      ultimo = (ultimo + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = ultimo;
    }
  }
  return normalizar(buf, 0.09);
}

async function viento(seg) {
  const sr = ctx.sampleRate;
  const off = new OfflineAudioContext(2, seg * sr, sr);
  const blanco = off.createBuffer(2, seg * sr, sr);
  for (let c = 0; c < 2; c++) {
    const d = blanco.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = off.createBufferSource();
  src.buffer = blanco;
  const separador = off.createChannelSplitter(2);
  const mezclador = off.createChannelMerger(2);
  src.connect(separador);
  const onda = (base, partes) => {
    const fases = partes.map(() => Math.random() * 6.283);
    const puntos = new Float32Array(600);
    for (let i = 0; i < puntos.length; i++) {
      const t = (i / puntos.length) * seg;
      puntos[i] = base + partes.reduce((a, [amp, periodo], j) => a + amp * Math.sin(6.283 * t / periodo + fases[j]), 0);
    }
    return puntos;
  };
  for (let c = 0; c < 2; c++) {
    const paso = off.createBiquadFilter();
    paso.type = 'bandpass';
    paso.Q.value = 0.8;
    paso.frequency.setValueCurveAtTime(onda(520, [[230, 11], [110, 4.3]]), 0, seg);
    const suave = off.createBiquadFilter();
    suave.type = 'lowpass';
    suave.frequency.value = 1400;
    const g = off.createGain();
    g.gain.setValueCurveAtTime(onda(0.55, [[0.28, 13], [0.14, 5.1]]), 0, seg);
    separador.connect(paso, c);
    paso.connect(suave);
    suave.connect(g);
    g.connect(mezclador, 0, c);
  }
  mezclador.connect(off.destination);
  src.start();
  return normalizar(await off.startRendering(), 0.075);
}

async function cargarPista(a) {
  if (pistas.has(a.id)) return pistas.get(a.id);
  let buf;
  if (a.generado === 'marron') buf = ruidoMarron(24);
  else if (a.generado === 'viento') buf = await viento(40);
  else {
    const r = await fetch(a.archivo);
    if (!r.ok) throw new Error('No se pudo cargar ' + a.archivo);
    const datos = await r.arrayBuffer();
    buf = await new Promise((ok, mal) => ctx.decodeAudioData(datos, ok, mal));
  }
  const url = aWav(hacerBucle(buf));
  pistas.set(a.id, url);
  if (pistas.size > 3) { // memoria del móvil
    const [viejo, urlVieja] = pistas.entries().next().value;
    pistas.delete(viejo);
    URL.revokeObjectURL(urlVieja);
  }
  return url;
}

async function sonarAmbiente(id) {
  motor();
  const mio = ++turno;
  estado.ambiente = id;
  estado.ambienteCargando = true;
  estado.aviso = '';
  sincronizar();
  const f = { el: null, nivel: 0, id };
  try {
    f.el = new Audio(await cargarPista(AMBIENTES.find((a) => a.id === id)));
    f.el.loop = true;
    f.el.volume = 0;
    // El propio <audio> manda: si el móvil lo pausa o lo reanuda (pantalla de
    // bloqueo, auriculares, una llamada), la app lo refleja.
    f.el.addEventListener('pause', () => {
      if (fuente !== f || !estado.ambienteSuena) return;
      estado.ambienteSuena = false;
      sincronizar();
    });
    f.el.addEventListener('play', () => {
      if (fuente !== f || estado.ambienteSuena) return;
      estado.ambienteSuena = true;
      rampa(f, 1, 1);
      sincronizar();
    });
    if (mio !== turno) return;
    await f.el.play();
  } catch (e) {
    console.error(e);
    if (mio !== turno) return;
    estado.ambienteCargando = false;
    estado.aviso = 'No se pudo reproducir ese sonido';
    sincronizar();
    return;
  }
  if (mio !== turno) { f.el.pause(); return; }
  callarAmbiente(1.5);
  fuente = f;
  rampa(f, 1, 2);
  estado.ambienteCargando = false;
  estado.ambienteSuena = true;
  sincronizar();
}

function callarAmbiente(seg) {
  if (!fuente) return;
  const f = fuente;
  fuente = null;
  f.factor = fundidoFinal; // conserva el fundido de fin de sesión mientras se apaga
  rampa(f, 0, seg, () => f.el.pause());
}

// Pausa sin soltar el <audio>: reanudar el mismo elemento es lo único que el
// móvil permite hacer desde la pantalla de bloqueo.
function pausarAmbiente(seg) {
  turno++;
  estado.ambienteSuena = false;
  estado.ambienteCargando = false;
  if (!fuente) return;
  const f = fuente;
  rampa(f, 0, seg, () => f.el.pause());
}

function pararAmbiente() {
  turno++;
  callarAmbiente(0.6);
  estado.ambienteSuena = false;
  estado.ambienteCargando = false;
  estado.ambiente = null;
}

async function campana() {
  motor();
  if (!urlCampana) {
    const sr = 44100;
    const off = new OfflineAudioContext(1, sr * 9, sr);
    for (const [razon, amp, dura] of [[1, 0.2, 8], [2.76, 0.08, 5], [5.4, 0.035, 3]]) {
      const o = off.createOscillator();
      o.frequency.value = 396 * razon;
      const g = off.createGain();
      g.gain.setValueAtTime(0.0001, 0.3);
      g.gain.linearRampToValueAtTime(amp, 0.33);
      g.gain.exponentialRampToValueAtTime(0.0001, 0.3 + dura);
      o.connect(g);
      g.connect(off.destination);
      o.start(0.3);
    }
    urlCampana = aWav(await off.startRendering());
  }
  new Audio(urlCampana).play().catch(console.error);
}

// ───────────────────────── Música (YouTube) ─────────────────────────

let yt = null, ytListo = false, ytCarga = null, ytVideo = null, ytErrores = 0;

function cargarYT() {
  return (ytCarga ||= new Promise((ok, mal) => {
    window.onYouTubeIframeAPIReady = ok;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { ytCarga = null; s.remove(); mal(new Error('YouTube no disponible')); };
    document.head.append(s);
  }));
}

function videoActual() {
  const cat = MUSICA.find((m) => m.id === estado.musica);
  return cat ? cat.videos[estado.pista % cat.videos.length] : null;
}

async function sonarMusica(id) {
  motor();
  if (id !== estado.musica) { estado.musica = id; estado.pista = 0; ytErrores = 0; }
  estado.aviso = '';
  $('reproductor').hidden = false;
  sincronizar();
  try {
    await cargarYT();
  } catch {
    quitarMusica();
    estado.aviso = 'No se pudo conectar con YouTube';
    sincronizar();
    return;
  }
  const video = videoActual();
  if (!video) return;
  if (!yt) {
    ytVideo = video;
    yt = new YT.Player('yt', {
      host: 'https://www.youtube-nocookie.com',
      videoId: video,
      playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
      events: {
        onReady() {
          ytListo = true;
          yt.setVolume(prefs.volMusica);
          const ahora = videoActual();
          if (!ahora) return;
          if (ahora !== ytVideo) { ytVideo = ahora; yt.loadVideoById(ahora); } else yt.playVideo();
        },
        onStateChange(e) {
          if (e.data === 1) { estado.musicaSuena = true; ytErrores = 0; }
          else if (e.data === 2) estado.musicaSuena = false;
          else if (e.data === 0) otraPista();
          sincronizar();
        },
        onError() {
          const cat = MUSICA.find((m) => m.id === estado.musica);
          if (cat && ++ytErrores < cat.videos.length) return otraPista();
          quitarMusica();
          estado.aviso = 'Esos vídeos ya no están disponibles';
          sincronizar();
        },
      },
    });
  } else if (ytListo) {
    ytVideo = video;
    yt.setVolume(prefs.volMusica);
    yt.loadVideoById(video);
  }
}

function otraPista() {
  if (!estado.musica) return;
  estado.pista++;
  sonarMusica(estado.musica);
}

function quitarMusica() {
  estado.musica = null;
  estado.musicaSuena = false;
  if (ytListo) yt.stopVideo();
  $('reproductor').hidden = true;
}

// ───────────────────────── Sesión y temporizador ─────────────────────────

let enFundido = false;

function restaurarFundido() {
  if (!enFundido) return;
  enFundido = false;
  fundidoFinal = 1;
  if (ytListo) yt.setVolume(prefs.volMusica);
}

function pausar() {
  pausarAmbiente(0.3);
  if (ytListo && estado.musica) yt.pauseVideo();
  estado.musicaSuena = false;
  sincronizar();
}

function reanudar() {
  motor();
  if (!estado.ambiente && !estado.musica) {
    estado.aviso = 'Toca primero un ambiente o una música';
    sincronizar();
    return;
  }
  estado.terminada = false;
  if (estado.ambiente) {
    if (fuente && fuente.id === estado.ambiente) {
      if (fuente.el.paused) fuente.el.play().catch(() => sonarAmbiente(estado.ambiente));
      else { // aún se estaba apagando: se vuelve a subir
        estado.ambienteSuena = true;
        rampa(fuente, 1, 1);
        sincronizar();
      }
    } else sonarAmbiente(estado.ambiente);
  }
  if (estado.musica) { if (ytListo) yt.playVideo(); else sonarMusica(estado.musica); }
}

function terminarSesion() {
  if (prefs.campana) campana(); // antes de callar, para que el móvil no duerma la app
  pausarAmbiente(0);
  if (ytListo && estado.musica) yt.pauseVideo();
  estado.musicaSuena = false;
  estado.finEn = null;
  estado.restante = null;
  estado.terminada = true;
  restaurarFundido();
  sincronizar();
}

function elegirDuracion(min) {
  prefs.minutos = min;
  guardar();
  estado.restante = null;
  estado.finEn = sonando() && min > 0 ? Date.now() + min * 60000 : null;
  restaurarFundido();
  sincronizar();
}

function latido() {
  if (estado.finEn) {
    const queda = estado.finEn - Date.now();
    if (queda <= 0) return terminarSesion();
    if (queda < FUNDIDO_FINAL) {
      enFundido = true;
      const f = queda / FUNDIDO_FINAL;
      fundidoFinal = f * f;
      if (fuente) ponerVolumen(fuente);
      if (ytListo) yt.setVolume(prefs.volMusica * f);
    }
  }
  pintarCuenta();
}

// Punto único donde se ajusta todo lo que depende del estado.
function sincronizar() {
  const suena = sonando();
  if (suena) {
    estado.terminada = false;
    if (!estado.finEn && prefs.minutos > 0) {
      estado.finEn = Date.now() + (estado.restante ?? prefs.minutos * 60000);
      estado.restante = null;
    }
  } else if (estado.finEn) {
    estado.restante = estado.finEn - Date.now();
    estado.finEn = null;
    restaurarFundido();
  }
  if (!estado.ambiente && !estado.musica) estado.restante = null;
  pantallaDespierta(estado.musicaSuena);
  pintar();
}

let cerrojo = null;
async function pantallaDespierta(si) {
  if (!('wakeLock' in navigator)) return;
  try {
    if (si && !cerrojo && document.visibilityState === 'visible') {
      cerrojo = await navigator.wakeLock.request('screen');
      cerrojo.addEventListener('release', () => { cerrojo = null; });
    } else if (!si && cerrojo) {
      await cerrojo.release();
    }
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') pantallaDespierta(estado.musicaSuena);
});

// ───────────────────────── Interfaz ─────────────────────────

const icono = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

function crearTeclas(contenedor, lista, alTocar) {
  for (const item of lista) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tecla';
    b.dataset.id = item.id;
    b.innerHTML = icono(item.icono) + `<span>${item.nombre}</span>`;
    b.addEventListener('click', () => alTocar(item.id));
    contenedor.append(b);
  }
}

function pintar() {
  for (const b of $('ambientes').children) {
    const mio = b.dataset.id === estado.ambiente;
    b.setAttribute('aria-pressed', String(mio && estado.ambienteSuena));
    b.classList.toggle('cargando', mio && estado.ambienteCargando);
  }
  for (const b of $('musicas').children) {
    const mio = b.dataset.id === estado.musica;
    b.setAttribute('aria-pressed', String(mio && estado.musicaSuena));
    b.classList.toggle('cargando', mio && !estado.musicaSuena);
    b.disabled = !navigator.onLine;
  }
  $('estado-red').hidden = navigator.onLine;

  const suena = sonando();
  $('icono-principal').setAttribute('d', suena ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5v14l11-7z');
  $('principal').setAttribute('aria-label', suena ? 'Pausar' : 'Reproducir');

  const nombres = [
    AMBIENTES.find((a) => a.id === estado.ambiente)?.nombre,
    MUSICA.find((m) => m.id === estado.musica)?.nombre,
  ].filter(Boolean);
  $('ahora-titulo').textContent = estado.aviso || nombres.join(' + ') || 'Elige un ambiente o una música';
  $('ahora-detalle').textContent = estado.aviso ? ''
    : estado.terminada ? 'Sesión terminada'
    : suena ? 'Sonando'
    : estado.ambienteCargando ? 'Cargando…'
    : estado.musica ? 'Toca ▶ en el vídeo si no empieza sola'
    : nombres.length ? 'En pausa' : '';

  for (const b of $('duraciones').children) {
    b.setAttribute('aria-checked', String(Number(b.dataset.min) === prefs.minutos));
  }
  pintarCuenta();

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: nombres.join(' + ') || 'Calma',
      artist: 'Calma',
      artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
    navigator.mediaSession.playbackState = suena ? 'playing' : 'paused';
  }
}

function pintarCuenta() {
  const ms = estado.finEn ? estado.finEn - Date.now() : estado.restante ?? prefs.minutos * 60000;
  const el = $('cuenta');
  if (!prefs.minutos) { el.textContent = ''; return; }
  const seg = Math.max(0, Math.ceil(ms / 1000));
  el.textContent = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`;
  el.classList.toggle('final', !!estado.finEn && ms < FUNDIDO_FINAL);
}

function iniciar() {
  crearTeclas($('ambientes'), AMBIENTES, (id) => {
    if (id === estado.ambiente && (estado.ambienteSuena || estado.ambienteCargando)) {
      pararAmbiente();
      sincronizar();
    } else sonarAmbiente(id);
  });
  crearTeclas($('musicas'), MUSICA, (id) => {
    if (id === estado.musica) { quitarMusica(); sincronizar(); } else sonarMusica(id);
  });

  for (const min of DURACIONES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.min = min;
    b.innerHTML = min ? `${min}<small>min</small>` : '∞<small>libre</small>';
    b.setAttribute('aria-label', min ? `${min} minutos` : 'Sin límite');
    b.addEventListener('click', () => elegirDuracion(min));
    $('duraciones').append(b);
  }

  const deslizador = (id, clave, aplicar) => {
    const el = $(id);
    const poner = () => el.style.setProperty('--v', el.value + '%');
    el.value = prefs[clave];
    poner();
    el.addEventListener('input', () => {
      prefs[clave] = Number(el.value);
      poner();
      guardar();
      aplicar();
    });
  };
  deslizador('vol-ambiente', 'volAmbiente', () => {
    if (fuente) ponerVolumen(fuente);
  });
  deslizador('vol-musica', 'volMusica', () => {
    if (ytListo && !enFundido) yt.setVolume(prefs.volMusica);
  });

  $('campana').checked = prefs.campana;
  $('campana').addEventListener('change', (e) => { prefs.campana = e.target.checked; guardar(); });

  $('principal').addEventListener('click', () => (sonando() ? pausar() : reanudar()));
  $('otra').addEventListener('click', otraPista);
  $('quitar').addEventListener('click', () => { quitarMusica(); sincronizar(); });

  addEventListener('online', pintar);
  addEventListener('offline', pintar);

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', reanudar);
    navigator.mediaSession.setActionHandler('pause', pausar);
  }

  setInterval(latido, 500);
  pintar();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.error);
}

iniciar();
