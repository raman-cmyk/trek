import { chromium } from "playwright-core";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args:["--no-sandbox"] });
const p = await (await b.newContext()).newPage();
await p.goto("http://localhost:5173/guides", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(800);
const r = await p.evaluate(() => {
  const h1 = document.querySelector("h1");
  const name = document.querySelector(".title");
  const price = document.querySelector(".font-mono");
  const g = (el) => el ? getComputedStyle(el).fontFamily.split(",")[0].replace(/["']/g,"") : "none";
  return { h1: g(h1), cardName: g(name), monoNumber: g(price) };
});
console.log(JSON.stringify(r));
await b.close();
