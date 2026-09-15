import AppShell from "@/components/AppShell";
import Header from "@/components/Header";
import TabNav from "@/components/TabNav";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <Header />
      <TabNav />
      {children}
    </AppShell>
  );
}
