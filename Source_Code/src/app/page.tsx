import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/DashboardClient";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { getAllRecipes } from "@/lib/recipes";

export default async function DashboardPage() {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    redirect("/login");
  }

  const recipes = getAllRecipes();

  return <DashboardClient user={user} recipes={recipes} />;
}
