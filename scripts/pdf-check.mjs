import { chromium } from "playwright-core";
const exec = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BID = "66666666-6666-6666-6666-000000000016";
const b = await chromium.launch({ executablePath: exec, args: ["--no-sandbox"] });

async function login(email, pass) {
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.goto("http://localhost:5173/login", { waitUntil: "domcontentloaded" });
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', pass);
  await p.getByRole("button", { name: "Sign in" }).click().catch(()=>{});
  await p.waitForTimeout(1400);
  return { ctx, p };
}
async function checkPdf(p, url) {
  return await p.evaluate(async (u) => {
    const r = await fetch(u);
    const buf = new Uint8Array(await r.arrayBuffer());
    const head = String.fromCharCode(...buf.slice(0, 5));
    return { status: r.status, type: r.headers.get("content-type"), bytes: buf.length, head };
  }, url);
}

// trekker (liam) → TIMS pdf
const liam = await login("liam@example.com", "TrekDemo2026");
console.log("liam TIMS pdf:", JSON.stringify(await checkPdf(liam.p, "/pdf/tims/" + BID)));
console.log("liam contract pdf (should 403):", JSON.stringify(await checkPdf(liam.p, "/pdf/contract/" + BID)));
await liam.ctx.close();

// ops → contract pdf
const ops = await (async () => {
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  await p.goto("http://localhost:5173/ops/login", { waitUntil: "domcontentloaded" });
  await p.fill('input[name="email"]', "ops@example.com");
  await p.fill('input[name="password"]', "opsdevpass123");
  await p.getByRole("button").filter({ hasText: /sign in/i }).first().click().catch(()=>{});
  await p.waitForTimeout(1400);
  return { ctx, p };
})();
console.log("ops contract pdf:", JSON.stringify(await checkPdf(ops.p, "/pdf/contract/" + BID)));
console.log("ops TIMS pdf:", JSON.stringify(await checkPdf(ops.p, "/pdf/tims/" + BID)));
await ops.ctx.close();
await b.close();
