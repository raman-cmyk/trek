/**
 * Nepal's seventy-seven districts.
 *
 * The application asked for a home district as a free text box, which on a
 * phone keyboard produces "Solukhumbhu", "solu khumbu", "SOLUKHUMBU" and
 * "Solu" for the same place — and the office then cannot group guides by
 * where they are from, which is the one thing that field is for.
 *
 * Grouped by province because a searchable list of seventy-seven is easier to
 * scan when the neighbours are together, and because a guide from Taplejung
 * knows they are in Koshi.
 */

export interface District {
  name: string;
  province: string;
}

export const PROVINCES = [
  "Koshi",
  "Madhesh",
  "Bagmati",
  "Gandaki",
  "Lumbini",
  "Karnali",
  "Sudurpashchim",
] as const;

export type Province = (typeof PROVINCES)[number];

const BY_PROVINCE: Record<Province, string[]> = {
  Koshi: [
    "Bhojpur", "Dhankuta", "Ilam", "Jhapa", "Khotang", "Morang", "Okhaldhunga",
    "Panchthar", "Sankhuwasabha", "Solukhumbu", "Sunsari", "Taplejung",
    "Terhathum", "Udayapur",
  ],
  Madhesh: [
    "Bara", "Dhanusha", "Mahottari", "Parsa", "Rautahat", "Saptari", "Sarlahi",
    "Siraha",
  ],
  Bagmati: [
    "Bhaktapur", "Chitwan", "Dhading", "Dolakha", "Kathmandu", "Kavrepalanchok",
    "Lalitpur", "Makwanpur", "Nuwakot", "Ramechhap", "Rasuwa", "Sindhuli",
    "Sindhupalchok",
  ],
  Gandaki: [
    "Baglung", "Gorkha", "Kaski", "Lamjung", "Manang", "Mustang", "Myagdi",
    "Nawalpur", "Parbat", "Syangja", "Tanahun",
  ],
  Lumbini: [
    "Arghakhanchi", "Banke", "Bardiya", "Dang", "Eastern Rukum", "Gulmi",
    "Kapilvastu", "Palpa", "Parasi", "Pyuthan", "Rolpa", "Rupandehi",
  ],
  Karnali: [
    "Dailekh", "Dolpa", "Humla", "Jajarkot", "Jumla", "Kalikot", "Mugu",
    "Salyan", "Surkhet", "Western Rukum",
  ],
  Sudurpashchim: [
    "Achham", "Baitadi", "Bajhang", "Bajura", "Dadeldhura", "Darchula", "Doti",
    "Kailali", "Kanchanpur",
  ],
};

export const DISTRICTS: District[] = PROVINCES.flatMap((p) =>
  BY_PROVINCE[p].map((name) => ({ name, province: p })),
);

export const DISTRICT_COUNT = 77;

/** Districts grouped for a picker, in province order. */
export function districtsByProvince(): { province: Province; districts: string[] }[] {
  return PROVINCES.map((p) => ({ province: p, districts: BY_PROVINCE[p] }));
}

/**
 * Search, forgivingly.
 *
 * Matches on the district or its province, ignores case and spaces, and
 * matches anywhere in the name rather than only at the start — somebody
 * looking for Sankhuwasabha will type "sabha".
 */
export function searchDistricts(q: string, limit = 12): District[] {
  const needle = q.trim().toLowerCase().replace(/\s+/g, "");
  if (!needle) return DISTRICTS.slice(0, limit);
  const flat = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const starts: District[] = [];
  const contains: District[] = [];
  for (const d of DISTRICTS) {
    const n = flat(d.name);
    if (n.startsWith(needle)) starts.push(d);
    else if (n.includes(needle) || flat(d.province).includes(needle)) contains.push(d);
  }
  return [...starts, ...contains].slice(0, limit);
}

/** Whether a typed or pasted value is one of the seventy-seven. */
export function isDistrict(s: unknown): boolean {
  if (typeof s !== "string") return false;
  const flat = s.trim().toLowerCase();
  return DISTRICTS.some((d) => d.name.toLowerCase() === flat);
}
