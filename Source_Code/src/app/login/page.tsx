import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getCurrentUserFromCookies } from "@/lib/auth-server";

interface LoginPageProps {
  readonly searchParams: Promise<{ next?: string | readonly string[] }>;
}

function getSafeNextPath(nextValue: string | readonly string[] | undefined): string {
  if (typeof nextValue !== "string") {
    return "/";
  }

  if (!nextValue.startsWith("/") || nextValue.startsWith("//")) {
    return "/";
  }

  return nextValue;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUserFromCookies();
  if (user) {
    redirect("/");
  }

  const resolvedSearchParams = await searchParams;
  const nextPath = getSafeNextPath(resolvedSearchParams.next);

  return <LoginForm nextPath={nextPath} />;
}
