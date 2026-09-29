// Données du système solaire (unités : km, km³/s², jours, degrés)
// Éléments képlériens des planètes : JPL « Approximate Positions of the Planets » (J2000, écliptique)

export const AU = 149597870.7;
export const C = 299792.458; // km/s
export const G = 6.674e-20;  // km³/(kg·s²)

// Masse estimée d'un petit corps à partir de son rayon et d'une densité (g/cm³)
const gmFromRadius = (r, rho = 1.6) => G * (4 / 3) * Math.PI * r ** 3 * rho * 1e12;

export const SUN = {
  id: 'sun', name: 'Soleil', type: 'Étoile', radius: 696000, gm: 1.32712440018e11,
  rotation: 609.12, pole: [286.13, 63.87], look: 'sun',
  info: 'Étoile de type G2V. Contient 99,86 % de la masse du système solaire. Température de surface : 5 772 K.',
};

// a (UA), e, I, L, ϖ, Ω  + taux par siècle
export const PLANETS = [
  {
    id: 'mercury', name: 'Mercure', type: 'Planète tellurique', radius: 2439.7, gm: 22032.09,
    rotation: 1407.6, pole: [281.01, 61.42], look: 'mercury',
    el: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
    rate: [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
    info: 'Plus petite planète et la plus proche du Soleil. Une année y dure 88 jours.',
  },
  {
    id: 'venus', name: 'Vénus', type: 'Planète tellurique', radius: 6051.8, gm: 324858.59,
    rotation: -5832.5, pole: [272.76, 67.16], look: 'venus', atmosphere: [1.0, 0.85, 0.55, 0.9],
    el: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
    rate: [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
    info: 'Atmosphère épaisse de CO₂, effet de serre extrême : 464 °C en surface. Rotation rétrograde.',
  },
  {
    id: 'earth', name: 'Terre', type: 'Planète tellurique', radius: 6371, gm: 398600.44,
    rotation: 23.9345, pole: [0, 90], look: 'earth', atmosphere: [0.35, 0.6, 1.0, 1.0], clouds: true,
    el: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
    rate: [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
    info: 'Notre planète. Seul monde connu abritant la vie. Point de départ de la mission.',
  },
  {
    id: 'mars', name: 'Mars', type: 'Planète tellurique', radius: 3389.5, gm: 42828.37,
    rotation: 24.6229, pole: [317.68, 52.89], look: 'mars', atmosphere: [1.0, 0.6, 0.4, 0.35],
    el: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
    rate: [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
    info: 'La planète rouge. Abrite Olympus Mons, le plus grand volcan connu du système solaire.',
  },
  {
    id: 'jupiter', name: 'Jupiter', type: 'Géante gazeuse', radius: 69911, gm: 126686534,
    rotation: 9.925, pole: [268.06, 64.50], look: 'jupiter', atmosphere: [0.9, 0.8, 0.65, 0.5],
    el: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
    rate: [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
    rings: { inner: 92000, outer: 226000, style: 'jupiter' },
    info: 'La plus grande planète : 318 masses terrestres. Sa Grande Tache rouge est une tempête plus large que la Terre.',
  },
  {
    id: 'saturn', name: 'Saturne', type: 'Géante gazeuse', radius: 58232, gm: 37931187,
    rotation: 10.656, pole: [40.59, 83.54], look: 'saturn', atmosphere: [0.95, 0.85, 0.6, 0.5],
    el: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
    rate: [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
    rings: { inner: 66900, outer: 140500, style: 'saturn' },
    info: 'Célèbre pour ses anneaux de glace, larges de 280 000 km mais épais de quelques dizaines de mètres.',
  },
  {
    id: 'uranus', name: 'Uranus', type: 'Géante de glaces', radius: 25362, gm: 5793939,
    rotation: -17.24, pole: [257.31, -15.18], look: 'uranus', atmosphere: [0.6, 0.9, 1.0, 0.6],
    el: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
    rate: [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
    rings: { inner: 41800, outer: 51600, style: 'uranus' },
    info: 'Couchée sur le côté : son axe est incliné de 98°. Atmosphère d’hydrogène, d’hélium et de méthane.',
  },
  {
    id: 'neptune', name: 'Neptune', type: 'Géante de glaces', radius: 24622, gm: 6836529,
    rotation: 16.11, pole: [299.36, 43.46], look: 'neptune', atmosphere: [0.4, 0.6, 1.0, 0.7],
    el: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
    rate: [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664],
    rings: { inner: 41000, outer: 63500, style: 'neptune' },
    info: 'Planète la plus éloignée. Les vents les plus rapides du système solaire : plus de 2 000 km/h.',
  },
  {
    id: 'pluto', name: 'Pluton', type: 'Planète naine', radius: 1188.3, gm: 869.6,
    rotation: -153.29, pole: [132.99, -6.16], look: 'pluto',
    el: [39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
    rate: [-0.00031596, 0.00005170, 0.00004818, 145.20780515, -0.04062942, -0.01183482],
    info: 'Planète naine de la ceinture de Kuiper. Son cœur glacé en forme de cœur s’appelle Tombaugh Regio.',
  },
];

// Petits corps héliocentriques : a (UA), e, i, Ω, ω, M0 (à J2000), période calculée
export const MINOR = [
  { id: 'ceres', name: 'Cérès', type: 'Planète naine', radius: 469.7, gm: 62.63, rotation: 9.07, look: 'ceres',
    kep: [2.7675, 0.0758, 10.59, 80.33, 73.6, 6.07],
    info: 'Plus grand objet de la ceinture d’astéroïdes. Possède des dépôts de sels brillants (cratère Occator).' },
  { id: 'vesta', name: 'Vesta', type: 'Astéroïde', radius: 262.7, gm: 17.29, rotation: 5.34, look: 'rock', irregular: 0.12,
    kep: [2.3615, 0.0887, 7.14, 103.85, 151.2, 341.0],
    info: 'Deuxième plus massif astéroïde. Visité par la sonde Dawn en 2011.' },
  { id: 'pallas', name: 'Pallas', type: 'Astéroïde', radius: 256, gm: 13.63, rotation: 7.81, look: 'rock', irregular: 0.1,
    kep: [2.7730, 0.2305, 34.84, 173.08, 310.05, 352.9],
    info: 'Astéroïde à l’orbite très inclinée (35°).' },
  { id: 'hygiea', name: 'Hygie', type: 'Astéroïde', radius: 217, gm: 5.78, rotation: 13.8, look: 'rock', irregular: 0.05,
    kep: [3.1415, 0.1146, 3.83, 283.2, 312.3, 150.0],
    info: 'Quatrième plus grand corps de la ceinture principale, presque sphérique.' },
  { id: 'halley', name: 'Comète de Halley', type: 'Comète', radius: 5.5, gm: 1.5e-5, rotation: 52.8, look: 'comet', irregular: 0.35, comet: true,
    kep: [17.834, 0.96714, 162.26, 58.42, 111.33, null], perihelion: Date.UTC(1986, 1, 9),
    info: 'Comète périodique (76 ans). Dernier passage en 1986, prochain en 2061.' },
];

// Lunes : [nom, rayon km, demi-grand axe km, période j, e, inclinaison °, look, GM optionnel]
// inclinaison > 90° = orbite rétrograde
const M = (id, name, radius, a, period, e = 0, inc = 0, look = 'rock', extra = {}) =>
  ({ id, name, radius, a, period, e, inc, look, ...extra });

export const MOONS = {
  earth: [
    M('moon', 'Lune', 1737.4, 384400, 27.321661, 0.0549, 5.145, 'moon',
      { gm: 4902.8, ecliptic: true, info: 'Seul satellite naturel de la Terre. Toujours la même face tournée vers nous.' }),
  ],
  mars: [
    M('phobos', 'Phobos', 11.1, 9376, 0.31891, 0.0151, 1.08, 'rock', { irregular: 0.3, info: 'Lune en forme de patate, se rapproche de Mars de 2 m par siècle.' }),
    M('deimos', 'Déimos', 6.2, 23463, 1.26244, 0.0003, 1.79, 'rock', { irregular: 0.3, info: 'La plus petite des deux lunes de Mars.' }),
  ],
  jupiter: [
    M('metis', 'Métis', 21.5, 128000, 0.2948, 0.0002, 0.06, 'rock', { irregular: 0.3 }),
    M('adrastea', 'Adrastée', 8.2, 129000, 0.2983, 0.0015, 0.03, 'rock', { irregular: 0.3 }),
    M('amalthea', 'Amalthée', 83.5, 181366, 0.498179, 0.0032, 0.37, 'redrock', { irregular: 0.3, info: 'Lune la plus rouge du système solaire.' }),
    M('thebe', 'Thébé', 49.3, 221889, 0.6745, 0.0175, 1.08, 'rock', { irregular: 0.25 }),
    M('io', 'Io', 1821.6, 421700, 1.769138, 0.0041, 0.05, 'io', { gm: 5959.9, info: 'Le corps le plus volcanique du système solaire : plus de 400 volcans actifs.' }),
    M('europa', 'Europe', 1560.8, 671034, 3.551181, 0.009, 0.47, 'europa', { gm: 3202.7, info: 'Sous sa croûte de glace se cache un océan d’eau liquide.' }),
    M('ganymede', 'Ganymède', 2634.1, 1070412, 7.154553, 0.0013, 0.2, 'ganymede', { gm: 9887.8, info: 'Plus grande lune du système solaire, plus grande que Mercure.' }),
    M('callisto', 'Callisto', 2410.3, 1882709, 16.689018, 0.0074, 0.19, 'callisto', { gm: 7179.3, info: 'Surface la plus cratérisée du système solaire.' }),
    M('leda', 'Léda', 10, 11165000, 240.9, 0.164, 27.5, 'rock', { irregular: 0.3 }),
    M('himalia', 'Himalia', 85, 11461000, 250.56, 0.162, 27.5, 'rock', { irregular: 0.2 }),
    M('lysithea', 'Lysithéa', 18, 11717000, 259.2, 0.112, 28.3, 'rock', { irregular: 0.3 }),
    M('elara', 'Élara', 43, 11741000, 259.6, 0.217, 26.6, 'rock', { irregular: 0.25 }),
    M('ananke', 'Ananké', 14, 21276000, 629.8, 0.244, 148.9, 'rock', { irregular: 0.3 }),
    M('carme', 'Carmé', 23, 23404000, 734.2, 0.253, 164.9, 'rock', { irregular: 0.3 }),
    M('pasiphae', 'Pasiphaé', 30, 23624000, 743.6, 0.409, 151.4, 'rock', { irregular: 0.3 }),
    M('sinope', 'Sinopé', 19, 23939000, 758.9, 0.25, 158.1, 'rock', { irregular: 0.3 }),
  ],
  saturn: [
    M('pan', 'Pan', 14, 133584, 0.575, 0, 0, 'ice', { irregular: 0.35 }),
    M('atlas', 'Atlas', 15, 137670, 0.6019, 0.0012, 0.003, 'ice', { irregular: 0.35 }),
    M('prometheus', 'Prométhée', 43, 139380, 0.613, 0.0022, 0.008, 'ice', { irregular: 0.3 }),
    M('pandora', 'Pandore', 40, 141720, 0.6285, 0.0042, 0.05, 'ice', { irregular: 0.3 }),
    M('epimetheus', 'Épiméthée', 58, 151422, 0.6942, 0.0098, 0.35, 'ice', { irregular: 0.25 }),
    M('janus', 'Janus', 89, 151472, 0.6945, 0.0068, 0.16, 'ice', { irregular: 0.2 }),
    M('mimas', 'Mimas', 198.2, 185539, 0.942422, 0.0196, 1.57, 'ice', { info: 'Son immense cratère Herschel lui donne un air d’Étoile de la Mort.' }),
    M('enceladus', 'Encelade', 252.1, 237948, 1.370218, 0.0047, 0.01, 'enceladus', { info: 'Des geysers d’eau jaillissent de son pôle sud et alimentent l’anneau E.' }),
    M('tethys', 'Téthys', 531.1, 294619, 1.887802, 0.0001, 1.09, 'ice'),
    M('dione', 'Dioné', 561.4, 377396, 2.736915, 0.0022, 0.02, 'ice'),
    M('rhea', 'Rhéa', 763.8, 527108, 4.518212, 0.0013, 0.35, 'ice'),
    M('titan', 'Titan', 2574.7, 1221870, 15.945, 0.0288, 0.33, 'titan', { gm: 8978.1, atmosphere: [1.0, 0.7, 0.3, 1.0], info: 'Seule lune dotée d’une atmosphère dense. Lacs de méthane liquide.' }),
    M('hyperion', 'Hypérion', 135, 1500934, 21.276, 0.1230, 0.43, 'sponge', { irregular: 0.3, info: 'Aspect d’éponge, rotation chaotique.' }),
    M('iapetus', 'Japet', 734.5, 3560820, 79.3215, 0.0286, 15.47, 'iapetus', { info: 'Deux faces : l’une blanche comme la neige, l’autre noire comme le charbon.' }),
    M('phoebe', 'Phœbé', 106.5, 12947780, 550.31, 0.1562, 175.3, 'rock', { irregular: 0.15 }),
  ],
  uranus: [
    M('cordelia', 'Cordélia', 20, 49770, 0.335, 0.0003, 0.08, 'darkice', { irregular: 0.3 }),
    M('ophelia', 'Ophélie', 21, 53790, 0.376, 0.0099, 0.1, 'darkice', { irregular: 0.3 }),
    M('bianca', 'Bianca', 26, 59170, 0.435, 0.0009, 0.19, 'darkice', { irregular: 0.3 }),
    M('cressida', 'Cressida', 40, 61780, 0.464, 0.0004, 0.01, 'darkice', { irregular: 0.3 }),
    M('desdemona', 'Desdémone', 32, 62680, 0.474, 0.0001, 0.11, 'darkice', { irregular: 0.3 }),
    M('juliet', 'Juliette', 47, 64350, 0.493, 0.0007, 0.07, 'darkice', { irregular: 0.3 }),
    M('portia', 'Portia', 68, 66090, 0.513, 0.0001, 0.06, 'darkice', { irregular: 0.25 }),
    M('rosalind', 'Rosalinde', 36, 69940, 0.558, 0.0001, 0.28, 'darkice', { irregular: 0.3 }),
    M('belinda', 'Belinda', 45, 75260, 0.624, 0.0001, 0.03, 'darkice', { irregular: 0.3 }),
    M('puck', 'Puck', 81, 86004, 0.7618, 0.0001, 0.32, 'darkice', { irregular: 0.15 }),
    M('miranda', 'Miranda', 235.8, 129390, 1.413479, 0.0013, 4.34, 'miranda', { info: 'Surface chaotique avec des falaises de 20 km, les plus hautes connues.' }),
    M('ariel', 'Ariel', 578.9, 191020, 2.520379, 0.0012, 0.04, 'ice'),
    M('umbriel', 'Umbriel', 584.7, 266000, 4.144177, 0.0039, 0.13, 'darkice'),
    M('titania', 'Titania', 788.4, 435910, 8.705872, 0.0011, 0.08, 'ice', { info: 'Plus grande lune d’Uranus.' }),
    M('oberon', 'Obéron', 761.4, 583520, 13.463239, 0.0014, 0.07, 'darkice'),
    M('caliban', 'Caliban', 36, 7231000, 579.7, 0.159, 141.5, 'redrock', { irregular: 0.2 }),
    M('sycorax', 'Sycorax', 75, 12179000, 1288.3, 0.522, 159.4, 'redrock', { irregular: 0.2 }),
  ],
  neptune: [
    M('naiad', 'Naïade', 33, 48227, 0.2944, 0.0003, 4.74, 'darkice', { irregular: 0.3 }),
    M('thalassa', 'Thalassa', 41, 50075, 0.3115, 0.0002, 0.21, 'darkice', { irregular: 0.3 }),
    M('despina', 'Despina', 75, 52526, 0.3347, 0.0002, 0.07, 'darkice', { irregular: 0.25 }),
    M('galatea', 'Galatée', 88, 61953, 0.4287, 0.0001, 0.05, 'darkice', { irregular: 0.25 }),
    M('larissa', 'Larissa', 97, 73548, 0.5547, 0.0014, 0.2, 'darkice', { irregular: 0.2 }),
    M('hippocamp', 'Hippocampe', 17, 105283, 0.95, 0, 0, 'darkice', { irregular: 0.3 }),
    M('proteus', 'Protée', 210, 117647, 1.122315, 0.0005, 0.04, 'darkice', { irregular: 0.12 }),
    M('triton', 'Triton', 1353.4, 354759, 5.876854, 0.000016, 156.9, 'triton', { gm: 1427.6, info: 'Orbite rétrograde : probablement un objet de Kuiper capturé. Geysers d’azote.' }),
    M('nereid', 'Néréide', 170, 5513818, 360.13, 0.7507, 7.23, 'ice', { irregular: 0.1, info: 'Orbite la plus excentrique de toutes les lunes connues.' }),
    M('halimede', 'Halimède', 31, 16611000, 1879.1, 0.265, 134.1, 'rock', { irregular: 0.3 }),
  ],
  pluto: [
    M('charon', 'Charon', 606, 19591, 6.387230, 0.0002, 0.08, 'charon', { gm: 106.1, info: 'Si massive par rapport à Pluton qu’elles tournent toutes deux autour d’un point situé entre elles.' }),
    M('styx', 'Styx', 8, 42656, 20.16155, 0.0058, 0.81, 'ice', { irregular: 0.35 }),
    M('nix', 'Nix', 25, 48694, 24.85463, 0.002, 0.13, 'ice', { irregular: 0.3 }),
    M('kerberos', 'Kerbéros', 9.5, 57783, 32.16756, 0.0033, 0.39, 'darkice', { irregular: 0.35 }),
    M('hydra', 'Hydre', 25, 64738, 38.20177, 0.0059, 0.24, 'ice', { irregular: 0.3 }),
  ],
};

for (const list of Object.values(MOONS)) {
  for (const m of list) {
    if (!m.gm) m.gm = gmFromRadius(m.radius, m.look.includes('ice') ? 1.2 : 1.8);
  }
}
for (const m of MINOR) if (!m.gm) m.gm = gmFromRadius(m.radius);
