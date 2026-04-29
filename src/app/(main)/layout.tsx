import AppShell from "@/components/AppShell";
import Header from "@/components/Header";
import TabNav from "@/components/TabNav";
import Footer from "@/components/Footer";

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
      <Footer />
    </AppShell>
  );
}
