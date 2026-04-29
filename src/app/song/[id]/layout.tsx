import AppShell from "@/components/AppShell";
import Header from "@/components/Header";
import TabNav from "@/components/TabNav";
import Footer from "@/components/Footer";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function SongLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data: song } = await supabase
    .from("songs")
    .select("title, artist")
    .eq("id", id)
    .maybeSingle();

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
