import { createFileRoute, Link } from "@tanstack/solid-router";
import { Temporal } from "temporal-polyfill";
import Editor from "../editor";

export const Route = createFileRoute("/$graph/")({
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();

  return (
    <div class="p-6 flex flex-col gap-4">
      <Navigation />
      <Editor noteId={search().date} isDaily={true} />
    </div>
  );
}

function Navigation() {
  const moveBy = (days: number) => (current: { date: string }) => {
    const to = Temporal.PlainDate.from(current.date).add({ days }).toString();

    return {
      ...current,
      date: to,
    };
  };

  return (
    <div class="flex gap-2 justify-between">
      <div class="flex gap-2 items-center">
        <Link
          from={Route.fullPath}
          to="/$graph"
          class="bg-gray-500 hover:bg-gray-700 text-white py-2 px-4 rounded"
          search={moveBy(-1)}
        >
          Prev
        </Link>

        <Link
          from={Route.fullPath}
          to="/$graph"
          class="bg-blue-500 hover:bg-blue-700 text-white py-2 px-4 rounded"
          search={(current) => {
            const to = Temporal.Now.plainDateISO().toString();

            return {
              ...current,
              date: to,
            };
          }}
        >
          Today
        </Link>

        <Link
          from={Route.fullPath}
          to="/$graph"
          class="bg-gray-500 hover:bg-gray-700 text-white py-2 px-4 rounded"
          search={moveBy(1)}
        >
          Next
        </Link>
      </div>

      <Link
        from={Route.fullPath}
        to="/$graph/other"
        class="bg-gray-500 hover:bg-gray-700 text-white py-2 px-4 rounded"
      >
        Go to other
      </Link>
    </div>
  );
}
