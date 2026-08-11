import { chromium } from "playwright-core";
const OUT="/tmp/claude-0/-home-user-trek/42f4dbb0-3e9a-5d33-9e27-ea72ecb3a2ad/scratchpad";
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium-1194/chrome-linux/chrome",args:["--no-sandbox"]});
for (const [w,name] of [[1440,"footer-1440"],[390,"footer-390"]]) {
  const p=await b.newPage({viewport:{width:w,height:900}});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,120)));
  await p.goto("http://localhost:5173/",{waitUntil:"networkidle",timeout:60000});
  const h=await p.evaluate(()=>document.body.scrollHeight);
  for(let y=0;y<h;y+=800){await p.evaluate(v=>window.scrollTo(0,v),y);await p.waitForTimeout(110);}
  await p.waitForTimeout(1500);
  const f=await p.$('footer');
  await f.scrollIntoViewIfNeeded(); await p.waitForTimeout(700);
  await f.screenshot({path:`${OUT}/${name}.png`});
  const res=await p.evaluate(()=>{
    const de=document.documentElement;
    const f=document.querySelector('footer');
    return {
      hscroll: de.scrollWidth>de.clientWidth+1,
      footerH: Math.round(f.getBoundingClientRect().height),
      faces: f.querySelectorAll('img').length,
      broken: [...f.querySelectorAll('img')].filter(i=>i.complete&&i.naturalWidth===0).length,
      nestedA: f.querySelectorAll('a a').length,
      label: f.querySelector('a[href^="/routes/"] , .font-mono')?.textContent?.trim().slice(0,40),
    };
  });
  console.log(w, JSON.stringify(res), errs.length?errs:"");
  await p.close();
}
await b.close();
