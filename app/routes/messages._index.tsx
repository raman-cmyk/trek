import { Link } from "react-router";

export function meta() {
  return [{ title: "Messages" }, { name: "robots", content: "noindex" }];
}

/**
 * The index pane.
 *
 * On mobile the conversation rail in the shell IS this route, so this
 * component renders nothing there. On desktop the rail is always visible and
 * this fills the empty right pane — the "pick a conversation" state.
 */
export default function MessagesIndex() {
  return (
    <div className="hidden h-full place-items-center bg-paper p-8 lg:grid">
      <div className="max-w-sm text-center">
        <p className="font-display text-xl text-ink">Pick a conversation.</p>
        <p className="mt-1.5 text-sm text-muted">
          Messaging a guide is free, and they answer themselves — not an office.
        </p>
        <Link
          to="/guides"
          className="mt-4 inline-block rounded bg-pine px-4 py-2 text-sm font-medium text-paper hover:bg-moss"
        >
          Find your guide →
        </Link>
      </div>
    </div>
  );
}
