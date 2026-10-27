// Zar corect 1..6 folosind generatorul criptografic (browser și Node).
// Eșantionare cu respingere, ca toate valorile să fie la fel de probabile.
export function rollDie() {
  const buf = new Uint8Array(1);
  do { globalThis.crypto.getRandomValues(buf); } while (buf[0] >= 252);
  return (buf[0] % 6) + 1;
}
