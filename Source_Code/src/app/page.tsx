import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/DashboardClient";
import { getCurrentUserFromCookies } from "@/lib/auth-server";

export default async function DashboardPage() {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    redirect("/login");
  }

  return <DashboardClient user={user} />;
}
