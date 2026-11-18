import confetti from 'canvas-confetti';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function confettiBurst(colors = ['#2E7D4F', '#FFF8EC', '#E0A100', '#7E1D18']) {
  if (reduced()) return;
  void confetti({ particleCount: 90, spread: 75, startVelocity: 42, origin: { y: 0.6 }, colors, disableForReducedMotion: true });
}

export function confettiWinner(color: string) {
  if (reduced()) return;
  const end = Date.now() + 1600;
  const frame = () => {
    void confetti({ particleCount: 6, angle: 60, spread: 60, origin: { x: 0, y: 0.7 }, colors: [color, '#FFF8EC', '#E0A100'], disableForReducedMotion: true });
    void confetti({ particleCount: 6, angle: 120, spread: 60, origin: { x: 1, y: 0.7 }, colors: [color, '#FFF8EC', '#E0A100'], disableForReducedMotion: true });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}

export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}
