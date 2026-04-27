import { redirect } from "next/navigation";
import { SettingsClient } from "@/components/settings/SettingsClient";
import { getCurrentUserFromCookies } from "@/lib/auth-server";

export default async function SettingsPage() {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    redirect("/login");
  }

  return <SettingsClient user={user} />;
}
