export type LeadTabReference = {
  provider: string;
  track: string;
  url: string;
  trust: "community-reference";
};

// These links are useful comparison material, not Mojo-verified notation.
// Never use their existence to pass the in-app accuracy gate.
const LEAD_TAB_REFERENCES: Record<string, LeadTabReference> = {
  "345fde6a-1c25-4921-9db1-baf7e8d24ad2": {
    provider: "Songsterr",
    track: "Slash · Lead Acoustic Guitar",
    url: "https://www.songsterr.com/a/wsa/guns-n-roses-patience-tab-s172",
    trust: "community-reference",
  },
};

export function getLeadTabReference(songId: string) {
  return LEAD_TAB_REFERENCES[songId] ?? null;
}
