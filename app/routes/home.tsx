import type { Route } from "./+types/home";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Pick your guide, not your agency" },
    {
      name: "description",
      content:
        "The only place in Nepal where you pick your guide, not your agency.",
    },
  ];
}

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-24">
      <h1 className="font-display text-4xl text-ink">Trek</h1>
      <p className="mt-3 text-ink-soft">Scaffold online.</p>
    </main>
  );
}
