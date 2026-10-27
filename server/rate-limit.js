// Limitare simplă de tip „găleată cu jetoane”: `capacity` acțiuni în rafală, reîncărcare cu `perSecond` pe secundă.

export class TokenBucket {
  constructor(capacity, perSecond, now = () => Date.now()) {
    Object.assign(this, { capacity, perSecond, now, tokens: capacity, last: now() });
  }

  take() {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.perSecond);
    this.last = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** Câte o găleată pentru fiecare cheie (de ex. adresa IP), cu ștergerea celor nefolosite. */
export class KeyedLimiter {
  constructor(capacity, perSecond) {
    Object.assign(this, { capacity, perSecond, buckets: new Map() });
  }

  take(key) {
    let b = this.buckets.get(key);
    if (!b) { b = new TokenBucket(this.capacity, this.perSecond); this.buckets.set(key, b); }
    return b.take();
  }

  prune() {
    const now = Date.now();
    for (const [key, b] of this.buckets) if (now - b.last > 15 * 60_000) this.buckets.delete(key);
  }
}
