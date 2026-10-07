import { signIn } from "@/app/actions/auth";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return <LoginForm action={signIn} />;
}
