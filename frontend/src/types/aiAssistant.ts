export type SupportedLanguage = 
  | 'auto'
  | 'en' // English
  | 'ta' // Tamil (தமிழ்)
  | 'hi' // Hindi (हिंदी)
  | 'te' // Telugu (తెలుగు)
  | 'ml' // Malayalam (മലയാളം)
  | 'kn' // Kannada (ಕನ್ನಡ)
  | 'bn' // Bengali (বাংলা)
  | 'mr' // Marathi (मराठी)
  | 'gu' // Gujarati (ગુજરાતી)
  | 'pa' // Punjabi (ਪੰਜਾਬੀ)
  | 'ur' // Urdu (اردو)
  | 'ar' // Arabic (العربية)
  | 'fr' // French (Français)
  | 'de' // German (Deutsch)
  | 'es' // Spanish (Español)
  | 'pt' // Portuguese (Português)
  | 'zh' // Chinese (中文)
  | 'ja' // Japanese (日本語)
  | 'ko'; // Korean (한국어)

export type ScriptType = 
  | 'Latin'
  | 'Tamil'
  | 'Devanagari'
  | 'Telugu'
  | 'Malayalam'
  | 'Kannada'
  | 'Bengali'
  | 'Gujarati'
  | 'Gurmukhi'
  | 'Arabic'
  | 'Hanzi'
  | 'Kana'
  | 'Hangul'
  | 'Mixed';

export type CanonicalIntent = 
  | 'GET_MY_LEAVE_BALANCE'
  | 'GET_MY_ATTENDANCE'
  | 'GET_MY_SHIFT'
  | 'GET_MY_CREDENTIAL_EMAIL'
  | 'GET_LEAVE_RECORDS'
  | 'GET_ATTENDANCE'
  | 'GET_ABSENT_EMPLOYEES'
  | 'GET_LATE_EMPLOYEES'
  | 'GET_EMPLOYEE_DETAILS'
  | 'GET_EMPLOYEE_LIST'
  | 'GET_EMPLOYEE_COUNT'
  | 'GET_TASKS'
  | 'GET_OVERDUE_TASKS'
  | 'GET_PERFORMANCE'
  | 'GET_KPA'
  | 'GET_KPI'
  | 'GET_PIP'
  | 'GET_PAYROLL'
  | 'GET_SALARY_STRUCTURE'
  | 'GET_REPORT'
  | 'GET_HOLIDAY_POLICIES'
  | 'GET_LEAVE_POLICIES'
  | 'GET_SANDWICH_POLICY'
  | 'GET_ATTENDANCE_POLICIES'
  | 'GET_COMPANY_POLICIES'
  | 'GET_ONBOARDING_GUIDE'
  | 'EXPORT_CURRENT_RESULT'
  | 'FILTER_CURRENT_RESULT'
  | 'SUMMARIZE_CURRENT_RESULT'
  | 'SWITCH_LANGUAGE'
  | 'GREETING_CASUAL'
  | 'GREETING_HELLO'
  | 'WHO_ARE_YOU'
  | 'BOT_TRAIN_FEEDBACK'
  | 'THANK_YOU'
  | 'GENERAL_HELP'
  | 'UNKNOWN';

export interface LanguageDetectionResult {
  primaryLanguage: SupportedLanguage;
  secondaryLanguage?: SupportedLanguage;
  script: ScriptType;
  isTransliterated: boolean;
  transliterationType?: 'Tanglish' | 'Hinglish' | 'Telugu-Latin' | 'Other';
  isMixed: boolean;
  confidence: number;
}

export interface ExtractedEntities {
  department?: string;
  employeeName?: string;
  employeeId?: string;
  dateKey?: 'today' | 'yesterday' | 'tomorrow' | 'this_week' | 'this_month' | 'last_month' | 'custom';
  resolvedDate?: string; // YYYY-MM-DD
  status?: string;
  priority?: string;
  exportFormat?: 'excel' | 'pdf';
  targetLanguage?: SupportedLanguage;
}

export interface MetricCardItem {
  label: string;
  value: string | number;
  subtext?: string;
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  icon?: string;
}

export interface TableColumn {
  key: string;
  label: string;
  align?: 'left' | 'center' | 'right';
}

export interface DistributionItem {
  label: string;
  count: number;
  percentage: number;
  color: string;
}

export interface RichPayload {
  type: 'table' | 'cards' | 'summary' | 'chart' | 'export_ready' | 'none';
  title?: string;
  metrics?: MetricCardItem[];
  columns?: TableColumn[];
  rows?: Record<string, any>[];
  chartData?: DistributionItem[];
  appliedFilters?: {
    module?: string;
    department?: string;
    date?: string;
    status?: string;
    searchTerm?: string;
  };
  navigationTarget?: string; // HRMS module name to jump to
  exportAvailable?: boolean;
}

export interface AIMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  timestamp: string;
  text: string;
  detectedLanguage?: LanguageDetectionResult;
  intent?: CanonicalIntent;
  richPayload?: RichPayload;
  rawEntities?: ExtractedEntities;
  followUpSuggestions?: string[];
  isError?: boolean;
  geminiModel?: string;
}

export interface ConversationState {
  currentLanguage: SupportedLanguage;
  conversationHistory: AIMessage[];
  lastResultData: Record<string, any>[] | null;
  lastColumns: TableColumn[] | null;
  lastIntent: CanonicalIntent | null;
  lastFilters: {
    department?: string;
    date?: string;
    status?: string;
    module?: string;
  };
}
