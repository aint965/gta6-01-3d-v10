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
  // Stage B: daytime drive. The player sits in a coupe on the South Market
  // road, facing south down the road; the camera stands behind and right
  // of the car, looking down the road through the traffic.
  driveDay: {
    preset: 'day',
    camera: { pos: [248, 5, 318], target: [234, 2, 240] },
    car: { profile: 'coupe', x: 240, z: 300, angle: 0, color: [0.85, 0.35, 0.28] },
    advance: 8,
  },
  // Stage B: night drive with headlights. The player sits in a sedan on the
  // Glasspoint road, facing north; the camera stands behind the car, close
  // enough that the car fills the frame and the headlight pool on the road
  // ahead of it reads clearly.
  driveNight: {
    preset: 'night',
    camera: { pos: [480, 5, 14], target: [480, 1, -40] },
    car: { profile: 'sedan', x: 480, z: 0, angle: Math.PI, color: [0.22, 0.56, 0.6] },
    advance: 8,
  },
  // Stage B: a red signal. The camera stands west of the Canal Ward
  // junction, looking east into the signal head's lamps, with the cars
  // stopped at the red in the foreground; the signal is forced red at
  // capture time and the traffic has run for 38 seconds, so a car is
  // waiting at the stop line.
  signal: {
    preset: 'day',
    camera: { pos: [-25, 5, -348], target: [0, 4, -360] },
    signalRed: 0,
    advance: 38,
  },
  // Stage C: verification shots only — never added to screenshots/ (the
  // dossier caps the game at four). Mission 2 in progress: Mara stands on
  // the harbour road, the gold beacon marking the dock ledger 40 m ahead,
  // the basin and the docks beyond it.
  missionHarbour: {
    preset: 'day',
    camera: { pos: [-1255, 8, 165], target: [-1255, 3, 80] },
    mission: 2,
    mara: [-1255, 140],
    maraYaw: 0,
    advance: 8,
  },
  // Stage C: verification shot only. Mission 3 in progress: Mara has
  // collected Oren's witness statement and Oren walks behind her on the
  // Canal Ward road, heading for the civic park archive.
  missionEscort: {
    preset: 'day',
    camera: { pos: [8, 6, 420], target: [0, 2, 300] },
    mission: 3,
    mara: [0, 380],
    maraYaw: 0,
    collect: true,
    advance: 8,
  },
  // Stage D: verification shots only — never added to screenshots/ (the
  // dossier caps the game at four). Mission 5 in progress: Mara has
  // activated the first relay stop and stands at the second one in
  // Citrus Quarter, the gold beacon ahead and the relay package in hand.
  missionRelay: {
    preset: 'day',
    // Closer and higher than the Stage D staging: the camera stands 16 m
    // from Mara at 6 units up, so she reads at ~60 px beside the gold
    // beacon instead of a speck over a bare plaza, and the dark building
    // corner that crowded the old frame's left edge is out of shot.
    camera: { pos: [1184, 6, 634], target: [1199, 4, 606] },
    mission: 5,
    mara: [480, 360],
    maraYaw: 0,
    collect: true,
    maraTo: [1196, 620],
    advance: 8,
  },
  // Stage D: verification shot only. The finale broadcast: the whole story
  // is complete and the archive is broadcasting — the overlay shows the
  // entry on screen while Mara stands in the civic park.
  finale: {
    preset: 'sunset',
    camera: { pos: [-960, 7, -980], target: [-1000, 2, -1080] },
    finale: true,
    mara: [-1000, -1040],
    maraYaw: 0,
    advance: 8,
  },
  // Stage F: verification shots only — never added to screenshots/ (the
  // dossier caps the game at four). A police pursuit at 3 stars: Mara in
  // the coupe on the South Market road, patrol cars closing in, a
  // roadblock forming ahead.
  policePursuit: {
    preset: 'day',
    // The camera sits 10 m behind patrol 0 so the closing patrol car is
    // fully in frame at the bottom (at 4 m it was clipped by the corner).
    camera: { pos: [248, 6, 324], target: [234, 2, 240] },
    // Facing north, away from the camera: the coupe's rear is to the
    // camera, patrol 0 closes in between camera and coupe, patrol 1 waits
    // ahead up the road. (Facing south put patrol 1 behind the camera and
    // patrol 0 on the far side of the coupe, half hidden.)
    car: { profile: 'coupe', x: 240, z: 300, angle: Math.PI, color: [0.85, 0.35, 0.28] },
    police: { stars: 3 },
    advance: 8,
  },
  // Stage E: verification shot only. The South Market garage, bought, with
  // the starter coupe parked in its bay.
  garage: {
    preset: 'day',
    garage: 0,
    advance: 2,
  },
  // Stage E: verification shot only. Glasspoint at night: the tallest
  // tower's lit office panes and crown against the dark facade.
  glasspoint: {
    preset: 'night',
    camera: { pos: [1595, 8, -1075], target: [1595, 60, -1150] },
    advance: 8,
  },
  // Stage F, final shot 1 — the title cover: the aerial camera at a fixed
  // moment over the live city at midday, with the title overlay (logo +
  // menu) on top of it. Midday, not sunset: at sunset the whole city sits
  // deep in the orange haze and reads as flat dark shapes, while the
  // midday aerial shows the limestone streets and the teal sea. The camera
  // comes from titleCameraAt, not a fixed pose, so the frame is the real
  // title screen.
  title: {
    preset: 'day',
    titleShot: true,
    titleTime: 8,
    advance: 8,
  },
  // Stage F, final shot 4 — a moonlit pursuit: the coupe at night on the
  // South Market road, headlights on, patrol cars closing in, the warrant
  // stars in the HUD. Same staging as the day pursuit, at night.
  nightPursuit: {
    preset: 'night',
    camera: { pos: [248, 6, 324], target: [234, 2, 240] },
    car: { profile: 'coupe', x: 240, z: 300, angle: Math.PI, color: [0.85, 0.35, 0.28] },
    police: { stars: 3 },
    advance: 8,
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
