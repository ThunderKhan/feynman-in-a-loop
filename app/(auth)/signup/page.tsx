import { signUp } from "@/app/actions/auth";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return <SignupForm action={signUp} />;
}
