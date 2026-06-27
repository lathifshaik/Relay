export type ReasoningQ = {
  statement: string;
  question: string;
  options: [string, string];
  answer: string;
};

export type PerceptualQ = {
  pairs: [string, string][];
  answer: number;
};

export type NumberQ = {
  numbers: [number, number, number];
  answer: number;
};

export type WordQ = {
  words: [string, string, string];
  answer: string;
};

export type SpatialQ = {
  pairs: [[boolean, boolean], [boolean, boolean]];
  rotations: [number, number, number, number];
  answer: number;
};

export const reasoningQuestions: ReasoningQ[] = [
  { statement: "Anna is faster than Ben. Ben is faster than Carol.", question: "Who is fastest?", options: ["Anna", "Carol"], answer: "Anna" },
  { statement: "Dan is older than Eve. Eve is older than Fred.", question: "Who is youngest?", options: ["Dan", "Fred"], answer: "Fred" },
  { statement: "Gina is taller than Harry. Harry is taller than Iris.", question: "Who is tallest?", options: ["Gina", "Iris"], answer: "Gina" },
  { statement: "Jack is heavier than Kate. Kate is heavier than Leo.", question: "Who is lightest?", options: ["Jack", "Leo"], answer: "Leo" },
  { statement: "Mia is smarter than Nick. Nick is smarter than Owen.", question: "Who is smartest?", options: ["Mia", "Owen"], answer: "Mia" },
  { statement: "Paul is shorter than Quinn. Quinn is shorter than Rose.", question: "Who is shortest?", options: ["Paul", "Rose"], answer: "Paul" },
  { statement: "Sam is slower than Tara. Tara is slower than Uma.", question: "Who is slowest?", options: ["Sam", "Uma"], answer: "Sam" },
  { statement: "Vera is younger than Walt. Walt is younger than Xena.", question: "Who is oldest?", options: ["Vera", "Xena"], answer: "Xena" },
  { statement: "Yara is lighter than Zack. Zack is lighter than Amy.", question: "Who is heaviest?", options: ["Yara", "Amy"], answer: "Amy" },
  { statement: "Bob is louder than Cleo. Cleo is louder than Dave.", question: "Who is quietest?", options: ["Bob", "Dave"], answer: "Dave" },
  { statement: "Ella is richer than Finn. Finn is richer than Gus.", question: "Who is richest?", options: ["Ella", "Gus"], answer: "Ella" },
  { statement: "Holly is lazier than Ike. Ike is lazier than Jade.", question: "Who is laziest?", options: ["Holly", "Jade"], answer: "Jade" },
  { statement: "Karl is braver than Lily. Lily is braver than Max.", question: "Who is bravest?", options: ["Karl", "Max"], answer: "Karl" },
  { statement: "Nora is busier than Omar. Omar is busier than Pam.", question: "Who is least busy?", options: ["Nora", "Pam"], answer: "Pam" },
  { statement: "Rex is faster than Sara. Sara is faster than Tom.", question: "Who is slowest?", options: ["Rex", "Tom"], answer: "Tom" },
  { statement: "Uma is sadder than Vince. Vince is sadder than Wendy.", question: "Who is happiest?", options: ["Uma", "Wendy"], answer: "Wendy" },
  { statement: "Xander is colder than Yolanda. Yolanda is colder than Zara.", question: "Who is warmest?", options: ["Xander", "Zara"], answer: "Zara" },
  { statement: "Alice is wiser than Brian. Brian is wiser than Clara.", question: "Who is wisest?", options: ["Alice", "Clara"], answer: "Alice" },
  { statement: "Derek is younger than Emma. Emma is younger than Fran.", question: "Who is youngest?", options: ["Derek", "Fran"], answer: "Derek" },
  { statement: "Glen is heavier than Hannah. Hannah is heavier than Ian.", question: "Who is lightest?", options: ["Glen", "Ian"], answer: "Ian" },
  { statement: "Julia is louder than Ken. Ken is louder than Laura.", question: "Who is loudest?", options: ["Julia", "Laura"], answer: "Julia" },
  { statement: "Mike is shorter than Nancy. Nancy is shorter than Olga.", question: "Who is tallest?", options: ["Mike", "Olga"], answer: "Olga" },
  { statement: "Peter is richer than Quincy. Quincy is richer than Rachel.", question: "Who is poorest?", options: ["Peter", "Rachel"], answer: "Rachel" },
  { statement: "Steve is slower than Tina. Tina is slower than Ulric.", question: "Who is fastest?", options: ["Steve", "Ulric"], answer: "Ulric" },
  { statement: "Violet is braver than Will. Will is braver than Xia.", question: "Who is least brave?", options: ["Violet", "Xia"], answer: "Xia" },
  { statement: "Yvette is busier than Zane. Zane is busier than Adam.", question: "Who is least busy?", options: ["Yvette", "Adam"], answer: "Adam" },
  { statement: "Beth is older than Cole. Cole is older than Diana.", question: "Who is oldest?", options: ["Beth", "Diana"], answer: "Beth" },
  { statement: "Ed is lazier than Fiona. Fiona is lazier than George.", question: "Who is least lazy?", options: ["Ed", "George"], answer: "Ed" },
  { statement: "Hank is taller than Ingrid. Ingrid is taller than Jerry.", question: "Who is shortest?", options: ["Hank", "Jerry"], answer: "Jerry" },
  { statement: "Karen is faster than Liam. Liam is faster than Mel.", question: "Who is slowest?", options: ["Karen", "Mel"], answer: "Mel" },
  { statement: "Nina is smarter than Oscar. Oscar is smarter than Paula.", question: "Who is least smart?", options: ["Nina", "Paula"], answer: "Paula" },
  { statement: "Quentin is lighter than Ruth. Ruth is lighter than Sean.", question: "Who is heaviest?", options: ["Quentin", "Sean"], answer: "Sean" },
  { statement: "Tracy is sadder than Umar. Umar is sadder than Vera.", question: "Who is saddest?", options: ["Tracy", "Vera"], answer: "Tracy" },
  { statement: "Walter is colder than Ximena. Ximena is colder than Yusuf.", question: "Who is coldest?", options: ["Walter", "Yusuf"], answer: "Walter" },
  { statement: "Zoe is wiser than Aaron. Aaron is wiser than Bella.", question: "Who is least wise?", options: ["Zoe", "Bella"], answer: "Bella" },
  { statement: "Carl is louder than Dana. Dana is louder than Eric.", question: "Who is quietest?", options: ["Carl", "Eric"], answer: "Eric" },
  { statement: "Faith is younger than Greg. Greg is younger than Helen.", question: "Who is oldest?", options: ["Faith", "Helen"], answer: "Helen" },
  { statement: "Ivan is heavier than Joan. Joan is heavier than Kurt.", question: "Who is lightest?", options: ["Ivan", "Kurt"], answer: "Kurt" },
  { statement: "Luna is faster than Marco. Marco is faster than Nell.", question: "Who is fastest?", options: ["Luna", "Nell"], answer: "Luna" },
  { statement: "Owen is richer than Petra. Petra is richer than Quinn.", question: "Who is richest?", options: ["Owen", "Quinn"], answer: "Owen" },
  { statement: "Rosa is shorter than Simon. Simon is shorter than Tess.", question: "Who is tallest?", options: ["Rosa", "Tess"], answer: "Tess" },
  { statement: "Ulric is braver than Val. Val is braver than Wade.", question: "Who is bravest?", options: ["Ulric", "Wade"], answer: "Ulric" },
  { statement: "Xena is busier than Yemi. Yemi is busier than Zach.", question: "Who is busiest?", options: ["Xena", "Zach"], answer: "Xena" },
  { statement: "Amy is lazier than Ben. Ben is lazier than Cara.", question: "Who is least lazy?", options: ["Amy", "Cara"], answer: "Amy" },
  { statement: "Don is older than Elsa. Elsa is older than Felix.", question: "Who is youngest?", options: ["Don", "Felix"], answer: "Felix" },
  { statement: "Greta is smarter than Hugh. Hugh is smarter than Ida.", question: "Who is least smart?", options: ["Greta", "Ida"], answer: "Ida" },
  { statement: "Jake is lighter than Kim. Kim is lighter than Leo.", question: "Who is lightest?", options: ["Jake", "Leo"], answer: "Jake" },
  { statement: "Maya is slower than Ned. Ned is slower than Ola.", question: "Who is fastest?", options: ["Maya", "Ola"], answer: "Ola" },
  { statement: "Pam is sadder than Roy. Roy is sadder than Sue.", question: "Who is happiest?", options: ["Pam", "Sue"], answer: "Sue" },
  { statement: "Tim is warmer than Una. Una is warmer than Vic.", question: "Who is coldest?", options: ["Tim", "Vic"], answer: "Vic" },
];

function makePerceptualQ(): PerceptualQ {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const pairs: [string, string][] = [];
  let matchCount = 0;
  for (let i = 0; i < 4; i++) {
    const upper = letters[Math.floor(Math.random() * 26)];
    const doesMatch = Math.random() > 0.5;
    if (doesMatch) {
      pairs.push([upper, upper.toLowerCase()]);
      matchCount++;
    } else {
      let lower = upper.toLowerCase();
      while (lower === upper.toLowerCase()) {
        lower = letters[Math.floor(Math.random() * 26)].toLowerCase();
      }
      pairs.push([upper, lower]);
    }
  }
  return { pairs, answer: matchCount };
}

export function generatePerceptualQuestions(n: number): PerceptualQ[] {
  return Array.from({ length: n }, makePerceptualQ);
}

function makeNumberQ(): NumberQ {
  const a = Math.floor(Math.random() * 90) + 1;
  let b = Math.floor(Math.random() * 90) + 1;
  let c = Math.floor(Math.random() * 90) + 1;
  while (b === a) b = Math.floor(Math.random() * 90) + 1;
  while (c === a || c === b) c = Math.floor(Math.random() * 90) + 1;
  const sorted = [a, b, c].sort((x, y) => x - y);
  const mid = sorted[1];
  const distA = Math.abs(a - mid);
  const distB = Math.abs(b - mid);
  const distC = Math.abs(c - mid);
  const maxDist = Math.max(distA, distB, distC);
  let answer: number;
  if (distA === maxDist) answer = a;
  else if (distB === maxDist) answer = b;
  else answer = c;
  return { numbers: [a, b, c], answer };
}

export function generateNumberQuestions(n: number): NumberQ[] {
  return Array.from({ length: n }, makeNumberQ);
}

export const wordQuestions: WordQ[] = [
  { words: ["Happy", "Joyful", "Bitter"], answer: "Bitter" },
  { words: ["Fast", "Rapid", "Slow"], answer: "Slow" },
  { words: ["Big", "Large", "Tiny"], answer: "Tiny" },
  { words: ["Hot", "Cold", "Warm"], answer: "Cold" },
  { words: ["Brave", "Bold", "Timid"], answer: "Timid" },
  { words: ["Clever", "Stupid", "Smart"], answer: "Stupid" },
  { words: ["Kind", "Cruel", "Gentle"], answer: "Cruel" },
  { words: ["Strong", "Weak", "Powerful"], answer: "Weak" },
  { words: ["Noisy", "Quiet", "Loud"], answer: "Quiet" },
  { words: ["Ancient", "Modern", "Old"], answer: "Modern" },
  { words: ["Rich", "Poor", "Wealthy"], answer: "Poor" },
  { words: ["Sad", "Gloomy", "Cheerful"], answer: "Cheerful" },
  { words: ["Easy", "Simple", "Difficult"], answer: "Difficult" },
  { words: ["Dark", "Bright", "Light"], answer: "Dark" },
  { words: ["Start", "Begin", "Finish"], answer: "Finish" },
  { words: ["Love", "Hate", "Adore"], answer: "Hate" },
  { words: ["Push", "Pull", "Shove"], answer: "Pull" },
  { words: ["Buy", "Sell", "Purchase"], answer: "Sell" },
  { words: ["Rise", "Fall", "Ascend"], answer: "Fall" },
  { words: ["Open", "Shut", "Close"], answer: "Open" },
  { words: ["Narrow", "Wide", "Thin"], answer: "Wide" },
  { words: ["Smooth", "Rough", "Coarse"], answer: "Smooth" },
  { words: ["True", "False", "Correct"], answer: "False" },
  { words: ["Clean", "Dirty", "Pure"], answer: "Dirty" },
  { words: ["Full", "Empty", "Packed"], answer: "Empty" },
  { words: ["Fresh", "Stale", "New"], answer: "Stale" },
  { words: ["Tall", "Short", "High"], answer: "Short" },
  { words: ["Thin", "Fat", "Slim"], answer: "Fat" },
  { words: ["Young", "Old", "Youthful"], answer: "Old" },
  { words: ["Save", "Spend", "Hoard"], answer: "Spend" },
  { words: ["Laugh", "Cry", "Chuckle"], answer: "Cry" },
  { words: ["Win", "Lose", "Triumph"], answer: "Lose" },
  { words: ["Give", "Take", "Donate"], answer: "Take" },
  { words: ["Accept", "Refuse", "Approve"], answer: "Refuse" },
  { words: ["Swift", "Sluggish", "Speedy"], answer: "Sluggish" },
  { words: ["Calm", "Angry", "Peaceful"], answer: "Angry" },
  { words: ["Honest", "Deceitful", "Truthful"], answer: "Deceitful" },
  { words: ["Rare", "Common", "Scarce"], answer: "Common" },
  { words: ["Dull", "Boring", "Exciting"], answer: "Exciting" },
  { words: ["Polite", "Rude", "Courteous"], answer: "Rude" },
  { words: ["Brave", "Cowardly", "Fearless"], answer: "Cowardly" },
  { words: ["Expand", "Contract", "Grow"], answer: "Contract" },
  { words: ["Succeed", "Fail", "Achieve"], answer: "Fail" },
  { words: ["Praise", "Criticise", "Compliment"], answer: "Criticise" },
  { words: ["Agree", "Disagree", "Concur"], answer: "Disagree" },
  { words: ["Generous", "Stingy", "Liberal"], answer: "Stingy" },
  { words: ["Optimistic", "Pessimistic", "Hopeful"], answer: "Pessimistic" },
  { words: ["Careful", "Reckless", "Cautious"], answer: "Reckless" },
  { words: ["Tidy", "Messy", "Neat"], answer: "Messy" },
  { words: ["Humble", "Arrogant", "Modest"], answer: "Arrogant" },
];

function makeSpatialQ(): SpatialQ {
  const rotations: [number, number, number, number] = [
    Math.floor(Math.random() * 4) * 90,
    Math.floor(Math.random() * 4) * 90,
    Math.floor(Math.random() * 4) * 90,
    Math.floor(Math.random() * 4) * 90,
  ];
  // Each pair: [isNormal, isNormal] — true = R family, false = Я family
  const pair1: [boolean, boolean] = [Math.random() > 0.5, Math.random() > 0.5];
  const pair2: [boolean, boolean] = [Math.random() > 0.5, Math.random() > 0.5];
  const match1 = pair1[0] === pair1[1] ? 1 : 0;
  const match2 = pair2[0] === pair2[1] ? 1 : 0;
  return { pairs: [pair1, pair2], rotations, answer: match1 + match2 };
}

export function generateSpatialQuestions(n: number): SpatialQ[] {
  return Array.from({ length: n }, makeSpatialQ);
}
