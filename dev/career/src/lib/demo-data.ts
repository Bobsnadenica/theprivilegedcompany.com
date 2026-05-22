import type { ConsultantProfile } from "./types";

function createIsoSlot(daysFromNow: number, hours: number, minutes = 0) {
  const value = new Date();
  value.setSeconds(0, 0);
  value.setDate(value.getDate() + daysFromNow);
  value.setHours(hours, minutes, 0, 0);
  return value.toISOString();
}

function sortConsultants(items: ConsultantProfile[]) {
  return [...items].sort((left, right) => {
    if (left.featured !== right.featured) {
      return left.featured ? -1 : 1;
    }

    if ((right.reviewCount || 0) !== (left.reviewCount || 0)) {
      return (right.reviewCount || 0) - (left.reviewCount || 0);
    }

    if ((right.rating || 0) !== (left.rating || 0)) {
      return (right.rating || 0) - (left.rating || 0);
    }

    return String(left.name || "").localeCompare(String(right.name || ""), "bg");
  });
}

const consultantAvailability = {
  ana: [createIsoSlot(1, 10, 0), createIsoSlot(2, 14, 30), createIsoSlot(4, 11, 0)],
  boris: [createIsoSlot(1, 16, 0), createIsoSlot(3, 18, 30), createIsoSlot(5, 12, 0)],
  elitsa: [createIsoSlot(2, 9, 30), createIsoSlot(4, 15, 0), createIsoSlot(6, 13, 30)],
  nikolay: [createIsoSlot(1, 8, 30), createIsoSlot(3, 10, 30), createIsoSlot(7, 17, 0)],
  twilight: [createIsoSlot(1, 11, 30), createIsoSlot(3, 15, 30), createIsoSlot(6, 10, 0)],
  rainbow: [createIsoSlot(2, 12, 0), createIsoSlot(4, 16, 30), createIsoSlot(6, 18, 0)],
  rarity: [createIsoSlot(1, 13, 0), createIsoSlot(3, 9, 0), createIsoSlot(5, 14, 0)],
  pinkie: [createIsoSlot(2, 10, 30), createIsoSlot(4, 12, 30), createIsoSlot(7, 15, 0)],
  fluttershy: [createIsoSlot(1, 9, 0), createIsoSlot(5, 11, 30), createIsoSlot(7, 16, 0)],
  applejack: [createIsoSlot(3, 8, 30), createIsoSlot(5, 13, 30), createIsoSlot(8, 10, 0)],
  blossom: [createIsoSlot(1, 15, 0), createIsoSlot(2, 17, 0), createIsoSlot(5, 9, 30)],
  bubbles: [createIsoSlot(2, 11, 0), createIsoSlot(4, 14, 0), createIsoSlot(6, 9, 30)],
  buttercup: [createIsoSlot(1, 18, 0), createIsoSlot(3, 12, 0), createIsoSlot(6, 16, 30)],
  professor: [createIsoSlot(2, 8, 0), createIsoSlot(4, 10, 0), createIsoSlot(7, 13, 0)]
} as const;

const demoImages = {
  ana: {
    avatar: "https://i.pravatar.cc/640?img=32",
    hero: "https://picsum.photos/id/1011/1600/1000"
  },
  boris: {
    avatar: "https://i.pravatar.cc/640?img=12",
    hero: "https://picsum.photos/id/1005/1600/1000"
  },
  elitsa: {
    avatar: "https://i.pravatar.cc/640?img=47",
    hero: "https://picsum.photos/id/1025/1600/1000"
  },
  nikolay: {
    avatar: "https://i.pravatar.cc/640?img=14",
    hero: "https://picsum.photos/id/1043/1600/1000"
  },
  twilight: {
    avatar: "https://randomuser.me/api/portraits/women/44.jpg",
    hero: "https://picsum.photos/id/1060/1600/1000"
  },
  rainbow: {
    avatar: "https://randomuser.me/api/portraits/women/22.jpg",
    hero: "https://picsum.photos/id/1056/1600/1000"
  },
  rarity: {
    avatar: "https://randomuser.me/api/portraits/women/65.jpg",
    hero: "https://picsum.photos/id/1062/1600/1000"
  },
  pinkie: {
    avatar: "https://randomuser.me/api/portraits/men/52.jpg",
    hero: ""
  },
  fluttershy: {
    avatar: "https://randomuser.me/api/portraits/women/8.jpg",
    hero: "https://picsum.photos/id/1074/1600/1000"
  },
  applejack: {
    avatar: "https://randomuser.me/api/portraits/men/34.jpg",
    hero: ""
  },
  blossom: {
    avatar: "https://randomuser.me/api/portraits/men/18.jpg",
    hero: "https://picsum.photos/id/1067/1600/1000"
  },
  bubbles: {
    avatar: "https://randomuser.me/api/portraits/women/76.jpg",
    hero: ""
  },
  buttercup: {
    avatar: "https://randomuser.me/api/portraits/women/30.jpg",
    hero: "https://picsum.photos/id/1071/1600/1000"
  },
  professor: {
    avatar: "https://randomuser.me/api/portraits/men/72.jpg",
    hero: "https://picsum.photos/id/1048/1600/1000"
  }
} as const;

export const demoConsultants: ConsultantProfile[] = sortConsultants([
  {
    consultantId: "demo-consultant-ana",
    ownerUserId: "demo-owner-ana",
    profileType: "consultant",
    slug: "ana-petrova",
    name: "Ана Петрова",
    headline: "Leadership, executive CV и кариерно позициониране за mid-to-senior роли",
    bio: "Ана работи с хора, които влизат в management и leadership роли и искат по-силно позициониране, по-ясно послание и увереност в следващата си кандидатура.",
    experienceSummary: "12+ години в talent и leadership advisory с фокус върху позициониране за мениджърски и директорски роли.",
    experienceHighlights: [
      "Подготовка за интервюта и case-и за management позиции",
      "Пренаписване на executive CV и LinkedIn профили",
      "Позициониране при международни кандидатури"
    ],
    educationHighlights: ["ICF coaching training", "HR Business Partner track"],
    city: "София",
    languages: ["Български", "English"],
    specializations: ["Leadership", "Executive CV", "Interview Prep"],
    experienceYears: 12,
    priceBgn: 160,
    sessionModes: ["Онлайн", "На живо"],
    featured: true,
    rating: 4.9,
    reviewCount: 18,
    nextAvailable: consultantAvailability.ana[0],
    avatarUrl: demoImages.ana.avatar,
    heroUrl: demoImages.ana.hero,
    tags: ["Мениджърски роли", "Кариерна стратегия", "LinkedIn"],
    availability: [...consultantAvailability.ana],
    idealFor: ["Мениджъри", "Head of / Director роли", "Кариерна промяна на senior ниво"],
    consultationTopics: ["CV и LinkedIn", "Интервю стратегия", "Кариерно позициониране"],
    workApproach: "Работата минава през бърз профилен одит, приоритизиране на посланието и конкретни следващи стъпки за кандидатстване.",
    sessionLengthMinutes: 60,
    isDemo: true
  },
  {
    consultantId: "demo-consultant-boris",
    ownerUserId: "demo-owner-boris",
    profileType: "mentor",
    slug: "boris-ivanov",
    name: "Борис Иванов",
    headline: "Продуктов ментор за startup екипи, PM роли и преход от execution към ownership",
    bio: "Борис работи практично и директно с PM-и, founders и хора в преход към product роли, когато им трябва по-ясна стратегия, ownership и уверен разказ за стойността им.",
    experienceSummary: "Бивш Head of Product с опит в SaaS и B2B продукти, работил с PM-и, founders и early-stage екипи.",
    experienceHighlights: [
      "Product sense и prioritization coaching",
      "Подготовка за PM интервюта и hiring loops",
      "Развитие от IC към people/strategy ownership"
    ],
    educationHighlights: ["Product Leadership cohort", "Lean experimentation program"],
    city: "Онлайн",
    languages: ["Български", "English"],
    specializations: ["Product Management", "Startup Growth", "Mentorship"],
    experienceYears: 10,
    priceBgn: 140,
    sessionModes: ["Онлайн"],
    featured: true,
    rating: 4.8,
    reviewCount: 11,
    nextAvailable: consultantAvailability.boris[0],
    avatarUrl: demoImages.boris.avatar,
    heroUrl: demoImages.boris.hero,
    tags: ["PM", "Startup", "Ownership"],
    availability: [...consultantAvailability.boris],
    idealFor: ["Product Managers", "Startup founders", "Senior IC преход"],
    consultationTopics: ["PM интервюта", "Career growth", "Product strategy"],
    workApproach: "Започва се от реален контекст, текущ екип и цел за следващите 90 дни, след което се оформя практичен план за развитие.",
    sessionLengthMinutes: 50,
    isDemo: true
  },
  {
    consultantId: "demo-consultant-elitsa",
    ownerUserId: "demo-owner-elitsa",
    profileType: "consultant",
    slug: "elitsa-stoyanova",
    name: "Елица Стоянова",
    headline: "CV, LinkedIn и първи международни кандидатури за early-to-mid professionals",
    bio: "Елица помага на early-to-mid professionals да подредят по-добре CV-то си, да изградят ясен LinkedIn профил и да влязат по-уверено в международни процеси.",
    experienceSummary: "Кариеран консултант с фокус върху junior и mid-level кандидати, които правят следваща стъпка към по-силен профилен прочит.",
    experienceHighlights: [
      "CV редизайн за международни кандидатури",
      "LinkedIn профили с по-силен headline и summary",
      "Mock interview за стандартни HR и hiring manager разговори"
    ],
    educationHighlights: ["Career coaching certificate"],
    city: "Варна",
    languages: ["Български", "English", "Deutsch"],
    specializations: ["CV Writing", "LinkedIn", "International Applications"],
    experienceYears: 7,
    priceBgn: 95,
    sessionModes: ["Онлайн"],
    featured: false,
    rating: 4.7,
    reviewCount: 9,
    nextAvailable: consultantAvailability.elitsa[0],
    avatarUrl: demoImages.elitsa.avatar,
    heroUrl: demoImages.elitsa.hero,
    tags: ["Junior to Mid", "CV", "Remote roles"],
    availability: [...consultantAvailability.elitsa],
    idealFor: ["Junior и mid-level кандидати", "Първа международна кандидатура"],
    consultationTopics: ["CV review", "LinkedIn", "Interview basics"],
    workApproach: "Сесиите са подредени около документи, конкретна обява и кратък списък с най-важните корекции за следващото кандидатстване.",
    sessionLengthMinutes: 45,
    isDemo: true
  },
  {
    consultantId: "demo-consultant-nikolay",
    ownerUserId: "demo-owner-nikolay",
    profileType: "mentor",
    slug: "nikolay-georgiev",
    name: "Николай Георгиев",
    headline: "Data и analytics ментор за преход към BI, analytics engineering и stakeholder communication",
    bio: "Николай работи с data и analytics специалисти, които искат по-силен професионален разказ, по-добра stakeholder комуникация и по-ясна следваща стъпка в кариерата си.",
    experienceSummary: "Работи с хора, които минават от reporting към по-стратегически data роли и искат по-ясен narrative за стойността си.",
    experienceHighlights: [
      "Storytelling с данни и stakeholder alignment",
      "Подготовка за BI / analytics интервюта",
      "Изграждане на профил за analytics engineering преход"
    ],
    educationHighlights: ["Modern Data Stack bootcamp"],
    city: "Пловдив",
    languages: ["Български", "English"],
    specializations: ["Data Analytics", "BI", "Career Growth"],
    experienceYears: 8,
    priceBgn: 120,
    sessionModes: ["Онлайн", "На живо"],
    featured: false,
    rating: 4.6,
    reviewCount: 6,
    nextAvailable: consultantAvailability.nikolay[0],
    avatarUrl: demoImages.nikolay.avatar,
    heroUrl: demoImages.nikolay.hero,
    tags: ["Analytics", "BI", "Stakeholders"],
    availability: [...consultantAvailability.nikolay],
    idealFor: ["Data analysts", "BI specialists", "Career switch to data"],
    consultationTopics: ["Analytics CV", "Interview prep", "Career narrative"],
    workApproach: "Фокусът е върху конкретни проекти, измерим принос и превръщането му в ясен профилен разказ за следваща роля.",
    sessionLengthMinutes: 50,
    isDemo: true
  },
  {
    consultantId: "demo-consultant-twilight",
    ownerUserId: "demo-owner-twilight",
    profileType: "mentor",
    theme: "violet",
    slug: "desislava-marinova",
    name: "Десислава Маринова",
    headline: "Структуриран ментор за learning plans, интервю подготовка и ясна кариерна стратегия",
    bio: "Десислава работи с професионалисти, които искат да систематизират подготовката си за следваща роля — от 90-дневен learning plan до конкретна стратегия за поведенчески интервюта.",
    experienceSummary: "10+ години в подреждане на сложни кариерни цели, учебни системи и превръщане на хаоса в изпълним седмичен план.",
    experienceHighlights: [
      "90-дневни learning plans за career switch",
      "Подготовка за поведенчески интервюта",
      "Систематизиране на портфолио и доказателства"
    ],
    educationHighlights: ["ICF Professional Coach", "Structured Mentorship track"],
    city: "Онлайн",
    languages: ["Български", "English"],
    specializations: ["Career Planning", "Learning Strategy", "Interview Prep"],
    experienceYears: 10,
    priceBgn: 130,
    sessionModes: ["Онлайн"],
    featured: true,
    rating: 5,
    reviewCount: 22,
    nextAvailable: consultantAvailability.twilight[0],
    avatarUrl: demoImages.twilight.avatar,
    heroUrl: demoImages.twilight.hero,
    tags: ["Learning plan", "Interview structure", "Career roadmap"],
    availability: [...consultantAvailability.twilight],
    idealFor: ["Career switch", "Junior-to-mid growth", "Хора с много идеи"],
    consultationTopics: ["Learning plan", "Mock interview", "Career roadmap"],
    workApproach: "Сесията започва с инвентаризация на целите, след което ги превръща в седмичен план с конкретни критерии за напредък.",
    sessionLengthMinutes: 60,
    isDemo: true
  },
  {
    consultantId: "demo-consultant-rainbow",
    ownerUserId: "demo-owner-rainbow",
    profileType: "mentor",
    theme: "sky",
    slug: "kalina-yordanova",
    name: "Калина Йорданова",
    headline: "Ментор за увереност, бърза подготовка и силно интервю присъствие",
    bio: "Калина работи с кандидати, които имат интервю в близките дни и им трябва бърза, фокусирана подготовка с акцент върху увереността и темпото.",
    experienceSummary: "8 години в performance coaching, презентационно присъствие и подготовка за разговори под напрежение.",
    experienceHighlights: [
      "Mock interview с бърз feedback",
      "Confidence drills за трудни въпроси",
      "Pitch за 60 секунди"
    ],
    educationHighlights: ["Performance Coaching cohort", "Public Speaking Academy"],
    city: "Онлайн",
    languages: ["Български", "English"],
    specializations: ["Interview Confidence", "Pitching", "Presentation"],
    experienceYears: 8,
    priceBgn: 110,
    sessionModes: ["Онлайн"],
    featured: false,
    rating: 4.8,
    reviewCount: 14,
    nextAvailable: consultantAvailability.rainbow[0],
    avatarUrl: demoImages.rainbow.avatar,
    heroUrl: demoImages.rainbow.hero,
    tags: ["Confidence", "Fast prep", "Mock interview"],
    availability: [...consultantAvailability.rainbow],
    idealFor: ["Интервю до 7 дни", "Презентационни роли", "Хора с нужда от увереност"],
    consultationTopics: ["Mock interview", "Elevator pitch", "Confidence prep"],
    workApproach: "Работи се през кратки повторения, конкретен feedback и финален сценарий за интервюто.",
    sessionLengthMinutes: 45,
    isDemo: true
  },
  {
    consultantId: "demo-consultant-rarity",
    ownerUserId: "demo-owner-rarity",
    profileType: "consultant",
    theme: "rose",
    slug: "viktoria-todorova",
    name: "Виктория Тодорова",
    headline: "Консултант за personal brand, CV polish и визуално подреден LinkedIn профил",
    bio: "Виктория работи с професионалисти, които искат по-силно лично позициониране — от LinkedIn профил до представяне на портфолиото и CV.",
    experienceSummary: "9 години в personal branding, профилна редакция и представяне на креативни и маркетинг роли.",
    experienceHighlights: [
      "LinkedIn headline и About секция",
      "Portfolio narrative за creative и marketing роли",
      "CV polish без претоварване"
    ],
    educationHighlights: ["Brand Strategy Track", "LinkedIn Marketing Lab"],
    city: "Варна",
    languages: ["Български", "English", "Français"],
    specializations: ["Personal Brand", "LinkedIn", "Portfolio"],
    experienceYears: 9,
    priceBgn: 125,
    sessionModes: ["Онлайн", "На живо"],
    featured: false,
    rating: 4.9,
    reviewCount: 17,
    nextAvailable: consultantAvailability.rarity[0],
    avatarUrl: demoImages.rarity.avatar,
    heroUrl: demoImages.rarity.hero,
    tags: ["Brand", "Portfolio", "LinkedIn"],
    availability: [...consultantAvailability.rarity],
    idealFor: ["Marketing", "Creative roles", "LinkedIn refresh"],
    consultationTopics: ["Personal brand", "CV polish", "Portfolio story"],
    workApproach: "Започва с профилен audit, после се изчистват послание, визуален ред и най-силните доказателства.",
    sessionLengthMinutes: 50,
    isDemo: true
  },
  {
    consultantId: "demo-consultant-pinkie",
    ownerUserId: "demo-owner-pinkie",
    profileType: "mentor",
    slug: "radoslav-kolev",
    name: "Радослав Колев",
    headline: "Ментор за networking, community jobs и по-естествено професионално общуване",
    bio: "Радослав помага на хора, които искат да изградят професионална мрежа без неудобство — с конкретни сценарии за reach-out, follow-up и community разговори.",
    experienceSummary: "7 години в community building, networking и подготовка за разговори с нови екипи.",
    experienceHighlights: [
      "Networking plan без awkward усещане",
      "Съобщения за reach-out и follow-up",
      "Подготовка за informal interviews"
    ],
    educationHighlights: ["Community Leadership Program", "Networking & Influence Track"],
    city: "Онлайн",
    languages: ["Български", "English"],
    specializations: ["Networking", "Community", "Communication"],
    experienceYears: 7,
    priceBgn: 90,
    sessionModes: ["Онлайн"],
    featured: false,
    rating: 4.7,
    reviewCount: 8,
    nextAvailable: consultantAvailability.pinkie[0],
    avatarUrl: demoImages.pinkie.avatar,
    heroUrl: demoImages.pinkie.hero,
    tags: ["Networking", "Community", "Communication"],
    availability: [...consultantAvailability.pinkie],
    idealFor: ["First job seekers", "Community roles", "Intro calls"],
    consultationTopics: ["Networking scripts", "Follow-up", "Community applications"],
    workApproach: "Създава се лек, човешки план за контакти, съобщения и последващи действия след разговори.",
    sessionLengthMinutes: 45,
    isDemo: true
  },
  {
    consultantId: "demo-consultant-fluttershy",
    ownerUserId: "demo-owner-fluttershy",
    profileType: "mentor",
    theme: "mint",
    slug: "magdalena-ivanova",
    name: "Магдалена Иванова",
    headline: "Спокоен ментор за интервю тревожност, soft skills и уверено кандидатстване",
    bio: "Магдалена работи с кандидати, които искат по-спокойна подготовка — особено при тревожност преди интервю или липса на увереност в комуникацията.",
    experienceSummary: "6 години в soft-skill coaching, подготовка за първи интервюта и confidence work.",
    experienceHighlights: [
      "Подготовка за тревожни кандидати",
      "Soft skills примери за STAR отговори",
      "Плавно изграждане на увереност"
    ],
    educationHighlights: ["Empathy & Coaching Practice", "Anxiety & Performance Workshop"],
    city: "Онлайн",
    languages: ["Български", "English"],
    specializations: ["Soft Skills", "Interview Anxiety", "Career Confidence"],
    experienceYears: 6,
    priceBgn: 85,
    sessionModes: ["Онлайн"],
    featured: false,
    rating: 4.8,
    reviewCount: 12,
    nextAvailable: consultantAvailability.fluttershy[0],
    avatarUrl: demoImages.fluttershy.avatar,
    heroUrl: demoImages.fluttershy.hero,
    tags: ["Soft skills", "Confidence", "STAR answers"],
    availability: [...consultantAvailability.fluttershy],
    idealFor: ["Първи интервюта", "Интроверти", "Кандидати с тревожност"],
    consultationTopics: ["STAR answers", "Confidence", "Interview anxiety"],
    workApproach: "Работи се спокойно и постепенно: първо се намалява напрежението, после се упражняват конкретни отговори.",
    sessionLengthMinutes: 50,
    isDemo: true
  },
  {
    consultantId: "demo-consultant-applejack",
    ownerUserId: "demo-owner-applejack",
    profileType: "consultant",
    slug: "stefan-cvetkov",
    name: "Стефан Цветков",
    headline: "Практичен консултант за реалистичен job search, приоритети и следващи действия",
    bio: "Стефан помага на хора в активно търсене на работа да подредят процеса — седмични приоритети, реалистична оценка и ясни критерии кога да променят посоката.",
    experienceSummary: "11 години в hands-on career planning, job search routines и прагматично вземане на решения.",
    experienceHighlights: [
      "Седмична система за кандидатстване",
      "Приоритизация на обяви",
      "Реалистична оценка на профила"
    ],
    educationHighlights: ["HR Business Partner Certification", "Career Coaching Track"],
    city: "Пловдив",
    languages: ["Български", "English"],
    specializations: ["Job Search", "Career Strategy", "Accountability"],
    experienceYears: 11,
    priceBgn: 115,
    sessionModes: ["Онлайн", "На живо"],
    featured: false,
    rating: 4.6,
    reviewCount: 10,
    nextAvailable: consultantAvailability.applejack[0],
    avatarUrl: demoImages.applejack.avatar,
    heroUrl: demoImages.applejack.hero,
    tags: ["Job search", "Accountability", "Career strategy"],
    availability: [...consultantAvailability.applejack],
    idealFor: ["Активно кандидатстване", "Career reset", "Практични планове"],
    consultationTopics: ["Job search plan", "Prioritization", "Weekly accountability"],
    workApproach: "Сесията завършва с кратък списък от действия за седмицата и критерии кога да се промени стратегията.",
    sessionLengthMinutes: 50,
    isDemo: true
  },
  {
    consultantId: "demo-consultant-blossom",
    ownerUserId: "demo-owner-blossom",
    profileType: "consultant",
    theme: "rose",
    slug: "ivaylo-mihaylov",
    name: "Ивайло Михайлов",
    headline: "Стратегически консултант за structured interviews, leadership signals и ясна подготовка",
    bio: "Ивайло работи със senior кандидати и team leads, които искат подредена подготовка за структурирани интервюта и ясни leadership signals.",
    experienceSummary: "12 години в structured hiring, leadership interview prep и decision-making frameworks.",
    experienceHighlights: [
      "Leadership examples за senior interviews",
      "Structured mock interview",
      "Decision framework за следваща роля"
    ],
    educationHighlights: ["Senior Leadership Hiring Track", "Decision Frameworks Cohort"],
    city: "София",
    languages: ["Български", "English"],
    specializations: ["Leadership", "Structured Interview", "Career Strategy"],
    experienceYears: 12,
    priceBgn: 150,
    sessionModes: ["Онлайн", "На живо"],
    featured: true,
    rating: 5,
    reviewCount: 24,
    nextAvailable: consultantAvailability.blossom[0],
    avatarUrl: demoImages.blossom.avatar,
    heroUrl: demoImages.blossom.hero,
    tags: ["Leadership", "Structured prep", "Senior"],
    availability: [...consultantAvailability.blossom],
    idealFor: ["Senior candidates", "Team leads", "Structured interviews"],
    consultationTopics: ["Leadership signals", "Mock interview", "Decision framework"],
    workApproach: "Първо се избира целевата роля, после се изграждат доказателства и отговори около най-важните hiring signals.",
    sessionLengthMinutes: 60,
    isDemo: true
  },
  {
    consultantId: "demo-consultant-bubbles",
    ownerUserId: "demo-owner-bubbles",
    profileType: "mentor",
    slug: "ralitsa-stefanova",
    name: "Ралица Стефанова",
    headline: "Ментор за creative portfolios, junior confidence и първи роли в креативни екипи",
    bio: "Ралица помага на junior кандидати в дизайн и creative роли да изградят портфолио и да преминат уверено през първите си интервюта.",
    experienceSummary: "5 години в portfolio reviews, junior profile building и подготовка за първи creative interviews.",
    experienceHighlights: [
      "Портфолио разказ за junior кандидати",
      "Преглед на case studies",
      "Подготовка за culture-fit разговори"
    ],
    educationHighlights: ["Creative Career Starter Program", "Portfolio Storytelling Workshop"],
    city: "Онлайн",
    languages: ["Български", "English"],
    specializations: ["Portfolio", "Junior Roles", "Creative Careers"],
    experienceYears: 5,
    priceBgn: 75,
    sessionModes: ["Онлайн"],
    featured: false,
    rating: 4.7,
    reviewCount: 7,
    nextAvailable: consultantAvailability.bubbles[0],
    avatarUrl: demoImages.bubbles.avatar,
    heroUrl: demoImages.bubbles.hero,
    tags: ["Portfolio", "Junior", "Creative careers"],
    availability: [...consultantAvailability.bubbles],
    idealFor: ["Junior designers", "Creative interns", "Portfolio refresh"],
    consultationTopics: ["Portfolio review", "Case study story", "First job prep"],
    workApproach: "Работи се през реални портфолио елементи и кратки подобрения, които правят разказа по-ясен.",
    sessionLengthMinutes: 45,
    isDemo: true
  },
  {
    consultantId: "demo-consultant-buttercup",
    ownerUserId: "demo-owner-buttercup",
    profileType: "mentor",
    theme: "amber",
    slug: "kameliya-petkova",
    name: "Камелия Петкова",
    headline: "Директен ментор за salary negotiation, boundaries и по-смело професионално присъствие",
    bio: "Камелия работи с професионалисти, които имат оферта на масата или труден разговор за заплата — с конкретни сценарии и ясни anchors преди преговори.",
    experienceSummary: "9 години в negotiation prep, boundaries coaching и подготовка за трудни career conversations.",
    experienceHighlights: [
      "Salary negotiation сценарии",
      "Подготовка за трудни разговори",
      "Ясна позиция при оферти и контраоферти"
    ],
    educationHighlights: ["Negotiation Lab Cohort", "Boundaries & Influence Track"],
    city: "Онлайн",
    languages: ["Български", "English"],
    specializations: ["Negotiation", "Career Confidence", "Offer Review"],
    experienceYears: 9,
    priceBgn: 135,
    sessionModes: ["Онлайн"],
    featured: false,
    rating: 4.9,
    reviewCount: 15,
    nextAvailable: consultantAvailability.buttercup[0],
    avatarUrl: demoImages.buttercup.avatar,
    heroUrl: demoImages.buttercup.hero,
    tags: ["Negotiation", "Offer review", "Salary"],
    availability: [...consultantAvailability.buttercup],
    idealFor: ["Оферти", "Повишение", "Трудни разговори"],
    consultationTopics: ["Salary negotiation", "Offer review", "Boundaries"],
    workApproach: "Сесията симулира реалния разговор, подготвя anchors и изяснява минималните условия преди преговори.",
    sessionLengthMinutes: 50,
    isDemo: true
  },
  {
    consultantId: "demo-consultant-professor",
    ownerUserId: "demo-owner-professor",
    profileType: "consultant",
    theme: "violet",
    slug: "alexander-dimov",
    name: "Александър Димов",
    headline: "Технически кариерен консултант за research, engineering и evidence-based career moves",
    bio: "Александър работи с инженери и research профили, които искат подредена narrative за следваща роля — с конкретни доказателства, проекти и trade-offs.",
    experienceSummary: "15 години в research teams, engineering mentorship и системно изграждане на доказателства за кандидатстване.",
    experienceHighlights: [
      "Technical career narrative",
      "Research portfolio и project evidence",
      "Подготовка за инженерни hiring loops"
    ],
    educationHighlights: ["Engineering Leadership Program", "Research Career Track"],
    city: "Онлайн",
    languages: ["Български", "English"],
    specializations: ["Technical Careers", "Research", "Engineering Mentorship"],
    experienceYears: 15,
    priceBgn: 170,
    sessionModes: ["Онлайн"],
    featured: true,
    rating: 4.8,
    reviewCount: 13,
    nextAvailable: consultantAvailability.professor[0],
    avatarUrl: demoImages.professor.avatar,
    heroUrl: demoImages.professor.hero,
    tags: ["Engineering", "Research", "Technical CV"],
    availability: [...consultantAvailability.professor],
    idealFor: ["Engineers", "Research roles", "Technical leadership"],
    consultationTopics: ["Technical CV", "Project evidence", "Hiring loop prep"],
    workApproach: "Работата е evidence-based: изваждат се проекти, решения, trade-offs и резултати, които подкрепят следващата роля.",
    sessionLengthMinutes: 60,
    isDemo: true
  }
]);

export function getDemoConsultantBySlug(slug: string) {
  return demoConsultants.find((consultant) => consultant.slug === slug) || null;
}

export function getFilteredDemoConsultants(filters: { query?: string; city?: string } = {}) {
  const query = String(filters.query || "").trim().toLowerCase();
  const city = String(filters.city || "").trim().toLowerCase();

  return demoConsultants.filter((consultant) => {
    const haystack = [
      consultant.name,
      consultant.headline,
      consultant.bio,
      consultant.experienceSummary,
      ...(consultant.specializations || []),
      ...(consultant.tags || []),
      ...(consultant.consultationTopics || []),
      ...(consultant.idealFor || [])
    ]
      .join(" ")
      .toLowerCase();

    const matchesQuery = !query || haystack.includes(query);
    const matchesCity = !city || consultant.city.toLowerCase().includes(city);
    return matchesQuery && matchesCity;
  });
}

export function mergeConsultantLists(
  primary: ConsultantProfile[],
  secondary: ConsultantProfile[]
) {
  const merged = new Map<string, ConsultantProfile>();

  primary.forEach((consultant) => {
    merged.set(consultant.slug, consultant);
  });

  secondary.forEach((consultant) => {
    if (!merged.has(consultant.slug)) {
      merged.set(consultant.slug, consultant);
    }
  });

  return sortConsultants(Array.from(merged.values()));
}
