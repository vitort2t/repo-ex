const { chromium } = require('playwright');
(async()=>{const dir=process.argv[2];const b=await chromium.launch();const p=await b.newPage({deviceScaleFactor:1});
await p.goto('file://'+dir+'/proposta.html');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(500);
await p.pdf({path:dir+'/proposta.pdf',width:'210mm',height:'297mm',printBackground:true,preferCSSPageSize:true});
// overflow check
const issues=await p.evaluate(()=>{const out=[];document.querySelectorAll('.page').forEach((pg,i)=>{const r=pg.getBoundingClientRect();pg.querySelectorAll('h1,h2,h4,h5,p,li,.inc,.ft,.st,.tm,.cta,.opt,.conts,.benefits,.p3-list,.feats,.cl-sign,.ill').forEach(e=>{const q=e.getBoundingClientRect();if(q.bottom>r.bottom-16||q.right>r.right+1||q.left<r.left-1)out.push(`p${i+1} ${e.className||e.tagName} b=${(q.bottom-r.top).toFixed(0)} r=${(q.right-r.left).toFixed(0)}`)})});return out});
console.log(issues.join('\n')||'no overflow');await b.close();})();
