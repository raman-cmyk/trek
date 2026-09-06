import { describe, it, expect } from "vitest";
import { listThreads } from "./threads.server";
import { countUnread } from "./unread.server";

/**
 * A very small stand-in for the Supabase query builder — enough of it to run
 * the inbox queries against fixture rows. It honours eq/neq/in and ordering,
 * and ignores `or`/`limit`, so fixtures are written already scoped to the
 * person whose inbox is being built.
 */
function fakeAdmin(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      const filters: [string, "eq" | "neq" | "in", any][] = [];
      let sort: { col: string; asc: boolean } | null = null;
      const builder: any = {
        select: () => builder,
        or: () => builder,
        limit: () => builder,
        eq: (col: string, val: any) => (filters.push([col, "eq", val]), builder),
        neq: (col: string, val: any) => (filters.push([col, "neq", val]), builder),
        in: (col: string, vals: any[]) => (filters.push([col, "in", vals]), builder),
        order: (col: string, opts?: { ascending?: boolean }) => {
          sort = { col, asc: opts?.ascending !== false };
          return builder;
        },
        upsert: () => Promise.resolve({ data: null, error: null }),
        then: (resolve: any, reject: any) => {
          let rows = [...(tables[table] ?? [])];
          for (const [col, op, val] of filters) {
            rows = rows.filter((r) =>
              op === "eq" ? r[col] === val : op === "neq" ? r[col] !== val : val.includes(r[col]),
            );
          }
          if (sort) {
            const { col, asc } = sort;
            rows.sort((a, b) => String(a[col] ?? "").localeCompare(String(b[col] ?? "")));
            if (!asc) rows.reverse();
          }
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  } as any;
}

const ME = "user-me";
const FRIEND = "user-friend";

const tables = () => ({
  conversations: [],
  bookings: [],
  messages: [],
  users: [
    { id: ME, full_name: "Me", avatar_url: null },
    { id: FRIEND, full_name: "Yuki", avatar_url: null },
  ],
  offerings: [{ id: "off-1", title: "Manaslu Circuit", cover_photo_url: "/manaslu.jpg" }],
  trip_groups: [
    {
      id: "grp-1",
      slug: "manaslu-in-may-ab12",
      name: "Manaslu in May",
      offering_id: "off-1",
      status: "forming",
      created_at: "2026-09-01T09:00:00Z",
    },
    // A group I have nothing to do with.
    {
      id: "grp-2",
      slug: "someone-else-cd34",
      name: "Not my trip",
      offering_id: null,
      status: "forming",
      created_at: "2026-09-01T09:00:00Z",
    },
  ],
  trip_group_members: [
    { group_id: "grp-1", user_id: ME, status: "joined" },
    { group_id: "grp-1", user_id: FRIEND, status: "joined" },
    { group_id: "grp-2", user_id: FRIEND, status: "joined" },
  ],
  trip_group_messages: [
    {
      group_id: "grp-1",
      author_id: FRIEND,
      body: "Shall we add a rest day at Samagaon?",
      created_at: "2026-09-05T10:00:00Z",
    },
    { group_id: "grp-1", author_id: ME, body: "Yes.", created_at: "2026-09-05T11:00:00Z" },
    { group_id: "grp-2", author_id: FRIEND, body: "Private", created_at: "2026-09-05T12:00:00Z" },
  ],
  thread_reads: [],
});

describe("the inbox carries trip-group chats", () => {
  it("lists a group I am in, pointing at the group page", async () => {
    const threads = await listThreads(fakeAdmin(tables()), ME);
    const group = threads.find((t) => t.kind === "group");
    expect(group).toBeDefined();
    expect(group!.to).toBe("/groups/manaslu-in-may-ab12");
    expect(group!.withName).toBe("Manaslu in May");
    expect(group!.about).toBe("Manaslu Circuit");
    expect(group!.snippet).toBe("Yes."); // newest message wins
    expect(group!.at).toBe("2026-09-05T11:00:00Z");
  });

  it("never shows somebody else's group", async () => {
    const threads = await listThreads(fakeAdmin(tables()), ME);
    expect(threads.some((t) => t.to.includes("someone-else"))).toBe(false);
  });

  it("counts only what other people said since I last opened the group", async () => {
    const unread = await listThreads(fakeAdmin(tables()), ME).then(
      (t) => t.find((x) => x.kind === "group")!.unread,
    );
    expect(unread).toBe(1); // the friend's line; my own reply does not count

    const read = tables();
    read.thread_reads = [
      { user_id: ME, thread_key: "g:grp-1", last_read_at: "2026-09-05T11:30:00Z" },
    ];
    const after = await listThreads(fakeAdmin(read), ME);
    expect(after.find((t) => t.kind === "group")!.unread).toBe(0);
  });

  it("feeds the header unread badge too", async () => {
    expect(await countUnread(fakeAdmin(tables()), ME)).toEqual({ unreadTotal: 1 });

    const read = tables();
    read.thread_reads = [
      { user_id: ME, thread_key: "g:grp-1", last_read_at: "2026-09-05T11:30:00Z" },
    ];
    expect(await countUnread(fakeAdmin(read), ME)).toEqual({ unreadTotal: 0 });
  });
});
