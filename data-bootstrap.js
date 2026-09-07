(()=>{
  // GitHub Pages sirve esta app bajo /AgroPiloto/. En ese entorno no existe el backend Flask.
  // Por eso los datos de campaña deben leerse directamente desde el archivo estático del repo.
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      const raw = typeof input === 'string' ? input : (input && input.url) || '';
      if(raw.includes('data.json')){
        input = './data.json?v=' + Date.now();
      }
      if(raw.startsWith('/api/state')){
        // GitHub Pages no tiene backend persistente; dejamos que falle y la app usa estado local.
        return Promise.reject(new Error('Sin backend en GitHub Pages'));
      }
    } catch(e) {}
    return originalFetch(input, init);
  };
})();