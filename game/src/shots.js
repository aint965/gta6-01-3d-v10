// The screenshot scenes behind ?shot=day|sunset|night. Each one stages a fixed
// cinematic camera in the real game — the same world, the same light, no
// special-case rendering — so the frame is what the game really looks like
// from that spot, and the same seed always gives the same frame. Every camera
// sits at street or promenade level, close to the city, so the frame shows
// buildings, streets, trees, parked cars or people in the foreground — never
// a bare ground plane filling the frame.

export const SHOTS = {
  // Street level on the Canal Ward road, looking north-west down the road
  // across the canal, brick facades on the left, the bridge and the canal
  // ahead, parked cars and street trees along the road.
  day: {
    preset: 'day',
    camera: { pos: [0, 7, -40], target: [-200, 10, -380] },
  },
  // On the beach at Sunstrand, close to the water, looking west-south-west
  // over the sea into the setting sun, palms and the lifeguard tower at
  // the frame edges and a bench in the foreground.
  sunset: {
    preset: 'sunset',
    camera: { pos: [-1520, 8, 1150], target: [-2290, 12, 1290] },
  },
  // On the marina promenade, just south of the harbour, looking north along
  // the lamps toward the boats and docks, Pearl Marina's lit windows to
  // the right and the sea to the left.
  night: {
    preset: 'night',
    camera: { pos: [-1440, 6, 300], target: [-1440, 6, -350] },
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
