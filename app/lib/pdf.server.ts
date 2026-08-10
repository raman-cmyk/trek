import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Tims } from "~/components/TimsCard";

const BLUE = rgb(0.118, 0.227, 0.541); // official TIMS blue (#1e3a8a)
const INK = rgb(0.07, 0.14, 0.11);
const GREY = rgb(0.42, 0.48, 0.43);
const WHITE = rgb(1, 1, 1);

/** Split text into lines that fit `maxWidth` at `size`, respecting newlines. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    if (para === "") {
      out.push("");
      continue;
    }
    let line = "";
    for (const word of para.split(/\s+/)) {
      const trial = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(trial, size) > maxWidth && line) {
        out.push(line);
        line = word;
      } else {
        line = trial;
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/** The blue TIMS card as a one-page PDF (A4 portrait, card at top). */
export async function timsCardPdf(t: Tims): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const M = 40;
  const cardX = M;
  const cardW = 595 - M * 2;
  const cardY = 842 - M - 260;
  const cardH = 260;

  page.drawRectangle({ x: cardX, y: cardY, width: cardW, height: cardH, color: BLUE });

  page.drawText("NEPAL · TAAN — TREKKERS' INFORMATION MANAGEMENT SYSTEM", {
    x: cardX + 20, y: cardY + cardH - 28, size: 8, font: bold, color: rgb(0.8, 0.85, 1),
  });
  page.drawText("Blue TIMS card", {
    x: cardX + 20, y: cardY + cardH - 54, size: 22, font: bold, color: WHITE,
  });
  page.drawText(t.card_no, {
    x: cardX + 20, y: cardY + cardH - 84, size: 15, font, color: WHITE,
  });
  page.drawText(t.status.toUpperCase(), {
    x: cardX + cardW - 20 - bold.widthOfTextAtSize(t.status.toUpperCase(), 9),
    y: cardY + cardH - 28, size: 9, font: bold, color: WHITE,
  });

  const fields: [string, string][] = [
    ["TREKKER", t.trekker_name],
    ["NATIONALITY", t.nationality ?? "—"],
    ["PARTY SIZE", String(t.party_size ?? "—")],
    ["ROUTE", t.route_name ?? "—"],
    ["REGION", t.region ?? "—"],
    ["ENTRY POINT", t.entry_point ?? "—"],
    ["GUIDE", t.guide_name ?? "—"],
    ["GUIDE LICENCE", t.guide_licence_no ?? "—"],
    ["DATES", t.start_date ? `${t.start_date} to ${t.end_date}` : "—"],
  ];
  const colW = (cardW - 40) / 3;
  fields.forEach(([label, value], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const fx = cardX + 20 + col * colW;
    const fy = cardY + cardH - 120 - row * 42;
    page.drawText(label, { x: fx, y: fy, size: 7, font: bold, color: rgb(0.72, 0.78, 1) });
    page.drawText(value, { x: fx, y: fy - 14, size: 10, font, color: WHITE });
  });

  page.drawText(
    `Issued ${new Date(t.issued_at).toLocaleDateString()} · verify guide licence at checkpoints`,
    { x: cardX, y: cardY - 20, size: 8, font, color: GREY },
  );
  page.drawText("Issued by Trek — Grey Floor Pvt. Ltd. (TAAN-registered).", {
    x: cardX, y: cardY - 36, size: 8, font, color: GREY,
  });

  return doc.save();
}

/** A contract body as a paginated A4 PDF. Light markdown cleanup (#, **, -). */
export async function contractPdf(title: string, body: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 56;
  const W = 595 - M * 2;
  const top = 842 - M;
  let page: PDFPage = doc.addPage([595, 842]);
  let y = top;

  const draw = (text: string, size: number, f: PDFFont, gap = 4) => {
    for (const line of wrap(text, f, size, W)) {
      if (y < M + size) {
        page = doc.addPage([595, 842]);
        y = top;
      }
      page.drawText(line, { x: M, y, size, font: f, color: INK });
      y -= size + gap;
    }
  };

  draw(title, 18, bold, 10);
  for (const raw of body.split("\n")) {
    const line = raw.replace(/\*\*/g, "");
    if (line.startsWith("## ")) {
      y -= 6;
      draw(line.slice(3).toUpperCase(), 11, bold, 4);
    } else if (line.startsWith("# ")) {
      draw(line.slice(2), 15, bold, 6);
    } else if (line.startsWith("- ")) {
      draw("•  " + line.slice(2), 10, font, 3);
    } else {
      draw(line, 10, font, 3);
    }
  }
  return doc.save();
}

/** Standard PDF response headers with an inline-download filename. */
export function pdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
