export const overviewRequiredFieldIds = ['selfDescription', 'interests', 'intentions']

export const profileSections = [
  {
    id: 'presentation',
    title: 'Identity and presentation',
    description: 'Share only the names, words, and broad context you want other people to know.',
    sensitive: true,
    fields: [
      {
        id: 'selfDescription',
        label: 'About you',
        prompt: 'What would you like someone to know about you, in your own words?',
        helpText: 'This answer is needed only to create SoulSite’s Overview. You may describe yourself without sharing a legal name or private identity details.',
        overviewRequired: true,
      },
      {
        id: 'nameAndPronouns',
        label: 'Name and pronouns',
        prompt: 'What name, nickname, or pronouns would you like people to use?',
        helpText: 'All parts are optional. Do not enter a legal name unless you choose to.',
      },
      {
        id: 'broadPlace',
        label: 'Broad place',
        prompt: 'Is there a broad region or kind of place you would like to mention?',
        helpText: 'For example, a city or region only if comfortable. Never enter a street address or precise location.',
      },
      {
        id: 'presentation',
        label: 'Presentation',
        prompt: 'How do you like to present yourself, or what would you like people to notice?',
        helpText: 'Share only what feels useful; there is no expected answer.',
      },
    ],
  },
  {
    id: 'intentions',
    title: 'Intentions and relationships',
    description: 'Describe the connections and relationship context you want to communicate.',
    sensitive: false,
    fields: [
      {
        id: 'intentions',
        label: 'Intentions',
        prompt: 'What kind of connection or intention, if any, would you like the overview to describe?',
        helpText: 'This answer is needed only to create SoulSite’s Overview. You can describe what you are open to without sharing intimate details.',
        overviewRequired: true,
      },
      {
        id: 'relationshipPace',
        label: 'Relationship pace',
        prompt: 'What pace feels comfortable when getting to know someone?',
        helpText: 'You can explain what helps you feel comfortable, or leave this blank.',
      },
      {
        id: 'connectionMeaning',
        label: 'Meaningful connection',
        prompt: 'What does a meaningful connection look like to you?',
        helpText: 'Describe your own preferences; there is no right answer.',
      },
    ],
  },
  {
    id: 'values',
    title: 'Values and perspective',
    description: 'Choose any principles, beliefs, or perspectives you would like to explain.',
    sensitive: false,
    fields: [
      {
        id: 'values',
        label: 'Values',
        prompt: 'Which values or principles matter to you, and what do they mean in daily life?',
        helpText: 'Beliefs, politics, religion, and other personal views are never required.',
      },
      {
        id: 'pride',
        label: 'Pride and meaning',
        prompt: 'What is something you value about the way you live or show up for others?',
        helpText: 'Share an example only if you want to; no explanation is required.',
      },
    ],
  },
  {
    id: 'communication',
    title: 'Communication and conflict',
    description: 'Help others understand how you prefer to communicate and work through differences.',
    sensitive: false,
    fields: [
      {
        id: 'communicationStyle',
        label: 'Communication',
        prompt: 'How do you like to communicate and stay in touch?',
        helpText: 'For example, conversation, messages, directness, or frequency—only what you choose.',
      },
      {
        id: 'conflictStyle',
        label: 'Working through differences',
        prompt: 'What helps you feel heard when there is a disagreement?',
        helpText: 'You do not need to disclose painful experiences or personal history.',
      },
      {
        id: 'appreciation',
        label: 'Feeling appreciated',
        prompt: 'What small actions help you feel appreciated or understood?',
        helpText: 'Share preferences, not private or identifying details.',
      },
    ],
  },
  {
    id: 'lifestyle',
    title: 'Lifestyle and routines',
    description: 'Share the everyday rhythms and choices you would like others to understand.',
    sensitive: false,
    fields: [
      {
        id: 'dailyRhythm',
        label: 'Daily rhythm',
        prompt: 'What does a typical day or week look like for you?',
        helpText: 'A broad description is enough; exact schedules and locations are unnecessary.',
      },
      {
        id: 'socialEnergy',
        label: 'Social energy',
        prompt: 'What balance of social time and quiet time suits you?',
        helpText: 'Describe what you prefer rather than sharing health information.',
      },
      {
        id: 'homeLife',
        label: 'Home life',
        prompt: 'Are there parts of your home life or routine you want a potential connection to know?',
        helpText: 'This is optional. Do not share your address, security details, or information about others without permission.',
      },
    ],
  },
  {
    id: 'interests',
    title: 'Interests and culture',
    description: 'Talk about the activities, ideas, and cultural experiences you enjoy.',
    sensitive: false,
    fields: [
      {
        id: 'interests',
        label: 'Interests',
        prompt: 'What interests, activities, or cultural experiences would you like included?',
        helpText: 'This answer is needed only to create SoulSite’s Overview. You can also say you prefer not to include interests.',
        overviewRequired: true,
      },
      {
        id: 'curiosity',
        label: 'Curiosity',
        prompt: 'What subjects or experiences are you curious to explore?',
        helpText: 'A few words are enough; you do not need to present yourself as an expert.',
      },
      {
        id: 'favoriteExperiences',
        label: 'Favorite experiences',
        prompt: 'What kinds of shared activities would you enjoy?',
        helpText: 'Keep suggestions broad if you prefer not to disclose specific places.',
      },
    ],
  },
  {
    id: 'workLearning',
    title: 'Work and learning',
    description: 'Share as much or as little as you want about your work, studies, or interests in learning.',
    sensitive: false,
    fields: [
      {
        id: 'workLearning',
        label: 'Work or learning',
        prompt: 'What would you like people to know about what you do or are learning?',
        helpText: 'Your employer, school, title, and income are not needed.',
      },
      {
        id: 'meaningfulWork',
        label: 'Meaningful work',
        prompt: 'What makes an activity, project, or kind of work meaningful to you?',
        helpText: 'You can describe motivations without sharing confidential or identifying information.',
      },
    ],
  },
  {
    id: 'community',
    title: 'Family and community',
    description: 'This area is entirely optional; you decide whether family or community belongs in your profile.',
    sensitive: true,
    fields: [
      {
        id: 'familyCommunity',
        label: 'Family and community',
        prompt: 'Are there family, chosen family, or community connections you want to mention?',
        helpText: 'Do not include another person’s private details. You can skip this entire section.',
      },
      {
        id: 'communityRole',
        label: 'Community life',
        prompt: 'Are there communities or shared activities that are important to you?',
        helpText: 'You never need to disclose membership in a sensitive or private group.',
      },
    ],
  },
  {
    id: 'goals',
    title: 'Goals and hopes',
    description: 'Describe hopes or plans in your own words, without pressure to have everything figured out.',
    sensitive: false,
    fields: [
      {
        id: 'goals',
        label: 'Goals',
        prompt: 'What goals or projects matter to you right now?',
        helpText: 'Small, long-term, changing, and undecided goals are all welcome.',
      },
      {
        id: 'futureHopes',
        label: 'Hopes',
        prompt: 'What would you like to make more room for in your life?',
        helpText: 'This is optional and does not imply a promise or fixed plan.',
      },
    ],
  },
  {
    id: 'boundaries',
    title: 'Boundaries and preferences',
    description: 'Explain what works for you and what you prefer to keep private.',
    sensitive: false,
    fields: [
      {
        id: 'boundaries',
        label: 'Boundaries',
        prompt: 'What boundaries or preferences would you like others to respect?',
        helpText: 'You do not need to explain why a boundary matters.',
      },
      {
        id: 'firstMeet',
        label: 'First meetings',
        prompt: 'What helps a first conversation or meeting feel comfortable for you?',
        helpText: 'Share preferences only; no precise location or safety-sensitive detail is needed.',
      },
    ],
  },
  {
    id: 'accessibility',
    title: 'Accessibility and preferences',
    description: 'Share practical preferences only if you want others to know or accommodate them.',
    sensitive: true,
    fields: [
      {
        id: 'accessPreferences',
        label: 'Access preferences',
        prompt: 'Are there communication or access preferences you want people to know?',
        helpText: 'Describe the accommodation or preference, not a diagnosis, medical history, or reason.',
      },
      {
        id: 'sensoryPreferences',
        label: 'Environment preferences',
        prompt: 'Are there kinds of environments or plans you tend to prefer?',
        helpText: 'This is optional and is not a request for health or trauma details.',
      },
    ],
  },
]

export const overviewRequiredQuestions = profileSections.flatMap((section) =>
  section.fields
    .filter((field) => field.overviewRequired)
    .map((field) => ({ id: field.id, label: field.label, question: field.prompt })),
)

export const allProfileFieldIds = profileSections.flatMap((section) =>
  section.fields.map((field) => field.id),
)

export function createDefaultOverviewSelection() {
  return Object.fromEntries(
    profileSections.flatMap((section) =>
      section.fields.map((field) => [field.id, field.overviewRequired ? true : !section.sensitive]),
    ),
  )
}
