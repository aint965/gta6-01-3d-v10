// The screenshot scenes behind ?shot=day|sunset|night. Each one stages a fixed
// cinematic camera in the real game — the same world, the same light, no
// special-case rendering — so the frame is what the game really looks like
// from that spot, and the same seed always gives the same frame.

export const SHOTS = {
  // Low over Canal Ward, looking north-east across the canal to the Glasspoint towers.
  day: {
    preset: 'day',
    camera: { pos: [-120, 35, 140], target: [300, 50, -650] },
  },
  // On the beach, looking west-south-west over the sea into the setting sun.
  sunset: {
    preset: 'sunset',
    camera: { pos: [-1500, 12, 400], target: [-2300, 6, 550] },
  },
  // On the beach promenade, looking north along the lamps toward the harbour.
  night: {
    preset: 'night',
    camera: { pos: [-1500, 10, 600], target: [-1480, 8, -400] },
  },
};

/** Camera yaw/pitch (the game's convention) for a camera looking at a target. */
export function lookAtYawPitch(from, target) {
  const dx = target[0] - from[0];
  const dy = target[1] - from[1];
  const dz = target[2] - from[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const yaw = Math.atan2(dx / len, -(dz / len));
  const pitch = Math.asin(dy / len);
  return { yaw, pitch };
}
