const adjectives = [
  "ambitious", "beaming", "bold", "brave", "bright",
  "brilliant", "calm", "cheerful", "clever", "courageous",
  "crisp", "daring", "dazzling", "eager", "energetic",
  "fearless", "gentle", "glowing", "graceful", "grateful",
  "happy", "harmonious", "hopeful", "joyful", "keen",
  "lively", "luminous", "mighty", "nimble", "noble",
  "peaceful", "playful", "radiant", "resilient", "serene",
  "sharp", "sincere", "sleek", "soaring", "spirited",
  "steady", "stellar", "swift", "tender", "thriving",
  "vibrant", "vivid", "warm", "wise", "zesty",
];

const animals = [
  "albatross", "axolotl", "badger", "bear", "bison",
  "capybara", "cassowary", "cheetah", "condor", "crane",
  "dolphin", "eagle", "elephant", "falcon", "flamingo",
  "fox", "giraffe", "hawk", "heron", "jaguar",
  "koala", "lemur", "leopard", "lynx", "manta",
  "meerkat", "narwhal", "numbat", "orca", "osprey",
  "otter", "panda", "panther", "parrot", "pelican",
  "penguin", "phoenix", "puma", "quokka", "raven",
  "salamander", "seahorse", "sparrow", "swift", "tapir",
  "tigon", "toucan", "viper", "wombat", "zebu",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

console.log(`${pick(adjectives)}-${pick(animals)}`);
