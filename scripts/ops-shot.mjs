import { chromium } from "playwright-core";
const exec = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const b = await chromium.launch({ executablePath: exec, args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 1200 } });
const p = await ctx.newPage();
await p.goto("http://localhost:5173/ops/login", { waitUntil: "domcontentloaded" });
await p.fill('input[name="email"]', "ops@example.com");
await p.fill('input[name="password"]', "opsdevpass123");
await p.getByRole("button").filter({ hasText: /sign in/i }).first().click();
await p.waitForTimeout(1500);
console.log("after login:", p.url());
await p.goto("http://localhost:5173/ops/contracts", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(900);
await p.screenshot({ path: "/tmp/shots/ops-contracts.png", fullPage: true });
await p.goto("http://localhost:5173/ops/bookings/66666666-6666-6666-6666-000000000001", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(900);
// expand the contract details
try { await p.getByText(/— view/).click(); await p.waitForTimeout(400); } catch {}
await p.screenshot({ path: "/tmp/shots/ops-booking-contract.png", fullPage: true });
console.log("done");
await b.close();
