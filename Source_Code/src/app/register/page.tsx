import { redirect } from "next/navigation";
import { RegisterForm } from "@/components/auth/RegisterForm";
import { getCurrentUserFromCookies } from "@/lib/auth-server";

export default async function RegisterPage() {
  const user = await getCurrentUserFromCookies();
  if (user) {
    redirect("/");
  }

  return <RegisterForm />;
}
