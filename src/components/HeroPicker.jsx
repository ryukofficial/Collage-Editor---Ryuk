import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import skinsData from '../../skins.json'
import useStore from '../store/useStore'

const TIERS = [
  'Legend', 'Grand', 'Exquisite', 'Deluxe', 'Exceptional','Starlight', 'Epic', 
]
const TIER_STYLES = {
  Legend:          { bg: '#2a1a00', border: '#f5c842', text: '#f5c842', icon: '👑' },
  Grand:           { bg: '#1a002a', border: '#a855f7', text: '#c084fc', icon: '💜' },
  Exquisite:       { bg: '#001a2a', border: '#38bdf8', text: '#7dd3fc', icon: '💎' },
  Deluxe:          { bg: '#001a10', border: '#34d399', text: '#6ee7b7', icon: '✨' },
  Exceptional:     { bg: '#1a1500', border: '#facc15', text: '#fde68a', icon: '⭐' },
  Starlight:       { bg: '#1a1a2a', border: '#818cf8', text: '#c7d2fe', icon: '🌟' },
  Epic:            { bg: '#1a002a', border: '#e879f9', text: '#f0abfc', icon: '🔮' },
}

// â”€â”€ Series map â€” skin name â†’ series name (case-insensitive via SERIES_MAP below) â”€
// Special override: "The Beacon" belongs to Nexus Sea but Layla's version
// is handled as standalone Legend â€” see heroSeriesOverrides below.
const SERIES_MAP_RAW = {
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
  // Nexus Sea â€” Layla's "The Beacon" is excluded via heroSeriesOverrides
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
  "Naruto Uzumaki": "MLBB Ã— NARUTO Collab", "Sasuke Uchiha": "MLBB Ã— NARUTO Collab",
  "Sakura Haruno": "MLBB Ã— NARUTO Collab", "Minato Namikaze": "MLBB Ã— NARUTO Collab",
  "Itachi Uchiha": "MLBB Ã— NARUTO Collab", "Kakashi Hatake": "MLBB Ã— NARUTO Collab",
  "Gaara": "MLBB Ã— NARUTO Collab",
  // Neobeasts
  "Neobeast Pharsa": "Neobeasts", "Neobeast Brody": "Neobeasts", "Neobeast Ling": "Neobeasts",
  "Neobeast Fredrinn": "Neobeasts", "Neobeast Lylia": "Neobeasts", "Neo Ling": "Neobeasts",
  // HUNTERÃ—HUNTER
  "Gon": "HUNTERÃ—HUNTER Collab", "Hisoka": "HUNTERÃ—HUNTER Collab",
  "Killua": "HUNTERÃ—HUNTER Collab", "Kurapika": "HUNTERÃ—HUNTER Collab",
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
  "Soundwave & Ravage": "MLBB Ã— Transformers Collab", "Starscream": "MLBB Ã— Transformers Collab",
  "Grimlock": "MLBB Ã— Transformers Collab", "Optimus Prime": "MLBB Ã— Transformers Collab",
  "Megatron": "MLBB Ã— Transformers Collab", "Bumblebee": "MLBB Ã— Transformers Collab",
  // 515 eParty
  "M-World Yin": "515 eParty", "M-World Ling": "515 eParty", "M-World Wanwan": "515 eParty",
  "S.T.U.N. Chou": "515 eParty", "S.T.U.N. Selena": "515 eParty", "S.T.U.N. Brody": "515 eParty",
  "Fashion Expert": "515 eParty", "Storm Rider": "515 eParty",
  // Sanrio
  "Heartstring": "MLBB Ã— Sanrio Collab", "Fluffy Dream": "MLBB Ã— Sanrio Collab",
  "Bad Bro": "MLBB Ã— Sanrio Collab", "Moon Artist": "MLBB Ã— Sanrio Collab",
  // Star Wars
  "Obi-Wan Kenobi": "MLBB Ã— Star Wars Collab", "Master Yoda": "MLBB Ã— Star Wars Collab",
  "First Order Jet Trooper": "MLBB Ã— Star Wars Collab", "Darth Vader": "MLBB Ã— Star Wars Collab",
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
  // Nexus Sea â€” Layla's "The Beacon" is excluded via HERO_SERIES_EXCLUDE, kept as standalone Legend
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

// Normalized lookup map â€” all keys lowercased so matching is case-insensitive
const SERIES_MAP = Object.fromEntries(
  Object.entries(SERIES_MAP_RAW).map(([k, v]) => [k.toLowerCase(), v])
)

// â”€â”€ Per-hero series overrides â€” heroId__skinName â†’ null (no series) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Used to exclude specific hero+skin combos from their series
// e.g. Layla's "The Beacon" is a Legend skin, not Nexus Sea
// Layla's "The Beacon" is a Legend skin â€” exclude it from Nexus Sea series grouping
// so it appears standalone under Legend tier instead
const HERO_SERIES_EXCLUDE = new Set([
  'layla__The Beacon',
])

const PLACEHOLDER      = 'https://placehold.co/200x300/1a1a2e/6c63ff?text=No+Image'
const HERO_PLACEHOLDER = 'https://placehold.co/80x80/1a1a2e/6c63ff?text=?'
const GITHUB_API       = 'https://api.github.com/repos/ryukofficial/mlbb-assets/contents/'
const CDN_BASE         = 'https://raw.githubusercontent.com/ryukofficial/mlbb-assets/refs/heads/main/'

let _cachedRepoFiles = []
let _cacheLoaded     = false

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

function fuzzyMatch(str, query) {
  if (!query) return true
  const s = str.toLowerCase(), q = query.toLowerCase().trim()
  if (s.includes(q)) return true
  let si = 0, qi = 0
  while (si < s.length && qi < q.length) { if (s[si] === q[qi]) qi++; si++ }
  if (qi === q.length) return true
  if (q.length >= 4) {
    const bigrams = t => { const set = new Set(); for (let i = 0; i < t.length-1; i++) set.add(t[i]+t[i+1]); return set }
    const qb = bigrams(q), sb = bigrams(s); let m = 0
    qb.forEach(b => { if (sb.has(b)) m++ })
    if (m / qb.size >= 0.5) return true
  }
  return false
}

const HERO_ALIASES = {
  yuzhong: ['yu zhong','yuzhong'], gusion: ['gusion','gus'], franco: ['franco'],
  johnson: ['johnson','john'], odette: ['odette'], lancelot: ['lancelot','lance'],
  alucard: ['alucard','alu'], vexana: ['vexana','vex'], layla: ['layla'], miya: ['miya'], ling: ['ling'],
}

function skinKeywords(n) { return slugify(n).split(' ').filter(w => w.length >= 3) }

function matchScore(filename, heroId, skinName) {
  const f = slugify(filename.replace(/\.(jpg|jpeg|png|webp)$/i, ''))
  const aliases = HERO_ALIASES[heroId] || [heroId]
  if (!aliases.some(a => f.includes(a))) return 0
  const kw = skinKeywords(skinName)
  if (kw.length === 0) return 1
  return kw.filter(k => f.includes(k)).length / kw.length
}

function buildImageMap(files, heroId, skins) {
  const map = {}, imgs = files.filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f))
  for (const skin of skins) {
    let best = null, bestScore = 0.3
    for (const file of imgs) {
      const s = matchScore(file, heroId, skin.name)
      if (s > bestScore) { bestScore = s; best = file }
    }
    if (best) map[skin.name] = CDN_BASE + encodeURIComponent(best)
  }
  return map
}

function loadTierAssignments() {
  try { return JSON.parse(localStorage.getItem('mlbb_tiers') || '{}') } catch { return {} }
}

// Returns the series for a given heroId + skinName, respecting per-hero excludes
// Matching is case-insensitive
function getSeries(heroId, skinName) {
  const excludeKey = `${heroId}__${skinName}`
  if (HERO_SERIES_EXCLUDE.has(excludeKey)) return null
  return SERIES_MAP[skinName.toLowerCase()] || null
}

// Compute majority tier for each series
function computeSeriesTiers(assignments) {
  const counts = {}
  for (const hero of skinsData) {
    for (const skin of hero.skins) {
      const series = getSeries(hero.id, skin.name)
      if (!series) continue
      const key  = `${hero.id}__${skin.name}`
      const tier = assignments[key] || skin.tier || ''
      if (!tier) continue
      if (!counts[series]) counts[series] = {}
      counts[series][tier] = (counts[series][tier] || 0) + 1
    }
  }
  const seriesTier = {}
  for (const [series, c] of Object.entries(counts))
    seriesTier[series] = Object.entries(c).sort((a,b) => b[1]-a[1])[0][0]
  return seriesTier
}

function useVisualViewportHeight() {
  const [h, setH] = useState(() => window.visualViewport ? window.visualViewport.height : window.innerHeight)
  useEffect(() => {
    const vv = window.visualViewport; if (!vv) return
    const up = () => setH(vv.height)
    vv.addEventListener('resize', up); vv.addEventListener('scroll', up)
    return () => { vv.removeEventListener('resize', up); vv.removeEventListener('scroll', up) }
  }, [])
  return h
}

function useScrollIntoView() {
  return useCallback(node => {
    if (!node) return
    const h = () => setTimeout(() => node.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
    node.addEventListener('focus', h)
    return () => node.removeEventListener('focus', h)
  }, [])
}

function ModeSelect({ onSelectMode }) {
  return (
    <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <p style={{ color: '#888', fontSize: '12px', textAlign: 'center', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Choose selection mode</p>
      {[
        { mode: 'hero', icon: 'ðŸ¦¸', title: 'Hero', desc: 'Browse skins by hero', color: '#6c63ff' },
        { mode: 'collection', icon: 'ðŸ’Ž', title: 'Collection', desc: 'Browse by tier â€” Legend, Grand, Exquisite and more', color: '#a855f7' },
      ].map(({ mode, icon, title, desc, color }) => (
        <button key={mode} onClick={() => onSelectMode(mode)}
          style={{ display: 'flex', alignItems: 'center', gap: '16px', background: '#1a1a2e', border: '1px solid #252535', borderRadius: '14px', padding: '16px 18px', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.2s' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = color}
          onMouseLeave={e => e.currentTarget.style.borderColor = '#252535'}>
          <span style={{ fontSize: '32px' }}>{icon}</span>
          <div>
            <p style={{ color: '#fff', fontSize: '15px', fontWeight: 700, margin: '0 0 4px' }}>{title}</p>
            <p style={{ color: '#888', fontSize: '12px', margin: 0 }}>{desc}</p>
          </div>
          <span style={{ marginLeft: 'auto', color, fontSize: '18px' }}>â€º</span>
        </button>
      ))}
    </div>
  )
}

function CollectionMode({ repoFiles, imageCache, setImageCache, selectedSkins, setSelectedSkins }) {
  const [activeTier, setActiveTier] = useState('Legend')
  const [search, setSearch]         = useState('')
  const [collapsed, setCollapsed]   = useState({})
  const searchRef                   = useScrollIntoView()
  const assignments                 = useMemo(() => loadTierAssignments(), [])
  const seriesTiers                 = useMemo(() => computeSeriesTiers(assignments), [assignments])

  const tierSkins = useMemo(() => {
    const result = []
    for (const hero of skinsData) {
      for (const skin of hero.skins) {
        const series   = getSeries(hero.id, skin.name)
        const key      = `${hero.id}__${skin.name}`
        const skinTier = assignments[key] || skin.tier || ''
        if (series) {
          if (seriesTiers[series] === activeTier)
            result.push({ ...skin, heroId: hero.id, heroName: hero.name, skinTier })
        } else {
          if (skinTier === activeTier)
            result.push({ ...skin, heroId: hero.id, heroName: hero.name, skinTier })
        }
      }
    }
    return result
  }, [activeTier, assignments, seriesTiers])

  const filtered = useMemo(() => {
    if (!search.trim()) return tierSkins
    const q = search.toLowerCase()
    return tierSkins.filter(s => fuzzyMatch(s.name, q) || fuzzyMatch(s.heroName, q))
  }, [tierSkins, search])

  const grouped = useMemo(() => {
    const map = {}
    for (const skin of filtered) {
      const series = getSeries(skin.heroId, skin.name) || 'Other'
      if (!map[series]) map[series] = []
      map[series].push(skin)
    }
    return Object.entries(map).sort(([a],[b]) => {
      if (a==='Other') return 1; if (b==='Other') return -1; return a.localeCompare(b)
    })
  }, [filtered])

  useEffect(() => {
    if (!repoFiles.length) return
    ;[...new Set(tierSkins.map(s => s.heroId))].forEach(heroId => {
      if (imageCache[heroId]) return
      const hero = skinsData.find(h => h.id === heroId); if (!hero) return
      setImageCache(prev => ({ ...prev, [heroId]: buildImageMap(repoFiles, heroId, hero.skins) }))
    })
  }, [activeTier, repoFiles])

  const getSkinImg = (heroId, skinName) => (imageCache[heroId] || {})[skinName] || null

  const toggleSkin = (skin, url) => {
    if (!url) return
    setSelectedSkins(prev => {
      const k = `${skin.heroId}__${skin.name}`
      return prev.find(s => `${s.heroId}__${s.name}` === k)
        ? prev.filter(s => `${s.heroId}__${s.name}` !== k)
        : [...prev, { ...skin, image: url }]
    })
  }

  const tierCounts = useMemo(() => {
    const counts = {}
    for (const hero of skinsData) {
      for (const skin of hero.skins) {
        const series   = getSeries(hero.id, skin.name)
        const key      = `${hero.id}__${skin.name}`
        const skinTier = assignments[key] || skin.tier || ''
        if (series) { const t = seriesTiers[series]; if (t) counts[t] = (counts[t]||0)+1 }
        else if (skinTier) counts[skinTier] = (counts[skinTier]||0)+1
      }
    }
    return counts
  }, [assignments, seriesTiers])

  const TIER_STYLES_DEFAULT = { bg: '#1a1a1a', border: '#555', text: '#aaa', icon: 'ðŸŽ®' }
  const ts = TIER_STYLES[activeTier] || TIER_STYLES_DEFAULT

  return (
    <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
      {/* Tier tabs */}
      <div style={{ display:'flex', gap:'6px', padding:'10px 12px', overflowX:'auto', flexShrink:0, borderBottom:'1px solid #1e1800' }}>
        {TIERS.map(tier => {
          const s = TIER_STYLES[tier]||TIER_STYLES['Basic'], isActive = activeTier===tier, count = tierCounts[tier]||0
          return (
            <button key={tier} onClick={() => { setActiveTier(tier); setSearch(''); setCollapsed({}) }}
              style={{ flexShrink:0, background:isActive?s.bg:'#0e1120', border:`1px solid ${isActive?s.border:'#2a2400'}`, borderRadius:'8px', padding:'6px 12px', color:isActive?s.text:'#5a4e2a', fontSize:'12px', fontWeight:isActive?700:400, cursor:'pointer', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:'5px' }}>
              <span>{s.icon}</span><span>{tier}</span>
              {count>0 && <span style={{ background:isActive?s.border+'33':'#1a1400', color:isActive?s.text:'#5a4e2a', fontSize:'10px', padding:'1px 5px', borderRadius:'4px' }}>{count}</span>}
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div style={{ padding:'10px 12px', flexShrink:0 }}>
        <input ref={searchRef} type="text" placeholder={`ðŸ” Search in ${activeTier}...`} value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width:'100%', background:'#0e1120', border:'1px solid #2a2400', borderRadius:'8px', padding:'8px 12px', color:'#fff', fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
      </div>

      {/* Grouped list */}
      <div style={{ flex:1, overflowY:'auto', padding:'0 10px 12px' }}>
        {filtered.length===0 ? (
          <div style={{ textAlign:'center', padding:'40px 20px' }}>
            <p style={{ fontSize:'32px', marginBottom:'12px' }}>{tierCounts[activeTier]?'ðŸ”':'ðŸ“­'}</p>
            <p style={{ color:'#b89a5a', fontSize:'14px', fontWeight:600, marginBottom:'6px' }}>
              {search?'No results found':`No ${activeTier} skins yet`}
            </p>
            <p style={{ color:'#5a4e2a', fontSize:'12px' }}>
              {search?'Try a different search term':'Use Admin Panel to assign skins'}
            </p>
          </div>
        ) : grouped.map(([series, skins]) => {
          const isCollapsed = collapsed[series], isOther = series==='Other'
          return (
            <div key={series} style={{ marginBottom:'16px' }}>
              <button onClick={() => setCollapsed(p => ({ ...p, [series]: !p[series] }))}
                style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between', background:isOther?'#0e1120':ts.bg, border:`1px solid ${isOther?'#2a2400':ts.border+'66'}`, borderRadius:'10px', padding:'8px 12px', marginBottom:isCollapsed?0:'8px', cursor:'pointer' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <span style={{ fontSize:'14px' }}>{isOther?'ðŸŽ®':ts.icon}</span>
                  <span style={{ color:isOther?'#8a7a4a':ts.text, fontSize:'12px', fontWeight:700 }}>
                    {isOther?'Other':`${series} Series`}
                  </span>
                  <span style={{ background:isOther?'#1a1400':ts.border+'33', color:isOther?'#5a4e2a':ts.text, fontSize:'10px', padding:'1px 6px', borderRadius:'4px', fontWeight:600 }}>
                    {skins.length}
                  </span>
                </div>
                <span style={{ color:isOther?'#555':ts.text, fontSize:'14px', transform:isCollapsed?'rotate(-90deg)':'rotate(0deg)', transition:'transform 0.2s', display:'inline-block' }}>â–¾</span>
              </button>

              {!isCollapsed && (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'6px' }}>
                  {skins.map((skin, i) => {
                    const url = getSkinImg(skin.heroId, skin.name), hasImg = !!url
                    const k = `${skin.heroId}__${skin.name}`
                    const isSel = selectedSkins.find(s => `${s.heroId}__${s.name}`===k)
                    const showBadge = skin.skinTier && skin.skinTier!==activeTier
                    const bs = TIER_STYLES[skin.skinTier]||TIER_STYLES_DEFAULT
                    return (
                      <button key={i} onClick={() => toggleSkin(skin, url)}
                        style={{ position:'relative', borderRadius:'10px', overflow:'hidden', border:`2px solid ${isSel?ts.border:hasImg?'#2a2400':'#1a1400'}`, opacity:hasImg?1:0.4, cursor:hasImg?'pointer':'not-allowed', transform:isSel?'scale(0.95)':'scale(1)', transition:'all 0.15s', background:'#0e1120', padding:0, textAlign:'center', display:'flex', flexDirection:'column' }}>
                        <div style={{ position:'relative', width:'100%' }}>
                          <img src={hasImg?url:PLACEHOLDER} alt={skin.name}
                            crossOrigin="anonymous"
                            style={{ width:'100%', height:'80px', objectFit:'cover', display:'block', background:'#0e1120' }}
                            onError={e => { e.target.src=PLACEHOLDER }} />
                          {isSel && (
                            <div style={{ position:'absolute', top:'3px', right:'3px', width:'16px', height:'16px', background:ts.border, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                              <span style={{ color:'#000', fontSize:'9px', fontWeight:800 }}>âœ“</span>
                            </div>
                          )}
                          {showBadge && (
                            <div style={{ position:'absolute', top:'3px', left:'3px', background:bs.bg, border:`1px solid ${bs.border}`, borderRadius:'4px', padding:'1px 3px' }}>
                              <span style={{ color:bs.text, fontSize:'7px', fontWeight:700 }}>{skin.skinTier}</span>
                            </div>
                          )}
                          {!hasImg && (
                            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                              <span style={{ color:'#555', fontSize:'9px' }}>No Image</span>
                            </div>
                          )}
                        </div>
                        <div style={{ padding:'4px 4px 5px', background:'#0e1120', borderTop:'1px solid #1e1800' }}>
                          <p style={{ color:'#f0e6c0', fontSize:'8px', fontWeight:700, margin:0, lineHeight:1.3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{skin.name}</p>
                          <p style={{ color:'#786040', fontSize:'7px', margin:'1px 0 0', lineHeight:1.2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{skin.heroName}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function HeroPicker({ open, onClose }) {
  const [isOpen,         setIsOpen]         = useState(false)
  const [mode,           setMode]           = useState(null)
  const [selectedHero,   setSelectedHero]   = useState(null)
  const [selectedSkins,  setSelectedSkins]  = useState([])
  const [search,         setSearch]         = useState('')
  const [repoFiles,      setRepoFiles]      = useState(_cachedRepoFiles)
  const [imageCache,     setImageCache]     = useState({})
  const [fetchError,     setFetchError]     = useState(false)
  const [isAdding,       setIsAdding]       = useState(false)
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(() => { if (open) setIsOpen(true) }, [open])

  const heroSearchRef = useScrollIntoView()
  const vvHeight      = useVisualViewportHeight()
  const addImages     = useStore(s => s.addImages)
  const saveSnapshot  = useStore(s => s.saveSnapshot)
  const updateImage   = useStore(s => s.updateImage)
  const images        = useStore(s => s.images)
  const hasImages     = images.length > 0
  const historyPushed = useRef(false)

  const handleClose = useCallback(() => {
    setIsOpen(false); setSelectedHero(null); setSelectedSkins([])
    setSearch(''); setMode(null); if (onClose) onClose()
  }, [onClose])

  useEffect(() => {
    if (isOpen) {
      window.history.pushState({ heroPickerOpen: true }, '')
      historyPushed.current = true
      const onPop = () => {
        if (selectedHero) { setSelectedHero(null); setSelectedSkins([]); window.history.pushState({ heroPickerOpen: true }, ''); return }
        if (mode) { setMode(null); window.history.pushState({ heroPickerOpen: true }, ''); return }
        handleClose(); historyPushed.current = false
      }
      window.addEventListener('popstate', onPop)
      return () => window.removeEventListener('popstate', onPop)
    } else {
      if (historyPushed.current) { historyPushed.current = false; window.history.back() }
    }
  }, [isOpen, mode, selectedHero, handleClose])

  useEffect(() => {
    if (!isOpen) return
    if (_cacheLoaded) { setRepoFiles(_cachedRepoFiles); return }
    fetch(GITHUB_API).then(r => r.json()).then(data => {
      if (!Array.isArray(data)) { setFetchError(true); return }
      const names = data.filter(f => f.type==='file' && /\.(jpg|jpeg|png|webp)$/i.test(f.name)).map(f => f.name)
      _cachedRepoFiles = names; _cacheLoaded = true; setRepoFiles(names)
    }).catch(() => setFetchError(true))
  }, [isOpen])

  useEffect(() => {
    if (!selectedHero || !repoFiles.length || imageCache[selectedHero.id]) return
    setImageCache(prev => ({ ...prev, [selectedHero.id]: buildImageMap(repoFiles, selectedHero.id, selectedHero.skins) }))
  }, [selectedHero, repoFiles])

  const getSkinImage   = (hero, skin) => (imageCache[hero.id]||{})[skin.name]||null
  const getHeroImage   = hero => Object.values(imageCache[hero.id]||{})[0]||HERO_PLACEHOLDER
  const filteredHeroes = skinsData.filter(h => fuzzyMatch(h.name, search))

  const toggleSkin = (skin, url) => {
    if (!url) return
    setSelectedSkins(prev => {
      const exists = prev.find(s => s.name===skin.name)
      return exists ? prev.filter(s => s.name!==skin.name) : [...prev, { ...skin, image: url }]
    })
  }

  const handleAddToCanvas = async () => {
  if (!selectedSkins.length || isAdding) return
  setIsAdding(true)
  saveSnapshot()

  const CANVAS_W = 3840
  const total = images.length + selectedSkins.length
  const cols = Math.ceil(Math.sqrt(total))
  const cell = Math.floor(CANVAS_W / cols)

  // Re-layout existing images
  images.forEach((img, i) => updateImage(img.id, {
    x: (i % cols) * cell,
    y: Math.floor(i / cols) * cell,
    scaleX: cell / img.naturalWidth,
    scaleY: cell / img.naturalHeight,
  }))

  // Load new skins, skip any that fail
  const skinData = await Promise.all(selectedSkins.map(skin =>
    new Promise(resolve => {
      const el = new Image()
      el.crossOrigin = 'anonymous'
      el.onload  = () => resolve({ skin, nw: el.naturalWidth, nh: el.naturalHeight, ok: true })
      el.onerror = () => resolve({ skin, nw: 0, nh: 0, ok: false })
      el.src = skin.image
    })
  ))

  const newImages = skinData
    .filter(({ ok }) => ok)
    .map(({ skin, nw, nh }, i) => {
      const gi = images.length + i
      const scale  = Math.max(cell / nw, cell / nh)
      const scaledW = nw * scale
      const scaledH = nh * scale
      const offsetX = (scaledW - cell) / 2
      const offsetY = (scaledH - cell) / 2
      return {
        src: skin.image,
        x: (gi % cols) * cell,
        y: Math.floor(gi / cols) * cell,
        naturalWidth: nw,
        naturalHeight: nh,
        scaleX: scale,
        scaleY: scale,
        cropX: offsetX / scale,
        cropY: offsetY / scale,
        cropW: cell / scale,
        cropH: cell / scale,
        rotation: 0,
        opacity: 1,
        name: skin.name,
        fileSize: 0,
      }
    })
    addImages(newImages)
  setIsAdding(false)
  setIsOpen(false)
  setSelectedHero(null)
  setSelectedSkins([])
  }

  const headerTitle = () => {
    if (!mode) return 'Add Skins'
    if (mode==='hero') return selectedHero?selectedHero.name:'Select Hero'
    if (mode==='collection') return 'Collection'
    return 'Add Skins'
  }

  const handleBack = () => {
    if (selectedHero) { setSelectedHero(null); setSelectedSkins([]); return }
    if (mode) { setMode(null); return }
    handleClose()
  }

  return (
    <>
      {hasImages && <button className="btn-primary text-sm px-3" onClick={() => setIsOpen(true)}>+ Add Skins</button>}
      {isOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'flex-end', justifyContent:'center', background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)' }}
          onClick={e => { if (e.target===e.currentTarget) handleClose() }}>
          <div style={{ width:'100%', maxWidth:'480px', maxHeight:`min(${vvHeight*0.85}px, 85dvh)`, marginBottom:`${keyboardHeight}px`, background:'#0a0d14', border:'1px solid #2a2400', borderRadius:'20px 20px 0 0', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 -8px 40px rgba(0,0,0,0.7)', paddingBottom:keyboardHeight>0?'0px':'env(safe-area-inset-bottom, 0px)', transition:'margin-bottom 0.2s ease' }}>

            {/* Header */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px 10px', borderBottom:'1px solid #1e1800', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                {(mode||selectedHero) && <button onClick={handleBack} style={{ background:'none', border:'none', color:'#f5c842', fontSize:'20px', cursor:'pointer', padding:'0 4px', lineHeight:1 }}>â€¹</button>}
                <span style={{ color:'#fff', fontSize:'16px', fontWeight:700 }}>{headerTitle()}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                {selectedSkins.length>0 && (
                  <button onClick={handleAddToCanvas} disabled={isAdding}
                    style={{ background:'linear-gradient(135deg, #f5c842, #f59e0b)', border:'none', borderRadius:'8px', padding:'7px 14px', color:'#0a0d14', fontWeight:700, fontSize:'13px', cursor:'pointer', opacity:isAdding?0.6:1 }}>
                    {isAdding?'Addingâ€¦':`Add ${selectedSkins.length}`}
                  </button>
                )}
                <button onClick={handleClose} style={{ background:'none', border:'none', color:'#666', fontSize:'20px', cursor:'pointer', lineHeight:1, padding:'2px 4px' }}>âœ•</button>
              </div>
            </div>

            {/* Body */}
            <div style={{ flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
              {!mode && <div style={{ overflowY:'auto', flex:1 }}><ModeSelect onSelectMode={setMode} /></div>}

              {mode==='collection' && (
                <CollectionMode repoFiles={repoFiles} imageCache={imageCache} setImageCache={setImageCache}
                  selectedSkins={selectedSkins} setSelectedSkins={setSelectedSkins} />
              )}

              {mode==='hero' && !selectedHero && (
                <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
                  <div style={{ padding:'10px 12px', flexShrink:0 }}>
                    <input ref={heroSearchRef} type="text" placeholder="ðŸ” Search hero..." value={search} onChange={e => setSearch(e.target.value)}
                      style={{ width:'100%', background:'#0e1120', border:'1px solid #2a2400', borderRadius:'8px', padding:'8px 12px', color:'#fff', fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
                  </div>
                  <div style={{ flex:1, overflowY:'auto', padding:'0 12px 12px' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'8px' }}>
                      {filteredHeroes.map(hero => (
                        <button key={hero.id} onClick={() => { setSelectedHero(hero); setSearch('') }}
                          style={{ background:'#0e1120', border:'1px solid #2a2400', borderRadius:'12px', overflow:'hidden', cursor:'pointer', padding:0, textAlign:'left', transition:'border-color 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.borderColor='#f5c842'}
                          onMouseLeave={e => e.currentTarget.style.borderColor='#2a2400'}>
                          <img src={getHeroImage(hero)} alt={hero.name} crossOrigin="anonymous" style={{ width:'100%', height:'80px', objectFit:'cover', display:'block' }} onError={e => { e.target.src=HERO_PLACEHOLDER }} />
                          <div style={{ padding:'6px 8px' }}>
                            <p style={{ color:'#fff', fontSize:'11px', fontWeight:600, margin:'0 0 2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{hero.name}</p>
                            <p style={{ color:'#666', fontSize:'10px', margin:0 }}>{hero.skins.length} skins</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {mode==='hero' && selectedHero && (
                <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden' }}>
                  <div style={{ padding:'10px 12px', flexShrink:0 }}>
                    <input type="text" placeholder="ðŸ” Search skin..." value={search} onChange={e => setSearch(e.target.value)}
                      style={{ width:'100%', background:'#0e1120', border:'1px solid #2a2400', borderRadius:'8px', padding:'8px 12px', color:'#fff', fontSize:'13px', outline:'none', boxSizing:'border-box' }} />
                  </div>
                  <div style={{ flex:1, overflowY:'auto', padding:'0 10px 12px' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'6px' }}>
                      {selectedHero.skins.filter(s => fuzzyMatch(s.name, search)).map((skin, i) => {
                        const url=getSkinImage(selectedHero, skin), hasImg=!!url
                        const isSel=selectedSkins.find(s => s.name===skin.name)
                        return (
                          <button key={i} onClick={() => toggleSkin(skin, url)}
                            style={{ position:'relative', borderRadius:'10px', overflow:'hidden', border:`2px solid ${isSel?'#f5c842':hasImg?'#2a2400':'#1a1400'}`, opacity:hasImg?1:0.4, cursor:hasImg?'pointer':'not-allowed', transform:isSel?'scale(0.95)':'scale(1)', transition:'all 0.15s', background:'#0e1120', padding:0, textAlign:'center', display:'flex', flexDirection:'column' }}>
                            <div style={{ position:'relative', width:'100%' }}>
                              <img src={hasImg?url:PLACEHOLDER} alt={skin.name} crossOrigin="anonymous" style={{ width:'100%', height:'80px', objectFit:'cover', display:'block', background:'#0e1120' }} onError={e => { e.target.src=PLACEHOLDER }} />
                              {isSel && (
                                <div style={{ position:'absolute', top:'3px', right:'3px', width:'16px', height:'16px', background:'#f5c842', borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                  <span style={{ color:'#0a0d14', fontSize:'9px', fontWeight:800 }}>âœ“</span>
                                </div>
                              )}
                              {!hasImg && <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}><span style={{ color:'#555', fontSize:'9px' }}>No Image</span></div>}
                            </div>
                            <div style={{ padding:'4px 4px 5px', background:'#0e1120', borderTop:'1px solid #1e1800' }}>
                              <p style={{ color:'#f0e6c0', fontSize:'8px', fontWeight:700, margin:0, lineHeight:1.3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{skin.name}</p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
