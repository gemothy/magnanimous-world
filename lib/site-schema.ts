export type Pillar = {
  title: string;
  body: string;
  accent: "bronze" | "wine" | "verdigris";
};

export type Product = {
  name: string;
  label: string;
  body: string;
  note: string;
};

export type Tier = {
  name: string;
  price: string;
  features: string[];
  featured?: boolean;
};

export type SiteModule =
  | {
      type: "pillars";
      eyebrow: string;
      title: string;
      items: Pillar[];
    }
  | {
      type: "products";
      eyebrow: string;
      title: string;
      items: Product[];
    }
  | {
      type: "tiers";
      eyebrow: string;
      title: string;
      items: Tier[];
    }
  | {
      type: "creed";
      quote: string;
      attribution: string;
    };

export const publicPillars: Pillar[] = [
  {
    title: "Spirit",
    body: "A private threshold for people who treat discipline as a form of taste.",
    accent: "bronze"
  },
  {
    title: "Soul",
    body: "Ritual, study, conversation, and commerce designed to feel intentional.",
    accent: "wine"
  },
  {
    title: "Body",
    body: "A foundation that can grow into learning, membership, account care, and apothecary.",
    accent: "verdigris"
  }
];

export const trials = [
  {
    id: 1,
    name: "Trial of Mercury",
    register: "Spirit",
    prompt:
      "A truth was set down, then hidden. Mercury, swiftest of the wanderers, advances every letter by three.",
    cipher: ["YLVLWD LQWHULRUD WHUUDH UHFWLILFDQGR", "LQYHQLHV RFFXOWDP ODSLGHP"],
    hint: "Roll each letter back by three. Submit the first word you uncover.",
    placeholder: "First word"
  },
  {
    id: 2,
    name: "Trial of Sulphur",
    register: "Soul",
    prompt: "The inscription is a vessel. Its soul is a single word, written in the heads of its parts.",
    hint: "Read only the first letter of each word of the uncovered inscription. Seven letters. One word.",
    placeholder: "Word within"
  },
  {
    id: 3,
    name: "Trial of Salt",
    register: "Body",
    prompt:
      "Dissolve the lion and read what settles. The Word hides in plain sight where the light does not fall.",
    hint: "Pass your cursor over the ash, or select the faint line, then submit the residue.",
    placeholder: "Residue"
  }
];

export const hubModules: SiteModule[] = [
  {
    type: "pillars",
    eyebrow: "The Order",
    title: "The Long Life Has Three Disciplines",
    items: [
      {
        title: "Vitality",
        body: "Energy that does not borrow against tomorrow.",
        accent: "bronze"
      },
      {
        title: "Vigor",
        body: "Performance, potency, and presence without vulgarity.",
        accent: "wine"
      },
      {
        title: "Longevity",
        body: "Years added, and life added to the years.",
        accent: "verdigris"
      }
    ]
  },
  {
    type: "products",
    eyebrow: "The Apothecary",
    title: "Formulations Of The Order",
    items: [
      {
        name: "Azoth",
        label: "Flagship elixir",
        body: "Adaptogenic roots and marine minerals for the spirit that must not flag.",
        note: "By membership"
      },
      {
        name: "Vigor No. VII",
        label: "Performance complex",
        body: "Seven botanicals for blood, drive, stamina, and composure.",
        note: "Reserved"
      },
      {
        name: "Longaevus",
        label: "Longevity blend",
        body: "Cellular support and daily ritual for the slow art of staying.",
        note: "Coming soon"
      },
      {
        name: "Ferreum",
        label: "Vital reserve",
        body: "Mineral and herbal support for durable strength and iron will.",
        note: "Private batch"
      }
    ]
  },
  {
    type: "tiers",
    eyebrow: "The Degrees",
    title: "Membership",
    items: [
      {
        name: "Initiate",
        price: "Private",
        features: ["Inner site access", "Monthly dispatch", "Apothecary at cost"]
      },
      {
        name: "Adept",
        price: "Reserved",
        featured: true,
        features: ["All Initiate privileges", "Quarterly elixir reserve", "Private counsel", "Unredacted texts"]
      },
      {
        name: "Magnus",
        price: "By invitation",
        features: ["All Adept privileges", "Bespoke formulation", "A vote in the Order", "The Word, to give once"]
      }
    ]
  },
  {
    type: "creed",
    quote:
      "We do not chase youth. We refuse decline. What the many call aging, the Order calls neglect - and neglect is a choice we have unmade.",
    attribution: "The Magnanimous Creed"
  }
];
