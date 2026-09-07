(()=>{
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try{
      const raw = typeof input === 'string' ? input : (input && input.url) || '';
      if(raw.startsWith('/data.json') || raw.startsWith('data.json') || raw.startsWith('./data.json')){
        input = '/api/campaign-data';
      }
    }catch(e){}
    return originalFetch(input, init);
  };
})();
