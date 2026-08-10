import { chromium } from "playwright-core";
const exec = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BID = "77777777-0000-0000-0000-0000000000bb";
const b = await chromium.launch({ executablePath: exec, args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 480, height: 1100 } });
const p = await ctx.newPage();

// backup guide block on a public trek page (no login needed)
await p.goto("http://localhost:5173/treks/ebc-classic-with-pemba", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(900);
let txt = await p.evaluate(() => document.body.innerText);
console.log("trek has 'Backed up by':", txt.includes("Backed up by"));
console.log("trek has 'never cancels':", txt.includes("never cancels"));
await p.screenshot({ path: "/tmp/shots/backup-guide.png", fullPage: false });

// instant-pay checkout for a day experience
await p.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded" });
await p.fill('input[name="email"]', "liam@example.com");
await p.fill('input[name="password"]', "TrekDemo2026");
await p.getByRole("button", { name: "Sign in" }).click();
await p.waitForTimeout(1400);
await p.goto(`http://localhost:5173/checkout/${BID}`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(900);
txt = await p.evaluate(() => document.body.innerText);
console.log("checkout title 'Pay & confirm':", txt.includes("Pay & confirm"));
console.log("no instalment section (paid in full):", !txt.includes("Split the balance"));
console.log("confirm-on-payment copy:", txt.includes("you're confirmed the moment"));
await p.screenshot({ path: "/tmp/shots/checkout-instant.png", fullPage: true });

await p.getByRole("button", { name: /^Pay \$/ }).click();
await p.waitForTimeout(1800);
console.log("after pay url:", p.url());
txt = await p.evaluate(() => document.body.innerText);
console.log("trip shows Confirmed step:", txt.includes("Confirmed"));
await p.screenshot({ path: "/tmp/shots/trip-instant.png", fullPage: false });
await b.close();
