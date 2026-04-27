"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { AuthUser } from "@/types/auth";

interface SettingsClientProps {
  readonly user: AuthUser;
}

export function SettingsClient({ user }: SettingsClientProps) {
  const router = useRouter();
  const [savedName, setSavedName] = useState(user.name);
  const [savedEmail, setSavedEmail] = useState(user.email);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const createdAt = new Date(user.createdAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  async function handleProfileSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setIsSavingProfile(true);
    setProfileError(null);
    setProfileSuccess(null);

    try {
      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email }),
      });

      const body = (await response.json()) as { error?: string; user?: AuthUser };
      if (!response.ok) {
        setProfileError(body.error ?? "Unable to update your profile.");
        setIsSavingProfile(false);
        return;
      }

      if (body.user) {
        setSavedName(body.user.name);
        setSavedEmail(body.user.email);
        setName(body.user.name);
        setEmail(body.user.email);
      }

      setProfileSuccess("Profile updated.");
      router.refresh();
    } catch {
      setProfileError("Unable to update your profile.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setIsChangingPassword(true);
    setPasswordError(null);
    setPasswordSuccess(null);

    try {
      const response = await fetch("/api/auth/profile/password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        setPasswordError(body.error ?? "Unable to change your password.");
        setIsChangingPassword(false);
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setPasswordSuccess("Password changed.");
    } catch {
      setPasswordError("Unable to change your password.");
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function handleLogout(): Promise<void> {
    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        setLogoutError("Unable to log out. Please try again.");
        setIsLoggingOut(false);
        return;
      }

      router.push("/login");
      router.refresh();
    } catch {
      setLogoutError("Unable to log out. Please try again.");
      setIsLoggingOut(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-10 dark:bg-zinc-950">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-orange-600">
              Account
            </p>
            <h1 className="mt-2 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
              Settings
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Review your profile details and update your sign-in credentials.
            </p>
          </div>

          <Link
            href="/"
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:text-zinc-100"
          >
            Back to dashboard
          </Link>
        </div>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Profile information
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Keep your account details up to date.
          </p>

          <dl className="mt-6 grid gap-4 rounded-xl bg-zinc-50 p-4 text-sm dark:bg-zinc-950 sm:grid-cols-3">
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Current name</dt>
              <dd className="mt-1 font-medium text-zinc-900 dark:text-zinc-50">
                {savedName}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Current email</dt>
              <dd className="mt-1 font-medium text-zinc-900 dark:text-zinc-50">
                {savedEmail}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500 dark:text-zinc-400">Member since</dt>
              <dd className="mt-1 font-medium text-zinc-900 dark:text-zinc-50">{createdAt}</dd>
            </div>
          </dl>

          <form className="mt-6 space-y-4" onSubmit={handleProfileSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="settings-name"
                  className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Name
                </label>
                <input
                  id="settings-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>

              <div>
                <label
                  htmlFor="settings-email"
                  className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Email
                </label>
                <input
                  id="settings-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
            </div>

            {profileError && (
              <p className="text-sm font-medium text-red-600" role="alert">
                {profileError}
              </p>
            )}
            {profileSuccess && (
              <p className="text-sm font-medium text-green-600" role="status">
                {profileSuccess}
              </p>
            )}

            <button
              type="submit"
              disabled={isSavingProfile}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSavingProfile ? "Saving..." : "Save profile"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Change password
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Confirm your current password before setting a new one.
          </p>

          <form className="mt-6 space-y-4" onSubmit={handlePasswordSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="current-password"
                  className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Current password
                </label>
                <input
                  id="current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  required
                  className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>

              <div>
                <label
                  htmlFor="new-password"
                  className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  className="w-full rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                />
              </div>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Use at least 8 characters with uppercase, lowercase, and a number.
            </p>

            {passwordError && (
              <p className="text-sm font-medium text-red-600" role="alert">
                {passwordError}
              </p>
            )}
            {passwordSuccess && (
              <p className="text-sm font-medium text-green-600" role="status">
                {passwordSuccess}
              </p>
            )}

            <button
              type="submit"
              disabled={isChangingPassword}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {isChangingPassword ? "Updating..." : "Update password"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            Session
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            End the current session on this device.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:border-red-300 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/60"
            >
              {isLoggingOut ? "Logging out..." : "Logout"}
            </button>

            {logoutError && (
              <p className="text-sm font-medium text-red-600" role="alert">
                {logoutError}
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
