import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  PaperclipIcon,
  BookTextIcon,
  CloudIcon,
  LayoutDashboardIcon,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <div className="min-h-svh flex flex-col">
      {/* Navigation */}
      <header className="border-b">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <Link to="/" className="flex items-center gap-2 font-medium">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <PaperclipIcon className="size-4" />
            </div>
            <span className="text-lg font-semibold">Manotes</span>
          </Link>
          <nav className="flex items-center gap-4 sm:gap-6">
            <a
              href="https://x.com/klapacz_dev"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Twitter/X"
            >
              <svg
                role="img"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                className="size-5"
                fill="currentColor"
              >
                <title>X</title>
                <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
              </svg>
            </a>
            <a
              href="https://github.com/klapacz/manotes"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="GitHub"
            >
              <svg
                role="img"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
                className="size-5"
                fill="currentColor"
              >
                <title>GitHub</title>
                <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
              </svg>
            </a>

            <Button variant="link" asChild className="px-0">
              <Link to="/login">Sign In</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-1 bg-muted/40">
        <div className="container mx-auto flex flex-col items-center justify-center gap-6 py-12 text-center text-balance md:py-24 lg:py-32 px-4 md:px-6">
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <PaperclipIcon className="size-6" />
            </div>
            <h1 className="max-w-lg text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">
              Capture your ideas with Manotes
            </h1>
            <p className="max-w-lg text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              The modern note-taking app designed to help you organize your
              thoughts, connect ideas, and boost productivity.
            </p>
          </div>
          <div className="w-full">
            <Button size="lg" className="w-full min-[400px]:w-auto" asChild>
              <Link to="/login">Join Waitlist</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-background py-12 md:py-24 lg:py-32">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Features
            </h2>
            <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              Everything you need to organize your thoughts and ideas in one
              place.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3 lg:gap-8 mt-8">
            {/* Feature 1 */}
            <div className="flex flex-col items-center gap-2 rounded-lg border p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BookTextIcon className="size-6" />
              </div>
              <h3 className="text-xl font-bold">Journal</h3>
              <p className="text-center text-muted-foreground">
                Dedicated notes for each day to track your thoughts, tasks, and
                progress over time.
              </p>
            </div>
            {/* Feature 2 */}
            <div className="flex flex-col items-center gap-2 rounded-lg border p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <LayoutDashboardIcon className="size-6" />
              </div>
              <h3 className="text-xl font-bold">Bullet Notes</h3>
              <p className="text-center text-muted-foreground">
                Simple, minimalist note-taking with bullet points for quick
                capture and organization.
              </p>
            </div>
            {/* Feature 3 */}
            <div className="flex flex-col items-center gap-2 rounded-lg border p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CloudIcon className="size-6" />
              </div>
              <h3 className="text-xl font-bold">Cloud Sync</h3>
              <p className="text-center text-muted-foreground">
                Access your notes from anywhere, on any device, with secure
                cloud sync.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-muted py-12 md:py-20">
        <div className="container mx-auto flex flex-col items-center justify-center gap-4 px-4 text-center md:px-6">
          <h2 className="text-2xl font-bold sm:text-3xl">
            Ready to get started?
          </h2>
          <p className="max-w-[600px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
            Join the waitlist today and be among the first to try Manotes.
          </p>
          <Button size="lg" className="w-full min-[400px]:w-auto" asChild>
            <Link to="/login">Join Waitlist</Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-6 md:py-8">
        <div className="container mx-auto flex flex-col items-center justify-center gap-4 px-4 md:px-6">
          <div className="flex items-center gap-2">
            <PaperclipIcon className="size-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Manotes.
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
