// Run on localhost /tuner, after one real click anywhere on the page:
// agent-browser eval --stdin < scripts/check-tuner-browser.js
// Synthetic media only: this never requests the physical microphone.
(async () => {
  if (location.hostname !== "localhost" || location.pathname !== "/tuner") throw new Error("Use the local tuner page");
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const until = async predicate => {
    const deadline = performance.now() + 3500;
    while (!predicate()) {
      if (performance.now() > deadline) throw new Error(`Timed out: ${read()}`);
      await sleep(40);
    }
  };
  const read = () => document.querySelector('[aria-label="Current tuning reading"]').textContent;
  const button = name => [...document.querySelectorAll("button")].find(node => node.textContent.trim() === name);
  const click = name => { const node = button(name); if (!node) throw new Error(`Missing ${name}`); node.click(); };
  const assert = (value, name) => { if (!value) throw new Error(name); report.push(name); };
  const original = navigator.mediaDevices.getUserMedia;
  const ctx = new AudioContext();
  const report = [];
  const streams = [];
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = 110;
  gain.gain.value = .08;
  osc.connect(gain);
  osc.start();
  const stream = () => {
    const dest = ctx.createMediaStreamDestination();
    gain.connect(dest);
    streams.push(dest.stream);
    return dest.stream;
  };
  try {
    await Promise.race([ctx.resume(), sleep(1500).then(() => { if (ctx.state !== "running") throw new Error("Click the page first to unlock Web Audio"); })]);
    button("Stop tuner")?.click();
    button("Cancel microphone")?.click();
    await sleep(100);
    click("Auto");
    navigator.mediaDevices.getUserMedia = async () => stream();
    click("Start tuner");
    await until(() => read().includes("In tune"));
    assert(read().includes("A"), "110 Hz identifies A2");
    for (const [name, hz, amplitude, expected] of [
      ["flat", 110 * 2 ** (-15 / 1200), .08, "Tune up"],
      ["sharp", 110 * 2 ** (15 / 1200), .08, "Tune down"],
      ["quiet", 110, .003, "In tune"],
      ["silence", 110, 0, "Listening"],
      ["clipping", 110, 1.4, "Too loud"],
    ]) {
      osc.frequency.value = hz; gain.gain.value = amplitude;
      await until(() => read().includes(expected));
      assert(true, `${name} guidance`);
    }
    gain.gain.value = .08; osc.frequency.value = 329.6276;
    await until(() => read().includes("In tune"));
    document.querySelector('[aria-label="Target E2 string"]').click();
    await until(() => read().includes("Different octave"));
    assert(!read().includes("In tune"), "wrong octave never green");
    click("Auto"); osc.frequency.value = 110;
    await until(() => read().includes("In tune"));

    for (const outcome of ["reject", "resolve"]) {
      click("Stop tuner"); await sleep(100);
      let pending;
      navigator.mediaDevices.getUserMedia = () => new Promise((resolve, reject) => { pending = { resolve, reject }; });
      click("Start tuner"); await until(() => pending);
      click("Cancel microphone"); await sleep(100);
      navigator.mediaDevices.getUserMedia = async () => stream();
      click("Start tuner"); await until(() => read().includes("In tune"));
      if (outcome === "reject") pending.reject(new DOMException("Denied old request", "NotAllowedError"));
      else {
        const late = stream(); pending.resolve(late);
        await until(() => late.getTracks().every(track => track.readyState === "ended"));
      }
      await sleep(150);
      assert(!!button("Stop tuner") && !document.querySelector('[role="alert"]'), `cancelled ${outcome} cannot stop newer session`);
    }

    const track = streams.at(-2).getAudioTracks()[0];
    Object.defineProperty(track, "muted", { configurable: true, value: true });
    track.dispatchEvent(new Event("mute"));
    await until(() => !!button("Reconnect microphone"));
    click("Reconnect microphone");
    await until(() => read().includes("In tune"));
    assert(track.readyState === "ended", "interrupted microphone reconnects and releases old stream");

    click("Stop tuner"); await sleep(100);
    for (const [name, expected] of [["NotAllowedError", "blocked"], ["NotReadableError", "busy"]]) {
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException(name, name); };
      click("Start tuner");
      await until(() => document.querySelector('[role="alert"]')?.textContent.includes(expected));
      assert(!!button("Start tuner"), `${name} allows retry`);
    }
    return report;
  } finally {
    button("Stop tuner")?.click();
    button("Cancel microphone")?.click();
    navigator.mediaDevices.getUserMedia = original;
    streams.forEach(value => value.getTracks().forEach(track => track.stop()));
    osc.stop();
    await ctx.close();
  }
})()
