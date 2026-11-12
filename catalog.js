// ─────────────────────────────────────────────────────────────
// CATÁLOGO — este es el único archivo que hay que tocar para
// cambiar sonidos o vídeos.
//
// Para cambiar un vídeo de YouTube: copia el código que aparece
// en su enlace después de "v=" (p. ej. youtube.com/watch?v=3NycM9lYdRI
// → "3NycM9lYdRI") y pégalo en la lista "videos" de la categoría.
// Después sube el número de VERSION en sw.js para que los
// dispositivos que ya tienen la app instalada reciban el cambio.
// ─────────────────────────────────────────────────────────────

const AMBIENTES = [
  { id: 'lluvia', nombre: 'Lluvia', archivo: 'audio/lluvia.mp3',
    icono: 'M7 15a4 4 0 1 1 .9-7.900A5 5 0 0 1 17.500 9 3 3 0 0 1 17 15ZM8 18v2.500M12 18v2.500M16 18v2.500' },
  { id: 'bosque', nombre: 'Bosque', archivo: 'audio/bosque.mp3',
    icono: 'M12 3l5 7h-3l4 6H6l4-6H7zM12 16v5' },
  { id: 'mar', nombre: 'Mar', archivo: 'audio/mar.mp3',
    icono: 'M3 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0M3 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0' },
  { id: 'rio', nombre: 'Río', archivo: 'audio/rio.mp3',
    icono: 'M7 3c0 4 4 5 4 9s-4 5-4 9M14 3c0 4 4 5 4 9s-4 5-4 9' },
  { id: 'viento', nombre: 'Viento', generado: 'viento',
    icono: 'M3 9h10a3 3 0 1 0-3-3M3 14h15a3 3 0 1 1-3 3M3 19h6' },
  { id: 'ruido', nombre: 'Ruido suave', generado: 'marron',
    icono: 'M4 11v2M8 8v8M12 5v14M16 8v8M20 11v2' },
];

const MUSICA = [
  { id: 'piano', nombre: 'Piano',
    icono: 'M4 5h16v14H4zM9.300 5v8M14.700 5v8M9.300 13v6M14.700 13v6',
    videos: ['3NycM9lYdRI', 'oYYwwnSqxGA', 'Ne5J4bxWypI'] },
  { id: 'spa', nombre: 'Spa',
    icono: 'M12 20c-4 0-7-3-8-6 3 0 5 1 8 6zM12 20c4 0 7-3 8-6-3 0-5 1-8 6zM12 20c-2-3-3-7 0-12 3 5 2 9 0 12z',
    videos: ['u7nPyizNXc8', 'caFQIoV9SUU', 'KXnPsVp-trM'] },
  { id: 'cuencos', nombre: 'Cuencos',
    icono: 'M4 11h16a8 8 0 0 1-16 0zM8 20.500h8M15 3.500l4 5',
    videos: ['2UfTPVmDtKw', '5Q8ULIPU2R0', 'u7Cyf3730gQ'] },
  { id: 'flauta', nombre: 'Flauta',
    icono: 'M4 20L20 4M8.500 15.500h.01M11.500 12.500h.01M14.500 9.500h.01',
    videos: ['8V8sI3N3bDE', 'RQhODxdBB60', 'u4aYW10nxYU'] },
  { id: 'guitarra', nombre: 'Guitarra',
    icono: 'M4 15a5 5 0 1 0 10 0a5 5 0 1 0-10 0M12.500 11.500L20 4M18 3l3 3M9 15h.01',
    videos: ['37ldJK1kWiA', 'u38oMcaBkUA', '8WVXk0Gz66E'] },
  { id: 'zen', nombre: 'Zen',
    icono: 'M7 20h10a2.500 2.500 0 0 0 0-5H7a2.500 2.500 0 0 0 0 5zM9 15h6a2 2 0 0 0 0-4H9a2 2 0 0 0 0 4zM10.500 11h3a1.750 1.750 0 0 0 0-3.500h-3a1.750 1.750 0 0 0 0 3.500z',
    videos: ['263Vb6xiifo', '22i6SofLVRY', 'l_RteEP_pOI'] },
];

// Duraciones de sesión que se ofrecen, en minutos (0 = sin límite).
const DURACIONES = [0, 30, 45, 60, 90, 120];
