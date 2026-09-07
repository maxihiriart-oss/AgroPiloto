// Ajustes agronómicos confirmados por Maxi.
// La pasada de Único + herbicidas corresponde al manejo en Z30 de gramíneas y ya fue realizada.
SEEDS.forEach(o=>{
  if(['ch-sm-ceb-1608','ch-sm-tri-1608','ch-is-ceb-2408','ch-is-tri1-2408','ch-is-tri2-2408'].includes(o.id)){
    o.label='Z30 · 1.er fungicida + herbicidas';
  }
});

function pending(){
  const ceb=DATA.lots.filter(l=>norm(l.Cultivo).includes('cebada'));
  $('#pending').innerHTML=`
    <div class="card"><h1>Pendientes</h1><div class="muted">Solo cosas que requieren una decisión nueva.</div></div>
    <div class="card priority">
      <div class="eyebrow">SANIDAD</div>
      <h2>2.º fungicida en cebadas</h2>
      <p>Recorrer las más adelantadas y definir la entrada en hoja bandera / ventana sanitaria. Producto conversado: Miravis.</p>
      <div class="tag">${ceb.length} lotes de cebada</div>
    </div>
    <div class="card">
      <div class="eyebrow">YA REALIZADO</div>
      <h2>Z30 de gramíneas</h2>
      <p>La pasada con Único ya está cerrada como realizada junto con los herbicidas. No queda como pendiente.</p>
    </div>`;
}
