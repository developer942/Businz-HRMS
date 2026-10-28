import React, { useState, useEffect, useRef } from 'react';
import { 
  SupportedLanguage, 
  AIMessage, 
  ConversationState,
} from '../../types/aiAssistant';
import { 
  detectLanguage, 
  normalizeIntent, 
  extractEntities, 
  LANGUAGE_NAMES,
  getLocalizedPack 
} from '../../services/aiLanguageEngine';
import { executeHRMSQuery } from '../../services/aiDataQueryService';
import { executeVerifiedHRMSQuery } from '../../services/aiBackendQueryService';
import { exportToExcel, exportToPDF, exportToCSV } from '../../services/aiExportService';
import {
  setStoredGeminiApiKey,
  getStoredGeminiModel,
  setStoredGeminiModel,
  listGeminiModels,
  callGeminiGenerateContent,
  checkAiServerStatus,
  cleanApiKey,
  syncApiKeyToBackend,
  GeminiModelInfo,
} from '../../services/geminiApiService';
import { useHRMS } from '../../context/HRMSContext';
import { isCeoOrHrUser } from '../../services/authService';
import {
  Settings,
  RotateCcw,
  Maximize2,
  Minimize2,
  X,
  Mic,
  Send,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  Search,
  Users,
  Calendar,
  CalendarX,
  CheckSquare,
  DollarSign,
  Bot,
  User,
  ExternalLink
} from 'lucide-react';
import './AIAssistantWidget.css';

// Quick action cards for modern welcome screen
const QUICK_ACTIONS = [
  {
    id: 'att-today',
    icon: Calendar,
    color: '#0E7490',
    bg: '#ECFEFF',
    label: "Today's Attendance",
    query: 'Inniku absent yaru?',
    desc: 'Absent, late & present count'
  },
  {
    id: 'leave-yesterday',
    icon: CalendarX,
    color: '#F59E0B',
    bg: '#FEF3C7',
    label: 'Leave Status',
    query: 'Nethu yaru leave?',
    desc: "Yesterday's leaves & approvals"
  },
  {
    id: 'overdue-tasks',
    icon: CheckSquare,
    color: '#EF4444',
    bg: '#FEE2E2',
    label: 'Overdue Tasks',
    query: 'En team-la overdue task yaruku irukku?',
    desc: 'Delayed assignments & team status'
  },
  {
    id: 'emp-count',
    icon: Users,
    color: '#3B82F6',
    bg: '#EFF6FF',
    label: 'Employee Directory',
    query: 'Total employees evlo peru?',
    desc: 'Active staff & departments'
  },
  {
    id: 'payroll-status',
    icon: DollarSign,
    color: '#10B981',
    bg: '#D1FAE5',
    label: 'Payroll Overview',
    query: 'Show payroll overview',
    desc: 'Salary disbursement & net payout'
  },
  {
    id: 'excel-export',
    icon: FileSpreadsheet,
    color: '#8B5CF6',
    bg: '#EDE9FE',
    label: 'Export Report',
    query: 'Monthly attendance report excel-la kudu',
    desc: 'Instant CSV & Excel spreadsheet'
  }
];

interface AIAssistantWidgetProps {
  hideDesktopTrigger?: boolean;
}

export const AIAssistantWidget: React.FC<AIAssistantWidgetProps> = ({ hideDesktopTrigger = false }) => {
  const {
    currentUser,
    employees,
    attendanceRecords,
    leaveRequests,
    enhancedTasks,
    performanceScores,
    payrollRecords,
    departments,
    activeModule,
    setActiveModule,
    holidayPolicies,
    leavePolicies,
    attendancePolicies,
    weeklySchedules,
    attendanceConfig,
    policyDocuments,
    businessSettings,
    shifts,
    fieldAssignments
  } = useHRMS();

  const role = currentUser?.role || 'Super Admin';

  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>('auto');
  const [inputText, setInputText] = useState<string>('');
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [tableSearch, setTableSearch] = useState<Record<string, string>>({});
  const [tableLoading, setTableLoading] = useState<Record<string, boolean>>({});

  // UI Interactive States
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  // Gemini API Configuration State
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>(getStoredGeminiModel());
  const [availableModels, setAvailableModels] = useState<GeminiModelInfo[]>([]);
  const [isTestingKey, setIsTestingKey] = useState<boolean>(false);
  const [keyTestStatus, setKeyTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [keyErrorMessage, setKeyErrorMessage] = useState<string>('');
  const [showKeyText, setShowKeyText] = useState<boolean>(false);
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(false);

  // Conversational Memory
  const [convState, setConvState] = useState<ConversationState>({
    currentLanguage: 'en',
    conversationHistory: [],
    lastResultData: null,
    lastColumns: null,
    lastIntent: null,
    lastFilters: {}
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize with clean, lightweight welcome message
  useEffect(() => {
    if (convState.conversationHistory.length === 0) {
      const welcomeMessage: AIMessage = {
        id: 'msg-welcome',
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: 'Hello! I am your BUSINZ Chat Bot. Ask me anything about attendance, leaves, tasks, or payroll in Tamil, Tanglish, English, or Hindi.',
        intent: 'GENERAL_HELP',
        followUpSuggestions: [
          'Inniku absent yaru?',
          'Nethu yaru leave?',
          'En team-la overdue task yaruku irukku?',
          'Total employees evlo peru?',
          'Dai eppadi iruka?'
        ]
      };
      setConvState(prev => ({
        ...prev,
        conversationHistory: [welcomeMessage]
      }));
    }
  }, []);

  // Auto scroll to bottom of messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [convState.conversationHistory, isOpen, isTyping]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // Stop speech when window closes or unmounts
  useEffect(() => {
    if (!isOpen && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    }
  }, [isOpen]);

  // Listen for programmatic open / toggle events from MobileBottomNav
  useEffect(() => {
    const handleOpen = () => setIsOpen(true);
    const handleClose = () => setIsOpen(false);
    const handleToggle = () => setIsOpen(prev => !prev);

    window.addEventListener('open-vrm-ai-chatbot', handleOpen);
    window.addEventListener('close-vrm-ai-chatbot', handleClose);
    window.addEventListener('toggle-vrm-ai-chatbot', handleToggle);

    return () => {
      window.removeEventListener('open-vrm-ai-chatbot', handleOpen);
      window.removeEventListener('close-vrm-ai-chatbot', handleClose);
      window.removeEventListener('toggle-vrm-ai-chatbot', handleToggle);
    };
  }, []);

  // Broadcast state changes so navigation items can synchronize active indicators
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('vrm-ai-chatbot-state-change', { detail: { isOpen } }));
  }, [isOpen]);

  // Close mobile chatbot panel when navigating to another module
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth <= 1024) {
      setIsOpen(false);
    }
  }, [activeModule]);

  // Real-time synchronization with Settings -> Integrations and backend AI status
  useEffect(() => {
    const syncStatus = async () => {
      try {
        const serverStatus = await checkAiServerStatus();
        setHasGeminiKey(serverStatus.isConfigured);
        if (serverStatus.model) setSelectedModel(serverStatus.model);
      } catch { setHasGeminiKey(false); }
    };
    syncStatus();

    const onKeyUpdated = () => syncStatus();
    window.addEventListener('gemini-api-key-updated', onKeyUpdated);
    window.addEventListener('storage', onKeyUpdated);
    return () => {
      window.removeEventListener('gemini-api-key-updated', onKeyUpdated);
      window.removeEventListener('storage', onKeyUpdated);
    };
  }, []);

  // Test and fetch models via Google Gemini models.list endpoint
  const handleTestAndFetchModels = async () => {
    if (!apiKeyInput.trim()) {
      setKeyTestStatus('error');
      setKeyErrorMessage('Please enter an API key first.');
      return;
    }
    setIsTestingKey(true);
    setKeyTestStatus('idle');
    setKeyErrorMessage('');
    try {
      const models = await listGeminiModels(apiKeyInput);
      setAvailableModels(models);
      setKeyTestStatus('success');
      if (models.length > 0 && !models.some(m => m.name === selectedModel)) {
        setSelectedModel(models[0].name);
      }
    } catch (err: any) {
      setKeyTestStatus('error');
      setKeyErrorMessage(err.message || 'Validation failed. Please verify your API key.');
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleSaveGeminiSettings = async () => {
    const cleanKey = cleanApiKey(apiKeyInput);
    try {
      await syncApiKeyToBackend(cleanKey, selectedModel);
      setStoredGeminiApiKey(''); setStoredGeminiModel(selectedModel);
      setApiKeyInput(''); setHasGeminiKey(true); setShowApiKeyModal(false);
    } catch (error: any) {
      setKeyTestStatus('error'); setKeyErrorMessage(error.message || 'Configuration was not saved.');
    }
  };

  // Speech to Text (Web Speech API)
  const handleVoiceInput = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported on this browser. Please type your query.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      
      if (selectedLanguage === 'ta') recognition.lang = 'ta-IN';
      else if (selectedLanguage === 'hi') recognition.lang = 'hi-IN';
      else if (selectedLanguage === 'te') recognition.lang = 'te-IN';
      else recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputText(prev => prev ? `${prev} ${transcript}` : transcript);
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.error('Speech recognition error:', err);
      setIsListening(false);
    }
  };

  // Text-to-Speech audio reader with toggle
  const handleSpeak = (msgId: string, text: string, lang: SupportedLanguage) => {
    if (!('speechSynthesis' in window)) return;

    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();

    const cleanText = text.replace(/[*_#•]/g, ' ').slice(0, 320);
    const utterance = new SpeechSynthesisUtterance(cleanText);

    if (lang === 'ta') utterance.lang = 'ta-IN';
    else if (lang === 'hi') utterance.lang = 'hi-IN';
    else if (lang === 'te') utterance.lang = 'te-IN';
    else utterance.lang = 'en-US';

    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);

    setSpeakingMsgId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  // Copy message to clipboard
  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const refreshDirectoryResult = async (message: AIMessage, page: number, search?: string) => {
    if (!message.richPayload?.pagination?.serverSearch) return;
    setTableLoading(prev => ({ ...prev, [message.id]: true }));
    try {
      const result = await executeVerifiedHRMSQuery('GET_EMPLOYEE_LIST', message.rawEntities || {}, {
        page, pageSize: message.richPayload.pagination.pageSize,
        search: search ?? tableSearch[message.id] ?? message.richPayload.pagination.search ?? '',
      });
      setConvState(prev => ({ ...prev, conversationHistory: prev.conversationHistory.map(item => item.id === message.id
        ? { ...item, text: result.responseText, richPayload: result.payload, timingMs: result.timings?.totalMs } : item),
        lastResultData: result.payload.rows || [], lastColumns: result.payload.columns || prev.lastColumns }));
    } catch (error: any) {
      setConvState(prev => ({ ...prev, conversationHistory: prev.conversationHistory.map(item => item.id === message.id
        ? { ...item, text: error.message || "I couldn't verify this information from the HRMS database.", isError: true } : item) }));
    } finally { setTableLoading(prev => ({ ...prev, [message.id]: false })); }
  };

  // Main message processor
  const handleSendMessage = (textToSend?: string) => {
    const queryText = (textToSend !== undefined ? textToSend : inputText).trim();
    if (!queryText) return;

    // 1. Language and Script Detection
    const detected = detectLanguage(queryText);
    const activeLang: SupportedLanguage = selectedLanguage !== 'auto' 
      ? selectedLanguage 
      : detected.primaryLanguage;

    // 2. Extract Entities & Relative Dates
    const entities = extractEntities(queryText);

    // 3. Normalize Intent
    const hasExistingData = Boolean(convState.lastResultData && convState.lastResultData.length > 0);
    const intent = normalizeIntent(queryText, hasExistingData);

    // Create user message
    const userMsg: AIMessage = {
      id: `user-${Date.now()}`,
      sender: 'user',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      text: queryText,
      detectedLanguage: detected,
      intent,
      rawEntities: entities
    };

    setConvState(prev => ({
      ...prev,
      conversationHistory: [...prev.conversationHistory, userMsg]
    }));

    setInputText('');
    setIsTyping(true);

    // Handle immediate Export request if detected
    if (intent === 'EXPORT_CURRENT_RESULT') {
      setTimeout(() => {
        setIsTyping(false);
        const format = entities.exportFormat || 'excel';
        const dataRows = convState.lastResultData;
        const cols = convState.lastColumns || [];

        if (!dataRows || dataRows.length === 0) {
          const noDataMsg: AIMessage = {
            id: `asst-${Date.now()}`,
            sender: 'assistant',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            text: activeLang === 'ta'
              ? 'Export செய்ய தற்போதைய முடிவுகள் எதுவும் இல்லை. முதலில் "Nethu yaru leave?" போன்ற கேள்வியை கேளுங்கள்.'
              : activeLang === 'hi'
              ? 'एक्सपोर्ट करने के लिए कोई सक्रिय डेटा नहीं है। कृपया पहले एक प्रश्न पूछें।'
              : 'There is no active data to export yet. Please ask an HRMS question first.',
            followUpSuggestions: ['Nethu yaru leave?', 'Inniku absent yaru?', 'En team-la overdue task yaruku irukku?']
          };
          setConvState(prev => ({ ...prev, conversationHistory: [...prev.conversationHistory, noDataMsg] }));
          return;
        }

        if (format === 'excel') {
          exportToExcel(dataRows, cols, 'HRMS_Export');
        } else {
          exportToPDF(dataRows, cols, 'VRM HRMS Report', undefined, convState.lastFilters);
        }

        const exportSuccessMsg: AIMessage = {
          id: `asst-${Date.now()}`,
          sender: 'assistant',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: format === 'excel'
            ? getLocalizedPack(activeLang).exportExcelSuccess
            : getLocalizedPack(activeLang).exportPdfSuccess,
          richPayload: {
            type: 'export_ready',
            exportAvailable: true
          },
          followUpSuggestions: [
            'HR team mattum',
            'Give in English',
            'Inniku absent yaru?',
            'Nethu yaru leave?'
          ]
        };

        setConvState(prev => ({
          ...prev,
          conversationHistory: [...prev.conversationHistory, exportSuccessMsg]
        }));
      }, 120);
      return;
    }

    // Deterministic HRMS facts are fetched from the authenticated PostgreSQL backend.
    setTimeout(async () => {
      const verifiedIntents = new Set([
        'GET_EMPLOYEE_COUNT', 'GET_EMPLOYEE_LIST', 'GET_EMPLOYEE_DETAILS', 'GET_ATTENDANCE',
        'GET_ABSENT_EMPLOYEES', 'GET_LATE_EMPLOYEES', 'GET_MY_ATTENDANCE', 'GET_LEAVE_RECORDS',
        'GET_MY_LEAVE_BALANCE', 'GET_LEAVE_POLICIES', 'GET_SANDWICH_POLICY',
        'GET_ATTENDANCE_POLICIES', 'GET_COMPANY_POLICIES', 'GET_PAYROLL', 'GET_SALARY_STRUCTURE', 'GET_MY_SHIFT',
        'GET_TASKS', 'GET_OVERDUE_TASKS', 'GET_PERFORMANCE', 'GET_KPA', 'GET_KPI', 'GET_PIP', 'GET_REPORT'
      ]);
      let queryResult: any;
      let geminiModelUsed: string | null = null;
      try {
        if (verifiedIntents.has(intent)) {
          queryResult = await executeVerifiedHRMSQuery(intent, entities);
          const explanationIntent = ['GET_LEAVE_POLICIES', 'GET_SANDWICH_POLICY', 'GET_ATTENDANCE_POLICIES', 'GET_COMPANY_POLICIES'].includes(intent);
          if (explanationIntent && hasGeminiKey && queryResult.verifiedFacts) {
            try {
              const explained = await callGeminiGenerateContent(queryText, { verifiedFacts: queryResult.verifiedFacts },
                activeLang, convState.conversationHistory);
              queryResult.responseText = explained.text;
              geminiModelUsed = explained.modelUsed;
            } catch { /* verified backend response remains authoritative */ }
          }
        } else {
          queryResult = executeHRMSQuery(intent, entities, activeLang, convState, {
            currentUser, role, employees: [], attendanceRecords: [], leaveRequests: [], enhancedTasks: [],
            performanceScores: [], payrollRecords: [], departments: [], holidayPolicies: [], leavePolicies: [],
            attendancePolicies: [], weeklySchedules: [], attendanceConfig: {} as any, policyDocuments: [], businessSettings: {} as any, shifts: [], fieldAssignments: []
          }, queryText);
        }
      } catch (error: any) {
        queryResult = { responseText: error?.status === 403 ? error.message : "I couldn't verify this information from the HRMS database.",
          payload: { type: 'none' }, followUpSuggestions: [], isError: true, newFilters: {} };
      }

      const assistantMsg: AIMessage = {
        id: `asst-${Date.now()}`,
        sender: 'assistant',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: queryResult.responseText,
        intent,
        rawEntities: entities,
        richPayload: queryResult.payload,
        followUpSuggestions: queryResult.followUpSuggestions,
        isError: queryResult.isError,
        geminiModel: geminiModelUsed || undefined,
        dataSource: verifiedIntents.has(intent) ? 'postgresql' : 'local',
        timingMs: queryResult.timings?.totalMs
      };

      setIsTyping(false);
      setConvState(prev => ({
        ...prev,
        currentLanguage: activeLang,
        conversationHistory: [...prev.conversationHistory, assistantMsg],
        lastResultData: queryResult.payload.rows || (intent === 'FILTER_CURRENT_RESULT' ? prev.lastResultData : null),
        lastColumns: queryResult.payload.columns || prev.lastColumns,
        lastIntent: intent,
        lastFilters: queryResult.newFilters
      }));
    }, 80);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const clearChat = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
    }
    setConvState({
      currentLanguage: 'en',
      conversationHistory: [
        {
          id: 'msg-cleared',
          sender: 'assistant',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: 'Hello! I am your BUSINZ Chat Bot. Ask me anything about attendance, leaves, tasks, or payroll.',
          followUpSuggestions: [
            'Inniku absent yaru?',
            'Nethu yaru leave?',
            'En team-la overdue task yaruku irukku?',
            'Total employees evlo peru?',
            'Dai eppadi iruka?'
          ]
        }
      ],
      lastResultData: null,
      lastColumns: null,
      lastIntent: null,
      lastFilters: {}
    });
  };

  // Clean Markdown-like rendering for structured responses
  const renderFormattedText = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, lIdx) => {
      const trimmed = line.trim();
      const isBullet = trimmed.startsWith('•') || trimmed.startsWith('-');
      const content = isBullet ? trimmed.replace(/^[•-]\s*/, '') : line;
      const parts = content.split(/(\*\*.*?\*\*)/g);

      return (
        <div key={lIdx} className={isBullet ? 'vrm-ai-bullet-line' : 'vrm-ai-text-line'}>
          {parts.map((part, pIdx) => {
            if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={pIdx} className="vrm-ai-strong">{part.slice(2, -2)}</strong>;
            }
            return part;
          })}
        </div>
      );
    });
  };

  const isInitialState = convState.conversationHistory.length <= 1;

  // AI Assistant is strictly restricted to CEO and HR roles (Super Admin, CEO, HR Manager, HR Admin)
  if (!isCeoOrHrUser(currentUser)) {
    return null;
  }

  return (
    <>
      {/* 
        ================================================================
        FLOATING TRIGGER BUTTON (Docked at Bottom-Right)
        ================================================================
      */}
      {!isOpen && !hideDesktopTrigger && (
        <button
          id="vrm-ai-chatbot-trigger"
          className="vrm-ai-trigger-btn"
          onClick={() => setIsOpen(true)}
          title="Open BUSINZ Chat Bot"
          aria-label="Open BUSINZ Chat Bot"
        >
          <img src="/seri-bot-logo.png?v=teal" alt="BUSINZ Chat Bot" className="vrm-ai-trigger-icon-img" />
        </button>
      )}

      {/* 
        ================================================================
        ULTRA-MODERN AI ASSISTANT PANEL
        ================================================================
      */}
      {isOpen && (
        <div className={`vrm-ai-panel ${isExpanded ? 'expanded' : ''}`}>
          {/* Header */}
          <div className="vrm-ai-header">
            <div className="vrm-ai-header-brand">
              <div className="vrm-ai-header-icon-wrap">
                <div className="vrm-ai-header-icon">
                  <img src="/seri-bot-logo.png?v=teal" alt="BUSINZ Chat Bot Logo" className="vrm-ai-header-logo-img" />
                </div>
              </div>

              <div className="vrm-ai-header-meta">
                <div className="vrm-ai-header-title-row">
                  <h3 className="vrm-ai-header-title">BUSINZ Chat Bot</h3>
                </div>
              </div>
            </div>

            <div className="vrm-ai-header-controls">
              {/* Refresh / Clear Chat */}
              <button
                className="vrm-ai-header-btn"
                onClick={clearChat}
                title="Reset Conversation"
              >
                <RotateCcw size={13} />
              </button>

              {/* Expand / Restore */}
              <button
                className="vrm-ai-header-btn"
                onClick={() => setIsExpanded(!isExpanded)}
                title={isExpanded ? 'Restore window size' : 'Expand window'}
              >
                {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>

              {/* Close */}
              <button
                className="vrm-ai-header-btn vrm-ai-close-btn"
                onClick={() => setIsOpen(false)}
                title="Close chat"
              >
                <X size={15} color="#ffffff" />
              </button>
            </div>
          </div>

          {/* Messages Feed */}
          <div className="vrm-ai-messages">
            {/* Interactive Welcome Hub shown when conversation starts */}
            {isInitialState && (
              <div className="vrm-ai-welcome-hub">
                <div className="vrm-ai-welcome-hero">
                  <div className="vrm-ai-welcome-avatar">
                    <img src="/seri-bot-logo.png?v=teal" alt="BUSINZ Chat Bot" />
                  </div>
                  <h4 className="vrm-ai-welcome-title">How can I assist you today?</h4>
                </div>


                <div className="vrm-ai-quick-grid">
                  {QUICK_ACTIONS.map(action => {
                    const ActionIcon = action.icon;
                    return (
                      <button
                        key={action.id}
                        className="vrm-ai-quick-card"
                        onClick={() => handleSendMessage(action.query)}
                      >
                        <div
                          className="vrm-ai-quick-card-icon"
                          style={{ backgroundColor: action.bg, color: action.color }}
                        >
                          <ActionIcon size={16} />
                        </div>
                        <div className="vrm-ai-quick-card-content">
                          <span className="vrm-ai-quick-card-label">{action.label}</span>
                          <span className="vrm-ai-quick-card-desc">{action.desc}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Conversation History Messages */}
            {convState.conversationHistory.map((msg, mIndex) => {
              // Skip rendering redundant initial plain hello if we are showing the rich welcome hub
              if (isInitialState && mIndex === 0) return null;

              return (
                <div key={msg.id} className={`vrm-ai-msg-row ${msg.sender}`}>
                  <div className={`vrm-ai-avatar ${msg.sender}`}>
                    {msg.sender === 'user' ? (
                      <User size={16} />
                    ) : (
                      <img src="/seri-bot-logo.png?v=teal" alt="BUSINZ Chat Bot" className="vrm-ai-msg-avatar-img" />
                    )}
                  </div>

                  <div className={`vrm-ai-bubble ${msg.sender}`}>
                    {/* Top Action Bar for Assistant Messages */}
                    {msg.sender === 'assistant' && (
                      <div className="vrm-ai-bubble-meta-header">
                        <span className="vrm-ai-bubble-badge" style={msg.geminiModel ? { background: '#ECFEFF', color: '#0E7490', border: '1px solid #A5F3FC' } : undefined}>
                          {msg.geminiModel ? `✨ Gemini (${msg.geminiModel})` : 'BUSINZ Chat Bot'}
                        </span>

                        <div className="vrm-ai-bubble-tools">
                          {/* Audio Listen Button */}
                          <button
                            className={`vrm-ai-tool-btn ${speakingMsgId === msg.id ? 'active' : ''}`}
                            onClick={() => handleSpeak(msg.id, msg.text, convState.currentLanguage)}
                            title={speakingMsgId === msg.id ? 'Stop listening' : 'Listen with Voice (TTS)'}
                          >
                            {speakingMsgId === msg.id ? (
                              <div className="vrm-ai-sound-wave">
                                <span /><span /><span /><span />
                              </div>
                            ) : (
                              <Volume2 size={13} />
                            )}
                          </button>

                          {/* Copy Message Button */}
                          <button
                            className="vrm-ai-tool-btn"
                            onClick={() => handleCopy(msg.text, msg.id)}
                            title="Copy text to clipboard"
                          >
                            {copiedId === msg.id ? (
                              <Check size={13} color="#16A34A" />
                            ) : (
                              <Copy size={13} />
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Message Content with Formatted Text */}
                    <div className="vrm-ai-bubble-text">
                      {renderFormattedText(msg.text)}
                    </div>

                    {/* Summary Metric Badges */}
                    {msg.richPayload?.metrics && msg.richPayload.metrics.length > 0 && (
                      <div className="vrm-ai-metric-grid">
                        {msg.richPayload.metrics.map((m, idx) => (
                          <div key={idx} className="vrm-ai-metric-card">
                            <div className="vrm-ai-metric-val">{m.value}</div>
                            <div className="vrm-ai-metric-lbl">{m.label}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Stacked Chart Breakdown */}
                    {msg.richPayload?.chartData && (
                      <div className="vrm-ai-chart-box">
                        <div className="vrm-ai-progress-stacked">
                          {msg.richPayload.chartData.map((seg, idx) => (
                            <div
                              key={idx}
                              className="vrm-ai-progress-segment"
                              style={{
                                width: `${seg.percentage}%`,
                                backgroundColor: seg.color
                              }}
                              title={`${seg.label}: ${seg.count} (${seg.percentage}%)`}
                            />
                          ))}
                        </div>
                        <div className="vrm-ai-legend">
                          {msg.richPayload.chartData.map((seg, idx) => (
                            <div key={idx} className="vrm-ai-legend-item">
                              <span
                                className="vrm-ai-legend-color"
                                style={{ backgroundColor: seg.color }}
                              />
                              <span>{seg.label} ({seg.count})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Data Table */}
                    {msg.richPayload?.rows && (
                      <div className="vrm-ai-table-container">
                        <div className="vrm-ai-table-header-bar">
                          <span className="vrm-ai-table-title">
                            📋 {msg.richPayload.title || 'Records'} {msg.richPayload.pagination
                              ? `(Showing ${msg.richPayload.rows.length} of ${msg.richPayload.pagination.total})`
                              : `(${msg.richPayload.rows.length})`}
                          </span>
                          <div className="vrm-ai-table-search-box">
                            <Search size={12} className="vrm-ai-table-search-icon" />
                            <input
                              type="text"
                              placeholder="Search..."
                              value={tableSearch[msg.id] || ''}
                              onChange={e => setTableSearch({ ...tableSearch, [msg.id]: e.target.value })}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && msg.richPayload?.pagination?.serverSearch) {
                                  refreshDirectoryResult(msg, 1, tableSearch[msg.id] || '');
                                }
                              }}
                              className="vrm-ai-table-search-input"
                            />
                          </div>
                        </div>
                        <div className="vrm-ai-table-wrapper">
                          <table className="vrm-ai-table">
                            <thead>
                              <tr>
                                {(msg.richPayload.columns || []).map(col => (
                                  <th key={col.key}>{col.label}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {msg.richPayload.rows
                                .filter(row => {
                                  if (msg.richPayload?.pagination?.serverSearch) return true;
                                  const term = (tableSearch[msg.id] || '').toLowerCase();
                                  if (!term) return true;
                                  return Object.values(row).some(v => String(v).toLowerCase().includes(term));
                                })
                                .map((row, rIdx) => (
                                  <tr key={rIdx}>
                                    {(msg.richPayload?.columns || []).map(col => (
                                      <td key={col.key}>
                                        {col.key === 'status' ? (
                                          <span className={`vrm-ai-pill-status ${
                                            row[col.key] === 'Approved' || row[col.key] === 'Present' || row[col.key] === 'Active'
                                              ? 'status-success' : row[col.key] === 'Pending' || row[col.key] === 'Late'
                                              ? 'status-warning' : 'status-danger'
                                          }`}>
                                            {row[col.key]}
                                          </span>
                                        ) : col.key === 'priority' ? (
                                          <span className={`vrm-ai-pill-priority ${row[col.key] === 'Urgent' ? 'prio-urgent' : 'prio-medium'}`}>
                                            {row[col.key]}
                                          </span>
                                        ) : (
                                          row[col.key]
                                        )}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                              {msg.richPayload.rows.length === 0 && (
                                <tr><td colSpan={(msg.richPayload.columns || []).length || 1}>No authorized records found.</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        {msg.richPayload.pagination?.serverSearch && (
                          <div className="vrm-ai-actions-row">
                            <button className="vrm-ai-action-btn" disabled={tableLoading[msg.id] || msg.richPayload.pagination.page <= 1}
                              onClick={() => refreshDirectoryResult(msg, msg.richPayload!.pagination!.page - 1)}>Previous</button>
                            <span>Page {msg.richPayload.pagination.page} — Showing {msg.richPayload.rows.length} of {msg.richPayload.pagination.total}</span>
                            <button className="vrm-ai-action-btn" disabled={tableLoading[msg.id] || !msg.richPayload.pagination.hasMore}
                              onClick={() => refreshDirectoryResult(msg, msg.richPayload!.pagination!.page + 1)}>
                              {tableLoading[msg.id] ? 'Loading…' : 'Next'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions Row: Excel & PDF Exports */}
                    {msg.richPayload?.exportAvailable && msg.richPayload?.rows && (
                      <div className="vrm-ai-actions-row">
                        <button
                          className="vrm-ai-action-btn excel"
                          onClick={() => exportToExcel(msg.richPayload!.rows!, msg.richPayload!.columns || [], 'HRMS_Data')}
                          title="Download Excel spreadsheet (.xls)"
                        >
                          <FileSpreadsheet size={13} />
                          <span>Download Excel</span>
                        </button>
                        <button
                          className="vrm-ai-action-btn pdf"
                          onClick={() => exportToPDF(
                            msg.richPayload!.rows!,
                            msg.richPayload!.columns || [],
                            msg.richPayload!.title || 'HRMS Report',
                            msg.richPayload!.metrics,
                            convState.lastFilters
                          )}
                          title="Download formatted PDF document"
                        >
                          <FileText size={13} />
                          <span>Download PDF</span>
                        </button>
                        <button
                          className="vrm-ai-action-btn csv"
                          onClick={() => exportToCSV(msg.richPayload!.rows!, msg.richPayload!.columns || [], 'HRMS_Data')}
                          title="Download CSV file (.csv)"
                        >
                          <Download size={13} />
                          <span>Download CSV</span>
                        </button>
                        {msg.richPayload?.navigationTarget && (
                          <button
                            className="vrm-ai-action-btn nav"
                            onClick={() => {
                              setActiveModule(msg.richPayload!.navigationTarget as any);
                              setIsOpen(false);
                            }}
                            title={`Navigate to ${msg.richPayload.navigationTarget} module`}
                          >
                            <ExternalLink size={13} />
                            <span>Open Module</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Timestamp */}
                    <span className="vrm-ai-msg-time">{msg.timestamp}</span>
                  </div>
                </div>
              );
            })}

            {/* Typing Animation */}
            {isTyping && (
              <div className="vrm-ai-msg-row assistant">
                <div className="vrm-ai-avatar assistant">
                  <img src="/seri-bot-logo.png?v=teal" alt="BUSINZ Chat Bot" className="vrm-ai-msg-avatar-img" />
                </div>
                <div className="vrm-ai-bubble assistant">
                  <div className="vrm-ai-typing">
                    <div className="vrm-ai-typing-dot" />
                    <div className="vrm-ai-typing-dot" />
                    <div className="vrm-ai-typing-dot" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Voice Listening Active Indicator Banner */}
          {isListening && (
            <div className="vrm-ai-listening-banner">
              <div className="vrm-ai-listening-badge">
                <div className="vrm-ai-red-dot-pulse" />
                <span>Listening... Speak in Tamil, Tanglish, or English</span>
              </div>
              <button
                type="button"
                onClick={() => setIsListening(false)}
                style={{ background: 'none', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: '11px', fontWeight: 700 }}
              >
                Cancel ✕
              </button>
            </div>
          )}

          {/* Clean, Modern Bottom Input Box */}
          <div className="vrm-ai-input-bar">
            <div className="vrm-ai-input-inner">
              <button
                type="button"
                className={`vrm-ai-mic-btn ${isListening ? 'listening' : ''}`}
                onClick={handleVoiceInput}
                title={isListening ? 'Listening...' : 'Click to speak (Voice Input)'}
              >
                <Mic size={16} />
              </button>

              <input
                ref={inputRef}
                type="text"
                className="vrm-ai-input"
                placeholder=""
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{
                  border: 'none',
                  outline: 'none',
                  boxShadow: 'none',
                  background: 'transparent'
                }}
              />

              <button
                type="button"
                className="vrm-ai-send-btn"
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim() || isTyping}
                title="Send query"
              >
                <Send size={15} />
              </button>
            </div>
          </div>

          {/* 
            ================================================================
            GOOGLE GEMINI API KEY & MODEL CONFIGURATION MODAL
            ================================================================
          */}
          {showApiKeyModal && (
            <div className="vrm-ai-modal-overlay" onClick={() => setShowApiKeyModal(false)}>
              <div className="vrm-ai-modal-card" onClick={e => e.stopPropagation()}>
                <div className="vrm-ai-modal-header">
                  <h4 className="vrm-ai-modal-title">
                    <Settings size={16} color="#0E7490" />
                    <span>Gemini AI Configuration (BUSINZ Chat Bot)</span>
                  </h4>
                  <button
                    className="vrm-ai-header-btn close-btn"
                    onClick={() => setShowApiKeyModal(false)}
                  >
                    <X size={14} />
                  </button>
                </div>

                <p style={{ fontSize: '11.5px', color: '#64748B', margin: '0 0 6px 0', lineHeight: 1.45 }}>
                  Connect your Google Gemini API key to enable live Generative AI responses across Tamil, Tanglish, Telugu, Hindi, and English.
                </p>

                <div className="vrm-ai-form-group">
                  <label className="vrm-ai-label">Gemini API Key</label>
                  <div className="vrm-ai-input-group">
                    <input
                      type={showKeyText ? 'text' : 'password'}
                      className="vrm-ai-modal-input"
                      placeholder="AIzaSy... or AQ...."
                      value={apiKeyInput}
                      onChange={e => setApiKeyInput(e.target.value)}
                    />
                    <button
                      type="button"
                      className="vrm-ai-key-toggle-btn"
                      onClick={() => setShowKeyText(!showKeyText)}
                    >
                      {showKeyText ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>

                <div className="vrm-ai-form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="vrm-ai-label">Select Model</label>
                    <button
                      type="button"
                      onClick={handleTestAndFetchModels}
                      disabled={isTestingKey || !apiKeyInput.trim()}
                      style={{ fontSize: '10.5px', color: '#0E7490', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                    >
                      {isTestingKey ? 'Fetching...' : 'List Models via API'}
                    </button>
                  </div>
                  <select
                    className="vrm-ai-modal-select"
                    value={selectedModel}
                    onChange={e => setSelectedModel(e.target.value)}
                  >
                    {availableModels.length > 0 ? (
                      availableModels.map(m => (
                        <option key={m.name} value={m.name}>
                          {m.displayName || m.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="gemini-2.0-flash">gemini-2.0-flash (Fast & Recommended)</option>
                        <option value="gemini-1.5-flash">gemini-1.5-flash (Standard & Reliable)</option>
                        <option value="gemini-1.5-pro">gemini-1.5-pro (Deep Reasoning)</option>
                        <option value="gemini-2.5-flash">gemini-2.5-flash (Next Gen Preview)</option>
                      </>
                    )}
                  </select>
                </div>

                {keyTestStatus === 'success' && (
                  <div style={{ fontSize: '11px', color: '#16A34A', background: '#DCFCE7', padding: '6px 10px', borderRadius: '6px', fontWeight: 600 }}>
                    ✓ API Key verified! Models listed successfully from Gemini endpoint.
                  </div>
                )}

                {keyTestStatus === 'error' && (
                  <div style={{ fontSize: '11px', color: '#DC2626', background: '#FEE2E2', padding: '6px 10px', borderRadius: '6px' }}>
                    ✕ {keyErrorMessage}
                  </div>
                )}

                <div style={{ fontSize: '10.5px', color: '#64748B' }}>
                  Need a key?{' '}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#0E7490', fontWeight: 600, textDecoration: 'underline' }}
                  >
                    Get free Gemini API Key at Google AI Studio ↗
                  </a>
                </div>

                <div className="vrm-ai-modal-footer">
                  <button
                    type="button"
                    className="vrm-ai-btn-secondary"
                    onClick={() => {
                      setStoredGeminiApiKey('');
                      setApiKeyInput('');
                      setHasGeminiKey(false);
                      setShowApiKeyModal(false);
                    }}
                  >
                    Disconnect
                  </button>
                  <button
                    type="button"
                    className="vrm-ai-btn-primary"
                    onClick={handleSaveGeminiSettings}
                  >
                    Save & Apply
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};
