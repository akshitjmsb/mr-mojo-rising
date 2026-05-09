import type { Theme } from "./types";

export interface ImportStage {
  title: string;
  subtitle: string;
  start: number;
}

export interface ImportStep {
  num: string;
  text: string;
}

export interface ThemeContent {
  label: string;
  hero: { lineOne: string; lineTwo: string; subtitle: string };
  importStages: ImportStage[];
  importQuotes: string[];
  importSteps: ImportStep[];
  searchHero: { title: string; subtitle: string };
  searchQuotes: string[];
  shareTip: string;
  errors: { mainTitle: string; songTitle: string; processingFallback: string };
}

const SHARED_STEPS: ImportStep[] = [
  { num: "I", text: "Paste a YouTube link to any song" },
  { num: "II", text: "We separate the guitar stem using AI" },
  { num: "III", text: "Sections are detected automatically" },
  { num: "IV", text: "Loop any section at any speed and practice" },
];

export const THEME_CONTENT: Record<Theme, ThemeContent> = {
  doors: {
    label: "Doors",
    hero: {
      lineOne: "Break on through",
      lineTwo: "to the other side.",
      subtitle:
        "Paste a YouTube link. We'll isolate the guitar, detect the sections, and let you practice at any speed.",
    },
    importStages: [
      { title: "Lighting the fire...", subtitle: "Validating & queuing your song", start: 0 },
      { title: "Riding the highway...", subtitle: "Downloading audio from YouTube", start: 5 },
      { title: "Breaking on through...", subtitle: "Separating guitar from the mix", start: 20 },
      { title: "Mapping the strange days...", subtitle: "Detecting song sections", start: 90 },
      { title: "Decoding the crystal ship...", subtitle: "Analyzing chord progressions", start: 130 },
      { title: "Whispering the words...", subtitle: "Fetching synced lyrics", start: 170 },
      { title: "The doors are open.", subtitle: "Ready to play", start: Infinity },
    ],
    importQuotes: [
      "The time to hesitate is through...",
      "There's danger on the edge of town...",
      "Can you give me sanctuary?",
      "Let it roll, baby, roll...",
      "Keep your eyes on the road, your hands upon the wheel...",
      "The future's uncertain and the end is always near...",
      "I found an island in your arms, a country in your eyes...",
      "People are strange when you're a stranger...",
      "No one here gets out alive...",
      "We could plan a murder, or start a religion...",
      "I am the Lizard King. I can do anything...",
      "This is the end, beautiful friend...",
    ],
    importSteps: SHARED_STEPS,
    searchHero: {
      title: "Find a song.",
      subtitle: "Search YouTube, or paste a YouTube or Spotify link.",
    },
    searchQuotes: [
      "Riders on the storm...",
      "Light my fire...",
      "Break on through...",
      "People are strange...",
      "Love me two times...",
      "Touch me, babe...",
    ],
    shareTip:
      'Share a song from YouTube or Spotify on your iPhone and pick "Mr. Mojo Rising" to add it here automatically.',
    errors: {
      mainTitle: "Something broke on through.",
      songTitle: "The music’s over.",
      processingFallback:
        "The music's over... Processing failed. Please try again.",
    },
  },

  eagles: {
    label: "Eagles",
    hero: {
      lineOne: "Take it easy.",
      lineTwo: "Find a peaceful, easy feeling.",
      subtitle:
        "Paste a YouTube link. We'll pull the guitar out of the mix, mark the road signs, and let you ride it at any speed.",
    },
    importStages: [
      { title: "Saddling up...", subtitle: "Validating & queuing your song", start: 0 },
      { title: "Already gone...", subtitle: "Downloading audio from YouTube", start: 5 },
      { title: "Taking it to the limit...", subtitle: "Separating guitar from the mix", start: 20 },
      { title: "Reading the road signs...", subtitle: "Detecting song sections", start: 90 },
      { title: "Tequila sunrise harmonies...", subtitle: "Analyzing chord progressions", start: 130 },
      { title: "Catching the desert lyric...", subtitle: "Fetching synced lyrics", start: 170 },
      { title: "Peaceful, easy feeling.", subtitle: "Ready to play", start: Infinity },
    ],
    importQuotes: [
      "I'm a-runnin' down the road tryin' to loosen my load...",
      "Standing on a corner in Winslow, Arizona...",
      "On a dark desert highway, cool wind in my hair...",
      "Welcome to the Hotel California...",
      "Such a lovely place, such a lovely face...",
      "You can't hide your lyin' eyes...",
      "Already gone, and I'm feelin' strong...",
      "Take it to the limit one more time...",
      "Desperado, why don't you come to your senses?",
      "Witchy woman, see how high she flies...",
      "I get a peaceful, easy feeling...",
      "And I know you won't let me down.",
    ],
    importSteps: SHARED_STEPS,
    searchHero: {
      title: "Find a song.",
      subtitle: "Search YouTube, or paste a YouTube or Spotify link.",
    },
    searchQuotes: [
      "Take it easy...",
      "Already gone...",
      "Hotel California...",
      "Tequila sunrise...",
      "Lyin' eyes...",
      "Desperado...",
    ],
    shareTip:
      'Share a song from YouTube or Spotify on your iPhone and pick "Mr. Mojo Rising" to add it here automatically.',
    errors: {
      mainTitle: "Something’s runnin’ down the road.",
      songTitle: "And the highway runs out.",
      processingFallback:
        "Took it past the limit. Processing failed. Please try again.",
    },
  },
};

export function getThemeContent(theme: Theme): ThemeContent {
  return THEME_CONTENT[theme];
}
