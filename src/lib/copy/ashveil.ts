export const COPY = {
  tagline: "Gather friends, write your story, go on adventure together.",
  thinking: [
    "The world shifts…",
    "Fate stirs…",
    "The tale unfolds…",
    "Shadows deepen…",
    "The threads of destiny weave…",
  ],
  scenePending: "Painting the scene…",
  diceContext: "Fortune rolls…",
  reconnect: "Catching up with the table…",
  imageFailure: "The vision falters; the scene remains.",
  awaitingHero: "Awaiting hero…",
  /** In-session UI; role is facilitator, not a genre lock. */
  aiDmWaiting: "AI facilitator — waiting to begin",
  /** Home / main app — strings only; does not change API or routes. */
  landing: {
    eyebrow: "Multiplayer story platform",
    heroTitle: "Play any story you can imagine",
    heroSub:
      "Solo or with friends. AI or human narrator. One story, one turn at a time.",
    ctaScrollSetup: "Set up your story",
    browseWorldsCta: "Browse worlds",
    lead:
      "Play together from one link. Drop a premise in any genre — the table stays yours; the app handles turns, sheets, and (optionally) narration.",
    howTitle: "How it works",
    steps: [
      {
        title: "Choose how to play",
        body: "AI narrator for full automation, or a human narrator with manual control.",
      },
      {
        title: "Set your story",
        body: "Optional seed, tone tags, world bible, and art direction shape the opening.",
      },
      {
        title: "Share the code",
        body: "Lobby opens; everyone builds a hero, then you start when the table is ready.",
      },
    ],
    modesTitle: "Who runs this table?",
    aiCardTitle: "AI narrator",
    aiCardBody:
      "Narration, scene images, and rule support — steered by your premise, not a fixed genre.",
    humanCardTitle: "Human narrator",
    humanCardBody:
      "A person at the table drives the story; WhatIf keeps characters, votes, and state in sync.",
    partyCardTitle: "Party game",
    partyCardBody:
      "Fast room: one shared scene — everyone pitches a line each round, AI weaves them, you vote for the take that should steer the story. No hero builder; names are just for the scoreboard. Separate from campaign quests.",
    partyRoundsLabel: "Rounds",
    partySeedHint:
      "Story seed and tags set the shared situation everyone is writing into.",
    originLabel: "Starting point",
    narrativeSeedLabel: "Story seed",
    toneTagsHint:
      "Tone tags (optional) — nudge mood and opening flavor.",
    partyLabel: "Party size",
    joinTitle: "Join a story",
    joinSubtitle: "Enter the code your host shared.",
    ctaCreate: "Create story",
    ctaJoin: "Join with code",
    ctaEnterSession: "Join story",
    creatingStory: "Creating your story…",
    backToCreate: "Back",
  },
  /** Monetization / Sparks — in-session and lobby. */
  spark: {
    buySparksCta: "Buy Sparks",
    hudHost: "Your Sparks",
    hudGuest: "Host funds AI & images",
    pauseHost:
      "The tale pauses — you need more Sparks for this moment. Add Sparks to keep the story moving.",
    pauseGuest:
      "The tale pauses — the host needs more Sparks for this moment. They can add Sparks or adjust the table.",
    shopTitle: "Sparks",
    shopStub:
      "Purchasing Sparks will land here soon. Until then, balances are managed by your team.",
    shopConfigureHint:
      "Purchases are not configured yet. Add Stripe, Razorpay, and SPARK_PACKS_JSON (see .env.example). Checkout routes India automatically; other regions use the global provider.",
    shopSignIn: "Sign in to buy Sparks",
    /** @deprecated use shopPaySecureCta */
    shopBuyCta: "Pay securely",
    shopPaySecureCta: "Pay securely",
    shopPaySecureBusy: "Opening secure checkout…",
    shopBusy: "Opening secure checkout…",
    shopErrorGeneric: "Something went wrong — try again.",
    shopSuccessTitle: "Thank you",
    shopBackPlay: "Back to adventures",
    /** Profile / character builder — payer is the signed-in user. */
    profileInsufficient:
      "You need more Sparks for that. Add Sparks to continue, or use a free portrait use if you still have one.",
    portraitRerollHint:
      "Free portrait uses apply first; after that, each generate or reroll costs Sparks.",
    /** Home / profile inline strip — guest browser account. */
    marketingGuestHint:
      "Guest session — link Google in your profile to keep Sparks and purchases when you switch devices.",
  },
} as const;
