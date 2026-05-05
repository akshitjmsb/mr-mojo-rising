import AppShell from "@/components/AppShell";
import Header from "@/components/Header";
import TabNav from "@/components/TabNav";
import Footer from "@/components/Footer";
import { queryOne } from "@/lib/queries";
import type { Song } from "@/lib/database.types";

export default async function SongLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const song = await queryOne<Pick<Song, "title" | "artist">>(
    `SELECT title, artist FROM songs WHERE id = ?`,
    [id],
  );

  return (
    <AppShell>
      <Header
        songTitle={song?.title}
        songArtist={song?.artist || undefined}
        backHref="/library"
      />
      <TabNav />
      {children}
      <Footer />
    </AppShell>
  );
}
