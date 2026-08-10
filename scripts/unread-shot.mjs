import { chromium } from "playwright-core";
const exec = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const b = await chromium.launch({ executablePath: exec, args: ["--no-sandbox"] });

async function login(email) {
  const ctx = await b.newContext({ viewport: { width: 480, height: 1100 } });
  const p = await ctx.newPage();
  await p.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded" });
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', "TrekDemo2026");
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForTimeout(1300);
  return p;
}

// 1) guide replies in the existing conversation with Liam
const g = await login("pemba@example.com");
await g.goto("http://localhost:5173/messages", { waitUntil: "domcontentloaded" });
await g.waitForTimeout(800);
await g.locator("a[href^='/messages/c/']").first().click();
await g.waitForTimeout(1000);
await g.fill('input[name="body"]', "Namaste Liam! October is perfect, let's plan.");
await g.getByRole("button", { name: "Send" }).click();
await g.waitForTimeout(1200);
console.log("guide sent reply ok:", (await g.evaluate(() => document.body.innerText)).includes("October is perfect"));

// 2) trekker inbox shows unread badge
const t = await login("liam@example.com");
await t.goto("http://localhost:5173/messages", { waitUntil: "domcontentloaded" });
await t.waitForTimeout(900);
let txt = await t.evaluate(() => document.body.innerText);
const badge = await t.locator("span.bg-primary.rounded-full").first().textContent().catch(() => null);
console.log("unread badge shows:", badge !== null && Number(badge) >= 1, `(count=${badge})`);
await t.screenshot({ path: "/tmp/shots/inbox-unread.png", fullPage: false });

// 3) open the thread → back to inbox → badge gone
await t.locator("a[href^='/messages/c/']").first().click();
await t.waitForTimeout(1000);
await t.goto("http://localhost:5173/messages", { waitUntil: "domcontentloaded" });
await t.waitForTimeout(900);
const badgeAfter = await t.locator("span.bg-primary.rounded-full").count();
console.log("badge cleared after reading:", badgeAfter === 0);
await t.screenshot({ path: "/tmp/shots/inbox-read.png", fullPage: false });

await b.close();
