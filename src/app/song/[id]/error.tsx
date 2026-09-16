"use client";
import LoadError from "@/components/LoadError";
import { useTheme } from "@/lib/theme/ThemeProvider";
export default function SongError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { content } = useTheme();
  return <LoadError error={error} reset={reset} title={content.errors.songTitle} />;
}
