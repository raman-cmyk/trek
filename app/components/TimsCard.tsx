/**
 * The blue TIMS card (Trekkers' Information Management System), issued in-app by
 * the TAAN-registered agency. Rendered blue by convention. Printable.
 */
export interface Tims {
  card_no: string;
  trekker_name: string;
  nationality: string | null;
  guide_name: string | null;
  guide_licence_no: string | null;
  route_name: string | null;
  region: string | null;
  entry_point: string | null;
  start_date: string | null;
  end_date: string | null;
  party_size: number | null;
  issued_at: string;
  status: string;
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-white/60">{label}</p>
      <p className="font-mono text-sm text-white">{value ?? "—"}</p>
    </div>
  );
}

export function TimsCard({ tims }: { tims: Tims }) {
  return (
    <div className="overflow-hidden rounded-lg shadow-card">
      <div className="bg-[#1e3a8a] p-5 text-white">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-white/70">
              Nepal · TAAN — Trekkers' Information Management System
            </p>
            <p className="mt-1 font-display text-2xl">Blue TIMS card</p>
          </div>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold uppercase">
            {tims.status}
          </span>
        </div>

        <p className="mt-3 font-mono text-lg tracking-wider text-white">{tims.card_no}</p>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Field label="Trekker" value={tims.trekker_name} />
          <Field label="Nationality" value={tims.nationality} />
          <Field label="Party size" value={tims.party_size} />
          <Field label="Route" value={tims.route_name} />
          <Field label="Region" value={tims.region} />
          <Field label="Entry point" value={tims.entry_point} />
          <Field label="Guide" value={tims.guide_name} />
          <Field label="Guide licence" value={tims.guide_licence_no} />
          <Field label="Dates" value={tims.start_date ? `${tims.start_date} → ${tims.end_date}` : null} />
        </div>
      </div>
      <div className="flex items-center justify-between bg-[#152a63] px-5 py-2 text-[11px] text-white/70">
        <span>Issued {new Date(tims.issued_at).toLocaleDateString()} · verify guide licence at checkpoints</span>
        <span className="font-semibold text-white/90">Trek</span>
      </div>
    </div>
  );
}
