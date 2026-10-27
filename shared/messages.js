// Transformă evenimentele motorului în mesaje în limba română.

export const COLOR_NAMES = { red: 'Roșu', green: 'Verde', yellow: 'Galben', blue: 'Albastru' };

const who = (players, i) => players[i]?.name ?? 'Jucătorul';

export function describeEvent(e, players) {
  switch (e.type) {
    case 'roll':
      return `${who(players, e.player)} a aruncat ${e.value}.`;
    case 'three-sixes':
      return `Al treilea 6 consecutiv! ${who(players, e.player)} nu mai mută în această tură.`;
    case 'no-moves':
      return `${who(players, e.player)} nu are mutări posibile cu ${e.value}. Tura trece mai departe.`;
    case 'no-moves-extra':
      return `Niciun pion nu poate muta cu 6, dar ${who(players, e.player)} aruncă din nou.`;
    case 'extra-roll':
      return `${who(players, e.player)} a dat 6 și mai aruncă o dată.`;
    case 'move': {
      const name = who(players, e.player);
      const n = e.pawn + 1;
      let text;
      if (e.kind === 'enter') text = `${name} a scos pionul ${n} din bază.`;
      else if (e.kind === 'finish') text = `${name} a adus pionul ${n} acasă!`;
      else if (e.kind === 'home') text = `${name} a intrat cu pionul ${n} pe culoarul final.`;
      else text = `${name} a mutat pionul ${n} cu ${e.to - e.from} poziții.`;
      for (const c of e.captures) {
        text += ` L-a trimis în bază pe un pion al lui ${who(players, c.player)}.`;
      }
      return text;
    }
    case 'win':
      return e.byForfeit
        ? `${who(players, e.player)} câștigă — ceilalți jucători au părăsit partida.`
        : `${who(players, e.player)} a câștigat partida!`;
    case 'left':
      return `${e.name} a părăsit partida.`;
    case 'turn':
    default:
      return null;
  }
}
