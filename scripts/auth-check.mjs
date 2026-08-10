import { chromium } from "playwright-core";
const exec = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const b = await chromium.launch({ executablePath: exec, args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
const p = await ctx.newPage();
// logged-out header
await p.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(600);
await p.screenshot({ path: "/tmp/shots/header-logged-out.png", clip: { x: 0, y: 0, width: 1200, height: 70 } });
// sign in
await p.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded" });
await p.fill('input[name="email"]', "liam@example.com");
await p.fill('input[name="password"]', "TrekDemo2026");
await p.getByRole("button", { name: "Sign in" }).click();
await p.waitForTimeout(1800);
console.log("after login url:", p.url());
await p.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(600);
await p.screenshot({ path: "/tmp/shots/header-logged-in.png", clip: { x: 0, y: 0, width: 1200, height: 70 } });
const hdr = await p.evaluate(() => document.querySelector("header").innerText.replace(/\n+/g," | "));
console.log("logged-in header:", hdr);
// sign out
await p.locator('header form[action="/logout"] button').click();
await p.waitForTimeout(1200);
const hdr2 = await p.evaluate(() => document.querySelector("header").innerText.replace(/\n+/g," | "));
console.log("after signout header:", hdr2);
await b.close();
