// Zarul afișat în interfață (doar vizual — valoarea vine din exterior).
// show(null) afișează starea neutră „?”, folosită înainte de fiecare aruncare.

const FACES = {
  1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9],
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

export class DiceView {
  constructor(root) {
    this.root = root;
    root.innerHTML = Array.from({ length: 9 }, (_, i) => `<span class="pip" data-i="${i + 1}"></span>`).join('')
      + '<span class="die-q" aria-hidden="true">?</span>';
    this.pips = [...root.querySelectorAll('.pip')];
    this.animations = true;
    this.rolling = false;
    this.show(null);
  }

  show(value) {
    if (this.rolling) return;
    this.paint(value);
  }

  paint(value) {
    const on = new Set(FACES[value] || []);
    this.pips.forEach((p, i) => p.classList.toggle('on', on.has(i + 1)));
    this.root.classList.toggle('neutral', !value);
    this.root.dataset.value = value ?? '';
  }

  async roll(value) {
    this.rolling = true;
    if (this.animations) {
      this.root.classList.remove('landed');
      this.root.classList.add('rolling');
      const end = performance.now() + 520;
      while (performance.now() < end) {
        this.paint(1 + Math.floor(Math.random() * 6));   // fețe decorative în timpul rostogolirii
        await sleep(65);
      }
      this.root.classList.remove('rolling');
    }
    this.rolling = false;
    this.paint(value);
    if (this.animations) this.root.classList.add('landed');
  }
}
