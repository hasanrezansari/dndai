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
  /** Home / Falvos — strings only; does not change API or routes. */
  landing: {
    eyebrow: "Multiplayer story engine",
    lead:
      "Play together from one link. Drop a premise in any genre — the table stays yours; the app handles turns, sheets, and (optionally) narration.",
    howTitle: "How it works",
    steps: [
      {
        title: "Choose a host",
        body: "AI facilitator for full automation, or a human host with manual control.",
      },
      {
        title: "Set your world",
        body: "Optional seed, tone tags, world bible, and art direction shape the opening.",
      },
      {
        title: "Share the code",
        body: "Lobby opens; everyone builds a hero, then you start when the table is ready.",
      },
    ],
    modesTitle: "Who runs this table?",
    aiCardTitle: "AI facilitator",
    aiCardBody:
      "Narration, scene images, and rule support — steered by your premise, not a fixed genre.",
    humanCardTitle: "Human host",
    humanCardBody:
      "A person at the table drives the story; Falvos keeps characters, votes, and state in sync.",
    originLabel: "Starting point",
    narrativeSeedLabel: "Story seed",
    toneTagsHint:
      "Tone tags (optional) — nudge mood and opening flavor.",
    partyLabel: "Party size",
    joinTitle: "Join a session",
    joinSubtitle: "Enter the code your host shared.",
    ctaCreate: "Create session",
    ctaJoin: "Join with code",
    ctaEnterSession: "Join session",
    backToCreate: "Back",
  },
} as const;
