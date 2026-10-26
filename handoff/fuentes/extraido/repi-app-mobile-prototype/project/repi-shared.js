// Prototype-only shared store between the gym desktop and the member app (same origin).
// Metadata in localStorage, proof videos in IndexedDB. Only touches keys prefixed "repi_gym_" / "repi_member_".
(function () {
  const K = { posts: 'repi_gym_posts', ch: 'repi_gym_challenges', cat: 'repi_gym_catalog', subs: 'repi_gym_submissions', notif: 'repi_member_notifs' };
  ['requests','checkins','pains','sessions','access','invites','reviews','prizes','health','shifts','coachInvites','accounts','staffNotifs','checkinsGym','consents'].forEach(k => { K[k] = 'repi_x_' + k; });
  const SEED = {
    posts: [
      { id: 'n1', type: 'novedad', title: 'Nueva zona de peso libre', text: 'Desde el lunes sumamos 2 racks y mancuernas hasta 50 kg en planta alta.', date: '18 may', img: null },
      { id: 'n2', type: 'descuento', title: '20% off en proteína whey', text: 'Mostrando la app en recepción, hasta el 31 de mayo.', badge: '20% OFF', date: '15 may', img: null },
      { id: 'n3', type: 'novedad', title: 'Clase abierta de movilidad', text: 'Sábado 10:00 en el salón 2, con Sofía. Cupo libre.', date: '12 may', img: null },
    ],
    ch: [
      { id: 'ch1', title: 'Dominadas máximas', unit: 'reps', rule: 'Una serie, agarre prono, mentón sobre la barra, sin balanceo.', record: 16, holder: 'Lucas B.', prize: 'Shaker REPI + 1 batido', ends: '31 may', participants: 42 },
      { id: 'ch2', title: 'Plancha más larga', unit: 'seg', rule: 'Antebrazos y puntas de pie, cuerpo alineado, cronómetro visible.', record: 245, holder: 'Carla M.', prize: 'Remera Gym Norte', ends: '15 jun', participants: 67 },
      { id: 'ch3', title: 'Remo 500 m', unit: 'seg', rule: 'Remoergómetro, resistencia 5, pantalla visible al final.', record: 98, holder: 'Diego A.', prize: 'Toalla Gym Norte', ends: '30 jun', participants: 23, lowerIsBetter: true },
    ],
    cat: [
      { id: 'p1', cat: 'Suplementos', name: 'Proteína whey 1 kg', price: 42000, promo: '20% OFF con la app', img: null },
      { id: 'p2', cat: 'Bebidas', name: 'Bebida isotónica 500 ml', price: 2500, img: null },
      { id: 'p3', cat: 'Bebidas', name: 'Agua mineral 1,5 L', price: 1800, img: null },
      { id: 'p4', cat: 'Snacks', name: 'Barra proteica 60 g', price: 3200, img: null },
      { id: 'p5', cat: 'Alimentos', name: 'Batido post-entreno', price: 5500, img: null },
      { id: 'p6', cat: 'Indumentaria', name: 'Remera Gym Norte', price: 18000, img: null },
    ],
    subs: [
      { id: 's1', ch: 'ch2', member: 'Julián O.', value: 251, date: 'Hoy 08:12', status: 'pending', video: false },
    ],
    notif: [],
    requests: [], checkins: [], pains: [], sessions: [], access: [], invites: [], reviews: [], prizes: [], staffNotifs: [], checkinsGym: [], coachInvites: [], consents: [],
    health: { 'Valentina G.': { injuries: [{ id: 'i1', zone: 'Hombro derecho', detail: 'Tendinopatía del supraespinoso (2024)', since: 'mar 2024', status: 'En seguimiento' }], conditions: 'Ninguna', meds: 'Anticonceptivo oral', allergies: 'Ninguna', clearance: 'mar 2027', minor: false } },
    shifts: { t1: 'off', t2: 'off', t4: 'on' },
    accounts: { c1: { name: 'Agustín Pérez', status: 'active', plan: 'perUnit', rate: 700, count: 'peak', day: 5, billable: 18, peak: 19, notices: [] }, g1: { name: 'Gym Norte', status: 'active', plan: 'tiered', count: 'peak', day: 1, billable: 2032, peak: 2190, notices: [] } },
  };
  const listeners = new Set();
  const clone = v => JSON.parse(JSON.stringify(v));
  const S = {
    get(k) { try { const v = localStorage.getItem(K[k]); if (v) return JSON.parse(v); } catch (e) {} return SEED[k] === undefined ? [] : clone(SEED[k]); },
    push(k, item) { const arr = S.get(k); arr.unshift(item); S.set(k, arr); return item; },
    patch(k, id, p) { S.set(k, S.get(k).map(x => x.id === id ? { ...x, ...p } : x)); },
    now() { const d = new Date(); return 'Hoy ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); },
    today() { return new Date().toISOString().slice(0, 10); },
    set(k, v) { try { localStorage.setItem(K[k], JSON.stringify(v)); } catch (e) { console.warn('repi-shared: storage full', e); } listeners.forEach(f => f(k)); },
    all() { const o = {}; Object.keys(K).forEach(k => { o[k] = S.get(k); }); return o; },
    subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
    reset() { Object.values(K).forEach(k => { try { localStorage.removeItem(k); } catch (e) {} }); listeners.forEach(f => f('all')); },
    uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); },
    db() {
      if (S._db) return S._db;
      S._db = new Promise((res, rej) => { const r = indexedDB.open('repi_proofs', 1); r.onupgradeneeded = () => r.result.createObjectStore('videos'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      return S._db;
    },
    async putVideo(id, blob) { const db = await S.db(); return new Promise((res, rej) => { const tx = db.transaction('videos', 'readwrite'); tx.objectStore('videos').put(blob, id); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); },
    async getVideo(id) { const db = await S.db(); return new Promise((res, rej) => { const q = db.transaction('videos').objectStore('videos').get(id); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); }); },
    resizeImage(file, max = 900) {
      return new Promise((res, rej) => { const fr = new FileReader(); fr.onerror = rej; fr.onload = () => { const im = new Image(); im.onerror = rej; im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .8)); }; im.src = fr.result; }; fr.readAsDataURL(file); });
    },
  };
  window.addEventListener('storage', e => { if (!e.key || Object.values(K).includes(e.key)) listeners.forEach(f => f('remote')); });
  window.RepiShared = S;
})();
