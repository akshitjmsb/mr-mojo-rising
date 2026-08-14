import assert from "node:assert/strict";
import test from "node:test";
import type { YouTubeSearchResult } from "./intake";
import {
  parseYouTubeSearchHtml,
  pickBestYouTubeMatch,
} from "./youtube-search";

function result(
  videoId: string,
  title: string,
  channel: string,
): YouTubeSearchResult {
  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title,
    channel,
    thumbnail: "",
    durationSeconds: 240,
    durationLabel: "4:00",
  };
}

test("parses playable videos from YouTube initial data without an API key", () => {
  const initialData = {
    contents: [
      {
        videoRenderer: {
          videoId: "GjXWtEqs8I4",
          title: { runs: [{ text: "Muse - Knights of Cydonia" }] },
          ownerText: { runs: [{ text: "Muse" }] },
          lengthText: { simpleText: "6:07" },
          thumbnail: {
            thumbnails: [{ url: "small.jpg" }, { url: "large.jpg" }],
          },
        },
      },
    ],
  };
  const html = `<script>var ytInitialData = ${JSON.stringify(initialData)};</script>`;
  const parsed = parseYouTubeSearchHtml(html);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].videoId, "GjXWtEqs8I4");
  assert.equal(parsed[0].channel, "Muse");
  assert.equal(parsed[0].durationSeconds, 367);
  assert.equal(parsed[0].thumbnail, "large.jpg");
});

test("prefers the artist match over covers and tutorials", () => {
  const candidates = [
    result("aaaaaaaaaaa", "Knights of Cydonia guitar cover tutorial", "Guitar Lab"),
    result("bbbbbbbbbbb", "Muse - Knights of Cydonia (Official Video)", "Muse"),
    result("ccccccccccc", "Knights of Cydonia live", "Festival Channel"),
  ];

  const match = pickBestYouTubeMatch(
    candidates,
    "Knights of Cydonia",
    ["Muse"],
  );

  assert.equal(match?.videoId, "bbbbbbbbbbb");
});
