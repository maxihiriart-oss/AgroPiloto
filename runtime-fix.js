// Robustez de carga para Agro Copiloto.
// Si el usuario entra a Lotes antes de que termine de cargar data.json, vuelve a buscar los datos y redibuja.
(function(){
  const originalLots = window.lots;
  if (typeof originalLots === 'function') {
    window.lots = async function(){
      if (!DATA || !Array.isArray(DATA.lots) || DATA.lots.length === 0) {
        const box = document.querySelector('#lots');
        if (box) box.innerHTML = '<div class="card"><h2>Lotes</h2><div class="muted">Cargando lotes de la campaña…</div></div>';
        try {
          const r = await fetch('/data.json?v=' + Date.now(), {cache:'no-store'});
          if (!r.ok) throw new Error('HTTP '+r.status);
          const fresh = await r.json();
          if (fresh && Array.isArray(fresh.lots)) DATA = fresh;
        } catch(e) {
          if (box) box.innerHTML = '<div class="card"><h2>Lotes</h2><div class="muted">No pude cargar los lotes. Recargá la página.</div></div>';
          return;
        }
      }
      return originalLots();
    };
  }
  // Si la vista de lotes quedó abierta durante la carga inicial, la repinta automáticamente.
  setTimeout(()=>{
    const active = document.querySelector('#lots.view.active');
    if (active && DATA && Array.isArray(DATA.lots) && DATA.lots.length) window.lots();
  },1200);
})();