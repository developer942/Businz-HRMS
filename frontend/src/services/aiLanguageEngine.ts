import { 
  SupportedLanguage, 
  ScriptType, 
  CanonicalIntent, 
  LanguageDetectionResult, 
  ExtractedEntities 
} from '../types/aiAssistant';

// Script matching patterns
const SCRIPT_PATTERNS = {
  Tamil: /[\u0B80-\u0BFF]/,
  Devanagari: /[\u0900-\u097F]/,
  Telugu: /[\u0C00-\u0C7F]/,
  Malayalam: /[\u0D00-\u0D7F]/,
  Kannada: /[\u0C80-\u0CFF]/,
  Bengali: /[\u0980-\u09FF]/,
  Gujarati: /[\u0A80-\u0AFF]/,
  Gurmukhi: /[\u0A00-\u0A7F]/,
  Arabic: /[\u0600-\u06FF]/,
  Hanzi: /[\u4E00-\u9FFF]/,
  Kana: /[\u3040-\u30FF]/,
  Hangul: /[\uAC00-\uD7AF]/,
};

// Transliteration Vocabulary Tokens
const TANGLISH_TOKENS = new Set([
  // Pronouns, Slang & Address terms
  'dai', 'da', 'di', 'machi', 'macha', 'thala', 'thalaiva', 'nanba', 'bro', 'pa', 'paa',
  'avan', 'aval', 'avanga', 'avargal', 'ivan', 'ival', 'ivanga', 'ivargal',
  'neenga', 'nee', 'naan', 'nanga', 'engal', 'ungal', 'enakku', 'enaku', 'unakku',
  'unaku', 'ungalku', 'ungalukku', 'engalku', 'engalukku', 'namakku',
  // Question & Direction words
  'eppadi', 'epdi', 'ippadi', 'ipdi', 'appadi', 'apdi',
  'yaru', 'yaar', 'yaruku', 'yarku', 'yarukku', 'yara', 'yaroda',
  'enna', 'edhu', 'edhula', 'ethana', 'ethanai', 'evlo', 'evalavu', 'evalo',
  'enge', 'enga', 'inge', 'inga', 'ange', 'anga',
  'eppo', 'yeppo', 'eppodhu', 'yeppodhu', 'edhuku', 'yen', 'yean',
  // Time & Status
  'nethu', 'netru', 'inniku', 'inraiku', 'naalaiki', 'nalaiki', 'naleiki',
  'ippo', 'appo', 'eppovum', 'daily', 'aachu', 'aacha', 'mudinjadhu', 'mudinju',
  // Verbs & Actions
  'iruka', 'irukka', 'irukku', 'irukanga', 'irukkanga', 'irukinga', 'irukeenga',
  'irundha', 'irundhanga', 'illai', 'illa', 'illaya', 'irundhadhu',
  'sollu', 'sollunga', 'solla', 'solren', 'solranga', 'solreenga',
  'panra', 'panreenga', 'panringa', 'panna', 'pannunga', 'pannu', 'pannuranga',
  'kudu', 'kudunga', 'venum', 'venuma', 'theva', 'mattum',
  'kaatu', 'kaatunga', 'paaru', 'paarunga', 'paakanum', 'pakanum',
  'vandha', 'vandhanga', 'vandhavanga', 'vandhrukanga', 'vandhurukanga',
  'varala', 'varavillai', 'kelambu', 'kelambunga',
  'gedalum', 'ketalum', 'kelu', 'kekanum', 'kellunga',
  'sapteeya', 'saptingala', 'theriyuma', 'theriyala', 'therinjukanum',
  'puriyala', 'purinjidhu', 'olunga', 'proper', 'seri', 'nalladhu', 'nalla', 'romba',
  'leave-la', 'team-la', 'excel-la', 'pdf-la', 'office-la', 'velai', 'velaigal'
]);

const HINGLISH_TOKENS = new Set([
  'bhai', 'yaar', 'bro', 'kal', 'aaj', 'parso', 'kaun', 'kiske', 'kisne', 'kisko', 'chhutti', 'chutti',
  'batao', 'bataiye', 'dikhao', 'dikhaye', 'kijiye', 'karo', 'karega', 'meri', 'mera', 'apna',
  'unka', 'inka', 'kitne', 'kya', 'hai', 'hain', 'tha', 'the', 'thi', 'hoga', 'kaisa', 'kaise',
  'pe', 'par', 'mein', 'se', 'ko', 'nahi', 'matlab', 'acha', 'theek', 'theek-hai', 'kripya',
  'excel-mein', 'pdf-mein', 'team-mein', 'chahiye', 'kaam', 'shukriya', 'dhanyawad'
]);

const TELUGU_LATIN_TOKENS = new Set([
  'babu', 'anna', 'bro', 'ninna', 'ee roju', 'eroju', 'repu', 'evaru', 'evariki', 'selavu', 'unnaru',
  'unnara', 'ivvandi', 'chupinchandi', 'cheppandi', 'naa', 'ma', 'team-lo',
  'kavali', 'enti', 'ela', 'ledu', 'unna', 'andaru', 'panulu', 'chudandi'
]);


// Language Names
export const LANGUAGE_NAMES: Record<SupportedLanguage, { name: string; nativeName: string; flag: string }> = {
  auto: { name: 'Auto Detect', nativeName: 'Auto Detect (தானியங்கு)', flag: '🌐' },
  en: { name: 'English', nativeName: 'English', flag: '🇬🇧' },
  ta: { name: 'Tamil', nativeName: 'தமிழ் / Tanglish', flag: '🇮🇳' },
  hi: { name: 'Hindi', nativeName: 'हिंदी / Hinglish', flag: '🇮🇳' },
  te: { name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳' },
  ml: { name: 'Malayalam', nativeName: 'മലയാളം', flag: '🇮🇳' },
  kn: { name: 'Kannada', nativeName: 'ಕನ್ನಡ', flag: '🇮🇳' },
  bn: { name: 'Bengali', nativeName: 'বাংলা', flag: '🇮🇳' },
  mr: { name: 'Marathi', nativeName: 'मराठी', flag: '🇮🇳' },
  gu: { name: 'Gujarati', nativeName: 'ગુજરાતી', flag: '🇮🇳' },
  pa: { name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', flag: '🇮🇳' },
  ur: { name: 'Urdu', nativeName: 'اردو', flag: '🇵🇰' },
  ar: { name: 'Arabic', nativeName: 'العربية', flag: '🇸🇦' },
  fr: { name: 'French', nativeName: 'Français', flag: '🇫🇷' },
  de: { name: 'German', nativeName: 'Deutsch', flag: '🇩🇪' },
  es: { name: 'Spanish', nativeName: 'Español', flag: '🇪🇸' },
  pt: { name: 'Portuguese', nativeName: 'Português', flag: '🇵🇹' },
  zh: { name: 'Chinese', nativeName: '中文', flag: '🇨🇳' },
  ja: { name: 'Japanese', nativeName: '日本語', flag: '🇯🇵' },
  ko: { name: 'Korean', nativeName: '한국어', flag: '🇰🇷' },
};

/**
 * Detects the writing script and language properties
 */
export function detectLanguage(text: string): LanguageDetectionResult {
  const clean = text.trim();
  if (!clean) {
    return {
      primaryLanguage: 'en',
      script: 'Latin',
      isTransliterated: false,
      isMixed: false,
      confidence: 1.0,
    };
  }

  // Check Non-Latin Scripts first
  if (SCRIPT_PATTERNS.Tamil.test(clean)) {
    return {
      primaryLanguage: 'ta',
      script: 'Tamil',
      isTransliterated: false,
      isMixed: /[a-zA-Z]/.test(clean),
      confidence: 0.98,
    };
  }
  if (SCRIPT_PATTERNS.Devanagari.test(clean)) {
    return {
      primaryLanguage: 'hi',
      script: 'Devanagari',
      isTransliterated: false,
      isMixed: /[a-zA-Z]/.test(clean),
      confidence: 0.98,
    };
  }
  if (SCRIPT_PATTERNS.Telugu.test(clean)) {
    return {
      primaryLanguage: 'te',
      script: 'Telugu',
      isTransliterated: false,
      isMixed: /[a-zA-Z]/.test(clean),
      confidence: 0.98,
    };
  }
  if (SCRIPT_PATTERNS.Malayalam.test(clean)) {
    return {
      primaryLanguage: 'ml',
      script: 'Malayalam',
      isTransliterated: false,
      isMixed: /[a-zA-Z]/.test(clean),
      confidence: 0.98,
    };
  }
  if (SCRIPT_PATTERNS.Kannada.test(clean)) {
    return {
      primaryLanguage: 'kn',
      script: 'Kannada',
      isTransliterated: false,
      isMixed: /[a-zA-Z]/.test(clean),
      confidence: 0.98,
    };
  }
  if (SCRIPT_PATTERNS.Bengali.test(clean)) {
    return {
      primaryLanguage: 'bn',
      script: 'Bengali',
      isTransliterated: false,
      isMixed: /[a-zA-Z]/.test(clean),
      confidence: 0.98,
    };
  }
  if (SCRIPT_PATTERNS.Gujarati.test(clean)) {
    return {
      primaryLanguage: 'gu',
      script: 'Gujarati',
      isTransliterated: false,
      isMixed: /[a-zA-Z]/.test(clean),
      confidence: 0.98,
    };
  }
  if (SCRIPT_PATTERNS.Arabic.test(clean)) {
    return {
      primaryLanguage: 'ar',
      script: 'Arabic',
      isTransliterated: false,
      isMixed: false,
      confidence: 0.98,
    };
  }
  if (SCRIPT_PATTERNS.Kana.test(clean)) {
    return {
      primaryLanguage: 'ja',
      script: 'Kana',
      isTransliterated: false,
      isMixed: false,
      confidence: 0.98,
    };
  }
  if (SCRIPT_PATTERNS.Hangul.test(clean)) {
    return {
      primaryLanguage: 'ko',
      script: 'Hangul',
      isTransliterated: false,
      isMixed: false,
      confidence: 0.98,
    };
  }
  if (SCRIPT_PATTERNS.Hanzi.test(clean)) {
    return {
      primaryLanguage: 'zh',
      script: 'Hanzi',
      isTransliterated: false,
      isMixed: false,
      confidence: 0.95,
    };
  }

  // European language tokens
  const lower = clean.toLowerCase();
  if (/\b(qui|est|hier|aujourd'hui|demain|salut|merci|employés|congé)\b/i.test(lower)) {
    return { primaryLanguage: 'fr', script: 'Latin', isTransliterated: false, isMixed: false, confidence: 0.92 };
  }
  if (/\b(wer|ist|gestern|heute|morgen|hallo|danke|mitarbeiter|urlaub)\b/i.test(lower)) {
    return { primaryLanguage: 'de', script: 'Latin', isTransliterated: false, isMixed: false, confidence: 0.92 };
  }
  if (/\b(quién|quien|ayer|hoy|mañana|hola|gracias|empleados|permiso|ausente)\b/i.test(lower)) {
    return { primaryLanguage: 'es', script: 'Latin', isTransliterated: false, isMixed: false, confidence: 0.92 };
  }
  if (/\b(quem|ontem|hoje|amanhã|obrigado|funcionários|licença)\b/i.test(lower)) {
    return { primaryLanguage: 'pt', script: 'Latin', isTransliterated: false, isMixed: false, confidence: 0.92 };
  }

  // Tokenize Latin script words to detect Transliteration (Tanglish / Hinglish / Telugu-Latin)
  const words = lower.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);
  let tanglishScore = 0;
  let hinglishScore = 0;
  let teluguScore = 0;

  // Colloquial multi-word phrases & common patterns
  if (/\b(dai|machi|macha|thala|thalaiva|nanba)\b/i.test(lower)) tanglishScore += 3;
  if (/\b(eppadi|epdi)\s*(iruka|irukka|irukinga|irukeenga)/i.test(lower)) tanglishScore += 5;
  if (/\b(proper\s*aa|olunga|correct\s*aa)\s*(reply|pesu|solra|sollu)/i.test(lower)) tanglishScore += 4;
  if (/\b(train\s*pannu|enna\s*gedalum|enna\s*ketalum|reply\s*varanum)/i.test(lower)) tanglishScore += 4;
  if (/\b(inniku|nethu|naalaiki|inraiku|netru)\b/i.test(lower)) tanglishScore += 3;
  if (/\b(yaru|yaar|yaruku|yarku|yarukku|yara)\b/i.test(lower)) tanglishScore += 3;
  if (/\b(kaisa\s*hai|kya\s*haal|kaun\s*hai|kisko\s*hai)/i.test(lower)) hinglishScore += 5;
  if (/\b(ela\s*unnaru|bagunnara|evariki\s*undhi)/i.test(lower)) teluguScore += 5;

  words.forEach(w => {
    // Exact match
    if (TANGLISH_TOKENS.has(w)) tanglishScore += 2;
    if (HINGLISH_TOKENS.has(w)) hinglishScore += 2;
    if (TELUGU_LATIN_TOKENS.has(w)) teluguScore += 2;

    // Suffix matching (e.g. "team-la", "leave-la", "priya-ku", "solranga", "mudinjadhu")
    if (w.endsWith('-la') || (w.endsWith('la') && w.length > 3) || w.endsWith('-ku') || w.endsWith('-kku') || w.endsWith('unga') || w.endsWith('anga') || w.endsWith('aachu') || w.endsWith('aacha')) {
      tanglishScore++;
    }
    if (w.endsWith('-mein') || w === 'mein' || w.endsWith('iye') || w.endsWith('oge')) {
      hinglishScore++;
    }
    if (w.endsWith('-lo') || (w.endsWith('lo') && w.length > 4)) {
      teluguScore++;
    }
  });

  const hasEnglishWords = /\b(who|leave|absent|today|yesterday|tomorrow|task|performance|report|team|excel|pdf|status|manager|employee|list|department|salary|payroll)\b/i.test(lower);

  if (tanglishScore >= 2 || (tanglishScore > 0 && tanglishScore >= hinglishScore && tanglishScore >= teluguScore)) {
    return {
      primaryLanguage: 'ta',
      secondaryLanguage: hasEnglishWords ? 'en' : undefined,
      script: 'Latin',
      isTransliterated: true,
      transliterationType: 'Tanglish',
      isMixed: hasEnglishWords,
      confidence: 0.95,
    };
  }

  if (hinglishScore >= 2 || (hinglishScore > 0 && hinglishScore > teluguScore)) {
    return {
      primaryLanguage: 'hi',
      secondaryLanguage: hasEnglishWords ? 'en' : undefined,
      script: 'Latin',
      isTransliterated: true,
      transliterationType: 'Hinglish',
      isMixed: hasEnglishWords,
      confidence: 0.95,
    };
  }

  if (teluguScore >= 2 || teluguScore > 0) {
    return {
      primaryLanguage: 'te',
      secondaryLanguage: hasEnglishWords ? 'en' : undefined,
      script: 'Latin',
      isTransliterated: true,
      transliterationType: 'Telugu-Latin',
      isMixed: hasEnglishWords,
      confidence: 0.92,
    };
  }

  return {
    primaryLanguage: 'en',
    script: 'Latin',
    isTransliterated: false,
    isMixed: false,
    confidence: 0.95,
  };
}

/**
 * Resolves dates across all languages into canonical ISO strings
 */
export function resolveRelativeDate(text: string, baseDate: Date = new Date()): { key: ExtractedEntities['dateKey']; dateStr: string } {
  const lower = text.toLowerCase();

  // Yesterday variations
  if (
    /\b(yesterday|hier|ayer|gestern|ontem)\b/i.test(lower) ||
    /\b(nethu|netru)\b/i.test(lower) ||
    /\b(kal)\b/i.test(lower) && /\b(leave|tha|chhutti|pe tha|beeti)\b/i.test(lower) ||
    /\b(ninna)\b/i.test(lower) ||
    /நேற்று|कल|నిన్న|গতকাল|काल|গতকাল|গতকাল|গতকাল|গতকাল|গতকাল|গতকাল|গতকাল|গতকাল|গতকাল|গতকাল|গতকাল|গতকাল|গতকাল|গতকাল|গতকাল|গতকাল|গতকাল|গতকাল|গতকাল/i.test(lower) ||
    /昨日/i.test(lower)
  ) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - 1);
    return { key: 'yesterday', dateStr: d.toISOString().split('T')[0] };
  }

  // Tomorrow variations
  if (
    /\b(tomorrow|demain|mañana|morgen|amanhã)\b/i.test(lower) ||
    /\b(naalaiki|nalaiki|naleiki)\b/i.test(lower) ||
    /\b(kal)\b/i.test(lower) && /\b(aayega|hoga|karega|planning)\b/i.test(lower) ||
    /\b(repu)\b/i.test(lower) ||
    /நாளை|कल|రేపు/i.test(lower) ||
    /明日/i.test(lower)
  ) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + 1);
    return { key: 'tomorrow', dateStr: d.toISOString().split('T')[0] };
  }

  // Last Month
  if (
    /\b(last month|previous month|dernier mois|mes pasado|letzter monat)\b/i.test(lower) ||
    /\b(kadantha maadham|sendra maadham|pichle mahine|pichhla mahina)\b/i.test(lower) ||
    /கடந்த மாதம்|पिछले महीने|గత నెల|先月/i.test(lower)
  ) {
    const d = new Date(baseDate);
    d.setMonth(d.getMonth() - 1);
    return { key: 'last_month', dateStr: d.toISOString().split('T')[0].substring(0, 7) };
  }

  // This Month
  if (
    /\b(this month|current month|ce mois|este mes|dieser monat)\b/i.test(lower) ||
    /\b(inda maadham|is mahine)\b/i.test(lower) ||
    /இந்த மாதம்|इस महीने|ఈ నెల|今月/i.test(lower)
  ) {
    return { key: 'this_month', dateStr: baseDate.toISOString().split('T')[0].substring(0, 7) };
  }

  // This Week
  if (
    /\b(this week|current week|cette semaine|esta semana)\b/i.test(lower) ||
    /\b(inda vaaram|is hafte)\b/i.test(lower) ||
    /இந்த வாரம்|इस हफ्ते|ఈ వారం|今週/i.test(lower)
  ) {
    return { key: 'this_week', dateStr: baseDate.toISOString().split('T')[0] };
  }

  // Default Today
  if (
    /\b(today|aujourd'hui|hoy|heute|hoje)\b/i.test(lower) ||
    /\b(inniku|inraiku|aaj|ee roju|eroju)\b/i.test(lower) ||
    /இன்று|आज|ఈరోజు|今日/i.test(lower)
  ) {
    return { key: 'today', dateStr: baseDate.toISOString().split('T')[0] };
  }

  return { key: 'today', dateStr: baseDate.toISOString().split('T')[0] };
}

/**
 * Extracts entities like departments, employee names/IDs, format, etc.
 */
export function extractEntities(text: string): ExtractedEntities {
  const lower = text.toLowerCase();
  const entities: ExtractedEntities = {};

  // Resolve Date
  const dateInfo = resolveRelativeDate(text);
  entities.dateKey = dateInfo.key;
  entities.resolvedDate = dateInfo.dateStr;

  // Department identification
  if (/\b(hr|human resources|manav sansadhan)\b/i.test(lower) || /hr team|hr-la|hr mattum|hr mein/i.test(lower)) {
    entities.department = 'Human Resources';
  } else if (/\b(it|information tech|tech|software|engineering)\b/i.test(lower) || /it team|it-la|it mein/i.test(lower)) {
    entities.department = 'Engineering & Design';
  } else if (/\b(accounts|finance|payroll|vith|kankku)\b/i.test(lower) || /accounts head|finance team/i.test(lower)) {
    entities.department = 'Accounts Head';
  } else if (/\b(sales|marketing|bikri)\b/i.test(lower) || /sales team|sales executive/i.test(lower)) {
    entities.department = 'Sales Head';
  } else if (/\b(production|manufacturing|floor|factory)\b/i.test(lower)) {
    entities.department = 'Production Head';
  } else if (/\b(qa|quality|quality assurance)\b/i.test(lower)) {
    entities.department = 'Quality Assurance';
  }

  // Priority
  if (/\b(urgent|high priority|critical|emergency|avasiyam|zaroori)\b/i.test(lower)) {
    entities.priority = 'Urgent';
  } else if (/\b(medium priority|madhyam)\b/i.test(lower)) {
    entities.priority = 'Medium';
  } else if (/\b(low priority|kam)\b/i.test(lower)) {
    entities.priority = 'Low';
  }

  // Status
  if (/\b(approved|oppudhal|manzoor)\b/i.test(lower)) {
    entities.status = 'Approved';
  } else if (/\b(pending|kaathirukku|baki|vicharadhin)\b/i.test(lower)) {
    entities.status = 'Pending';
  } else if (/\b(rejected|niragarikkappattadhu|khariz)\b/i.test(lower)) {
    entities.status = 'Rejected';
  }

  // Export format
  if (/\b(excel|csv|xlsx|sheet|table|excel-la|excel mein|spreadsheet)\b/i.test(lower)) {
    entities.exportFormat = 'excel';
  } else if (/\b(pdf|document|print|report-ah|pdf-la|pdf mein)\b/i.test(lower)) {
    entities.exportFormat = 'pdf';
  }

  // Language switch target detection
  if (/\b(english|aangilam|angrezi)\b/i.test(lower) && /\b(in|into|la|mein|pesu|bolo|give|convert|switch)\b/i.test(lower)) {
    entities.targetLanguage = 'en';
  } else if (/\b(tamil|thamizh|தமிழ்)\b/i.test(lower) && /\b(in|into|la|mein|pesu|bolo|give|convert|switch)\b/i.test(lower)) {
    entities.targetLanguage = 'ta';
  } else if (/\b(hindi|hindi mein|हिंदी)\b/i.test(lower) && /\b(in|into|la|mein|pesu|bolo|give|convert|switch)\b/i.test(lower)) {
    entities.targetLanguage = 'hi';
  } else if (/\b(telugu|telugulo|తెలుగు)\b/i.test(lower) && /\b(in|into|la|mein|give|convert|switch)\b/i.test(lower)) {
    entities.targetLanguage = 'te';
  } else if (/\b(french|français)\b/i.test(lower)) {
    entities.targetLanguage = 'fr';
  } else if (/\b(japanese|nihongo|日本語)\b/i.test(lower)) {
    entities.targetLanguage = 'ja';
  }

  return entities;
}

/**
 * Maps any multilingual sentence into a Canonical Intent
 */
export function normalizeIntent(
  text: string, 
  hasPreviousData: boolean = false
): CanonicalIntent {
  const lower = text.toLowerCase().trim();

  // Explicit Language switch intent
  if (
    /^(give me this in|show in|respond in|speak in|talk in|translate to|switch to|give in)\s+(english|tamil|hindi|telugu|french|spanish|german|japanese)/i.test(lower) ||
    /^(ஆங்கிலத்தில்|தமிழில் பேசு|हिंदी में जवाब दो|अंग्रेजी में दो|in english please)/i.test(lower) ||
    /^(give this in english|english-la kudu|english mein do|tamil-la kudu|hindi mein do)$/i.test(lower)
  ) {
    return 'SWITCH_LANGUAGE';
  }

  // Bot Training / Prompt feedback / "chat bot aa proper aaa train pannanum because they not properly work"
  if (
    /\b(train\s*(the)?\s*(ai|chat\s*bot|bot|assistant)?|train\s*pannanum|train\s*pannu|proper\s*a+\s*train|not\s*properly\s*work|work\s*aagala|work\s*aagalai|work\s*pannala|olunga\s*work|sariya\s*work|proper\s*a+\s*reply|olunga\s*reply|correct\s*a+\s*reply|enna\s*gedalum|enna\s*ketalum|reply\s*varanum|proper\s*reply|sariya\s*reply|bot\s*training)\b/i.test(lower) ||
    /train pannanum|proper aaa|not properly work|proper aa train|train the bot|train chat bot|olunga vela|work aagalai|enna ketalum reply/i.test(lower)
  ) {
    return 'BOT_TRAIN_FEEDBACK';
  }

  // Casual Greeting / "dai eppadi iruka", "eppadi irukka da", "how are you", "kaisa hai", "epdi irukka"
  if (
    /\b(how are you|how r u|kaisa hai|kaise ho|kya haal|bagunnara|saukhyamo)\b/i.test(lower) ||
    /(dai|thala|machi|nanba|bro)?\s*(eppadi|epdi)\s*(iruka|irukka|irukinga|irukeenga)(\s*da|\s*bro|\s*pa)?/i.test(lower) ||
    /\b(eppadi|epdi)\s*(iruka|irukka|irukinga|irukeenga)\b/i.test(lower)
  ) {
    return 'GREETING_CASUAL';
  }

  // Casual Greeting / Hello / Hi / Vanakkam
  if (
    /^(hi|hello|hey|vanakkam|namaste|namaskar|namaskaram|bonjour|hola|dai|machi|thala|bro)$/i.test(lower) ||
    /^(hi|hello|hey)\s+(bro|there|bot|ai|assistant|vrm|seri|pavi|businz)/i.test(lower) ||
    /^(dai|machi|thala)\s+(hi|hello|vanakkam|sollu)/i.test(lower)
  ) {
    return 'GREETING_HELLO';
  }

  // Thank You / Appreciation
  if (
    /\b(thanks|thank you|thx|nandri|romba nandri|dhanyawad|shukriya|super|great|good job|arputham)\b/i.test(lower)
  ) {
    return 'THANK_YOU';
  }

  // Who Are You / Capabilities
  if (
    /\b(who are you|who r u|ne yaru|nee yaru|yar nee|tu kaun hai|what can you do|features enna|enna panna mudiyum|unnala enna panna mudiyum|businz|pavi)\b/i.test(lower) ||
    /^(who are you|ne yaaru|nee yaaru|who is this)/i.test(lower)
  ) {
    return 'WHO_ARE_YOU';
  }

  // Sandwich Leave Policy & Rules
  if (
    /\b(sandwich|sandwich rule|sandwich rules|sandwich policy|sandwich leave|sandwich leaves|sandwich calculation|sandwich epdi|sandwich eppadi|sandwich formula|weekend sandwich|holiday sandwich|unpaid sandwich)\b/i.test(lower) ||
    /sandwich leave rules|sandwich policy enna|sandwich eppadi calculate|what is sandwich leave/i.test(lower)
  ) {
    return 'GET_SANDWICH_POLICY';
  }

  // Add Employee / Onboarding Guide
  if (
    /\b(add employee|new employee|create employee|employee registration|onboarding steps|add employee eppadi|new employee create panna|how to add employee|employee add panna)\b/i.test(lower) ||
    /add employee steps|how to create employee/i.test(lower)
  ) {
    return 'GET_ONBOARDING_GUIDE';
  }

  // Salary Structure / Payroll Calculation Breakdown
  if (
    (/\b(salary|payroll|ctc|sambalam|vetan)\b/i.test(lower) && /\b(calculation|calculate|formula|breakdown|structure|components|basic|hra|da|pf deduction|esi deduction|lop calculation|eppadi calculate|how is salary calculated)\b/i.test(lower)) ||
    /\b(salary calculation|salary structure|ctc breakdown|pf calculation|esi calculation|advance salary rules)\b/i.test(lower)
  ) {
    return 'GET_SALARY_STRUCTURE';
  }

  // Headcount / Total Employees count
  if (
    /\b(total employees|headcount|how many employees|ethana peru|ethana employee|evalavu peru|evlo peru|kitne log|kitne employee|motha paniyalargal)\b/i.test(lower) ||
    /evlo peru vela pakkuranga|total staff/i.test(lower)
  ) {
    return 'GET_EMPLOYEE_COUNT';
  }

  // Explicit Export Intent (Excel or PDF)
  if (
    /\b(excel-la kudu|excel mein do|excel do|give me this in excel|give in excel|export to excel|excel file|excel kudunga|excel-la venum|exportar a excel|excelでください)\b/i.test(lower) ||
    /\b(pdf-la kudu|pdf mein do|pdf do|give me pdf|give in pdf|export to pdf|pdf file|pdf kudunga|pdf-la venum|pdfでください)\b/i.test(lower) ||
    /^(excel-la|excel mein|excel please|export excel|download excel|pdf-la|export pdf)$/i.test(lower)
  ) {
    return 'EXPORT_CURRENT_RESULT';
  }

  // Filter follow-up
  if (
    hasPreviousData && (
      /\b(mattum|only|sirf|keval|chahiye|filter|alone)\b/i.test(lower) ||
      /^(hr|it|sales|production|accounts|engineering|qa)(\s+team)?(\s+mattum|\s+only)?$/i.test(lower) ||
      /^(approved|pending|rejected)(\s+mattum|\s+only)?$/i.test(lower)
    )
  ) {
    return 'FILTER_CURRENT_RESULT';
  }

  // Absent Employees
  if (
    /\b(absent|absentees|not come|varala|vandhavanga|varavillai|anupasthit|nahi aaye|raledu|రాలేదు|வரவில்லை|अनुपस्थित)\b/i.test(lower) ||
    /inniku absent yaru|aaj kaun absent|who is absent|aaj kaun nahi aaya|nethu absent|absent list/i.test(lower)
  ) {
    return 'GET_ABSENT_EMPLOYEES';
  }

  // Late Employees
  if (
    /\b(late|latecomers|late vandhavanga|late aana|deri se|late vacchina|தாமதம்|देरी)\b/i.test(lower) ||
    /show me nethu late|who was late|kaun late aaya/i.test(lower)
  ) {
    return 'GET_LATE_EMPLOYEES';
  }

  // 1. Personal Employee Leave Balance (Deterministic Quotas & Approved Leaves)
  if (
    /\b(my leave balance|en leave balance|mera leave balance|my leave quota|remaining leave|remaining leaves|balance leave|leave balance|leaves balance|leaves left|my leaves left|my remaining leaves|how many leaves do i have|how many leaves left|leave quota balance|cl balance|sl balance|el balance|leave balance evlo|leave balance sollunga|leave balance enna|enakku evlo leave irukku|ennoda leave balance|mere kitne leave bache|naaku enni leaves unnayi|விடுப்பு இருப்பு)\b/i.test(lower) ||
    (/\b(my|en|ennoda|mera|naa|meri)\b/i.test(lower) && /\b(leave|leaves|chhutti|selavu)\b/i.test(lower) && /\b(balance|quota|remaining|left|evlo|kitni|enni|irukku)\b/i.test(lower))
  ) {
    return 'GET_MY_LEAVE_BALANCE';
  }

  // 2. Personal Employee Attendance Totals (Month-to-date present, late, absent)
  if (
    /\b(my attendance|en attendance|ennoda attendance|mera attendance|naa attendance|my present days|my late days|my attendance this month|en attendance intha maasam|is mahine mera attendance|ee month naa attendance|how many days was i present|how many days present|ethana naal present|evalavu naal present)\b/i.test(lower) ||
    (/\b(my|en|ennoda|mera|naa)\b/i.test(lower) && /\b(attendance|punches|present days|working hours)\b/i.test(lower))
  ) {
    return 'GET_MY_ATTENDANCE';
  }

  // 3. Personal Employee Assigned Shift Timing
  if (
    /\b(my shift|en shift|ennoda shift|mera shift|naa shift|my shift timing|my shift timings|en shift timing enna|what is my shift|what is my shift timing|my shift schedule|my work timing|my office timing|en shift eppo|mera shift time kya hai)\b/i.test(lower) ||
    (/\b(my|en|ennoda|mera|naa)\b/i.test(lower) && /\b(shift|shift timing|work timing|office timing)\b/i.test(lower))
  ) {
    return 'GET_MY_SHIFT';
  }

  // 4. Personal Credential Email Status Verification
  if (
    /\b(credential email|credentials email|login email|password email|my login email|credential anupitingala|email anupitingala|email sent-aa|credential email sent|did you send my email|welcome email|login details email)\b/i.test(lower)
  ) {
    return 'GET_MY_CREDENTIAL_EMAIL';
  }

  // Holiday Policies & Company Holiday Calendar
  // Holiday Policies & Company Holiday Calendar
  if (
    /\b(holiday|holidays|festival|festivals|statutory holiday|national holiday|official holiday|calendar|விடுமுறை|பண்டிகை|त्योहार|పండుగ|ರಜೆ|விடுமுறைப் பட்டியல்)\b/i.test(lower) ||
    /\b(holiday policy|holiday policies|holiday list|company holidays|holidays in our company|holidays in company|holiday calendar|upcoming holidays|chhutti list|chhuttiyan|selavula list|vidumurai|vidumuraigal)\b/i.test(lower) ||
    /inniku holiday|today holiday|tomorrow holiday|holiday schedule|holidays 2026/i.test(lower)
  ) {
    return 'GET_HOLIDAY_POLICIES';
  }

  // Leave Policies & Quotas
  if (
    (/\b(leave|leaves|chhutti|selavu|விடுப்பு)\b/i.test(lower) && /\b(policy|policies|quota|quotas|entitlement|accrual|carry forward|rules|slabs|types|casual leave|sick leave|earned leave|maternity|paternity|comp-off|comp off|how many leaves|ethana leave|kolgai)\b/i.test(lower)) ||
    /\b(leave policy|leave policies|leave quota|leave rules|leave guidelines|leave entitlement|cl quota|sl quota|el quota)\b/i.test(lower)
  ) {
    return 'GET_LEAVE_POLICIES';
  }

  // Attendance Policies, Shift Regulations & Punch Rules
  if (
    (/\b(attendance|punch|punches|varugai|haziri)\b/i.test(lower) && /\b(policy|policies|rule|rules|grace|late mark|late penalty|penalty|geofence|overtime|ot|regulation|regulations|working days|working hours)\b/i.test(lower)) ||
    /\b(attendance policy|attendance policies|attendance rules|punch policy|working hours|shift timings|late policy|overtime policy|face attendance|geofence radius)\b/i.test(lower)
  ) {
    return 'GET_ATTENDANCE_POLICIES';
  }

  // General Enterprise Policies, POSH, Code of Conduct & Safety
  if (
    /\b(posh|code of conduct|safety policy|ehs|travel policy|reimbursement policy|corporate policy|company policy|company policies|hr policy|hr policies)\b/i.test(lower)
  ) {
    return 'GET_COMPANY_POLICIES';
  }

  // Leave Records
  if (
    /\b(leave|leaves|chhutti|chutti|selavu|chuttee|விடுப்பு|छुट्टी|సెలవు|休んだ|congé|permiso|urlaub)\b/i.test(lower) ||
    /yaru leave|kaun leave pe|who was on leave|who is on leave|leave list/i.test(lower) ||
    /நேற்று லீவ்|யார் லீவ்/i.test(lower)
  ) {
    return 'GET_LEAVE_RECORDS';
  }

  // Overdue Tasks
  if (
    /\b(overdue|delayed task|pending task|thavariya velaigal|mudiyadha|samay par nahi)\b/i.test(lower) ||
    /overdue task yaruku|overdue tasks kiske paas|who has overdue tasks/i.test(lower)
  ) {
    return 'GET_OVERDUE_TASKS';
  }

  // Tasks in general
  if (
    /\b(task|tasks|assignment|assignments|project tasks|velaigal|kam|karya|வேலை|कार्य|పని)\b/i.test(lower)
  ) {
    return 'GET_TASKS';
  }

  // Low Performance / PIP
  if (
    /\b(low performance|poor performance|low performer|bottom performer|kamjor|kam performance|kuraindha)\b/i.test(lower) ||
    /low performance employees yaru|low performance employees kaun/i.test(lower)
  ) {
    return 'GET_PIP';
  }

  // Performance / KPA / KPI
  if (/\b(pip|performance improvement)\b/i.test(lower)) {
    return 'GET_PIP';
  }
  if (/\b(kpa|key performance)\b/i.test(lower)) {
    return 'GET_KPA';
  }
  if (/\b(kpi|indicator)\b/i.test(lower)) {
    return 'GET_KPI';
  }
  if (/\b(performance|rating|score|review|appraisal|seyalthiran|pradarshan|செயல்திறன்|प्रदर्शन)\b/i.test(lower)) {
    return 'GET_PERFORMANCE';
  }

  // Attendance in general
  if (
    /\b(attendance|present|punch|punches|varugai|haziri|ಹಾಜರಾತಿ|హాజరు|வருகை|उपस्थिति|présence|asistencia)\b/i.test(lower)
  ) {
    return 'GET_ATTENDANCE';
  }

  // Payroll / Salary
  if (
    /\b(payroll|salary|payslip|wages|ctc|sambalam|vetan|वेतन|జీతం|சம்பளம்|salaire|salario)\b/i.test(lower)
  ) {
    return 'GET_PAYROLL';
  }

  // Specific Employee Details
  if (
    /\b(emp-\d+|who is|details of|profile of|yaru|kaun hai)\b/i.test(lower) &&
    /\b(priya|ramesh|murugan|pavithra|robert|anita|dinesh|swetha|kavitha|david)\b/i.test(lower)
  ) {
    return 'GET_EMPLOYEE_DETAILS';
  }

  // Employee Directory / List
  if (
    /\b(employee|employees|staff|team members|paniyalar|karmachari|paniyalargal|ஊழியர்கள்|कर्मचारी|ఉద్యోగులు)\b/i.test(lower)
  ) {
    return 'GET_EMPLOYEE_LIST';
  }

  // General Report
  if (
    /\b(report|analytics|summary|arikkai|vivaram|report do|report kudu|vivaram kudu)\b/i.test(lower)
  ) {
    return 'GET_REPORT';
  }

  // General Help
  if (
    /\b(help|hi|hello|vanakkam|namaste|namaskaram|bonjour|hola|hallo|features|what can you do)\b/i.test(lower)
  ) {
    return 'GENERAL_HELP';
  }

  return 'UNKNOWN';
}

/**
 * Localized phrases and UI translation dictionary
 */
export const LOCALIZED_RESPONSES = {
  ta: {
    greeting: 'வணக்கம்! நான் உங்கள் BUSINZ Chat Bot. நீங்கள் எந்த மொழியிலும் என்னிடம் HRMS விபரங்களை கேட்கலாம்.',
    casualGreeting: 'Naan romba nalla irukken bro! 😊 BUSINZ Chat Bot-la ungalukku enna help venum? Inniku absent yaru, leave list, overdue tasks, performance, payroll pathi enna vena kelunga, instant-aa solren!',
    botTrained: 'Kandippa nanba! 👍 BUSINZ Chat Bot ippo full-aa train aagi ready-aa irukken. Neenga Tanglish, Tamil, English, Hindi-la enna ketalum accurate-aa HRMS live data eduthu instant-aa solluven!\n\nIdha click panni paarunga:\n• Inniku absent yaru?\n• Nethu yaru leave?\n• En team-la overdue task yaruku irukku?\n• Total employees evlo peru?\n• Monthly attendance report excel-la kudu',
    whoAreYou: 'Naan unga BUSINZ Chat Bot! 🤖 Office employees, daily attendance, biometric punches, leave requests, team tasks, performance ratings, mattrum payroll data-va ungalukku live-aa eduthu tharuven.',
    thankYou: 'Romba magizhchi bro! 😊 Vera edhavadhu report venuma? Kelunga, udaney solren!',
    leaveFound: (count: number, dateLabel: string) => `${dateLabel}-ல் Approved Leave பெற்ற ${count} ஊழியர்களின் விபரம் கீழே கொடுக்கப்பட்டுள்ளது:`,
    noLeaveFound: (dateLabel: string) => `${dateLabel}-ல் எந்த ஒரு ஊழியரும் Leave-ல் இல்லை. அனைவரும் வருகை புரிந்துள்ளனர்.`,
    absentFound: (count: number, dateLabel: string) => `${dateLabel}-ல் வருகை தராத (${count}) ஊழியர்களின் பட்டியல்:`,
    lateFound: (count: number, dateLabel: string) => `${dateLabel}-ல் தாமதமாக வந்த (${count}) ஊழியர்களின் விபரம்:`,
    tasksFound: (count: number) => `உங்கள் நிறுவனத்தில் உள்ள (${count}) Task-கள் கீழே காட்டப்பட்டுள்ளன:`,
    overdueTasksFound: (count: number) => `கவனத்திற்குரிய (${count}) Overdue Task-கள் மற்றும் அவற்றின் விபரம்:`,
    performanceFound: (count: number) => `ஊழியர்களின் செயல்திறன் (Performance Scores & KPI) அறிக்கை (${count}):`,
    lowPerformanceFound: (count: number) => `செயல்திறன் குறைவாக உள்ள மற்றும் PIP தேவைப்படும் (${count}) ஊழியர்கள்:`,
    attendanceFound: (dateLabel: string) => `${dateLabel}-க்கான வருகைப்பதிவு அறிக்கை (Attendance Summary):`,
    filteredNotice: (dept: string) => `விபரங்கள் "${dept}" துறைக்கு ஏற்றவாறு Filter செய்யப்பட்டுள்ளன.`,
    exportExcelSuccess: 'தற்போதைய விபரங்கள் Excel கோப்பாக (XLSX/CSV) பதிவிறக்கம் செய்யப்பட்டுள்ளன.',
    exportPdfSuccess: 'தற்போதைய விபரங்களுக்கான PDF அறிக்கை தயார் செய்யப்பட்டு திறக்கப்பட்டுள்ளது.',
    dateLabels: {
      today: 'இன்று (Today)',
      yesterday: 'நேற்று (Yesterday)',
      tomorrow: 'நாளை (Tomorrow)',
      last_month: 'கடந்த மாதம் (Last Month)',
      this_month: 'இந்த மாதம் (This Month)',
      this_week: 'இந்த வாரம் (This Week)',
    },
    tableHeaders: {
      employee: 'ஊழியர் பெயர்',
      id: 'ஊழியர் எண் (ID)',
      department: 'துறை (Department)',
      leaveType: 'விடுப்பு வகை (Leave Type)',
      status: 'நிலை (Status)',
      date: 'தேதி (Date)',
      checkIn: 'வருகை நேரம் (Check-In)',
      taskTitle: 'பணி (Task Title)',
      priority: 'முன்னுரிமை (Priority)',
      dueDate: 'கடைசி தேதி (Due Date)',
      score: 'மதிப்பெண் (Score)',
    }
  },
  hi: {
    greeting: 'नमस्ते! मैं आपका BUSINZ Chat Bot हूँ। आप किसी भी भाषा में HRMS से जुड़े प्रश्न पूछ सकते हैं।',
    casualGreeting: 'Main bilkul badhiya hoon! 😊 BUSINZ Chat Bot mein aapki kya madad kar sakta hoon? Attendance, leave, overdue tasks ya payroll ke baare mein kuch bhi poochiye!',
    botTrained: 'बिल्कुल! 👍 BUSINZ Chat Bot अब पूरी तरह तैयार है। आप Tanglish, हिंदी या अंग्रेज़ी में जो भी पूछेंगे, मैं HRMS लाइव डेटाबेस से सटीक जानकारी दूँगा!\n\nइनमें से कोई भी प्रश्न पूछें:\n• आज कौन absent है?\n• कल कौन छुट्टी पर था?\n• मेरी टीम में overdue tasks किसके पास हैं?\n• कुल कितने कर्मचारी हैं?',
    whoAreYou: 'मैं आपका BUSINZ Chat Bot हूँ! 🤖 मैं कर्मचारियों की उपस्थिति, छुट्टियाँ, टास्क, परफॉरमेंस और वेतन का पूरा विवरण तुरंत दे सकता हूँ।',
    thankYou: 'आपका बहुत-बहुत धन्यवाद! 😊 क्या आपको किसी और रिपोर्ट या डेटा की आवश्यकता है?',
    leaveFound: (count: number, dateLabel: string) => `${dateLabel} को Approved Leave पर रहने वाले ${count} कर्मचारियों की सूची नीचे दी गई है:`,
    noLeaveFound: (dateLabel: string) => `${dateLabel} को कोई भी कर्मचारी छुट्टी पर नहीं था। सभी उपस्थित थे।`,
    absentFound: (count: number, dateLabel: string) => `${dateLabel} को अनुपस्थित (${count}) कर्मचारियों की सूची:`,
    lateFound: (count: number, dateLabel: string) => `${dateLabel} को देरी से आने वाले (${count}) कर्मचारियों का विवरण:`,
    tasksFound: (count: number) => `कंपनी में चल रहे (${count}) कार्यों (Tasks) की सूची नीचे है:`,
    overdueTasksFound: (count: number) => `ध्यान दें: समय सीमा पार कर चुके (${count}) Overdue Tasks की सूची:`,
    performanceFound: (count: number) => `कर्मचारियों का प्रदर्शन स्कोर (Performance & KPI) विवरण (${count}):`,
    lowPerformanceFound: (count: number) => `कम प्रदर्शन और PIP निगरानी में शामिल (${count}) कर्मचारी:`,
    attendanceFound: (dateLabel: string) => `${dateLabel} की उपस्थिति रिपोर्ट (Attendance Report):`,
    filteredNotice: (dept: string) => `रिकॉर्ड्स "${dept}" विभाग के लिए फ़िल्टर किए गए हैं।`,
    exportExcelSuccess: 'वर्तमान रिकॉर्ड्स को Excel (CSV) फ़ाइल के रूप में डाउनलोड किया गया है।',
    exportPdfSuccess: 'वर्तमान रिकॉर्ड्स की PDF रिपोर्ट तैयार कर दी गई है।',
    dateLabels: {
      today: 'आज (Today)',
      yesterday: 'कल (Yesterday)',
      tomorrow: 'कल (Tomorrow)',
      last_month: 'पिछले महीने (Last Month)',
      this_month: 'इस महीने (This Month)',
      this_week: 'इस हफ्ते (This Week)',
    },
    tableHeaders: {
      employee: 'कर्मचारी का नाम',
      id: 'कर्मचारी आईडी',
      department: 'विभाग (Department)',
      leaveType: 'छुट्टी का प्रकार',
      status: 'स्थिति (Status)',
      date: 'दिनांक (Date)',
      checkIn: 'आगमन समय (Check-In)',
      taskTitle: 'कार्य (Task Title)',
      priority: 'प्राथमिकता (Priority)',
      dueDate: 'अंतिम तिथि (Due Date)',
      score: 'स्कोर (Score)',
    }
  },
  te: {
    greeting: 'నమస్కారం! నేను మీ BUSINZ Chat Bot ని. మీరు ఏ భాషలోనైనా HRMS వివరాలను అడగవచ్చు.',
    casualGreeting: 'నేను చాలా బాగున్నాను! 😊 BUSINZ Chat Bot లో మీకు ఏ సహాయం కావాలి? హాజరు, సెలవులు, టాస్కులు, జీతాల వివరాల గురించి అడగండి!',
    botTrained: 'ఖచ్చితంగా! 👍 BUSINZ Chat Bot ఇప్పుడు పూర్తిగా సిద్ధంగా ఉంది. మీరు Tanglish, తెలుగు లేదా ఇంగ్లీషులో ఏది అడిగినా లైవ్ HRMS సమాచారం ఇస్తాను!',
    whoAreYou: 'నేను మీ BUSINZ Chat Bot ని! 🤖 ఉద్యోగుల వివరాలు, హాజరు, సెలవులు, టాస్కులు మరియు జీతాల సమాచారాన్ని అందిస్తాను.',
    thankYou: 'చాలా ధన్యవాదాలు! 😊 మీకు ఇంకా ఏదైనా సమాచారం కావాలా?',
    leaveFound: (count: number, dateLabel: string) => `${dateLabel}న Approved సెలవులో ఉన్న ${count} మంది ఉద్యోగుల వివరాలు:`,
    noLeaveFound: (dateLabel: string) => `${dateLabel}న ఎవరూ సెలవులో లేరు. అందరూ హాజరయ్యారు.`,
    absentFound: (count: number, dateLabel: string) => `${dateLabel}న రాని (${count}) ఉద్యోగుల జాబితా:`,
    lateFound: (count: number, dateLabel: string) => `${dateLabel}న ఆలస్యంగా వచ్చిన (${count}) ఉద్యోగుల వివరాలు:`,
    tasksFound: (count: number) => `ప్రస్తుత (${count}) పనుల (Tasks) జాబితా క్రింద ఉంది:`,
    overdueTasksFound: (count: number) => `గడువు ముగిసిన (${count}) Overdue టాస్కుల వివరాలు:`,
    performanceFound: (count: number) => `ఉద్యోగుల పనితీరు స్కోరు (Performance Score) నివేదిక:`,
    lowPerformanceFound: (count: number) => `తక్కువ పనితీరు మరియు PIP లో ఉన్న ఉద్యోగుల వివరాలు:`,
    attendanceFound: (dateLabel: string) => `${dateLabel} హాజరు నివేదిక (Attendance Summary):`,
    filteredNotice: (dept: string) => `రికార్డులు "${dept}" విభాగానికి ఫిల్టర్ చేయబడ్డాయి.`,
    exportExcelSuccess: 'ప్రస్తుత డేటా Excel ఫైల్‌గా డౌన్‌లోడ్ చేయబడింది.',
    exportPdfSuccess: 'PDF నివేదిక సిద్ధం చేయబడింది.',
    dateLabels: {
      today: 'ఈరోజు (Today)',
      yesterday: 'నిన్న (Yesterday)',
      tomorrow: 'రేపు (Tomorrow)',
      last_month: 'గత నెల (Last Month)',
      this_month: 'ఈ నెల (This Month)',
      this_week: 'ఈ వారం (This Week)',
    },
    tableHeaders: {
      employee: 'ఉద్యోగి పేరు',
      id: 'ఉద్యోగి ID',
      department: 'విభాగం',
      leaveType: 'సెలవు రకం',
      status: 'స్థితి',
      date: 'తేదీ',
      checkIn: 'వచ్చిన సమయం',
      taskTitle: 'టాస్క్ పేరు',
      priority: 'ప్రాధాన్యత',
      dueDate: 'గడువు తేదీ',
      score: 'స్కోర్',
    }
  },
  en: {
    greeting: 'Hello! I am your BUSINZ Chat Bot. You can ask me any HRMS question in any language, script, or transliteration.',
    casualGreeting: "I'm doing great, thank you! 😊 How can I assist you with your BUSINZ Chat Bot today? Feel free to ask about attendance, absent lists, leave requests, overdue tasks, or payroll!",
    botTrained: "Understood! 👍 BUSINZ Chat Bot is fully trained and ready. Whatever you ask in Tamil, Tanglish, Hindi, or English, I will fetch live, accurate data directly from your HRMS database!\n\nTry clicking any of these:\n• Inniku absent yaru?\n• Nethu yaru leave?\n• En team-la overdue task yaruku irukku?\n• Total employees evlo peru?\n• Monthly attendance report excel-la kudu",
    whoAreYou: "I am your BUSINZ Chat Bot! 🤖 I provide instant real-time data for employee directories, biometric attendance, leave approvals, team tasks, performance appraisals, and payroll records across languages.",
    thankYou: "You are very welcome! 😊 Let me know if you need any other reports, attendance metrics, or HRMS records.",
    leaveFound: (count: number, dateLabel: string) => `Here are the ${count} employee(s) who were on approved leave for ${dateLabel}:`,
    noLeaveFound: (dateLabel: string) => `No employees were on leave on ${dateLabel}. All employees were accounted for.`,
    absentFound: (count: number, dateLabel: string) => `Here are the (${count}) employee(s) marked absent on ${dateLabel}:`,
    lateFound: (count: number, dateLabel: string) => `Here are the (${count}) employee(s) who clocked in late on ${dateLabel}:`,
    tasksFound: (count: number) => `Here are the (${count}) task(s) currently registered in your HRMS:`,
    overdueTasksFound: (count: number) => `Attention required: (${count}) overdue task(s) found across departments:`,
    performanceFound: (count: number) => `Employee Performance & KPI Assessment Summary (${count} records):`,
    lowPerformanceFound: (count: number) => `Employees flagged with Low Performance or under PIP review (${count}):`,
    attendanceFound: (dateLabel: string) => `Attendance report & shift metrics for ${dateLabel}:`,
    filteredNotice: (dept: string) => `Results are currently filtered for the "${dept}" department.`,
    exportExcelSuccess: 'Current conversation dataset has been exported to an Excel (.csv) file.',
    exportPdfSuccess: 'A professional PDF print report has been generated and prepared for viewing.',
    dateLabels: {
      today: 'Today',
      yesterday: 'Yesterday',
      tomorrow: 'Tomorrow',
      last_month: 'Last Month',
      this_month: 'This Month',
      this_week: 'This Week',
    },
    tableHeaders: {
      employee: 'Employee Name',
      id: 'Employee ID',
      department: 'Department',
      leaveType: 'Leave Type',
      status: 'Status',
      date: 'Date',
      checkIn: 'Check-In',
      taskTitle: 'Task Title',
      priority: 'Priority',
      dueDate: 'Due Date',
      score: 'Score',
    }
  },
  ja: {
    greeting: 'こんにちは！VRM AI HRMSアシスタントです。どんな言語でもお気軽にお問い合わせください。',
    leaveFound: (count: number, dateLabel: string) => `${dateLabel}に承認済み休暇を取得した従業員一覧（${count}名）です：`,
    noLeaveFound: (dateLabel: string) => `${dateLabel}に休暇を取得した従業員はいませんでした。`,
    absentFound: (count: number, dateLabel: string) => `${dateLabel}の欠勤者一覧（${count}名）：`,
    lateFound: (count: number, dateLabel: string) => `${dateLabel}の遅刻者一覧（${count}名）：`,
    tasksFound: (count: number) => `登録されているタスク一覧（${count}件）：`,
    overdueTasksFound: (count: number) => `期限切れのタスク（${count}件）があります：`,
    performanceFound: (count: number) => `従業員パフォーマンス・KPIサマリー：`,
    lowPerformanceFound: (count: number) => `改善が必要な低パフォーマンス従業員（${count}名）：`,
    attendanceFound: (dateLabel: string) => `${dateLabel}の勤怠レポート：`,
    filteredNotice: (dept: string) => `"${dept}" 部署でフィルター適用中。`,
    exportExcelSuccess: '現在のデータがExcelファイルとしてエクスポートされました。',
    exportPdfSuccess: 'PDFレポートが作成されました。',
    dateLabels: {
      today: '本日 (Today)',
      yesterday: '昨日 (Yesterday)',
      tomorrow: '明日 (Tomorrow)',
      last_month: '先月 (Last Month)',
      this_month: '今月 (This Month)',
      this_week: '今週 (This Week)',
    },
    tableHeaders: {
      employee: '従業員氏名',
      id: '従業員番号',
      department: '部署',
      leaveType: '休暇区分',
      status: 'ステータス',
      date: '日付',
      checkIn: '出勤時刻',
      taskTitle: 'タスク名',
      priority: '優先度',
      dueDate: '期日',
      score: 'スコア',
    }
  },
  fr: {
    greeting: 'Bonjour! Je suis votre assistant VRM AI HRMS. Vous pouvez me poser vos questions en toute langue.',
    leaveFound: (count: number, dateLabel: string) => `Voici la liste des ${count} employé(s) en congé approuvé pour ${dateLabel}:`,
    noLeaveFound: (dateLabel: string) => `Aucun employé n'était en congé le ${dateLabel}.`,
    absentFound: (count: number, dateLabel: string) => `Employés absents le ${dateLabel} (${count}):`,
    lateFound: (count: number, dateLabel: string) => `Employés arrivés en retard le ${dateLabel} (${count}):`,
    tasksFound: (count: number) => `Voici la liste des (${count}) tâches enregistrées :`,
    overdueTasksFound: (count: number) => `Attention : (${count}) tâche(s) en retard identifiée(s) :`,
    performanceFound: (count: number) => `Rapport d'évaluation des performances et KPI (${count}) :`,
    lowPerformanceFound: (count: number) => `Employés sous revue PIP ou faible performance (${count}) :`,
    attendanceFound: (dateLabel: string) => `Rapport de présence pour ${dateLabel} :`,
    filteredNotice: (dept: string) => `Résultats filtrés pour le département "${dept}".`,
    exportExcelSuccess: 'Les données ont été exportées avec succès au format Excel (.csv).',
    exportPdfSuccess: 'Le rapport imprimable PDF a été généré.',
    dateLabels: {
      today: "Aujourd'hui",
      yesterday: 'Hier',
      tomorrow: 'Demain',
      last_month: 'Le mois dernier',
      this_month: 'Ce mois-ci',
      this_week: 'Cette semaine',
    },
    tableHeaders: {
      employee: "Nom de l'employé",
      id: "Matricule",
      department: "Département",
      leaveType: "Type de congé",
      status: "Statut",
      date: "Date",
      checkIn: "Pointage",
      taskTitle: "Tâche",
      priority: "Priorité",
      dueDate: "Date limite",
      score: "Score",
    }
  },
  es: {
    greeting: '¡Hola! Soy tu Asistente VRM AI HRMS. Puedes preguntarme en cualquier idioma.',
    leaveFound: (count: number, dateLabel: string) => `Lista de los ${count} empleado(s) con permiso aprobado para ${dateLabel}:`,
    noLeaveFound: (dateLabel: string) => `Ningún empleado estuvo con permiso el ${dateLabel}.`,
    absentFound: (count: number, dateLabel: string) => `Empleados ausentes el ${dateLabel} (${count}):`,
    lateFound: (count: number, dateLabel: string) => `Empleados que llegaron tarde el ${dateLabel} (${count}):`,
    tasksFound: (count: number) => `Lista de (${count}) tareas registradas:`,
    overdueTasksFound: (count: number) => `Atención: (${count}) tarea(s) vencida(s):`,
    performanceFound: (count: number) => `Resumen de desempeño y KPI (${count}):`,
    lowPerformanceFound: (count: number) => `Empleados bajo plan PIP o bajo rendimiento (${count}):`,
    attendanceFound: (dateLabel: string) => `Informe de asistencia para ${dateLabel}:`,
    filteredNotice: (dept: string) => `Resultados filtrados para el departamento "${dept}".`,
    exportExcelSuccess: 'Los datos actuales se han exportado exitosamente a Excel.',
    exportPdfSuccess: 'El informe PDF ha sido generado y preparado.',
    dateLabels: {
      today: 'Hoy',
      yesterday: 'Ayer',
      tomorrow: 'Mañana',
      last_month: 'El mes pasado',
      this_month: 'Este mes',
      this_week: 'Esta semana',
    },
    tableHeaders: {
      employee: 'Nombre del Empleado',
      id: 'ID Empleado',
      department: 'Departamento',
      leaveType: 'Tipo de Permiso',
      status: 'Estado',
      date: 'Fecha',
      checkIn: 'Hora de Entrada',
      taskTitle: 'Título de Tarea',
      priority: 'Prioridad',
      dueDate: 'Fecha Límite',
      score: 'Puntaje',
    }
  },
  ar: {
    greeting: 'مرحبًا! أنا مساعد الموارد البشرية الذكي VRM. يمكنك سؤالي بأي لغة.',
    leaveFound: (count: number, dateLabel: string) => `قائمة الموظفين في إجازة معتمدة لـ ${dateLabel} (${count}):`,
    noLeaveFound: (dateLabel: string) => `لم يكن هناك موظفون في إجازة في ${dateLabel}.`,
    absentFound: (count: number, dateLabel: string) => `الموظفون الغائبون في ${dateLabel} (${count}):`,
    lateFound: (count: number, dateLabel: string) => `الموظفون المتأخرون في ${dateLabel} (${count}):`,
    tasksFound: (count: number) => `قائمة المهام المسجلة (${count}):`,
    overdueTasksFound: (count: number) => `تنبيه: توجد (${count}) مهام متأخرة عن موعدها:`,
    performanceFound: (count: number) => `ملخص تقييم الأداء ومؤشرات الأداء الرئيسية:`,
    lowPerformanceFound: (count: number) => `الموظفون ذوو الأداء المنخفض وبرامج التحسين (${count}):`,
    attendanceFound: (dateLabel: string) => `تقرير الحضور والانصراف لـ ${dateLabel}:`,
    filteredNotice: (dept: string) => `تمت تصفية السجلات لقسم "${dept}".`,
    exportExcelSuccess: 'تم تصدير السجلات الحالية كملف Excel.',
    exportPdfSuccess: 'تم إنشاء تقرير PDF وطباعته بنجاح.',
    dateLabels: {
      today: 'اليوم (Today)',
      yesterday: 'أمس (Yesterday)',
      tomorrow: 'غداً (Tomorrow)',
      last_month: 'الشهر الماضي (Last Month)',
      this_month: 'هذا الشهر (This Month)',
      this_week: 'هذا الأسبوع (This Week)',
    },
    tableHeaders: {
      employee: 'اسم الموظف',
      id: 'رقم الموظف',
      department: 'القسم',
      leaveType: 'نوع الإجازة',
      status: 'الحالة',
      date: 'التاريخ',
      checkIn: 'وقت الدخول',
      taskTitle: 'عنوان المهمة',
      priority: 'الأولوية',
      dueDate: 'تاريخ الاستحقاق',
      score: 'الدرجة',
    }
  }
};

/**
 * Gets the localized phrase pack for a target language with safe fallback to English
 */
export function getLocalizedPack(lang: SupportedLanguage) {
  if (lang in LOCALIZED_RESPONSES) {
    return LOCALIZED_RESPONSES[lang as keyof typeof LOCALIZED_RESPONSES];
  }
  return LOCALIZED_RESPONSES.en;
}
