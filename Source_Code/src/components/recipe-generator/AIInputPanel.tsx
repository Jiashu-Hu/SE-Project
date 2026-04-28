"use client";

import { useState, type ChangeEvent } from "react";
import { compressImage } from "@/lib/image-compress";
import type { CreateRecipePayload } from "@/types/recipe";

interface AIInputPanelProps {
  readonly onGenerated: (recipe: CreateRecipePayload) => void;
}

type Tab = "text" | "image";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AIInputPanel({ onGenerated }: AIInputPanelProps) {
  const [tab, setTab] = useState<Tab>("text");
  const [text, setText] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const { dataUrl, sizeBytes } = await compressImage(file);
      setImageDataUrl(dataUrl);
      setImageSize(sizeBytes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read image.");
      setImageDataUrl(null);
      setImageSize(null);
    }
  }

  async function handleGenerate(): Promise<void> {
    setError(null);
    setIsGenerating(true);
    try {
      const body =
        tab === "text"
          ? { mode: "text", input: text }
          : { mode: "image", input: imageDataUrl ?? "" };

      const response = await fetch("/api/recipes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error ?? "Generation failed.");
        return;
      }
      onGenerated(json.recipe as CreateRecipePayload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setIsGenerating(false);
    }
  }

  const canGenerate =
    !isGenerating &&
    (tab === "text" ? text.trim().length > 0 : imageDataUrl !== null);

  return (
    <section className="rounded-2xl border border-orange-200 bg-orange-50/50 p-6 dark:border-orange-900/40 dark:bg-orange-950/20">
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
        ✨ Generate with AI
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Describe the ingredients you have, or upload a photo of them.
      </p>

      <div className="mt-4 inline-flex rounded-lg border border-zinc-300 bg-white p-1 dark:border-zinc-700 dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setTab("text")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "text"
              ? "bg-orange-600 text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          Text
        </button>
        <button
          type="button"
          onClick={() => setTab("image")}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === "image"
              ? "bg-orange-600 text-white"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          }`}
        >
          Image
        </button>
      </div>

      <div className="mt-4">
        {tab === "text" ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="What ingredients do you have? E.g., 'chicken thighs, rice, soy sauce, garlic'."
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-orange-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        ) : (
          <div className="space-y-3">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="block w-full text-sm text-zinc-600 file:mr-4 file:rounded-md file:border-0 file:bg-orange-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-orange-700 dark:text-zinc-400"
            />
            {imageDataUrl && imageSize !== null && (
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageDataUrl}
                  alt="Selected ingredient photo"
                  className="h-24 w-24 rounded-lg object-cover"
                />
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Photo: {formatBytes(imageSize)}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleGenerate}
        disabled={!canGenerate}
        className="mt-4 rounded-lg bg-orange-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isGenerating ? "Generating..." : "Generate"}
      </button>
    </section>
  );
}
