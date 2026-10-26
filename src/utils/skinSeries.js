// ─────────────────────────────────────────────────────────────────────────────
// Skin series — which series each skin belongs to.
//
// Moved here from HeroPicker.jsx so the Hero Picker and Auto Collage share ONE
// list. To add a skin to a series, add a line to SERIES_MAP_RAW below.
// ─────────────────────────────────────────────────────────────────────────────

import skinsData from '../../skins.json'

// ── Series map — skin name → series name (case-insensitive via SERIES_MAP below) ─
// Special override: "The Beacon" belongs to Nexus Sea but Layla's version
// is handled as standalone Legend — see heroSeriesOverrides below.
export const SERIES_MAP_RAW = {
  // Shadow Covenant
  "Midnight's Allure": "Shadow Covenant", "Phantasmal Revelry": "Shadow Covenant",
  "Sanguine Steward": "Shadow Covenant", "Phantom Mirage": "Shadow Covenant",
  "Duchess of Tides": "Shadow Covenant",
  // Eternal Seasons
  "Arrow of Spring": "Eternal Seasons", "Herald of Autumn": "Eternal Seasons",
  // Rolling Tides
  "Phantom Current": "Rolling Tides", "Seasworn Oracle": "Rolling Tides",
  // SpongeBob
  "SpongeBob": "SpongeBob SquarePants Collab", "Patrick": "SpongeBob SquarePants Collab",
  // Soul Vessels
  "Vessel of Gluttony": "Soul Vessels", "Vessel of Pride": "Soul Vessels",
  "Vessel of Ruin": "Soul Vessels", "Vessel of Deceit": "Soul Vessels",
  "Vessel of Rage": "Soul Vessels",
  // Nexus Sea — Layla's "The Beacon" is excluded via heroSeriesOverrides
  "The Annihilator": "Nexus Sea", "The Navigator": "Nexus Sea",
  // P.ACE
  "P.ACE Fanny": "P.ACE", "P.ACE Cici": "P.ACE", "P.ACE Zhuxin": "P.ACE",
  // Mystic Meow
  "Meowkin Warden": "Mystic Meow", "Meowkin Hunter": "Mystic Meow", "Meowkin Tracker": "Mystic Meow",
  // Metro Zero
  "Invoker's Command": "Metro Zero", "Invoker's Restraint": "Metro Zero", "Invoker's Flame": "Metro Zero",
  // The Aspirants
  "Twilight Star": "The Aspirants", "Daybreak Halo": "The Aspirants", "Tech Tensai": "The Aspirants",
  "Deadeye Spectre": "The Aspirants", "Cyber Cherubin": "The Aspirants", "Mecha Maiden": "The Aspirants",
  "Blade of Kibou": "The Aspirants", "Miss Hikari": "The Aspirants",
  // NARUTO
  "Naruto Uzumaki": "MLBB × NARUTO Collab", "Sasuke Uchiha": "MLBB × NARUTO Collab",
  "Sakura Haruno": "MLBB × NARUTO Collab", "Minato Namikaze": "MLBB × NARUTO Collab",
  "Itachi Uchiha": "MLBB × NARUTO Collab", "Kakashi Hatake": "MLBB × NARUTO Collab",
  "Gaara": "MLBB × NARUTO Collab",
  // Neobeasts
  "Neobeast Pharsa": "Neobeasts", "Neobeast Brody": "Neobeasts", "Neobeast Ling": "Neobeasts",
  "Neobeast Fredrinn": "Neobeasts", "Neobeast Lylia": "Neobeasts", "Neo Ling": "Neobeasts",
  // HUNTER×HUNTER
  "Gon": "HUNTER×HUNTER Collab", "Hisoka": "HUNTER×HUNTER Collab",
  "Killua": "HUNTER×HUNTER Collab", "Kurapika": "HUNTER×HUNTER Collab",
  // Kishin Densetsu
  "Strings of Fate": "Kishin Densetsu", "Breath of Naraka": "Kishin Densetsu",
  "Guardian of the Shrine": "Kishin Densetsu",
  // The Exorcists
  "Exorcist Yu Zhong": "The Exorcists", "Exorcist Kagura": "The Exorcists",
  "Exorcist Granger": "The Exorcists", "Exorcist Hayabusa": "The Exorcists",
  // Street Fighter
  "Ryu (Outfit 2)": "Street Fighter", "Ken (Outfit 2)": "Street Fighter",
  "Chun-Li (Outfit 2)": "Street Fighter", "Guile (Outfit 2)": "Street Fighter",
  // Special
  "Ashbone Gunslinger": "Special", "Wind-up Courier": "Special",
  // KOF
  "Kyo Kusanagi": "KOF", "Mai Shiranui": "KOF", "Terry Bogard": "KOF",
  "Iori Yagami": "KOF", "Athena Asamiya": "KOF", "Leona": "KOF",
  "K'": "KOF", "Orochi Chris": "KOF", "Kula Diamond": "KOF", "Gusion KOF": "KOF",
  // ALLSTAR
  "SPARKLE Melissa": "ALLSTAR", "SPARKLE Fredrinn": "ALLSTAR", "SPARKLE Estes": "ALLSTAR",
  // All Star
  "Hanabi Moonlit Ninja": "All Star", "Moskov Wrymlord": "All Star",
  // Attack on Titan
  "Eren": "Attack on Titan Collab", "Levi": "Attack on Titan Collab", "Mikasa": "Attack on Titan Collab",
  // Mistbenders
  "Mistbender Aldous": "Mistbenders", "Mistbender Nana": "Mistbenders",
  // Beyond the Clouds
  "Beyond the Clouds Kagura": "Beyond the Clouds", "Beyond the Clouds Edith": "Beyond the Clouds",
  "Beyond the Clouds Xavier": "Beyond the Clouds",
  // Ducati
  "Diavel V4 Rider": "Ducati", "Panigale V4S Rider": "Ducati", "Monster SP Rider": "Ducati",
  // Dawning Stars
  "Thunderfist": "Dawning Stars", "Firebolt": "Dawning Stars", "Swordmaster": "Dawning Stars",
  "Blizzard Storm": "Dawning Stars", "The Foreseer": "Dawning Stars",
  // Atomic Pop
  "Atomic Pop Eudora": "Atomic Pop", "Atomic Pop Miya": "Atomic Pop",
  // Jujutsu Kaisen
  "Yuji Itadori": "Jujutsu Kaisen Collab", "Megumi Fushiguro": "Jujutsu Kaisen Collab",
  "Nobara Kugisaki": "Jujutsu Kaisen Collab", "Satoru Gojo": "Jujutsu Kaisen Collab",
  // Gold Saints
  "Sagittarius Seiya": "Gold Saints", "Libra Shiryu": "Gold Saints", "Leo Ikki": "Gold Saints",
  // Bronze Saints
  "Pegasus Seiya": "Bronze Saints", "Phoenix Ikki": "Bronze Saints", "Dragon Shiryu": "Bronze Saints",
  // Kung Fu Panda
  "Kung Fu Panda": "Kung Fu Panda Collab", "Lord Shen": "Kung Fu Panda Collab", "General Kai": "Kung Fu Panda Collab",
  // Heavenly Artifact
  "Empyrean Paladin": "Heavenly Artifact", "Elysium Guardian": "Heavenly Artifact",
  // Transformers
  "Soundwave & Ravage": "MLBB × Transformers Collab", "Starscream": "MLBB × Transformers Collab",
  "Grimlock": "MLBB × Transformers Collab", "Optimus Prime": "MLBB × Transformers Collab",
  "Megatron": "MLBB × Transformers Collab", "Bumblebee": "MLBB × Transformers Collab",
  // 515 eParty
  "M-World Yin": "515 eParty", "M-World Ling": "515 eParty", "M-World Wanwan": "515 eParty",
  "S.T.U.N. Chou": "515 eParty", "S.T.U.N. Selena": "515 eParty", "S.T.U.N. Brody": "515 eParty",
  "Fashion Expert": "515 eParty", "Storm Rider": "515 eParty",
  // Sanrio
  "Heartstring": "MLBB × Sanrio Collab", "Fluffy Dream": "MLBB × Sanrio Collab",
  "Bad Bro": "MLBB × Sanrio Collab", "Moon Artist": "MLBB × Sanrio Collab",
  // Star Wars
  "Obi-Wan Kenobi": "MLBB × Star Wars Collab", "Master Yoda": "MLBB × Star Wars Collab",
  "First Order Jet Trooper": "MLBB × Star Wars Collab", "Darth Vader": "MLBB × Star Wars Collab",
  // Blazing Bounties
  "Blazing Gun": "Blazing Bounties", "Blazing Force": "Blazing Bounties", "Blazing Trace": "Blazing Bounties",
  "Blazing Axe": "Blazing Bounties", "Blazing Shadow": "Blazing Bounties",
  // Dragon Tamer
  "Empyrean Flame": "Dragon Tamer", "Draconic Flame": "Dragon Tamer", "Frost Wing": "Dragon Tamer",
  "Rattan Dragon": "Dragon Tamer", "Night Shade": "Dragon Tamer", "Dragon Armor": "Dragon Tamer",
  // Lightborn
  "Lightborn - Striker": "Lightborn", "Lightborn - Defender": "Lightborn",
  "Lightborn - Ranger": "Lightborn", "Lightborn - Inspirer": "Lightborn",
  "Lightborn - Overrider": "Lightborn", "Lightborn Striker": "Lightborn",
  // V.E.N.O.M.
  "V.E.N.O.M. Octopus": "V.E.N.O.M. Squad", "V.E.N.O.M. Monitor Lizard": "V.E.N.O.M. Squad",
  "V.E.N.O.M. Nephila": "V.E.N.O.M. Squad", "V.E.N.O.M. Emperor Scorpion": "V.E.N.O.M. Squad",
  "V.E.N.O.M. Vespid": "V.E.N.O.M. Squad", "V.E.N.O.M. Cobra": "V.E.N.O.M. Squad",
  // S.A.B.E.R.
  "S.A.B.E.R. Regulator": "S.A.B.E.R. Squad", "S.A.B.E.R. Automata": "S.A.B.E.R. Squad",
  "S.A.B.E.R. Breacher": "S.A.B.E.R. Squad", "S.A.B.E.R. Enforcer": "S.A.B.E.R. Squad",
  "S.A.B.E.R. Savior": "S.A.B.E.R. Squad", "S.A.B.E.R. Manhunter": "S.A.B.E.R. Squad",
  // Zodiac
  "Leo": "Zodiac", "Aries": "Zodiac", "Aquarius": "Zodiac", "Sagittarius": "Zodiac",
  "Virgo": "Zodiac", "Pisces": "Zodiac", "Cancer": "Zodiac", "Scorpio": "Zodiac",
  "Capricorn": "Zodiac", "Gemini - Shadow": "Zodiac", "Libra": "Zodiac",
  "Taurus": "Zodiac", "Gemini - Halo": "Zodiac",
  // Prime
  "Fiend Haunter": "Prime", "Cosmic Dragon": "Prime", "Cosmic Finality": "Prime",
  "Stellar Brilliance": "Prime", "Cosmic Blaze": "Prime",
  // Double 11
  "Flying Swallow": "Double 11", "Tesla Maniac": "Double 11",
  "Shura": "Double 11", "Dimension Walker": "Double 11",
  // Abyss
  "General Void": "Abyss", "Doom Incarnate": "Abyss",
  "Lady Vengeance": "Abyss", "Shadow Knight": "Abyss",
  // Zenith
  "Curse of Cinder": "Zenith", "Twisted Fairytale": "Zenith",
  // Christmas
  "Angelic Sonata": "Christmas", "Christmas Carnival": "Christmas",
  // Lunar Fest
  "Auspicious Charm": "Lunar Fest", "Dawning Fortune": "Lunar Fest",
  "Foxy Lady": "Lunar Fest", "Lion Dance": "Lunar Fest",
  "Dragon Of Prosperity": "Lunar Fest", "Bloom Of Abundance": "Lunar Fest",
  "Auspicious Blaze": "Lunar Fest", "New Moon": "Lunar Fest",
  // MPL
  "Biomedic": "MPL", "Cyber Ranger": "MPL", "Dream Groove": "MPL",
  "E-girl": "MPL", "Hydromancer": "MPL", "Prismatic Sentinel": "MPL",
  "Quantum Edge": "MPL", "Quantum Grip": "MPL", "Quantum Vanguard": "MPL",
  "Wind Fairy": "MPL", "Quantum Razor": "MPL", "Quantum Polarity": "MPL",
  // Summer
  "Beach Sweetheart": "Summer", "Lifeguard": "Summer", "Summer Breeze": "Summer",
  "Summer Festival": "Summer", "Summer Party": "Summer", "Summer Sparks": "Summer",
  "Summer Vibes": "Summer", "Summer Waves": "Summer", "Sun n Sand": "Summer",
  "Sundress": "Summer", "Sushi Master": "Summer", "Yatai Waitress": "Summer",
  "Summer Chill": "Summer", "Summer Blasts": "Summer", "Petal's Razor": "Summer",
  "Summer Rescue": "Summer", "Summer Splash": "Summer", "Summer Fun": "Summer",
  // Valentine's
  "Cannon and Roses": "Valentine's", "Dangerous Liaison": "Valentine's",
  "Dangerous Love": "Valentine's", "Gentleman Thief": "Valentine's",
  "Guns and Roses": "Valentine's", "Lady Thief": "Valentine's",
  "Phantom Count": "Valentine's", "Phantom Countess": "Valentine's",
  "Romantic Fantasy": "Valentine's", "Sweet Fantasy": "Valentine's",
  "Heart Aflame": "Valentine's", "Heart Afloat": "Valentine's",
  "Alluring Mystique": "Valentine's",
  // Special
  "Abyssal Reaper": "Special", "Amethyst Dance": "Special", "Arcane Magistrate": "Special",
  "Astro Mallet": "Special", "Ba-tender": "Special", "Badminton Champion": "Special",
  "Bass Craze": "Special", "Best DJ": "Special", "Butterfly Goddess": "Special",
  "Charge Leader": "Special", "Cheergunner": "Special", "Cherry Witch": "Special",
  "Classroom": "Special", "Constellation": "Special", "Cosmo Guard": "Special",
  "Crimson Warrior": "Special", "Crow Bishop": "Special", "Dauntless Shield": "Special",
  "Death Ride": "Special", "Deathrock": "Special", "Demon's Bane": "Special",
  "Divine Owl": "Special", "Dreadnought": "Special", "Emerald Guardian": "Special",
  "Evolved Predator": "Special", "Field Op": "Special", "Fist of Light": "Special",
  "Floral Elfo": "Special", "Furious Tiger": "Special", "Future Star": "Special",
  "Genki Slam": "Special", "Gold Baron": "Special", "Grim Strangler": "Special",
  "Hammer Giant": "Special", "Insidious Tutor": "Special", "Javelin Champion": "Special",
  "Jellyman": "Special", "Masterchef": "Special", "Midnight Raven": "Special",
  "Moodblade": "Special", "Pasha of Justice": "Special", "Phantom Seer": "Special",
  "Pinball Machine": "Special", "Pulsar Prodigy": "Special", "Razor": "Special",
  "Referee": "Special", "Rising Nova": "Special", "Rock Star": "Special",
  "Rogue Talon": "Special", "Sakura Wishes": "Special", "Samba Muse": "Special",
  "Savage Pointguard": "Special", "Shikigami Summoner": "Special", "Soul Reaper": "Special",
  "Street Legend": "Special", "Susanoo": "Special", "Suzuhime": "Special",
  "Temporal Vortex": "Special", "The Deep One": "Special", "The Falcon": "Special",
  "The Nutcracker": "Special", "Underground Boxer": "Special", "Vibrant Fiesta": "Special",
  "Vulcan": "Special", "War Lion": "Special", "Wasteland Psycho": "Special",
  "White Robin": "Special",
  // New Special skins
  "Fathom Terrors": "Special", "Steel Arms": "Special", "Razor Edge": "Special",
  "Ba-rista": "Special", "Moonblade": "Special", "Moonglow Troupe": "Special",
  "Captain Of The Lost": "Special", "Solar Spark": "Special", "Techno Hazard": "Special",
  "Lady Parasol": "Special", "Ghosmo": "Special", "Lunar Scion": "Special",
  "Fists Of Light": "Special", "Classroom Charm": "Special", "Wavebreaker": "Special",
  "Extraterrestrial": "Special",
  "Fangs of Slaughter": "Special", "Badlands Scrapper": "Special", "10th Anniversary": "Special",
  // Collector
  "Starbound Sentry": "Collector", "Kaiju of the Deep": "Collector",
  "Aeon of Twilight": "Collector", "Adlaw's Chosen": "Collector", "Agent Z": "Collector",
  "Aqua Pura": "Collector", "Astral Wanderer": "Collector", "Blazing Tiger": "Collector",
  "Blood Serpent": "Collector", "Celestial Judicator": "Collector", "Crimson Blast": "Collector",
  "Crimson Wings": "Collector", "Death Oath": "Collector", "Demonlord": "Collector",
  "Doom Catalyst": "Collector", "Dragonsworn": "Collector", "Dream Caster": "Collector",
  "Empress Phoenix": "Collector", "Falcon Mistress": "Collector", "Fist of Zen": "Collector",
  "Floral Elf": "Collector", "God of Mountains": "Collector", "Light Envoy": "Collector",
  "Mecha Infernus": "Collector", "Mecha-King Perseus": "Collector", "Melody of Light": "Collector",
  "Naraka Flame": "Collector", "Night Owl": "Collector", "Ore-chemist": "Collector",
  "Paranormal Operative": "Collector", "Pixel Blast": "Collector", "Prismatic Plume": "Collector",
  "Psychic": "Collector", "Queen Frost": "Collector", "Realm Watcher": "Collector",
  "Red Bastion": "Collector", "Riverland Phoenix": "Collector", "Samurai Mech": "Collector",
  "Serene Plume": "Collector", "Sol Invictus": "Collector", "Soulblight Tyrant": "Collector",
  "Soulfire Netherlord": "Collector", "Spirit of the Brush": "Collector",
  "Supernal Tempest": "Collector", "The Sun Empress": "Collector", "Tidal Lord": "Collector",
  "Umbra Bloom": "Collector", "Veil of the Celestials": "Collector",
  "Volcanic Overlord": "Collector", "Warrioress Paragon": "Collector", "Wicked Flames": "Collector",
  "Lone Destructor": "Collector", "Sunborn Monarch": "Collector", "Celestial General": "Collector",
  "Tremor of the Deep": "Collector", "Yokai Warlock": "Collector",
  "Dreaming Monarch": "Collector", "Soul Reaver": "Collector",
  "Vulcan Lionheart": "Collector", "Raiden Maru": "Collector",
  // Annual Starlight
  "Avatar of Time": "Annual Starlight", "No.1 Controller": "Annual Starlight",
  "Hawk-eyed Sniper": "Annual Starlight", "Queller Of Chaos": "Annual Starlight",
  "Concerto of Light": "Annual Starlight",
  // M Series
  "King Of Supremacy": "M Series", "Light Chaser": "M Series",
  "Thunder Ascendant": "M Series", "Challenger's Spark": "M Series",
  "Shadow Omen": "M Series", "Dragon's Shade": "M Series", "Phantom Ranger": "M Series",
  // Champion Series
  "APBren": "Champion", "Echo": "Champion", "Blacklist International": "Champion",
  "Evos Legends": "Champion", "Onic PH": "Champion", "Bren eSports": "Champion",
  // FMVP Series
  "Sky Force Maverick": "FMVP", "Fist Of Glory": "FMVP",
  // MSC Series
  "Rune Sentinel": "MSC", "Archon Of Knowledge": "MSC", "Dark Nexus": "MSC",
  "Aegis of Honor": "MSC",
  "Earth's Mightiest": "MSC", "Space Explorer": "MSC", "Triumph - Eagle": "MSC",
  // Myth Series
  "Dragon's Maw": "Myth", "Infernal Magister": "Myth", "Lord of the Tundra": "Myth",
  // Create Series
  "Hellbringer": "Create", "Maiden of the Tide": "Create", "Sage of the Currents": "Create",
  "Cyber Spectre": "Create", "Lady Dragon": "Create",
  // Golden Month
  "Twin Crescent": "Golden Month", "Neonscape Icon": "Golden Month",
  "Neon Edge": "Golden Month", "Crescent Dervish": "Golden Month",
  // Rising
  "Mech Protector": "Rising", "Starwatcher": "Rising",
  // Halloween
  "Jack-o'-lantern": "Halloween", "Pumpkin Brawler": "Halloween",
  "Scream Doll": "Halloween", "Impish Trickster": "Halloween",
  "Haunted Doll": "Halloween", "Baratstein": "Halloween",
  "Straw Doll": "Halloween", "Wheatfield Nightmare": "Halloween",
  "Jester": "Halloween",
  // Neymar
  "Neymar Jr": "Neymar Collab", "Halo Striker": "Neymar Collab",
  // Nexus Sea — Layla's "The Beacon" is excluded via HERO_SERIES_EXCLUDE, kept as standalone Legend
  "The Beacon": "Nexus Sea",
  // Annual Starlight extra
  "Water Lily": "Annual Starlight", "Experiment 21": "Annual Starlight",
  "Neon Lightwheel": "Annual Starlight",
  // Valentine's Premium
  "Blade of Devotion": "Valentine's Premium", "Song of Devotion": "Valentine's Premium",
  // 515 eParty
  "M World Ling": "515 eParty",
  // Licensed
  "Manny Pacquiao": "Licensed", "Seraphic Selfie": "Licensed", "Vivo Selfie Goddess": "Licensed",
  // Summer
  "Summer Blast": "Summer",
  // Anniversary
  "Angelic Fan": "Anniversary", "Moon Priestess": "Anniversary", "Starblazer": "Anniversary",
  // All Star
  "Tidescale Sealord": "All Star", "Moonlit Ninja": "All Star", "Infernal Wrymlord": "All Star",
  // AS Skins
  "Astral Muse": "AS", "Portal Hunter": "AS",
  // MCGG
  "Keyforged Champion": "MCGG",
}

// Normalized lookup map — all keys lowercased so matching is case-insensitive
const SERIES_MAP = Object.fromEntries(
  Object.entries(SERIES_MAP_RAW).map(([k, v]) => [k.toLowerCase(), v])
)

// ── Per-hero series overrides — heroId__skinName → null (no series) ───────────
// Used to exclude specific hero+skin combos from their series
// e.g. Layla's "The Beacon" is a Legend skin, not Nexus Sea
// Layla's "The Beacon" is a Legend skin — exclude it from Nexus Sea series grouping
// so it appears standalone under Legend tier instead
export const HERO_SERIES_EXCLUDE = new Set([
  'layla__The Beacon',
  // "10th Anniversary" is a Special-series skin for Chou, but Nana's version has no series ("Other")
  'nana__10th Anniversary',
])

// Returns the series for a given heroId + skinName, respecting per-hero excludes
// Matching is case-insensitive
export function getSeries(heroId, skinName) {
  const excludeKey = `${heroId}__${skinName}`
  if (HERO_SERIES_EXCLUDE.has(excludeKey)) return null
  return SERIES_MAP[skinName.toLowerCase()] || null
}

// ═════════════════════════════════════════════════════════════════════════════
// Auto Collage order
//
// The order Auto Collage lays skins out in. It only affects Auto Collage; the
// canvas can still be rearranged by hand afterwards.
//
// Each line is one group, top to bottom. A group is either
//   - a tier          { tier: 'Legend' }
//   - one or more series names exactly as written in SERIES_MAP_RAW above
//   - a special rule  (STUN skins are the "S.T.U.N. …" skins of 515 eParty)
// Skins of the same series always stay together. Inside a group, skins keep
// the order they appeared in the screenshots.
// ═════════════════════════════════════════════════════════════════════════════
const STUN = 'S.T.U.N.'
export const COLLAGE_ORDER = [
  { tier: 'Legend' },
  'Collector',
  'Heavenly Artifact',
  'KOF',
  'MLBB × Star Wars Collab',
  'MLBB × Transformers Collab',
  'MLBB × Sanrio Collab',
  'Gold Saints',
  'Jujutsu Kaisen Collab',
  'Attack on Titan Collab',
  'HUNTER×HUNTER Collab',
  'MLBB × NARUTO Collab',
  'Kung Fu Panda Collab',
  'Kishin Densetsu',
  'Neobeasts',
  'Soul Vessels',
  { tier: 'Grand' },                     // the rest of the Grand skins
  'Beyond the Clouds',
  'Annual Starlight',
  'Champion',
  STUN,
  { tier: 'Exquisite' },                 // the other Exquisite skins = Lucky Box
  'Zodiac',
  'MPL',
  'Lunar Fest',
  'Lightborn',
  'V.E.N.O.M. Squad',
  'S.A.B.E.R. Squad',
  'Christmas',
  'Halloween',
  'Atomic Pop',
  'Create',
  'Anniversary',
  'AS',
  'Neymar Collab',
  ["Valentine's", "Valentine's Premium"],
  'SpongeBob SquarePants Collab',
  'Shadow Covenant',
  'Rolling Tides',
  'P.ACE',
  'Rising',
  'Myth',
  'MSC',
  'Mystic Meow',
  'M Series',
  'FMVP',
  'Bronze Saints',
  ['All Star', 'ALLSTAR'],
  { tier: 'Deluxe' },
  { tier: '' },                          // everything else (Elite, Basic, no tier yet…)
  'Special',                             // always second last
  { tier: ['Exceptional', 'Starlight'] },// always last: the other Exceptional skins = Starlight
]

const TIER_ALIASES = { expectional: 'Exceptional' }
const cleanTier = t => {
  const s = String(t || '').trim()
  return TIER_ALIASES[s.toLowerCase()] || s
}

// Tiers set in the Admin Panel (saved in this browser) win over skins.json.
function tierOverrides() {
  try { return JSON.parse(localStorage.getItem('mlbb_tiers') || '{}') } catch { return {} }
}

const _baseTier = new Map()
for (const hero of skinsData) for (const skin of hero.skins || []) _baseTier.set(`${hero.id}__${skin.name}`, skin.tier || '')

// The tier most skins of each series have (a series is filed under one tier).
function seriesTiers(tierOf) {
  const counts = {}
  for (const hero of skinsData) {
    for (const skin of hero.skins || []) {
      const series = getSeries(hero.id, skin.name)
      const tier = tierOf(hero.id, skin.name)
      if (!series || !tier) continue
      counts[series] = counts[series] || {}
      counts[series][tier] = (counts[series][tier] || 0) + 1
    }
  }
  const out = {}
  for (const [series, c] of Object.entries(counts)) out[series] = Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]
  return out
}

const KNOWN_TIERS = new Set(['Legend', 'Grand', 'Exquisite', 'Deluxe', 'Exceptional', 'Starlight'])

// Sorts skins ({ heroId, skinName }) into the Auto Collage order. The input
// order is kept inside each group (pass them in screenshot order).
export function sortForCollage(skins) {
  const overrides = tierOverrides()
  const tierOf = (heroId, skinName) => cleanTier(overrides[`${heroId}__${skinName}`] || _baseTier.get(`${heroId}__${skinName}`))
  const bySeriesTier = seriesTiers(tierOf)

  const seriesRank = new Map(), tierRank = new Map()
  COLLAGE_ORDER.forEach((g, i) => {
    if (typeof g === 'object' && !Array.isArray(g)) for (const t of [].concat(g.tier)) tierRank.set(t, i)
    else for (const name of [].concat(g)) seriesRank.set(name, i)
  })

  const placed = skins.map((s, index) => {
    const tier = tierOf(s.heroId, s.skinName)
    let series = getSeries(s.heroId, s.skinName)
    if (series === '515 eParty' && s.skinName.startsWith(STUN)) series = STUN

    let rank
    if (tier === 'Legend') rank = tierRank.get('Legend')
    else if (series && seriesRank.has(series)) rank = seriesRank.get(series)
    else if (tier === 'Starlight') rank = tierRank.get('Starlight')
    else {
      // not a listed series: goes with its tier (a series goes with the tier most of its skins have)
      const t = cleanTier(series ? bySeriesTier[series] || tier : tier)
      rank = tierRank.get(KNOWN_TIERS.has(t) && t !== 'Legend' && t !== 'Starlight' ? t : '')
    }
    return { s, index, rank, series: series || '' }
  })

  // inside one group: each series stays together (in the order its first skin
  // appeared), skins without a series after them
  const firstSeen = new Map()
  for (const p of placed) {
    const k = `${p.rank}|${p.series}`
    if (!firstSeen.has(k)) firstSeen.set(k, p.index)
  }
  placed.sort((a, b) =>
    (a.rank - b.rank) ||
    ((a.series ? 0 : 1) - (b.series ? 0 : 1)) ||
    (firstSeen.get(`${a.rank}|${a.series}`) - firstSeen.get(`${b.rank}|${b.series}`)) ||
    (a.index - b.index))
  return placed.map(p => p.s)
}
