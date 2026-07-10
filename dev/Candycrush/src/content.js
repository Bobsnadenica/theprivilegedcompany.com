export const RESOURCE_ORDER = [
  "candies",
  "lollipops",
  "chocolateBars",
  "sugarGlass",
  "moonSalt",
  "prismSeeds",
  "dragonCaramel"
];

export const RESOURCE_LABELS = {
  candies: "candies",
  lollipops: "lollipops",
  chocolateBars: "chocolate bars",
  sugarGlass: "sugar glass",
  moonSalt: "moon salt",
  prismSeeds: "prism seeds",
  dragonCaramel: "dragon caramel"
};

export const ASCII = {
  sugarbox: String.raw`
        ______________________________
       /                              \
      /      S U G A R B O X          \
     /__________________________________\
      |    .-.     .-.      .-.       |
      |   (   )   (   )    (   )      |
      |    '-'     '-'      '-'       |
      |        candies arrive         |
      |        one by one             |
      '--------------------------------'
`,
  village: String.raw`
             _     _       _     _
        _   | |   | |     | |   | |
       | |_| |___| |_____| |___| |_
       |  _  |   |  _  _  |   |  _|
       |_| |_|___|_| || |_|___|_|
            the village of spoons
`,
  farm: String.raw`
       . . . . . . . . . . . . . . .
      .   lollipop stakes in rows   .
       . . . . . . . . . . . . . . .
          | |    | |    | |    | |
          |_|    |_|    |_|    |_|
`,
  bridge: String.raw`
       shore       broken caramel bridge       far shore
        ___          _    _    _                 ___
       /   \________/ \__/ \__/ \_______________/   \
            planks missing, syrup below
`,
  forest: String.raw`
          &&&    &&&       &&&        &&&
         &&&&&  &&&&&     &&&&&      &&&&&
           ||     ||        ||          ||
       the trees whisper in alphabetical order
`,
  cave: String.raw`
             ______________________
           _/  _     _     _      \_
          /   (_)   (_)   (_)       \
          \__      salt shines     __/
             \____________________/
`,
  lighthouse: String.raw`
             |
            /_\
           /___\       light -> ? -> ?
          /_____\           ? -> shore
          |  _  |
          | | | |
          |_| |_|
`,
  pier: String.raw`
       ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~
         === === === === ===
        the taffy sea pulls gently
       ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~
`,
  desert: String.raw`
         _      _       _       _
        / \____/ \_____/ \_____/ \
       / amber dunes, quiet wheels \
       \___________________________/
`,
  fortress: String.raw`
             [ ]       [ ]
          ___| |_______| |___
         |  _  _  _  _  _  |
         | |_| |_| |_| |_| |
         |____glass fortress|
`,
  well: String.raw`
             .-----------.
            /   moon      \
           |     well      |
            \____   ______/
                 | |
                _| |_
`,
  keep: String.raw`
              /\                 /\
             /  \__ LICORICE __/  \
            |  [] [] [] [] [] []   |
            |___  ___  ___  ___ ___|
                ||   ||   ||   ||
`,
  orchard: String.raw`
       o     o      o      o      o
      /|\   /|\    /|\    /|\    /|\
       |     |      |      |      |
      / \   / \    / \    / \    / \
           the hollow orchard waits
`
};

export const EQUIPMENT = {
  bareHands: { slot: "weapon", name: "Bare hands", attack: 2, defense: 0, candyRate: 0 },
  tinSpoon: { slot: "weapon", name: "Tin spoon", attack: 7, defense: 0, candyRate: 0 },
  caramelDagger: { slot: "weapon", name: "Caramel dagger", attack: 13, defense: 0, candyRate: 0.2 },
  glassBlade: { slot: "weapon", name: "Glass blade", attack: 22, defense: 0, candyRate: 0.4 },
  moonFork: { slot: "weapon", name: "Moon fork", attack: 34, defense: 0, candyRate: 0.8 },
  seaNeedle: { slot: "weapon", name: "Sea needle", attack: 27, defense: 1, candyRate: 0.5 },
  echoSpoon: { slot: "weapon", name: "Echo spoon", attack: 42, defense: 1, candyRate: 1.4 },
  paperApron: { slot: "armor", name: "Paper apron", attack: 0, defense: 2, maxHp: 20 },
  syrupMail: { slot: "armor", name: "Syrup mail", attack: 0, defense: 6, maxHp: 55 },
  amberPlate: { slot: "armor", name: "Amber plate", attack: 1, defense: 13, maxHp: 120 },
  glassCloak: { slot: "armor", name: "Glass cloak", attack: 0, defense: 10, maxHp: 95 },
  orchardMantle: { slot: "armor", name: "Orchard mantle", attack: 4, defense: 16, maxHp: 160 },
  brambleLantern: { slot: "trinket", name: "Bramble lantern", attack: 1, defense: 1, candyRate: 0.9, maxHp: 10 },
  prismCharm: { slot: "trinket", name: "Prism charm", attack: 3, defense: 2, candyRate: 1.2, maxHp: 15 },
  licoriceKeyring: { slot: "trinket", name: "Licorice keyring", attack: 5, defense: 5, candyRate: 1.6, maxHp: 25 },
  pocketClock: { slot: "trinket", name: "Pocket clock", attack: 0, defense: 0, candyRate: 2.4, maxHp: 0 }
};

export const SHOP_ITEMS = [
  {
    id: "statusRibbon",
    name: "Status ribbon",
    description: "A little ribbon that keeps count of your better ideas.",
    cost: { candies: 30 },
    max: 1,
    effect: { unlocks: ["inventory"], log: "The ribbon ties itself to the box and begins counting." }
  },
  {
    id: "paperMap",
    name: "Folded map",
    description: "The village is drawn in one corner. The rest looks unfinished.",
    cost: { candies: 100 },
    max: 1,
    effect: { unlocks: ["map"], map: ["village", "brokenBridge"], log: "The map unfolds wider than the box." }
  },
  {
    id: "tinSpoon",
    name: "Tin spoon",
    description: "Officially a utensil. Unofficially sharp enough.",
    cost: { candies: 160 },
    max: 1,
    effect: { equipment: "tinSpoon", unlocks: ["quests"], log: "You hold the spoon like a hero would." }
  },
  {
    id: "paperApron",
    name: "Paper apron",
    description: "Better than courage against sticky things.",
    cost: { candies: 240 },
    max: 1,
    effect: { equipment: "paperApron", log: "The apron crinkles with defensive intent." }
  },
  {
    id: "starterPlot",
    name: "Lollipop stake",
    description: "A farm begins with one patient stick.",
    cost: { candies: 300 },
    max: 1,
    effect: { farmPlots: 1, map: ["orchardFarm"], unlocks: ["farm"], resources: { lollipops: 15 }, log: "A lollipop stake sprouts beside the box." }
  },
  {
    id: "beginnersGrimoire",
    name: "Beginner grimoire",
    description: "Three spells, two warnings, one suspicious stain.",
    cost: { lollipops: 1200 },
    max: 1,
    effect: { spells: ["fizzbolt", "sugarShield", "blink"], log: "The grimoire coughs up a page of spells." }
  },
  {
    id: "cauldronPermit",
    name: "Borrowed cauldron",
    description: "Heavy, warm, and legally almost yours.",
    cost: { lollipops: 3600, chocolateBars: 2 },
    max: 1,
    effect: { unlocks: ["cauldron"], log: "The cauldron settles down with a bubbling sigh." }
  },
  {
    id: "pocketClock",
    name: "Pocket clock",
    description: "It ticks only when nobody is looking.",
    cost: { sugarGlass: 8, moonSalt: 3 },
    max: 1,
    visibleWhen: { completedQuest: "desertCaravan" },
    effect: { equipment: "pocketClock", log: "The clock makes every candy feel slightly early." }
  }
];

export const FORGE_RECIPES = [
  {
    id: "caramelDagger",
    name: "Caramel dagger",
    description: "A warm blade for the forest road.",
    cost: { candies: 500, chocolateBars: 1 },
    creates: "caramelDagger",
    visibleWhen: { completedQuest: "trainingMeadow" }
  },
  {
    id: "syrupMail",
    name: "Syrup mail",
    description: "Layered syrup hardened into useful patience.",
    cost: { candies: 700, lollipops: 600, sugarGlass: 2 },
    creates: "syrupMail",
    visibleWhen: { completedQuest: "forestAmbush" }
  },
  {
    id: "glassBlade",
    name: "Glass blade",
    description: "Cuts by reflecting the idea of sharpness.",
    cost: { sugarGlass: 6, moonSalt: 2, chocolateBars: 2 },
    creates: "glassBlade",
    visibleWhen: { flag: "caveSolved" }
  },
  {
    id: "brambleLantern",
    name: "Bramble lantern",
    description: "A forest lamp that glows only near secrets.",
    cost: { lollipops: 900, sugarGlass: 3, prismSeeds: 1 },
    creates: "brambleLantern",
    visibleWhen: { flag: "forestRiddlesSolved" }
  },
  {
    id: "seaNeedle",
    name: "Sea needle",
    description: "Thin enough to sew a current shut.",
    cost: { sugarGlass: 7, moonSalt: 4, prismSeeds: 2 },
    creates: "seaNeedle",
    visibleWhen: { completedQuest: "caveMaze" }
  },
  {
    id: "glassCloak",
    name: "Glass cloak",
    description: "Almost invisible, very uncomfortable, surprisingly strong.",
    cost: { sugarGlass: 8, moonSalt: 5, prismSeeds: 3 },
    creates: "glassCloak",
    visibleWhen: { completedQuest: "seaDive" }
  },
  {
    id: "amberPlate",
    name: "Amber plate",
    description: "Desert heat caught in careful armor.",
    cost: { candies: 1800, moonSalt: 6, chocolateBars: 3 },
    creates: "amberPlate",
    visibleWhen: { completedQuest: "desertCaravan" }
  },
  {
    id: "prismCharm",
    name: "Prism charm",
    description: "A charm that lets rewards remember they could be larger.",
    cost: { prismSeeds: 8, sugarGlass: 8, dragonCaramel: 1 },
    creates: "prismCharm",
    visibleWhen: { completedQuest: "fortressRooms" }
  },
  {
    id: "licoriceKeyring",
    name: "Licorice keyring",
    description: "Keys that remember locks you have not met yet.",
    cost: { prismSeeds: 10, moonSalt: 8, dragonCaramel: 2 },
    creates: "licoriceKeyring",
    visibleWhen: { completedQuest: "fortressRooms" }
  },
  {
    id: "moonFork",
    name: "Moon fork",
    description: "The endgame utensil. Very formal.",
    cost: { moonSalt: 12, prismSeeds: 12, dragonCaramel: 3 },
    creates: "moonFork",
    visibleWhen: { completedQuest: "licoriceKeep" }
  },
  {
    id: "orchardMantle",
    name: "Orchard mantle",
    description: "A cloak for people who walked out of an ending.",
    cost: { dragonCaramel: 5, moonSalt: 15, prismSeeds: 15 },
    creates: "orchardMantle",
    visibleWhen: { completedQuest: "finalOrchard" }
  },
  {
    id: "echoSpoon",
    name: "Echo spoon",
    description: "Hits once, then politely repeats itself.",
    cost: { dragonCaramel: 7, sugarGlass: 20, lollipops: 12000 },
    creates: "echoSpoon",
    visibleWhen: { unlock: "developer" }
  }
];

export const CAULDRON_RECIPES = [
  {
    id: "health",
    name: "Health potion",
    description: "Restores 80 hit points during quests.",
    cost: { candies: 120 },
    output: { health: 1 }
  },
  {
    id: "turtle",
    name: "Turtle potion",
    description: "Halves incoming damage for 8 quest rounds.",
    cost: { candies: 80, lollipops: 250 },
    output: { turtle: 1 }
  },
  {
    id: "quicksilver",
    name: "Quicksilver potion",
    description: "Doubles your next 6 attacks.",
    cost: { lollipops: 500, sugarGlass: 1 },
    output: { quicksilver: 1 },
    visibleWhen: { flag: "caveSolved" }
  },
  {
    id: "starfire",
    name: "Starfire flask",
    description: "Burns the active enemy for a large burst.",
    cost: { moonSalt: 2, prismSeeds: 2, candies: 900 },
    output: { starfire: 1 },
    visibleWhen: { completedQuest: "desertCaravan" }
  },
  {
    id: "focus",
    name: "Focus cordial",
    description: "Improves puzzle progress and attack precision for a few rounds.",
    cost: { candies: 400, lollipops: 600 },
    output: { focus: 1 },
    visibleWhen: { unlock: "cauldron" }
  },
  {
    id: "glass",
    name: "Glass luck draught",
    description: "Reflects part of incoming quest damage.",
    cost: { sugarGlass: 3, candies: 600 },
    output: { glass: 1 },
    visibleWhen: { flag: "caveSolved" }
  },
  {
    id: "moon",
    name: "Moon syrup",
    description: "Heals a little and makes your shadow useful.",
    cost: { moonSalt: 3, lollipops: 900 },
    output: { moon: 1 },
    visibleWhen: { completedQuest: "caveMaze" }
  },
  {
    id: "prism",
    name: "Prism vapor",
    description: "Greatly helps exploration and puzzle quests.",
    cost: { prismSeeds: 4, sugarGlass: 4 },
    output: { prism: 1 },
    visibleWhen: { completedQuest: "seaDive" }
  },
  {
    id: "caramel",
    name: "Caramel varnish",
    description: "Protects escorts and seals cracks.",
    cost: { dragonCaramel: 1, candies: 1200 },
    output: { caramel: 1 },
    visibleWhen: { completedQuest: "fortressRooms" }
  },
  {
    id: "echo",
    name: "Echo extract",
    description: "Repeats your best idea in late quests.",
    cost: { dragonCaramel: 2, moonSalt: 5, prismSeeds: 5 },
    output: { echo: 1 },
    visibleWhen: { unlock: "developer" }
  }
];

export const MAP_NODES = [
  { id: "sugarbox", name: "Sugarbox", art: "sugarbox", description: "The box where everything starts." },
  { id: "village", name: "Village", art: "village", description: "Shops, gossip, and a forge with a careful sign." },
  { id: "orchardFarm", name: "Orchard Farm", art: "farm", description: "Plant lollipops. Harvest patience." },
  { id: "brokenBridge", name: "Broken Bridge", art: "bridge", description: "The far road is one repair away." },
  { id: "whisperingForest", name: "Whispering Forest", art: "forest", description: "The trees trade riddles for keys." },
  { id: "saltCave", name: "Salt Cave", art: "cave", description: "Every wrong turn tastes expensive." },
  { id: "lighthouse", name: "Lighthouse", art: "lighthouse", description: "Its beam knows where the sea begins." },
  { id: "pier", name: "Pier", art: "pier", description: "The taffy sea pulls at your boots." },
  { id: "taffySea", name: "Taffy Sea", art: "pier", description: "A sticky dive for serious equipment." },
  { id: "amberDesert", name: "Amber Desert", art: "desert", description: "A caravan route under hard sugar suns." },
  { id: "glassFortress", name: "Glass Fortress", art: "fortress", description: "Rooms reflect rooms that reflect rooms." },
  { id: "moonWell", name: "Moon Well", art: "well", description: "Wish carefully. The well remembers tone." },
  { id: "licoriceKeep", name: "Licorice Keep", art: "keep", description: "The last locked place before the orchard." },
  { id: "hollowOrchard", name: "Hollow Orchard", art: "orchard", description: "A place where sweets have shadows." }
];

export const LOCATION_DETAILS = {
  sugarbox: [
    "The box seam is warm where no hand touched it.",
    "A tiny number under the lid changes when you blink."
  ],
  village: [
    "The shopkeeper writes prices in pencil, then in syrup.",
    "A forge apprentice practices hammering silence flat.",
    "Someone has carved a spoon-shaped compass into a doorframe."
  ],
  orchardFarm: [
    "One lollipop row leans toward the moon well.",
    "The soil is mostly sugar and old patience.",
    "A root below the farm taps twice when you plant too many."
  ],
  brokenBridge: [
    "The missing planks are not broken; they are hiding.",
    "The syrup below reflects the far shore before the near one."
  ],
  whisperingForest: [
    "The trees whisper in alphabetical order until you answer.",
    "A bramble lantern shape has been burned into the bark.",
    "The forest floor keeps footprints for exactly three questions."
  ],
  saltCave: [
    "Salt crystals point north, then east, then pretend they did not.",
    "The cave wall tastes like a recipe you have not learned."
  ],
  lighthouse: [
    "The keeper has labeled the red lens twice.",
    "A beam diagram shows blue in two places and green at the end.",
    "A gull has stolen a small piece of shadow from the stairs."
  ],
  pier: [
    "The pier boards stretch when the sea gets curious.",
    "A boat name has been scratched out and replaced with Maybe."
  ],
  taffySea: [
    "The sea surface tries to keep the shape of your face.",
    "Something below threads bubbles like beads."
  ],
  amberDesert: [
    "The caravan cook spices everything with moon salt.",
    "A dune moves only when no one compliments it."
  ],
  glassFortress: [
    "Every hallway reflection is one second late.",
    "The annex door opens inward, outward, and eventually sideways."
  ],
  moonWell: [
    "The well remembers every exact word spent near it.",
    "A coin at the bottom is falling upward."
  ],
  licoriceKeep: [
    "The keyholes smell like burnt caramel.",
    "The keep bends toward whoever carries the most endings."
  ],
  hollowOrchard: [
    "The fruit is empty but heavy.",
    "The orchard voice speaks from roots that are no longer there.",
    "A second ending hangs behind the first like a seed."
  ]
};

export const RUMORS = [
  { id: "pileMouth", text: "Drop enough candy and the ground starts answering.", cost: { lollipops: 40 } },
  { id: "forestLamp", text: "The forest does not give the lantern to people who skip riddles.", cost: { lollipops: 90 }, when: { map: "whisperingForest" } },
  { id: "saltRoute", text: "Cave salt points the way if you stop arguing with it.", cost: { lollipops: 120 }, when: { map: "saltCave" } },
  { id: "twoBlue", text: "The lighthouse keeper trusts blue twice.", cost: { lollipops: 180 }, when: { map: "lighthouse" } },
  { id: "cookfire", text: "The caravan cook pays well for guarded spices.", cost: { lollipops: 260 }, when: { completedQuest: "seaDive" } },
  { id: "annex", text: "The fortress has a room that was embarrassed to be in the main quest.", cost: { moonSalt: 1 }, when: { completedQuest: "fortressRooms" } },
  { id: "moonEnding", text: "The moon well does not grant endings; it negotiates them.", cost: { moonSalt: 2 }, when: { completedQuest: "desertCaravan" } },
  { id: "boxEnding", text: "The console can end the story without ending the box.", cost: { dragonCaramel: 1 }, when: { completedQuest: "finalOrchard" } }
];

export const QUESTS = [
  {
    id: "trainingMeadow",
    name: "Training meadow",
    location: "village",
    description: "Learn which end of the spoon points forward.",
    unlock: { map: "village", equipment: "tinSpoon" },
    enemies: [
      { name: "crumb scout", hp: 28, attack: 3, armor: 0 },
      { name: "sugar beetle", hp: 36, attack: 4, armor: 1 }
    ],
    rewards: { candies: 180, lollipops: 45, chocolateBars: 1 },
    first: { unlocks: ["forge"], map: ["whisperingForest"], log: "The village forge opens after hearing about your spoon work." }
  },
  {
    id: "forestAmbush",
    name: "Forest ambush",
    location: "whisperingForest",
    description: "Something in the branches wants a toll.",
    unlock: { flag: "bridgeRepaired" },
    enemies: [
      { name: "syrup moth", hp: 48, attack: 6, armor: 1 },
      { name: "bramble baker", hp: 70, attack: 8, armor: 2 }
    ],
    rewards: { candies: 420, lollipops: 180, sugarGlass: 2, prismSeeds: 1 },
    first: { map: ["saltCave"], log: "The forest gives up the path to the salt cave." }
  },
  {
    id: "caveMaze",
    name: "Cave maze",
    location: "saltCave",
    description: "Carry a steady light through the tasting dark.",
    unlock: { flag: "caveSolved" },
    enemies: [
      { name: "salt bat", hp: 58, attack: 9, armor: 2 },
      { name: "glass crawler", hp: 82, attack: 10, armor: 4 }
    ],
    rewards: { candies: 650, lollipops: 340, sugarGlass: 4, moonSalt: 2 },
    first: { map: ["lighthouse"], log: "A tunnel wind points toward the lighthouse." }
  },
  {
    id: "seaDive",
    name: "Taffy sea dive",
    location: "taffySea",
    description: "Dive below the surface before it remembers to stick.",
    unlock: { flag: "lighthouseSolved" },
    enemies: [
      { name: "gum current", hp: 70, attack: 11, armor: 3 },
      { name: "taffy eel", hp: 95, attack: 13, armor: 4 }
    ],
    rewards: { candies: 900, lollipops: 600, prismSeeds: 4, moonSalt: 2 },
    first: { map: ["amberDesert"], log: "A bottle from the sea contains desert sand." }
  },
  {
    id: "desertCaravan",
    name: "Amber caravan",
    location: "amberDesert",
    description: "Guard a caravan that insists it is not lost.",
    unlock: { completedQuest: "seaDive" },
    enemies: [
      { name: "amber wheel", hp: 110, attack: 14, armor: 5 },
      { name: "caramel bandit", hp: 120, attack: 16, armor: 4 }
    ],
    rewards: { candies: 1300, lollipops: 900, moonSalt: 4, chocolateBars: 2 },
    first: { map: ["glassFortress", "moonWell"], log: "The caravan captain marks the glass fortress on your map." }
  },
  {
    id: "fortressRooms",
    name: "Fortress rooms",
    location: "glassFortress",
    description: "Room after room, reflection after reflection.",
    unlock: { completedQuest: "desertCaravan" },
    enemies: [
      { name: "mirror page", hp: 120, attack: 15, armor: 6 },
      { name: "sugar-glass knight", hp: 155, attack: 18, armor: 7 },
      { name: "hallway echo", hp: 90, attack: 20, armor: 2 }
    ],
    rewards: { candies: 1900, lollipops: 1200, sugarGlass: 6, prismSeeds: 6, dragonCaramel: 1 },
    first: { map: ["licoriceKeep"], log: "A reflected key becomes real enough for the licorice keep." }
  },
  {
    id: "licoriceKeep",
    name: "Licorice keep",
    location: "licoriceKeep",
    description: "The gates bend, but they do not open politely.",
    unlock: { completedQuest: "fortressRooms" },
    enemies: [
      { name: "black sugar guard", hp: 165, attack: 20, armor: 7 },
      { name: "licorice engine", hp: 220, attack: 24, armor: 8 }
    ],
    rewards: { candies: 2600, lollipops: 1800, moonSalt: 6, prismSeeds: 8, dragonCaramel: 2 },
    first: { map: ["hollowOrchard"], log: "The keep opens a road that was not on the map yesterday." }
  },
  {
    id: "finalOrchard",
    name: "The hollow orchard",
    location: "hollowOrchard",
    description: "End the hunger at the root.",
    type: "boss",
    unlock: { completedQuest: "licoriceKeep" },
    phases: [
      { intro: "The roots remember your footsteps.", enemies: [{ name: "hollow root", hp: 210, attack: 24, armor: 8, ability: "drain" }] },
      { intro: "The shade bends into a second shape.", enemies: [{ name: "orchard shade", hp: 260, attack: 28, armor: 9, ability: "pierce" }] },
      { intro: "The final fruit opens without becoming full.", enemies: [{ name: "empty fruit", hp: 340, attack: 32, armor: 10, ability: "drain" }] }
    ],
    events: [
      {
        id: "rootMercy",
        round: 2,
        text: "The orchard asks whether hunger deserves mercy.",
        choices: [
          { id: "mercy", label: "answer gently", effect: { heal: 45, buff: "shield", duration: 4 }, trust: { orchardVoice: 2 }, log: "The roots loosen around your feet." },
          { id: "blade", label: "answer with the fork", effect: { buff: "focus", duration: 5 }, trust: { orchardVoice: -1 }, log: "The fork rings like a bell under the bark." }
        ]
      }
    ],
    rewards: { candies: 5000, lollipops: 3000, dragonCaramel: 4 },
    first: { unlocks: ["developer", "endgame"], ending: "orchard", endingLabel: "The Hollow Orchard", log: "The orchard is quiet. A new tab appears because reality is loose now." }
  },
  {
    id: "shopkeeperErrand",
    name: "Shopkeeper's errand",
    location: "village",
    description: "Find the price tag that escaped before it learns economics.",
    type: "exploration",
    unlock: { map: "village" },
    targetProgress: 55,
    hazards: { damageEvery: 4, damage: 2 },
    events: [
      {
        id: "tagCorner",
        round: 2,
        text: "The tag hides under a shelf marked probably cursed.",
        choices: [
          { id: "reach", label: "reach under it", effect: { progress: 12 }, trust: { shopkeeper: 1 }, log: "You rescue a dusty price tag." },
          { id: "wait", label: "wait it out", effect: { heal: 15 }, log: "The tag gets bored and scoots closer." }
        ]
      }
    ],
    rewards: { candies: 220, lollipops: 90 },
    first: { log: "The shopkeeper starts saving stranger rumors for you." }
  },
  {
    id: "farmUnderRoots",
    name: "Under-root tapping",
    location: "orchardFarm",
    description: "Survive what knocks from below the farm rows.",
    type: "survival",
    unlock: { unlock: "farm" },
    roundsRequired: 8,
    hazards: { damage: 7 },
    rewards: { lollipops: 420, prismSeeds: 1 },
    first: { log: "The farm roots agree to grow in less obvious directions." }
  },
  {
    id: "bridgeEchoes",
    name: "Bridge echoes",
    location: "brokenBridge",
    description: "Solve the echo pattern under the repaired bridge.",
    type: "puzzle",
    unlock: { flag: "bridgeRepaired" },
    targetProgress: 70,
    events: [
      {
        id: "echoWord",
        round: 3,
        text: "An echo repeats the word planks until it becomes thanks.",
        choices: [
          { id: "thanks", label: "say thanks", effect: { progress: 20 }, log: "The bridge creaks politely." },
          { id: "planks", label: "say planks", effect: { buff: "focus", duration: 3 }, log: "The echo sharpens into a route." }
        ]
      }
    ],
    rewards: { sugarGlass: 3, moonSalt: 1 },
    first: { log: "The bridge reveals an echo-road beneath it." }
  },
  {
    id: "keeperLens",
    name: "Keeper's lens",
    location: "lighthouse",
    description: "Help the lighthouse keeper polish a beam without waking the sea.",
    type: "puzzle",
    unlock: { flag: "caveSolved" },
    targetProgress: 85,
    rewards: { prismSeeds: 3, moonSalt: 2 },
    first: { log: "The lighthouse keeper begins trusting your color choices." }
  },
  {
    id: "caravanCookfire",
    name: "Caravan cookfire",
    location: "amberDesert",
    description: "Escort the caravan cook's spice cart through amber wind.",
    type: "escort",
    unlock: { completedQuest: "seaDive" },
    targetProgress: 90,
    integrity: 85,
    hazards: { integrityLoss: 8 },
    events: [
      {
        id: "spiceSpill",
        round: 4,
        text: "The spice cart tilts toward a dune with opinions.",
        choices: [
          { id: "brace", label: "brace the cart", effect: { integrity: 20 }, trust: { caravanCook: 2 }, log: "The cook salutes with a soup spoon." },
          { id: "run", label: "run ahead", effect: { progress: 18 }, log: "The road clears just in time." }
        ]
      }
    ],
    rewards: { candies: 900, moonSalt: 4, chocolateBars: 2 },
    first: { log: "The caravan cook adds your name to the good spoon list." }
  },
  {
    id: "fortressAnnex",
    name: "Fortress annex",
    location: "glassFortress",
    description: "Fight a room that was cut from the main hallway for being too reflective.",
    type: "boss",
    unlock: { completedQuest: "fortressRooms" },
    phases: [
      { intro: "The annex copies your stance.", enemies: [{ name: "annex reflection", hp: 180, attack: 18, armor: 8, ability: "drain" }] },
      { intro: "The copy finds a sharper angle.", enemies: [{ name: "angle duplicate", hp: 210, attack: 22, armor: 7, ability: "pierce" }] }
    ],
    rewards: { sugarGlass: 8, prismSeeds: 7, dragonCaramel: 1 },
    first: { log: "The annex folds itself into your journal." }
  },
  {
    id: "moonWellBargain",
    name: "Moon well bargain",
    location: "moonWell",
    description: "Negotiate with the well for an ending that leaves the orchard untouched.",
    type: "puzzle",
    unlock: { completedQuest: "desertCaravan" },
    targetProgress: 110,
    events: [
      {
        id: "namePrice",
        round: 2,
        text: "The well asks what part of the story you are willing to spend.",
        choices: [
          { id: "memory", label: "spend a memory", effect: { progress: 25 }, log: "The well swallows a memory of a candy you never ate." },
          { id: "salt", label: "spend moon salt", effect: { buff: "focus", duration: 6 }, log: "Moon salt rings against the water." }
        ]
      }
    ],
    rewards: { moonSalt: 8, prismSeeds: 6 },
    first: { ending: "moon", endingLabel: "The Moon Well Bargain", unlocks: ["endgame"], log: "The well writes a quiet alternate ending in silver." }
  },
  {
    id: "boxSingularity",
    name: "Box singularity",
    location: "sugarbox",
    description: "Convince the console that the box was the final boss all along.",
    type: "puzzle",
    unlock: { unlock: "developer" },
    targetProgress: 130,
    hazards: { damageEvery: 5, damage: 5 },
    rewards: { candies: 9000, dragonCaramel: 3 },
    first: { ending: "box", endingLabel: "The Box Singularity", log: "The box ends the story by becoming the menu." }
  }
];

export const RIDDLES = [
  {
    prompt: "First tree: I grow when eaten, vanish when hoarded, and start in your box.",
    answer: "candy",
    reward: { candies: 80, lollipops: 40 }
  },
  {
    prompt: "Second tree: Say the missing letter in this row: S U G A R B O _.",
    answer: "x",
    reward: { sugarGlass: 1, prismSeeds: 1 }
  },
  {
    prompt: "Third tree: The road is broken. What does a bridge want most?",
    answer: "planks",
    reward: { sugarGlass: 2 },
    flag: "forestRiddlesSolved"
  },
  {
    prompt: "Fourth tree: What follows you into caves but never enters first?",
    answer: "shadow",
    reward: { moonSalt: 1 }
  },
  {
    prompt: "Fifth tree: Which way did the first salt crystal point?",
    answer: "north",
    reward: { candies: 250, lollipops: 150 }
  },
  {
    prompt: "Sixth tree: Which lighthouse color is trusted twice?",
    answer: "blue",
    reward: { prismSeeds: 2 }
  },
  {
    prompt: "Seventh tree: The fortress enemy you always bring with you is your...",
    answer: "mirror",
    reward: { sugarGlass: 3 }
  },
  {
    prompt: "Eighth tree: The moon well likes this mineral more than compliments.",
    answer: "salt",
    reward: { moonSalt: 2 }
  },
  {
    prompt: "Ninth tree: A hero's first weapon and last utensil.",
    answer: "spoon",
    reward: { chocolateBars: 1, lollipops: 300 }
  },
  {
    prompt: "Tenth tree: The well's favorite sky coin.",
    answer: "moon",
    reward: { moonSalt: 2, prismSeeds: 1 }
  },
  {
    prompt: "Eleventh tree: The place where empty fruit grows.",
    answer: "orchard",
    reward: { dragonCaramel: 1 },
    flag: "orchardNameKnown"
  },
  {
    prompt: "Twelfth tree: What does the box say when the story is listening?",
    answer: "silence",
    reward: { dragonCaramel: 1, prismSeeds: 3 },
    flag: "riddleCrown"
  }
];

export const CAVE_SEQUENCE = ["north", "east", "east", "south", "west"];
export const LIGHTHOUSE_SEQUENCE = ["red", "blue", "blue", "green"];

export const WISHES = [
  {
    id: "courage",
    name: "Wish for courage",
    cost: { candies: 900, moonSalt: 1 },
    max: 1,
    effect: { maxHp: 35, log: "The well gives you courage, then charges interest in moonlight." }
  },
  {
    id: "seeds",
    name: "Wish for prism seeds",
    cost: { lollipops: 900, moonSalt: 2 },
    max: 3,
    effect: { resources: { prismSeeds: 3 }, log: "Seeds rise from the well like small colored teeth." }
  },
  {
    id: "shortcut",
    name: "Wish for a shortcut",
    cost: { sugarGlass: 5, prismSeeds: 3 },
    max: 1,
    effect: { unlocks: ["quickTravel"], log: "The map folds itself into a more convenient lie." }
  },
  {
    id: "recipe",
    name: "Wish for a recipe",
    cost: { lollipops: 1400, sugarGlass: 2 },
    max: 1,
    effect: { flag: "wellRecipe", resources: { moonSalt: 1 }, log: "The well gives you a recipe written as a ripple." }
  },
  {
    id: "trust",
    name: "Wish for a kind word",
    cost: { candies: 1200, prismSeeds: 1 },
    max: 2,
    effect: { flag: "wellKindness", log: "The well says something kind enough to be suspicious." }
  },
  {
    id: "glass",
    name: "Wish for glass",
    cost: { lollipops: 1600, moonSalt: 1 },
    max: 3,
    effect: { resources: { sugarGlass: 4 }, log: "Sugar glass rises in neat, impossible panes." }
  },
  {
    id: "caramel",
    name: "Wish for dragon caramel",
    cost: { moonSalt: 5, prismSeeds: 5, candies: 2000 },
    max: 2,
    effect: { resources: { dragonCaramel: 1 }, log: "The well spits out caramel that is warmer than the water." }
  },
  {
    id: "ending",
    name: "Wish for another ending",
    cost: { moonSalt: 10, dragonCaramel: 2 },
    max: 1,
    effect: { flag: "wellEndingHint", log: "The well says: bargain, do not conquer." }
  }
];

export const DEV_COMMANDS = [
  {
    id: "sweeten",
    name: "sweeten()",
    cost: { lollipops: 10000 },
    effect: { resources: { candies: 5000 }, log: "The console prints: fine, have some candies." }
  },
  {
    id: "overclock",
    name: "overclockFarm()",
    cost: { prismSeeds: 10, dragonCaramel: 1 },
    once: true,
    effect: { flag: "farmOverclocked", log: "The farm now thinks seconds are suggestions." }
  },
  {
    id: "invert",
    name: "invertPalette()",
    cost: { sugarGlass: 6 },
    effect: { toggleDark: true, log: "The screen blinks in a deeply official way." }
  }
];
