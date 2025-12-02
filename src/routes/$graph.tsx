import { createFileRoute, Outlet, redirect } from "@tanstack/solid-router";
import { Runtime, RuntimeProvider } from "../lib";
import { Schema } from "effect";

export const Route = createFileRoute("/$graph")({
  component: RouteComponent,
  validateSearch: Schema.Struct({
    allowCreate: Schema.optional(Schema.Boolean),
  }).pipe(Schema.standardSchemaV1),
  beforeLoad: async ({ params, search }) => {
    const graphName = params.graph;
    const result = await Runtime.setup({
      allowCreate: search.allowCreate ?? false,
      graphName,
    });

    return Runtime.setupResult.$match({
      DatabaseNotFound() {
        // Redirect user so they can confirm creation of new graph
        throw redirect({ to: "/create", search: { graphName } });
      },
      Success({ runtime }) {
        // Remove allowCreate from search params
        if (search.allowCreate) {
          throw redirect({
            from: Route.fullPath,
            to: "/$graph",
            replace: true,
            search: (search) => ({ ...search, allowCreate: undefined }),
          });
        }
        return { runtime };
      },
    })(result);
  },
  loader: async ({ context }) => ({ runtime: context.runtime }),
});

function RouteComponent() {
  const data = Route.useLoaderData();

  return (
    <RuntimeProvider runtime={() => data().runtime}>
      <Outlet />
    </RuntimeProvider>
  );
}
