import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/DashboardClient";
import { getCurrentUserFromCookies } from "@/lib/auth-server";
import { getRecipesByAuthor } from "@/lib/recipes";

export default async function DashboardPage() {
  const user = await getCurrentUserFromCookies();

  if (!user) {
    redirect("/login");
  }

  const recipes = await getRecipesByAuthor(user.id);

  return <DashboardClient user={user} recipes={recipes} />;
}
