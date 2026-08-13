export type VerifiedLeadTab = {
  provider: string;
  track: string;
  url: string;
};

const VERIFIED_LEAD_TABS: Record<string, VerifiedLeadTab> = {
  "345fde6a-1c25-4921-9db1-baf7e8d24ad2": {
    provider: "Songsterr",
    track: "Slash · Lead Acoustic Guitar",
    url: "https://www.songsterr.com/a/wsa/guns-n-roses-patience-tab-s172",
  },
};

export function getVerifiedLeadTab(songId: string) {
  return VERIFIED_LEAD_TABS[songId] ?? null;
}
