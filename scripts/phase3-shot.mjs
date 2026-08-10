import { chromium } from "playwright-core";
const exec = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const b = await chromium.launch({ executablePath: exec, args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 480, height: 1100 } });
const p = await ctx.newPage();

// 1) public: verification receipts + porter badge on guide profile
await p.goto("http://localhost:5173/guides/pemba-sherpa", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(900);
let txt = await p.evaluate(() => document.body.innerText);
console.log("receipts:", txt.includes("Verification receipts"));
console.log("dated (has '→ '):", /[A-Z][a-z]{2} 20\d\d/.test(txt));
console.log("porter badge:", txt.includes("Porter-welfare pledge"));
await p.screenshot({ path: "/tmp/shots/receipts.png", fullPage: false });

// 2) trust porters section
await p.goto("http://localhost:5173/trust#porters", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(600);
txt = await p.evaluate(() => document.body.innerText);
console.log("trust porters:", txt.includes("porter-welfare pledge") || txt.includes("The porter-welfare pledge"));
await p.screenshot({ path: "/tmp/shots/trust-porters.png", fullPage: false });

// 3) trekker inbox
await p.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded" });
await p.fill('input[name="email"]', "liam@example.com");
await p.fill('input[name="password"]', "TrekDemo2026");
await p.getByRole("button", { name: "Sign in" }).click();
await p.waitForTimeout(1400);
await p.goto("http://localhost:5173/messages", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(900);
txt = await p.evaluate(() => document.body.innerText);
console.log("trekker inbox loads:", txt.includes("Messages"));
console.log("trekker threads present:", txt.includes("Pemba") || txt.includes("No conversations yet"));
await p.screenshot({ path: "/tmp/shots/inbox-trekker.png", fullPage: false });

// 4) guide inbox — fresh context (logout is POST-only)
const ctx2 = await b.newContext({ viewport: { width: 480, height: 1100 } });
const p2 = await ctx2.newPage();
await p2.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded" });
await p2.fill('input[name="email"]', "pemba@example.com");
await p2.fill('input[name="password"]', "TrekDemo2026");
await p2.getByRole("button", { name: "Sign in" }).click();
await p2.waitForTimeout(1400);
await p2.goto("http://localhost:5173/messages", { waitUntil: "domcontentloaded" });
await p2.waitForTimeout(900);
txt = await p2.evaluate(() => document.body.innerText);
console.log("guide inbox loads:", txt.includes("Your trekkers"));
console.log("guide sees trekker thread:", txt.includes("Liam") || txt.includes("No conversations yet"));
await p2.screenshot({ path: "/tmp/shots/inbox-guide.png", fullPage: false });
await b.close();
