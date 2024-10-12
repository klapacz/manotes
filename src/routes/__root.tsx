import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/router-devtools";

export const Route = createRootRoute({
  component: () => (
    <>
      <div className="p-2 flex gap-2">
        <Link to="/" className="[&.active]:font-bold">
          Notes
        </Link>{" "}
        <Link to="/studio" className="[&.active]:font-bold">
          Studio
        </Link>
      </div>
      <hr />
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
});
