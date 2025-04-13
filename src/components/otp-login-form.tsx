import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { CircleCheckIcon } from "lucide-react";
import type { AuthService } from "../../worker/service";

// Email form schema
const emailFormSchema = z.object({
  email: z.string().email("Please enter a valid email"),
});

// OTP form schema
const otpFormSchema = z.object({
  otp: z.string().min(6, "OTP must be at least 6 characters"),
});

type EmailFormValues = z.infer<typeof emailFormSchema>;
type OtpFormValues = z.infer<typeof otpFormSchema>;

export function OtpLoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  // State to track the current step
  const [userEmail, setUserEmail] = useState<string>();

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">
            {!userEmail ? "Sign in or join the waitlist" : "Enter verification code"}
          </CardTitle>
          <CardDescription>
            {!userEmail
              ? "Enter your email to sign in. If you don't have access yet, you'll be added to the waitlist"
              : `We've sent a code to ${userEmail}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {userEmail ? (
            <OTPForm email={userEmail} setUserEmail={setUserEmail} />
          ) : (
            <EmailForm setUserEmail={setUserEmail} />
          )}
        </CardContent>
      </Card>
      <div className="text-muted-foreground *:[a]:hover:text-primary text-center text-xs text-balance *:[a]:underline *:[a]:underline-offset-4">
        By clicking continue, you agree to our <a href="#">Terms of Service</a>{" "}
        and <a href="#">Privacy Policy</a>.
      </div>
    </div>
  );
}

type SendOtpStandardResult = {
  success: boolean;
};
type SendOtpWaitlistResult = {
  code: AuthService.ProtectSigninResponseCode;
  message: string;
};
type SendOtpResult = SendOtpStandardResult | SendOtpWaitlistResult;
const protectSigninResponseCodes: AuthService.ProtectSigninResponseCode[] = [
  "WAITLIST_FOUND",
  "WAITLIST_CREATED",
];

function isWaitlistResult(
  result: SendOtpResult,
): result is SendOtpWaitlistResult {
  return "code" in result && protectSigninResponseCodes.includes(result.code);
}

type UseSendOtpMutationOpts = {
  setUserEmail: (email: string) => void;
};

function useSendOtpMutation(opts: UseSendOtpMutationOpts) {
  return useMutation({
    mutationFn: async (values: EmailFormValues) => {
      const { data, error } = await authClient.emailOtp.sendVerificationOtp({
        email: values.email,
        type: "sign-in",
      });

      if (error) {
        throw error;
      }

      return data as SendOtpResult;
    },
    onSuccess: (response, values) => {
      if (isWaitlistResult(response)) {
        return;
      }

      // Reset OTP form when switching to OTP step
      opts.setUserEmail(values.email);
    },
  });
}

function SendOtpDataAlert({ data }: { data: SendOtpResult | undefined }) {
  if (!data || !isWaitlistResult(data)) {
    return;
  }

  return (
    <div className="rounded-md border border-emerald-500/50 px-4 py-3 text-emerald-600">
      <p className="text-sm">
        <CircleCheckIcon
          className="me-3 -mt-0.5 inline-flex opacity-60"
          size={16}
          aria-hidden="true"
        />
        {data.message}
      </p>
    </div>
  );
}

function EmailForm({
  setUserEmail,
}: {
  setUserEmail: (email: string) => void;
}) {
  // Send OTP mutation
  const sendOtpMutation = useSendOtpMutation({
    setUserEmail,
  });

  // Handle email form submission
  function onEmailSubmit(values: EmailFormValues) {
    sendOtpMutation.mutateAsync(values);
  }

  // Email form
  const emailForm = useForm<EmailFormValues>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: {
      email: "",
    },
  });

  return (
    <Form {...emailForm}>
      <form
        onSubmit={emailForm.handleSubmit(onEmailSubmit)}
        className="grid gap-6"
      >
        <div className="grid gap-6">
          {sendOtpMutation.error ? (
            <Alert variant={"destructive"}>
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>
                {sendOtpMutation.error.message}
              </AlertDescription>
            </Alert>
          ) : null}

          <SendOtpDataAlert data={sendOtpMutation.data} />

          <FormField
            control={emailForm.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input placeholder="m@example.com" {...field} type="email" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full"
            disabled={sendOtpMutation.isPending}
          >
            {sendOtpMutation.isPending ? "Sending..." : "Continue"}
          </Button>
        </div>

        {/* <div className="text-center text-sm">
          Don&apos;t have an account?{" "}
          <Link to="/signup" className="underline underline-offset-4">
            Sign up
          </Link>
        </div> */}
      </form>
    </Form>
  );
}

function OTPForm({
  email,
  setUserEmail,
}: {
  email: string;
  setUserEmail: (email: string | undefined) => void;
}) {
  // Send OTP mutation
  const sendOtpMutation = useSendOtpMutation({
    setUserEmail,
  });

  // OTP form
  const otpForm = useForm<OtpFormValues>({
    resolver: zodResolver(otpFormSchema),
    defaultValues: {
      otp: "",
    },
  });

  // Verify OTP mutation
  const verifyOtpMutation = useMutation({
    mutationFn: async (values: OtpFormValues) => {
      const { data, error } = await authClient.signIn.emailOtp({
        email: email,
        otp: values.otp,
      });

      if (error) {
        throw error;
      }

      return data;
    },
  });
  // Handle OTP form submission
  function onOtpSubmit(values: OtpFormValues) {
    verifyOtpMutation.mutate(values);
  }

  return (
    <Form {...otpForm}>
      <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} className="grid gap-6">
        <div className="grid gap-6">
          {verifyOtpMutation.error ? (
            <Alert variant={"destructive"}>
              <AlertTitle>Invalid code</AlertTitle>
              <AlertDescription>
                {verifyOtpMutation.error.message}
              </AlertDescription>
            </Alert>
          ) : null}

          <FormField
            control={otpForm.control}
            name="otp"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Verification Code</FormLabel>
                <FormControl>
                  <InputOTP
                    maxLength={6}
                    pattern={REGEXP_ONLY_DIGITS}
                    value={field.value}
                    onChange={field.onChange}
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex flex-col gap-2">
            <Button
              type="submit"
              className="w-full"
              disabled={verifyOtpMutation.isPending}
            >
              {verifyOtpMutation.isPending ? "Verifying..." : "Sign in"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setUserEmail(undefined);
              }}
            >
              Back to email
            </Button>
            <Button
              type="button"
              variant="link"
              className="w-full"
              onClick={() => {
                sendOtpMutation.mutate({ email });
              }}
              disabled={sendOtpMutation.isPending}
            >
              {sendOtpMutation.isPending ? "Sending..." : "Resend code"}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
