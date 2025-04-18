import { Fragment } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { formatISO, startOfMonth } from "date-fns";
import { z } from "zod";
import { fallback, zodSearchValidator } from "@tanstack/router-zod-adapter";
import { NoteService } from "@/services/note.service";
import { Editor } from "@/components/editor";
import { authClient } from "@/lib/auth-client";

const today = formatISO(new Date(), { representation: "date" });

export const indexSearchSchema = z.object({
  date: fallback(z.string().date(), today).default(today),
});

export const Route = createFileRoute("/_app/graph")({
  component: Index,
  validateSearch: zodSearchValidator(indexSearchSchema),
  loaderDeps: ({ search: { date } }) => {
    const monthStartISO = formatISO(startOfMonth(date), {
      representation: "date",
    });
    return { monthStartISO };
  },
  loader: async ({ deps }) => {
    const session = await authClient.getSession();
    if (!session.data) {
      throw redirect({
        to: "/login",
      });
    }
    return NoteService.listInMonth(deps.monthStartISO);
  },

  // Set staleTime to 0 to consider data stale immediately after loading
  staleTime: 0,
  // Set gcTime to 0 to remove data from cache as soon as it's not actively used
  gcTime: 0,
  // Force reload on every navigation to this route
  shouldReload: () => true,
});

function Index() {
  const days = Route.useLoaderData();

  return (
    <div className="space-y-4 pb-[100vh] divide-y">
      {days.map(({ day, note }) => (
        <Fragment key={day}>
          <Editor note={note} className="p-8" />
        </Fragment>
      ))}
    </div>
  );
}
