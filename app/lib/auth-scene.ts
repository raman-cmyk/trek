import type { AuthScene } from "~/components/design/AuthSplit";

/**
 * The trail beside the sign-in form.
 *
 * A real route with its real day stops — Langtang, eight days, the valley
 * that rebuilt itself after 2015 — not a stock photograph of somewhere.
 * Chosen because the walk has a clear shape (up the valley, over the top,
 * back down) that draws well small, and because it is a route we actually
 * sell. The figures are the route's own from the database, copied here so a
 * sign-in page never waits on a query.
 */
export const AUTH_SCENE: AuthScene = {
  photo: "/img/routes/langtang-valley.jpg",
  alt: "The Langtang valley, walking towards Kyanjin Gompa",
  title: "Langtang Valley",
  to: "/routes/langtang-valley",
  stops: [
    { day: 1, place: "Lama Hotel", altitude_m: 2470 },
    { day: 2, place: "Langtang village", altitude_m: 3430 },
    { day: 3, place: "Kyanjin Gompa", altitude_m: 3870 },
    { day: 4, place: "Kyanjin Ri", altitude_m: 4773 },
    { day: 5, place: "Lama Hotel", altitude_m: 2470 },
    { day: 6, place: "Syabrubesi", altitude_m: 1460 },
  ],
  facts: [
    { glyph: "calendar", value: "8", unit: "days" },
    { glyph: "altitude", value: "4,984", unit: "m" },
    { glyph: "walk", value: "62", unit: "km" },
    { value: "Moderate" },
  ],
};
