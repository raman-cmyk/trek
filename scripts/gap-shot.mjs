import { chromium } from "playwright-core";
const exec = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const b = await chromium.launch({ executablePath: exec, args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 800, height: 1100 } });
const p = await ctx.newPage();
await p.goto("http://localhost:5173/insurance", { waitUntil: "domcontentloaded" });
// leave altitude off (fails) but turn helicopter on to show a partial gap
await p.getByText("Covers emergency helicopter evacuation").click();
await p.waitForTimeout(400);
await p.getByText("Not yet").scrollIntoViewIfNeeded().catch(()=>{});
await p.waitForTimeout(300);
await p.screenshot({ path: "/tmp/shots/insurance-gap.png", fullPage: true });
console.log("gap text present:", await p.getByText("Ask us for a partner policy").count());
await b.close();
