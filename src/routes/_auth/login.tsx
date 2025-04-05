import { OtpLoginForm } from "@/components/otp-login-form";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_auth/login")({
  component: RouteComponent,
});

function RouteComponent() {
  return <OtpLoginForm />;
}
