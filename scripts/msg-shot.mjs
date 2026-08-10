import { chromium } from "playwright-core";
const exec = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const b = await chromium.launch({ executablePath: exec, args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 480, height: 900 } });
const p = await ctx.newPage();
// log in as liam (trekker)
await p.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded" });
await p.fill('input[name="email"]', "liam@example.com");
await p.fill('input[name="password"]', "TrekDemo2026");
await p.getByRole("button", { name: "Sign in" }).click();
await p.waitForTimeout(1400);
// guide profile → Message
await p.goto("http://localhost:5173/guides/pemba-sherpa", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(700);
await p.getByRole("button", { name: /Message Pemba/ }).click();
await p.waitForTimeout(1500);
console.log("after message click url:", p.url());
// send a message containing a phone number → should mask
await p.fill('input[name="body"]', "Hi Pemba! Call me at +9779812345678 to plan EBC");
await p.getByRole("button", { name: "Send" }).click();
await p.waitForTimeout(1200);
const bodyText = await p.evaluate(() => document.body.innerText);
console.log("masked number present:", bodyText.includes("[number hidden]"));
console.log("raw number leaked:", bodyText.includes("9779812345678"));
await p.screenshot({ path: "/tmp/shots/conversation.png", fullPage: true });
await b.close();
