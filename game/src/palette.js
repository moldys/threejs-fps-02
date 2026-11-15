// The game's single six-colour palette. Every colour below comes from these
// six, so the whole scene reads as one look. Three.js materials, the HTML UI
// and the bots all reference these values.
export const PALETTE = {
  canvas: '#0d1117', // page background / sky
  surface: '#171e2a', // panels, floors, big walls
  hairline: '#243047', // edges, seams
  ink: '#e9edf4', // text, bright edges
  muted: '#8b96a8', // secondary text
  accent: '#f2b53c', // highlight, gold, crosshair
  danger: '#e05a4e', // RAIDERS red, low health
  good: '#6fc98a', // ECHO green, defuse
  teamB: '#5aa9e6', // ECHO SQUAD blue
};
