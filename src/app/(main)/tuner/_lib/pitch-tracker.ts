/** Keep a quiet decay visible briefly, but never call stale audio stable. */
export class PitchTracker {
  private history: number[] = [];
  private frequency: number | null = null;
  private acceptedAt = -Infinity;

  reset() {
    this.history = [];
    this.frequency = null;
    this.acceptedAt = -Infinity;
  }

  update(frequency: number | null, now: number) {
    const fresh =
      frequency !== null && Number.isFinite(frequency) && frequency > 0;
    if (fresh) {
      if (
        now - this.acceptedAt > 120 ||
        (this.frequency !== null &&
          Math.abs(1200 * Math.log2(frequency / this.frequency)) > 120)
      )
        this.history = [];
      this.history.push(frequency);
      if (this.history.length > 5) this.history.shift();
      const sorted = [...this.history].sort((a, b) => a - b);
      this.frequency = sorted[Math.floor(sorted.length / 2)];
      this.acceptedAt = now;
    } else {
      // Stability requires consecutive good frames, not a collection of
      // unrelated plucks separated by silence or an interruption.
      this.history = [];
      if (now - this.acceptedAt > 250) this.frequency = null;
    }
    const stable =
      fresh &&
      this.frequency !== null &&
      this.history.length >= 4 &&
      this.history.every(
        (value) => Math.abs(1200 * Math.log2(value / this.frequency!)) <= 6,
      );
    return { frequency: this.frequency, stable };
  }
}
