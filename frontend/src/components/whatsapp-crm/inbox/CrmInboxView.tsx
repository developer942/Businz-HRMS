/**
 * WhatsApp CRM Inbox View for BUSINZ HRMS
 * Desktop: WhatsApp Web Style Stable Two-Pane Layout
 * Mobile: Native WhatsApp Chat Flow with Independent Scrolling
 * Copyright (c) 2026 Arnas Donauskas - MIT License
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search,
  Send,
  Check,
  CheckCheck,
  AlertCircle,
  User,
  Phone,
  Mail,
  Plus,
  X,
  MessageSquare,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  UserCheck,
  RefreshCw,
  ArrowLeft,
  Info,
  Paperclip,
  FileText,
  MoreVertical,
  ChevronDown,
  RotateCcw,
  Download,
  Image as ImageIcon,
  ExternalLink
} from 'lucide-react';
import { crmService } from '../../../services/crmService';
import type {
  CrmConversation,
  CrmMessage,
  CrmContact,
  CrmTag,
  CrmTemplate
} from '../../../types/crm';
import { useHRMS } from '../../../context/HRMSContext';
import { RecordConsentModal } from '../contacts/RecordConsentModal';

interface CrmInboxViewProps {
  initialContactId?: string;
}

export interface ParsedDeliveryError {
  type: '24h_window' | 'auth' | 'invalid_phone' | 'rate_limit' | 'billing' | 'generic';
  badge: string;
  title: string;
  shortDesc: string;
  actionType?: 'template' | 'retry' | 'none';
  actionLabel?: string;
  rawDetails: string;
}

export function parseDeliveryError(rawError?: string | null): ParsedDeliveryError {
  const err = (rawError || '').trim();
  const lower = err.toLowerCase();

  // 1. 24-hour customer window expired (Code 131047 or text)
  if (
    lower.includes('131047') ||
    lower.includes('24 hour') ||
    lower.includes('24-hour') ||
    lower.includes('re-engagement') ||
    lower.includes('window')
  ) {
    return {
      type: '24h_window',
      badge: '24h Window Expired',
      title: '24-Hour Reply Window Expired',
      shortDesc:
        'Customer has not replied in the last 24 hours. Meta requires an Approved Template to message this contact.',
      actionType: 'template',
      actionLabel: 'Send Approved Template',
      rawDetails: err
    };
  }

  // 2. Auth / Token Expired (Code 190)
  if (
    lower.includes('190') ||
    lower.includes('oauth') ||
    lower.includes('access token') ||
    lower.includes('session has expired') ||
    lower.includes('authorization')
  ) {
    return {
      type: 'auth',
      badge: 'API Auth Error',
      title: 'Meta API Authentication Failed',
      shortDesc:
        'Your Meta WhatsApp System User token is invalid or expired. Please refresh the token in CRM Settings.',
      actionType: 'none',
      rawDetails: err
    };
  }

  // 3. Not on WhatsApp (Code 131026 / recipient not registered)
  if (
    lower.includes('131026') ||
    lower.includes('not a whatsapp') ||
    lower.includes('undeliverable') ||
    lower.includes('not registered')
  ) {
    return {
      type: 'invalid_phone',
      badge: 'Not on WhatsApp',
      title: 'Recipient Not on WhatsApp',
      shortDesc: 'This phone number is not registered on WhatsApp or cannot receive business messages.',
      actionType: 'none',
      rawDetails: err
    };
  }

  // 4. Rate limiting or spam thresholds
  if (
    lower.includes('rate limit') ||
    lower.includes('throughput') ||
    lower.includes('too many requests') ||
    lower.includes('131048')
  ) {
    return {
      type: 'rate_limit',
      badge: 'Rate Limit',
      title: 'Sending Rate Limit Reached',
      shortDesc: 'Meta Cloud API throughput limit reached for this number. Please wait a minute before retrying.',
      actionType: 'retry',
      actionLabel: 'Retry Send',
      rawDetails: err
    };
  }

  // 5. Payment / Billing
  if (lower.includes('payment') || lower.includes('billing') || lower.includes('credit card') || lower.includes('tier')) {
    return {
      type: 'billing',
      badge: 'Billing Alert',
      title: 'Meta Account Billing Notice',
      shortDesc: 'Please check the payment method configured on your WhatsApp Business Account in Meta Business Suite.',
      actionType: 'none',
      rawDetails: err
    };
  }

  // 6. Generic failure
  return {
    type: 'generic',
    badge: 'Delivery Failed',
    title: 'Message Delivery Failed',
    shortDesc: err.length > 95 ? `${err.substring(0, 92)}...` : err || 'Network or Meta Cloud API delivery failure.',
    actionType: 'retry',
    actionLabel: 'Retry Send',
    rawDetails: err
  };
}

export const CrmInboxView: React.FC<CrmInboxViewProps> = ({ initialContactId }) => {
  const { employees } = useHRMS();

  // Conversations State
  const [conversations, setConversations] = useState<CrmConversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loadingConvs, setLoadingConvs] = useState(false);

  // Active Chat State
  const [activeConv, setActiveConv] = useState<CrmConversation | null>(null);
  const [messages, setMessages] = useState<CrmMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  // Contact Info Drawer / Mobile Sheet State
  const [showContactInfo, setShowContactInfo] = useState<boolean>(false);
  const [contactDetails, setContactDetails] = useState<CrmContact | null>(null);
  const [availableTags, setAvailableTags] = useState<CrmTag[]>([]);
  const [showAddTagModal, setShowAddTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  // Mobile More Menu State
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Error details expansion state
  const [expandedErrorIds, setExpandedErrorIds] = useState<Set<string>>(new Set());

  // New Chat Modal State
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [directoryContacts, setDirectoryContacts] = useState<CrmContact[]>([]);
  const [contactSearchTerm, setContactSearchTerm] = useState('');
  const [loadingDirectoryContacts, setLoadingDirectoryContacts] = useState(false);

  // Template Picker Modal State
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [approvedTemplates, setApprovedTemplates] = useState<CrmTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<CrmTemplate | null>(null);
  const [templateVarValues, setTemplateVarValues] = useState<string[]>([]);
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const [templateSendError, setTemplateSendError] = useState<{ message: string; isConsentError: boolean } | null>(null);

  // Record WhatsApp Consent Modal State
  const [showConsentModal, setShowConsentModal] = useState(false);

  // Scroll Tracking & New Messages Indicator
  const [showScrollBottomPill, setShowScrollBottomPill] = useState(false);
  const [unreadNewCount, setUnreadNewCount] = useState(0);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef<boolean>(true);
  const prevMessagesLengthRef = useRef<number>(0);

  // Concurrency & Stale Request Guard
  const selectedConvIdRef = useRef<string | null>(null);
  const loadRequestSeqRef = useRef<number>(0);

  // Drafts Memory per Conversation
  const draftsRef = useRef<Record<string, string>>({});

  // Input & Attachment refs
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  // Sync ref with state
  useEffect(() => {
    selectedConvIdRef.current = selectedConvId;
  }, [selectedConvId]);

  // Click outside mobile menu listener
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    if (mobileMenuOpen) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [mobileMenuOpen]);

  // Load conversations on mount & filter changes
  useEffect(() => {
    loadConversations();
    loadTags();
  }, [statusFilter]);

  // Handle initialContactId passed from Contacts Directory
  useEffect(() => {
    if (initialContactId) {
      handleOpenContactConversation(initialContactId);
    }
  }, [initialContactId]);

  // Handle active conversation change
  useEffect(() => {
    if (selectedConvId) {
      loadConversationData(selectedConvId);
      const interval = setInterval(() => {
        pollMessages(selectedConvId);
      }, 5000);
      return () => clearInterval(interval);
    } else {
      setActiveConv(null);
      setMessages([]);
      setContactDetails(null);
      setShowContactInfo(false);
      setInputText('');
    }
  }, [selectedConvId]);

  // Auto-scroll logic: scroll to bottom if near bottom or initial load
  const scrollToBottom = useCallback((smooth = true) => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTo({
        top: chatAreaRef.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
      isNearBottomRef.current = true;
      setShowScrollBottomPill(false);
      setUnreadNewCount(0);
    }
  }, []);

  // Watch messages change to handle scroll & notification
  useEffect(() => {
    const currentLength = messages.length;
    const prevLength = prevMessagesLengthRef.current;
    prevMessagesLengthRef.current = currentLength;

    if (currentLength === 0) return;

    // If initial load for a conversation, jump immediately to bottom without smooth transition
    if (prevLength === 0 || loadingMessages) {
      scrollToBottom(false);
      return;
    }

    // If new messages arrived:
    if (currentLength > prevLength) {
      const lastMsg = messages[currentLength - 1];
      const isMySend = lastMsg.senderType === 'agent' || lastMsg.senderType === 'bot';

      if (isMySend || isNearBottomRef.current) {
        scrollToBottom(true);
      } else {
        // User has scrolled up reading history: show "New Messages" pill
        setUnreadNewCount(prev => prev + (currentLength - prevLength));
        setShowScrollBottomPill(true);
      }
    }
  }, [messages, loadingMessages, scrollToBottom]);

  const handleChatScroll = () => {
    if (!chatAreaRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatAreaRef.current;
    const threshold = 90;
    const near = scrollHeight - scrollTop - clientHeight <= threshold;
    isNearBottomRef.current = near;
    if (near) {
      setShowScrollBottomPill(false);
      setUnreadNewCount(0);
    }
  };

  const loadConversations = async () => {
    setLoadingConvs(true);
    try {
      const data = await crmService.getConversations({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: searchQuery || undefined
      });
      setConversations(data);

      // On desktop (> 900px), automatically select the first conversation if none selected
      if (data.length > 0 && !selectedConvIdRef.current && !initialContactId) {
        if (typeof window !== 'undefined' && window.innerWidth > 900) {
          handleSelectConversation(data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoadingConvs(false);
    }
  };

  const loadTags = async () => {
    try {
      const tags = await crmService.getTags();
      setAvailableTags(tags);
    } catch (err) {
      console.error('Failed to load tags:', err);
    }
  };

  // Safe conversation selection with Draft Preservation
  const handleSelectConversation = (conv: CrmConversation) => {
    // 1. Save draft of previously selected conversation
    if (selectedConvIdRef.current && selectedConvIdRef.current !== conv.id) {
      draftsRef.current[selectedConvIdRef.current] = inputText;
    }

    // 2. Set active conversation optimistically to update header immediately
    setActiveConv(conv);
    setSelectedConvId(conv.id);
    selectedConvIdRef.current = conv.id;

    // 3. Restore draft for the newly selected conversation
    const savedDraft = draftsRef.current[conv.id] || '';
    setInputText(savedDraft);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // 4. Reset scroll state
    setShowScrollBottomPill(false);
    setUnreadNewCount(0);
    isNearBottomRef.current = true;
    prevMessagesLengthRef.current = 0;
  };

  const handleBackToList = () => {
    // Save draft of current conversation before leaving
    if (selectedConvIdRef.current) {
      draftsRef.current[selectedConvIdRef.current] = inputText;
    }
    setSelectedConvId(null);
    selectedConvIdRef.current = null;
    setActiveConv(null);
    setShowContactInfo(false);
  };

  const handleOpenContactConversation = async (contactId: string) => {
    try {
      const conv = await crmService.startOrGetConversation(contactId);
      if (conv && conv.id) {
        setConversations(prev => {
          const exists = prev.some(c => c.id === conv.id);
          return exists ? prev.map(c => (c.id === conv.id ? { ...c, ...conv } : c)) : [conv, ...prev];
        });
        handleSelectConversation(conv);
      } else {
        await loadConversations();
      }
    } catch (err) {
      console.error('Error opening contact conversation:', err);
    }
  };

  const loadConversationData = async (convId: string) => {
    const currentSeq = ++loadRequestSeqRef.current;
    setLoadingMessages(true);

    try {
      const conv = await crmService.getConversationById(convId);
      if (currentSeq !== loadRequestSeqRef.current || selectedConvIdRef.current !== convId) return;

      setActiveConv(conv);

      if (conv?.contactId) {
        const contact = await crmService.getContactById(conv.contactId);
        if (currentSeq !== loadRequestSeqRef.current) return;
        setContactDetails(contact);
      }

      const msgs = await crmService.getMessages(convId);
      if (currentSeq !== loadRequestSeqRef.current || selectedConvIdRef.current !== convId) return;

      setMessages(msgs);

      // Mark conversation as read
      await crmService.markAsRead(convId);
      setConversations(prev =>
        prev.map(c => (c.id === convId ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err) {
      console.error('Error loading conversation data:', err);
    } finally {
      if (currentSeq === loadRequestSeqRef.current) {
        setLoadingMessages(false);
      }
    }
  };

  const pollMessages = async (convId: string) => {
    if (selectedConvIdRef.current !== convId) return;
    try {
      const msgs = await crmService.getMessages(convId);
      if (selectedConvIdRef.current === convId) {
        setMessages(msgs);
      }
    } catch (err) {
      console.error('Error polling messages:', err);
    }
  };

  // Textarea multi-line height auto-expand
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    if (selectedConvId) {
      draftsRef.current[selectedConvId] = val;
    }
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  // Desktop: Enter sends message; Shift + Enter creates a new line
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // If mobile screen, allow normal enter key for typing
      if (typeof window !== 'undefined' && window.innerWidth <= 768) {
        return;
      }
      e.preventDefault();
      void handleSendMessage();
    }
  };

  const handleSendMessage = async (textOverride?: string) => {
    const textToSend = (textOverride || inputText).trim();
    if (!textToSend || !selectedConvId || sending) return;

    if (!textOverride) {
      setInputText('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      if (selectedConvId) {
        delete draftsRef.current[selectedConvId];
      }
    }

    setSending(true);

    try {
      const newMsg = await crmService.sendMessage(selectedConvId, textToSend);
      setMessages(prev => [...prev, newMsg]);

      setConversations(prev =>
        prev.map(c =>
          c.id === selectedConvId
            ? {
                ...c,
                lastMessageText: textToSend,
                lastMessageTimestamp: new Date().toISOString()
              }
            : c
        )
      );

      // Scroll immediately after sending
      setTimeout(() => scrollToBottom(true), 50);
    } catch (err: any) {
      // If sending failed, restore text into input and draft for retry
      setInputText(textToSend);
      if (selectedConvId) {
        draftsRef.current[selectedConvId] = textToSend;
      }
      alert(`Message failed to send: ${err.message || 'WhatsApp Cloud API error'}`);
    } finally {
      setSending(false);
    }
  };

  const handleAssignAgent = async (employeeId: string) => {
    if (!selectedConvId) return;
    const emp = employees.find(e => e.id === employeeId || e.employeeId === employeeId);
    const empName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : 'Assigned Agent';

    try {
      await crmService.assignConversation(selectedConvId, employeeId, empName);
      setActiveConv(prev => (prev ? { ...prev, assignedEmployeeId: employeeId, assignedEmployeeName: empName } : null));
      setConversations(prev =>
        prev.map(c =>
          c.id === selectedConvId
            ? { ...c, assignedEmployeeId: employeeId, assignedEmployeeName: empName }
            : c
        )
      );
      setMobileMenuOpen(false);
    } catch (err) {
      console.error('Failed to assign agent:', err);
    }
  };

  const handleOpenNewChatModal = async () => {
    setShowNewChatModal(true);
    setLoadingDirectoryContacts(true);
    try {
      const res = await crmService.getContacts({ limit: 100, offset: 0 });
      setDirectoryContacts(res.contacts || []);
    } catch (err) {
      console.error('Failed to load contacts for new chat:', err);
    } finally {
      setLoadingDirectoryContacts(false);
    }
  };

  const handleOpenTemplatePicker = async () => {
    setTemplateSendError(null);
    setShowTemplateModal(true);
    try {
      const tmpls = await crmService.getTemplates({ status: 'APPROVED' });
      const list = tmpls.length > 0 ? tmpls : await crmService.getTemplates();
      setApprovedTemplates(list);
      const firstApproved = list.find(t => t.status === 'APPROVED') || list[0] || null;
      handleSelectTemplateForSend(firstApproved);
    } catch (err) {
      console.error('Failed to load templates for chat:', err);
    }
  };

  const handleSelectTemplateForSend = (tmpl: CrmTemplate | null) => {
    setSelectedTemplate(tmpl);
    setTemplateSendError(null);
    if (!tmpl || !tmpl.bodyText) {
      setTemplateVarValues([]);
      return;
    }
    const matches = tmpl.bodyText.match(/\{\{(\d+)\}\}/g) || [];
    const count = matches.length;
    const defaults = Array.from({ length: count }, (_, i) => {
      if (i === 0 && (activeConv?.contactName || contactDetails?.name)) {
        return activeConv?.contactName || contactDetails?.name || '';
      }
      return tmpl.bodyExampleValues?.[i] || '';
    });
    setTemplateVarValues(defaults);
  };

  const handleSendSelectedTemplate = async () => {
    if (!selectedTemplate || !activeConv || sendingTemplate) return;
    setSendingTemplate(true);
    setTemplateSendError(null);
    try {
      const headerUrl = selectedTemplate.headerContent || (selectedTemplate.headerExample && selectedTemplate.headerExample[0] && !selectedTemplate.headerExample[0].startsWith('https://scontent.') ? selectedTemplate.headerExample[0] : null) || (selectedTemplate.headerType === 'IMAGE' ? 'https://hrms.businz.com/vrm-banner.png' : undefined);

      const msg = await crmService.sendTemplateMessage({
        contactId: activeConv.contactId,
        recipientPhone: activeConv.contactPhone || contactDetails?.phone,
        recipientName: activeConv.contactName || contactDetails?.name,
        templateName: selectedTemplate.name,
        language: selectedTemplate.language || 'en',
        category: (selectedTemplate.category as any) || 'UTILITY',
        bodyParameters: templateVarValues.filter(v => v !== undefined),
        headerType: selectedTemplate.headerType || undefined,
        headerUrl: headerUrl || undefined
      });
      setMessages(prev => [...prev, msg]);
      setConversations(prev =>
        prev.map(c =>
          c.id === activeConv.id
            ? {
                ...c,
                lastMessageText: msg.contentText || `Template: ${selectedTemplate.name}`,
                lastMessageTimestamp: new Date().toISOString()
              }
            : c
        )
      );
      setShowTemplateModal(false);
      setTemplateSendError(null);
      setTimeout(() => scrollToBottom(true), 50);
    } catch (err: any) {
      const errorMsg = err.message || 'Meta API error';
      const isConsent = /consent/i.test(errorMsg);
      setTemplateSendError({
        message: errorMsg,
        isConsentError: isConsent
      });
    } finally {
      setSendingTemplate(false);
    }
  };

  const handleRetryMessage = async (failedMsg: CrmMessage) => {
    if (sending || sendingTemplate) return;

    if (failedMsg.contentType === 'template' || (failedMsg as any).templateName) {
      // Dedicated template retry - PRESERVES type: "template", image header, variables, and buttons
      setSendingTemplate(true);
      try {
        const bodyParams: string[] = [];
        const bodyComp = failedMsg.templateVariables?.components?.find(
          (c: any) => String(c?.type || '').toLowerCase() === 'body'
        );
        if (bodyComp?.parameters && Array.isArray(bodyComp.parameters)) {
          bodyComp.parameters.forEach((p: any) => {
            if (p?.text) bodyParams.push(String(p.text));
          });
        }

        const templateName = (failedMsg as any).templateName || selectedTemplate?.name || '';
        const headerUrl = failedMsg.mediaUrl || (failedMsg as any).templateVariables?.headerUrl || undefined;

        const retried = await crmService.sendTemplateMessage({
          contactId: activeConv?.contactId || '',
          recipientPhone: activeConv?.contactPhone || contactDetails?.phone,
          recipientName: activeConv?.contactName || contactDetails?.name,
          templateName,
          language: failedMsg.templateVariables?.language || 'en',
          bodyParameters: bodyParams.length > 0 ? bodyParams : undefined,
          components: failedMsg.templateVariables?.components || undefined,
          headerUrl
        });

        // Update local messages state replacing the failed message
        setMessages(prev => prev.map(m => (m.id === failedMsg.id ? { ...retried, id: failedMsg.id } : m)));
        setTimeout(() => scrollToBottom(true), 50);
      } catch (err: any) {
        alert(`Failed to retry template message: ${err.message || 'Meta API error'}`);
      } finally {
        setSendingTemplate(false);
      }
    } else {
      // Plain text messages retry as text
      handleSendMessage(failedMsg.contentText);
    }
  };

  const handleAddTag = async (tagId: string) => {
    if (!contactDetails) return;
    try {
      await crmService.assignTag(contactDetails.id, tagId);
      const updated = await crmService.getContactById(contactDetails.id);
      setContactDetails(updated);
    } catch (err) {
      console.error('Failed to add tag:', err);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!contactDetails) return;
    try {
      await crmService.removeTag(contactDetails.id, tagId);
      const updated = await crmService.getContactById(contactDetails.id);
      setContactDetails(updated);
    } catch (err) {
      console.error('Failed to remove tag:', err);
    }
  };

  const handleCreateNewTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const tag = await crmService.createTag(newTagName.trim(), '#0E7490');
      setAvailableTags(prev => [...prev, tag]);
      if (contactDetails) {
        await handleAddTag(tag.id);
      }
      setNewTagName('');
      setShowAddTagModal(false);
    } catch (err: any) {
      alert(err.message || 'Error creating tag');
    }
  };

  const formatTime = (ts?: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatListDate = (ts?: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const formatDateSeparator = (ts?: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const handleAttachmentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setInputText(prev => (prev ? `${prev}\n[Attachment: ${file.name}]` : `[Attachment: ${file.name}]`));
    e.target.value = '';
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const toggleErrorDetails = (msgId: string) => {
    setExpandedErrorIds(prev => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  };

  const showRightDrawer = Boolean(activeConv && contactDetails && showContactInfo);

  return (
    <div
      className={`crm-inbox-container ${selectedConvId ? 'mobile-show-chat' : ''} ${
        showRightDrawer ? 'with-contact-drawer' : ''
      }`}
    >
      {/* ============================================================
          1. LEFT SIDEBAR: Chats List, Search & Filters (Fixed 320px)
          ============================================================ */}
      <aside className="crm-inbox-left" aria-label="Conversation list">
        <div className="crm-inbox-left-header">
          <div className="crm-inbox-title-row">
            <h2 className="crm-inbox-heading">Chats</h2>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={handleOpenNewChatModal}
                title="Start New Chat"
                aria-label="Start New Chat"
                className="crm-btn-sm-primary"
                style={{ padding: '5px 10px', fontSize: '0.78rem' }}
              >
                <Plus size={14} />
                <span>New Chat</span>
              </button>
              <button
                type="button"
                onClick={loadConversations}
                title="Refresh conversations"
                aria-label="Refresh conversations"
                className="crm-icon-btn"
              >
                <RefreshCw size={15} className={loadingConvs ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Search Box */}
          <div className="crm-inbox-search-box">
            <Search size={15} className="crm-inbox-search-icon" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadConversations()}
              className="crm-inbox-search-input"
              style={{ paddingLeft: '38px', paddingRight: '32px' }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setTimeout(loadConversations, 0);
                }}
                aria-label="Clear search"
                className="crm-inbox-search-clear"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Filter Chips: All / Unread / Open */}
          <div className="crm-inbox-filter-chips" role="tablist" aria-label="Conversation filters">
            {(['all', 'unread', 'open'] as const).map(st => {
              const isActive = statusFilter === st;
              return (
                <button
                  key={st}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setStatusFilter(st)}
                  className={`crm-inbox-chip ${isActive ? 'active' : ''}`}
                >
                  {st}
                </button>
              );
            })}
          </div>
        </div>

        {/* Conversation List Stream (Scrolls Internally) */}
        <div className="crm-conv-list">
          {loadingConvs && conversations.length === 0 ? (
            <div className="crm-conv-empty">Loading chats...</div>
          ) : conversations.length === 0 ? (
            <div className="crm-conv-empty">
              <MessageSquare size={26} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
              <div style={{ fontWeight: 600, color: '#17212C', marginBottom: '2px' }}>No conversations found</div>
              <div style={{ fontSize: '0.76rem', color: '#667085', marginBottom: '12px' }}>
                Start a chat with any contact or employee.
              </div>
              <button
                type="button"
                onClick={handleOpenNewChatModal}
                className="crm-btn-primary"
                style={{ fontSize: '0.8rem', padding: '6px 14px' }}
              >
                <Plus size={15} />
                <span>Start New Chat</span>
              </button>
            </div>
          ) : (
            conversations.map(conv => {
              const isSelected = conv.id === selectedConvId;
              const resolvedName =
                conv.contactName || (conv as any).contact?.name || conv.contactPhone || (conv as any).contact?.phone || 'Unknown';
              const resolvedPhone = conv.contactPhone || (conv as any).contact?.phone || '';
              const resolvedTime = conv.lastMessageTimestamp || (conv as any).lastMessageAt;
              const initial = resolvedName.charAt(0).toUpperCase();

              return (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => handleSelectConversation(conv)}
                  className={`crm-conv-row ${isSelected ? 'selected' : ''}`}
                >
                  <div className="crm-conv-avatar">{initial}</div>

                  <div className="crm-conv-main">
                    <div className="crm-conv-top-line">
                      <span className="crm-conv-name">{resolvedName}</span>
                      <span className={`crm-conv-time ${conv.unreadCount > 0 ? 'unread' : ''}`}>
                        {formatListDate(resolvedTime)}
                      </span>
                    </div>

                    <div className="crm-conv-bottom-line">
                      <span className="crm-conv-snippet">
                        {conv.lastMessageText || resolvedPhone || 'No messages yet'}
                      </span>
                      {conv.unreadCount > 0 && (
                        <span className="crm-conv-unread-badge">{conv.unreadCount}</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ============================================================
          2. CENTER PANE: Fixed Contact Header, Scrolling Messages, Fixed Composer
          ============================================================ */}
      <main className="crm-inbox-center" aria-label="Conversation chat">
        {activeConv ? (
          <>
            {/* Top Contact Header (Always Pinned) */}
            <header className="crm-chat-header">
              <div className="crm-chat-header-left">
                {/* Mobile Back Button: returns to full list */}
                <button
                  type="button"
                  onClick={handleBackToList}
                  className="crm-chat-back-btn"
                  title="Back to Chats"
                  aria-label="Back to Chats list"
                >
                  <ArrowLeft size={20} />
                </button>

                <button
                  type="button"
                  onClick={() => setShowContactInfo(prev => !prev)}
                  className="crm-chat-contact-trigger"
                  title="View contact info"
                >
                  <div className="crm-chat-header-avatar">
                    {(activeConv.contactName || contactDetails?.name || activeConv.contactPhone || 'U')
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div className="crm-chat-header-meta">
                    <div className="crm-chat-header-name-row">
                      <span className="crm-chat-header-name">
                        {activeConv.contactName || contactDetails?.name || activeConv.contactPhone}
                      </span>
                      {(activeConv.contactCategory || contactDetails?.category) && (
                        <span className="crm-chat-category-tag">
                          {activeConv.contactCategory || contactDetails?.category}
                        </span>
                      )}
                    </div>
                    <div className="crm-chat-header-phone">
                      {activeConv.contactPhone || contactDetails?.phone || ''}
                    </div>
                  </div>
                </button>
              </div>

              {/* Desktop Header Actions */}
              <div className="crm-chat-header-actions desktop-only">
                {/* Info Button */}
                <button
                  type="button"
                  onClick={() => setShowContactInfo(prev => !prev)}
                  className={`crm-icon-btn ${showContactInfo ? 'active' : ''}`}
                  title={showContactInfo ? 'Hide contact info' : 'Show contact info'}
                  aria-label="Toggle contact info"
                >
                  <Info size={19} />
                </button>
              </div>

              {/* Mobile Header Actions (Compact: Info + 3-Dot Menu) */}
              <div className="crm-chat-header-actions mobile-only" ref={mobileMenuRef}>
                <button
                  type="button"
                  onClick={() => setShowContactInfo(prev => !prev)}
                  className={`crm-icon-btn ${showContactInfo ? 'active' : ''}`}
                  title="Contact info"
                  aria-label="Contact info"
                >
                  <Info size={18} />
                </button>

                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(prev => !prev)}
                  className="crm-icon-btn"
                  title="More actions"
                  aria-label="More actions"
                >
                  <MoreVertical size={18} />
                </button>

                {mobileMenuOpen && (
                  <div className="crm-mobile-chat-dropdown" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        handleOpenTemplatePicker();
                      }}
                      className="crm-dropdown-btn-item"
                    >
                      <FileText size={15} />
                      <span>Send Template</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setShowContactInfo(true);
                      }}
                      className="crm-dropdown-btn-item"
                    >
                      <User size={15} />
                      <span>View Contact Info</span>
                    </button>
                  </div>
                )}
              </div>
            </header>

            {/* Anti-Spam Consent Warning Banner */}
            {contactDetails?.consentStatus === 'Opted Out' && (
              <div className="crm-consent-warning-bar">
                <ShieldAlert size={15} style={{ flexShrink: 0 }} />
                <span>
                  <strong>Opted Out:</strong> Promotional messages are restricted. Only reply to direct inquiries.
                </span>
              </div>
            )}

            {/* Message Stream (Middle Scrolling Section) */}
            <div
              className="crm-chat-messages-area"
              ref={chatAreaRef}
              onScroll={handleChatScroll}
            >
              {loadingMessages ? (
                <div className="crm-chat-status-msg">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="crm-chat-status-msg">
                  <MessageSquare size={28} style={{ margin: '0 auto 8px', opacity: 0.35 }} />
                  <div style={{ fontWeight: 600, color: '#17212C' }}>No messages yet</div>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      color: '#667085',
                      marginTop: '4px',
                      maxWidth: '340px',
                      marginInline: 'auto'
                    }}
                  >
                    To start a new WhatsApp chat (before the contact messages you), send an approved template first.
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenTemplatePicker}
                    className="crm-btn-primary"
                    style={{ marginTop: '12px', padding: '6px 14px', fontSize: '0.8rem' }}
                  >
                    <FileText size={15} />
                    <span>Send Approved Template</span>
                  </button>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const isOutbound =
                    msg.senderType === 'agent' || msg.senderType === 'bot' || msg.senderType === 'system';
                  const prevMsg = idx > 0 ? messages[idx - 1] : null;
                  const currDateLabel = formatDateSeparator(msg.createdAt);
                  const prevDateLabel = prevMsg ? formatDateSeparator(prevMsg.createdAt) : '';
                  const showDateDivider = currDateLabel && currDateLabel !== prevDateLabel;

                  // Parse delivery failure if failed
                  const parsedErr = msg.status === 'failed' ? parseDeliveryError(msg.failureReason) : null;
                  const isErrorExpanded = expandedErrorIds.has(msg.id);

                  // Check if document attachment
                  const isDocument =
                    msg.contentType === 'document' ||
                    (msg.contentText && msg.contentText.toLowerCase().includes('.pdf')) ||
                    (msg.mediaUrl && msg.mediaUrl.toLowerCase().includes('.pdf'));

                  // Template identification & metadata resolution
                  const isTemplate =
                    msg.contentType === 'template' ||
                    Boolean((msg as any).templateName) ||
                    Boolean(msg.contentText && msg.contentText.includes('VRM Structures'));
                  const templateName =
                    (msg as any).templateName ||
                    (msg.contentText?.includes('VRM Structures') ? 'vrm_expo_followup_v1' : '');

                  // Resolve header image if template
                  let templateHeaderImage: string | null = null;
                  if (isTemplate) {
                    if (msg.mediaUrl) {
                      templateHeaderImage = msg.mediaUrl;
                    } else if ((msg as any).templateVariables?.components) {
                      const hComp = (msg as any).templateVariables.components.find(
                        (c: any) => String(c?.type || '').toLowerCase() === 'header'
                      );
                      const imgParam = hComp?.parameters?.find((p: any) => p?.type === 'image' || p?.image);
                      templateHeaderImage = imgParam?.image?.link || null;
                    }
                    if (
                      !templateHeaderImage &&
                      (templateName === 'vrm_expo_followup_v1' || msg.contentText?.includes('VRM Structures'))
                    ) {
                      templateHeaderImage = 'https://hrms.businz.com/vrm-banner.png';
                    }
                  }

                  // Resolve buttons if template
                  let templateButtons: any[] = [];
                  if (isTemplate) {
                    if (
                      (msg as any).interactivePayload?.buttons &&
                      Array.isArray((msg as any).interactivePayload.buttons) &&
                      (msg as any).interactivePayload.buttons.length > 0
                    ) {
                      templateButtons = (msg as any).interactivePayload.buttons;
                    } else if (
                      (msg as any).templateVariables?.buttons &&
                      Array.isArray((msg as any).templateVariables.buttons) &&
                      (msg as any).templateVariables.buttons.length > 0
                    ) {
                      templateButtons = (msg as any).templateVariables.buttons;
                    } else {
                      const tmplObj = approvedTemplates.find(t => t.name === templateName);
                      if (tmplObj?.buttons && Array.isArray(tmplObj.buttons) && tmplObj.buttons.length > 0) {
                        templateButtons = tmplObj.buttons;
                      } else if (
                        templateName === 'vrm_expo_followup_v1' ||
                        msg.contentText?.includes('VRM Structures')
                      ) {
                        templateButtons = [
                          { text: 'Call Support', type: 'PHONE_NUMBER', phoneNumber: '+919884330789' },
                          { text: 'Visit Website', type: 'URL', url: 'https://vrmstructures.in/' }
                        ];
                      }
                    }
                  }

                  return (
                    <React.Fragment key={msg.id}>
                      {showDateDivider && (
                        <div className="crm-date-separator">
                          <span>{currDateLabel}</span>
                        </div>
                      )}

                      <div className={`crm-msg-row ${isOutbound ? 'outbound' : 'inbound'}`}>
                        <div className={`crm-msg-bubble ${isOutbound ? 'outbound' : 'inbound'}`}>
                          {/* Template Header Badge */}
                          {isTemplate && templateName && (
                            <div className="crm-msg-template-badge">
                              <FileText size={11} />
                              <span>Template • {templateName}</span>
                            </div>
                          )}

                          {/* Template Header Image */}
                          {isTemplate && templateHeaderImage && (
                            <div className="crm-msg-template-header-wrap">
                              <img src={templateHeaderImage} alt="Template Header" className="crm-msg-template-header-img" />
                            </div>
                          )}

                          {/* Document Attachment Card */}
                          {isDocument && (
                            <div className="crm-msg-doc-card">
                              <div className="crm-msg-doc-icon-box">
                                <FileText size={18} color="#DC2626" />
                              </div>
                              <div className="crm-msg-doc-meta">
                                <div className="crm-msg-doc-name">
                                  {(msg as any).fileName || 'VRM Product Catalogue.pdf'}
                                </div>
                                <div className="crm-msg-doc-size">
                                  {(msg as any).fileSize || '2.4 MB • PDF'}
                                </div>
                              </div>
                              <button
                                type="button"
                                className="crm-msg-doc-download-btn"
                                title="Download attachment"
                                aria-label="Download attachment"
                                onClick={() => {
                                  if (msg.mediaUrl) {
                                    window.open(msg.mediaUrl, '_blank');
                                  } else {
                                    alert('Downloading attachment...');
                                  }
                                }}
                              >
                                <Download size={15} />
                              </button>
                            </div>
                          )}

                          {/* Image Attachment Thumbnail (for direct non-template image messages) */}
                          {!isTemplate && msg.contentType === 'image' && msg.mediaUrl && (
                            <div className="crm-msg-image-wrap">
                              <img src={msg.mediaUrl} alt="WhatsApp Image" className="crm-msg-image-thumb" />
                            </div>
                          )}

                          {/* Text Message Content */}
                          {(!isDocument || msg.contentText) && (
                            <div className="crm-msg-text">
                              {msg.contentText || (templateName ? `Template: ${templateName}` : '')}
                            </div>
                          )}

                          {/* Template Action Buttons (Call Support, Visit Website) */}
                          {isTemplate && templateButtons.length > 0 && (
                            <div className="crm-template-buttons-container">
                              {templateButtons.map((btn: any, bIdx: number) => {
                                const isPhone = btn.type === 'PHONE_NUMBER';
                                const phoneNum = btn.phoneNumber || btn.phone_number;
                                const targetUrl = isPhone ? `tel:${phoneNum}` : (btn.url || '#');
                                return (
                                  <a
                                    key={bIdx}
                                    href={targetUrl}
                                    target={!isPhone && btn.url ? '_blank' : undefined}
                                    rel="noopener noreferrer"
                                    className="crm-template-btn"
                                    onClick={e => {
                                      if (!isPhone && !btn.url) e.preventDefault();
                                    }}
                                  >
                                    {isPhone ? (
                                      <Phone size={13} className="crm-template-btn-icon" />
                                    ) : (
                                      <ExternalLink size={13} className="crm-template-btn-icon" />
                                    )}
                                    <span>{btn.text}</span>
                                  </a>
                                );
                              })}
                            </div>
                          )}

                          {/* Smart Delivery Error Card */}
                          {msg.status === 'failed' && parsedErr && (
                            <div className="crm-msg-error-card">
                              <div className="crm-msg-error-head">
                                <AlertCircle size={14} className="crm-msg-error-icon" />
                                <span className="crm-msg-error-title">{parsedErr.title}</span>
                              </div>
                              <div className="crm-msg-error-desc">{parsedErr.shortDesc}</div>

                              <div className="crm-msg-error-actions">
                                {parsedErr.actionType === 'template' && (
                                  <button
                                    type="button"
                                    onClick={handleOpenTemplatePicker}
                                    className="crm-msg-error-action-btn primary"
                                  >
                                    <FileText size={12} />
                                    <span>Send Approved Template</span>
                                  </button>
                                )}

                                {parsedErr.actionType === 'retry' && (
                                  <button
                                    type="button"
                                    onClick={() => handleRetryMessage(msg)}
                                    className="crm-msg-error-action-btn outline"
                                  >
                                    <RotateCcw size={12} />
                                    <span>Retry Send</span>
                                  </button>
                                )}

                                {parsedErr.rawDetails && (
                                  <button
                                    type="button"
                                    onClick={() => toggleErrorDetails(msg.id)}
                                    className="crm-msg-error-toggle-btn"
                                  >
                                    <span>{isErrorExpanded ? 'Hide details' : 'View details'}</span>
                                  </button>
                                )}
                              </div>

                              {isErrorExpanded && parsedErr.rawDetails && (
                                <div className="crm-msg-error-details-box">
                                  {parsedErr.rawDetails}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Message Metadata: Timestamp & Delivery Indicators */}
                          <div className="crm-msg-meta">
                            <span>{formatTime(msg.createdAt)}</span>
                            {isOutbound && (
                              <span className="crm-msg-tick">
                                {msg.status === 'read' ? (
                                  <CheckCheck size={14} color="#0E7490" />
                                ) : msg.status === 'delivered' ? (
                                  <CheckCheck size={14} color="#64748B" />
                                ) : msg.status === 'failed' ? (
                                  <AlertCircle size={13} color="#DC2626" />
                                ) : (
                                  <Check size={14} color="#64748B" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })
              )}
            </div>

            {/* Floating "New Messages" Pill Button when scrolled up */}
            {showScrollBottomPill && (
              <button
                type="button"
                onClick={() => scrollToBottom(true)}
                className="crm-scroll-bottom-pill"
                aria-label="Scroll to newest messages"
              >
                <ChevronDown size={14} />
                <span>{unreadNewCount > 0 ? `${unreadNewCount} new messages` : 'Latest messages'}</span>
              </button>
            )}

            {/* Bottom Message Composer (Always Pinned at Bottom) */}
            <footer className="crm-chat-composer">
              <input
                ref={attachmentInputRef}
                type="file"
                style={{ display: 'none' }}
                onChange={handleAttachmentSelect}
              />
              <button
                type="button"
                onClick={() => attachmentInputRef.current?.click()}
                className="crm-composer-icon-btn"
                title="Attach Document or Image"
                aria-label="Attach Document or Image"
              >
                <Paperclip size={18} />
              </button>

              <button
                type="button"
                onClick={handleOpenTemplatePicker}
                className="crm-composer-icon-btn"
                title="Send Approved WhatsApp Template"
                aria-label="Send Approved WhatsApp Template"
                style={{ color: '#0E7490' }}
              >
                <FileText size={18} />
              </button>

              {/* Multiline Expandable Input (Enter sends on desktop, Shift+Enter new line) */}
              <textarea
                ref={textareaRef}
                rows={1}
                placeholder="Type a message..."
                value={inputText}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                disabled={sending}
                className="crm-composer-textarea"
                aria-label="Type message content"
              />

              {/* Circular Send Button */}
              <button
                type="button"
                onClick={() => handleSendMessage()}
                disabled={sending || !inputText.trim()}
                className={`crm-composer-send-btn ${inputText.trim() && !sending ? 'ready' : ''}`}
                aria-label="Send WhatsApp message"
              >
                {sending ? <span className="crm-spinner-sm" /> : <Send size={16} />}
              </button>
            </footer>
          </>
        ) : (
          <div className="crm-inbox-empty-state">
            <div className="crm-inbox-empty-icon">
              <MessageSquare size={28} />
            </div>
            <h3 className="crm-inbox-empty-title">Select a conversation</h3>
            <p className="crm-inbox-empty-desc">
              Choose a contact from the left panel to read message history or send a WhatsApp reply.
            </p>
          </div>
        )}
      </main>

      {/* ============================================================
          3. RIGHT PANEL: Contact Details Drawer (Desktop) & Bottom Sheet (Mobile)
          ============================================================ */}
      {showRightDrawer && contactDetails && (
        <div className="crm-contact-drawer-backdrop" onClick={() => setShowContactInfo(false)}>
          <aside
            className="crm-inbox-right"
            aria-label="Contact Information"
            onClick={e => e.stopPropagation()}
          >
            <div className="crm-contact-drawer-header">
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#17212C' }}>Contact Info</span>
              <button
                type="button"
                onClick={() => setShowContactInfo(false)}
                className="crm-icon-btn"
                aria-label="Close contact info"
              >
                <X size={17} />
              </button>
            </div>

            {/* Profile Summary */}
            <div className="crm-contact-profile-box">
              <div className="crm-contact-large-avatar">
                {contactDetails.name.charAt(0).toUpperCase()}
              </div>
              <h4 className="crm-contact-profile-name">{contactDetails.name}</h4>
              <p className="crm-contact-profile-sub">
                {contactDetails.designation || contactDetails.category || 'Contact'}
              </p>
              {contactDetails.companyName && (
                <p className="crm-contact-profile-company">{contactDetails.companyName}</p>
              )}
            </div>

            {/* Consent Status Card */}
            <div
              className={`crm-consent-card ${
                contactDetails.consentStatus === 'Opted In'
                  ? 'opted-in'
                  : contactDetails.consentStatus === 'Opted Out'
                  ? 'opted-out'
                  : 'pending'
              }`}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {contactDetails.consentStatus === 'Opted In' ? (
                    <ShieldCheck size={16} color="#16A34A" />
                  ) : contactDetails.consentStatus === 'Opted Out' ? (
                    <ShieldAlert size={16} color="#DC2626" />
                  ) : (
                    <ShieldQuestion size={16} color="#D97706" />
                  )}
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#17212C' }}>
                    {contactDetails.consentStatus}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowConsentModal(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#0E7490',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    padding: '2px 4px',
                    borderRadius: '4px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  title="Record or update consent"
                >
                  Edit
                </button>
              </div>

              <div style={{ fontSize: '0.74rem', color: '#667085', marginTop: '4px' }}>
                Source: {contactDetails.consentSource || contactDetails.sourceType || 'Direct'}
              </div>
              {contactDetails.consentTimestamp && (
                <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: '2px' }}>
                  Date: {new Date(contactDetails.consentTimestamp).toLocaleDateString()}
                </div>
              )}
              {contactDetails.consentRecordedByName && (
                <div style={{ fontSize: '0.7rem', color: '#94A3B8', marginTop: '1px' }}>
                  Recorded by: {contactDetails.consentRecordedByName}
                </div>
              )}
              {contactDetails.consentNotes && (
                <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '4px', fontStyle: 'italic', background: 'rgba(255,255,255,0.6)', padding: '3px 6px', borderRadius: '4px' }}>
                  &ldquo;{contactDetails.consentNotes}&rdquo;
                </div>
              )}

              <button
                type="button"
                onClick={() => setShowConsentModal(true)}
                style={{
                  marginTop: '8px',
                  width: '100%',
                  padding: '6px 10px',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #CBD5E1',
                  borderRadius: '6px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: '#0E7490',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <ShieldCheck size={13} />
                <span>Record WhatsApp Consent</span>
              </button>
            </div>

            {/* Contact Details List */}
            <div className="crm-contact-section">
              <div className="crm-contact-section-label">Contact Channels</div>
              <div className="crm-contact-detail-list">
                <div className="crm-contact-detail-row">
                  <Phone size={14} color="#667085" />
                  <span>{contactDetails.phone}</span>
                </div>
                {contactDetails.email && (
                  <div className="crm-contact-detail-row">
                    <Mail size={14} color="#667085" />
                    <span style={{ overflowWrap: 'anywhere' }}>{contactDetails.email}</span>
                  </div>
                )}
                {contactDetails.category && (
                  <div className="crm-contact-detail-row">
                    <User size={14} color="#667085" />
                    <span>{contactDetails.category}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Tags Section */}
            <div className="crm-contact-section">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="crm-contact-section-label" style={{ marginBottom: 0 }}>
                  Tags
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddTagModal(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#0E7490',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                >
                  <Plus size={13} /> Add
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {contactDetails.tags && contactDetails.tags.length > 0 ? (
                  contactDetails.tags.map(t => (
                    <span key={t.id} className="crm-tag-pill">
                      <span>{t.name}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveTag(t.id)}
                        aria-label={`Remove tag ${t.name}`}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: 'inherit',
                          cursor: 'pointer',
                          display: 'inline-flex'
                        }}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: '0.78rem', color: '#667085' }}>No tags assigned</span>
                )}
              </div>
            </div>

            {/* Notes Section */}
            {contactDetails.notes && (
              <div className="crm-contact-section">
                <div className="crm-contact-section-label">Notes</div>
                <div className="crm-contact-notes-box">{contactDetails.notes}</div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Add Tag Modal */}
      {showAddTagModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowAddTagModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20000,
            padding: '16px'
          }}
        >
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              padding: '22px',
              width: '100%',
              maxWidth: '360px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.12)',
              border: '1px solid #E5E7EB'
            }}
          >
            <h4 style={{ margin: '0 0 14px', fontSize: '1rem', fontWeight: 700, color: '#17212C' }}>
              Assign or Create Tag
            </h4>

            {availableTags.length > 0 && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ fontSize: '0.78rem', color: '#667085', marginBottom: '8px' }}>Select Existing:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {availableTags.map(tag => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => {
                        handleAddTag(tag.id);
                        setShowAddTagModal(false);
                      }}
                      style={{
                        padding: '5px 10px',
                        borderRadius: '9999px',
                        backgroundColor: '#F8FAFC',
                        color: '#17212C',
                        border: '1px solid #E5E7EB',
                        fontSize: '0.76rem',
                        fontWeight: 500,
                        cursor: 'pointer'
                      }}
                    >
                      + {tag.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.78rem', color: '#667085', marginBottom: '6px' }}>New Tag Name:</div>
              <input
                type="text"
                placeholder="e.g. VIP Client, Priority"
                value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                style={{
                  width: '100%',
                  minHeight: '42px',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid #E5E7EB',
                  fontSize: '0.86rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowAddTagModal(false)}
                className="crm-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateNewTag}
                disabled={!newTagName.trim()}
                className="crm-btn-primary"
              >
                Create &amp; Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start New Chat Contact Picker Modal */}
      {showNewChatModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowNewChatModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20000,
            padding: '16px'
          }}
        >
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              padding: '20px',
              width: '100%',
              maxWidth: '440px',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.12)',
              border: '1px solid #E5E7EB'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#17212C' }}>Start New WhatsApp Chat</h4>
              <button type="button" onClick={() => setShowNewChatModal(false)} className="crm-icon-btn">
                <X size={18} />
              </button>
            </div>

            <div className="crm-inbox-search-box" style={{ marginBottom: '12px' }}>
              <Search size={15} className="crm-inbox-search-icon" />
              <input
                type="text"
                placeholder="Search contact name or phone..."
                value={contactSearchTerm}
                onChange={e => setContactSearchTerm(e.target.value)}
                className="crm-inbox-search-input"
                style={{ paddingLeft: '38px', paddingRight: '32px' }}
              />
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {loadingDirectoryContacts ? (
                <div style={{ padding: '24px', textAlign: 'center', color: '#667085', fontSize: '0.84rem' }}>
                  Loading contacts...
                </div>
              ) : (
                directoryContacts
                  .filter(c => {
                    if (!contactSearchTerm.trim()) return true;
                    const q = contactSearchTerm.toLowerCase();
                    return (
                      c.name.toLowerCase().includes(q) ||
                      c.phone.toLowerCase().includes(q) ||
                      (c.companyName || '').toLowerCase().includes(q)
                    );
                  })
                  .map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        setShowNewChatModal(false);
                        void handleOpenContactConversation(c.id);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid #F1F5F9',
                        backgroundColor: '#FFFFFF',
                        cursor: 'pointer',
                        textAlign: 'left'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <div className="crm-conv-avatar" style={{ width: '36px', height: '36px', fontSize: '0.85rem' }}>
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.86rem', color: '#17212C' }}>{c.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#667085' }}>
                            {c.phone} {c.category ? `• ${c.category}` : ''}
                          </div>
                        </div>
                      </div>
                      <span
                        style={{
                          padding: '4px 10px',
                          borderRadius: '8px',
                          backgroundColor: '#ECFEFF',
                          color: '#0E7490',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          flexShrink: 0
                        }}
                      >
                        Chat
                      </span>
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Send Approved WhatsApp Template Modal */}
      {showTemplateModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowTemplateModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20000,
            padding: '16px'
          }}
        >
          <div
            className="modal-content"
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              padding: '22px',
              width: '100%',
              maxWidth: '460px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.12)',
              border: '1px solid #E5E7EB'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#17212C' }}>
                Send Approved WhatsApp Template
              </h4>
              <button type="button" onClick={() => setShowTemplateModal(false)} className="crm-icon-btn">
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: '0.78rem', color: '#667085', marginBottom: '14px', lineHeight: 1.45 }}>
              Meta requires an <strong>Approved Template</strong> to message a contact when the recipient has not messaged your business number in the last 24 hours.
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#17212C', marginBottom: '6px' }}>
                Select Template
              </label>
              <select
                value={selectedTemplate?.id || ''}
                onChange={e => {
                  const found = approvedTemplates.find(t => t.id === e.target.value) || null;
                  handleSelectTemplateForSend(found);
                }}
                className="crm-form-input"
              >
                {approvedTemplates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.category} • {t.language} • {t.status})
                  </option>
                ))}
              </select>
            </div>

            {selectedTemplate && (
              <div
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E5E7EB',
                  fontSize: '0.82rem',
                  color: '#17212C',
                  marginBottom: '14px',
                  whiteSpace: 'pre-wrap'
                }}
              >
                {/* Header Preview */}
                {selectedTemplate.headerType === 'IMAGE' && (
                  <div style={{ marginBottom: '8px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #E2E8F0', maxHeight: '120px' }}>
                    <img
                      src={selectedTemplate.headerContent || (selectedTemplate.headerExample && selectedTemplate.headerExample[0] && !selectedTemplate.headerExample[0].startsWith('https://scontent.') ? selectedTemplate.headerExample[0] : null) || 'https://hrms.businz.com/vrm-banner.png'}
                      alt="Header"
                      style={{ width: '100%', height: '120px', objectFit: 'cover', display: 'block' }}
                    />
                  </div>
                )}
                {selectedTemplate.headerType === 'TEXT' && selectedTemplate.headerContent && (
                  <div style={{ fontWeight: 700, marginBottom: '6px', color: '#0E7490' }}>
                    {selectedTemplate.headerContent}
                  </div>
                )}

                {/* Body Text */}
                <div>{selectedTemplate.bodyText}</div>

                {/* Buttons Preview */}
                {selectedTemplate.buttons && Array.isArray(selectedTemplate.buttons) && selectedTemplate.buttons.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '10px', borderTop: '1px solid #E2E8F0', paddingTop: '8px' }}>
                    {selectedTemplate.buttons.map((b: any, bi: number) => (
                      <div
                        key={bi}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '6px 10px',
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #CBD5E1',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          color: '#0E7490'
                        }}
                      >
                        {b.type === 'PHONE_NUMBER' ? <Phone size={11} /> : <ExternalLink size={11} />}
                        <span>{b.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {templateVarValues.length > 0 && (
              <div style={{ marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#17212C' }}>Template Variables</div>
                {templateVarValues.map((val, i) => (
                  <input
                    key={i}
                    type="text"
                    placeholder={`Value for {{${i + 1}}}`}
                    value={val}
                    onChange={e => {
                      const next = [...templateVarValues];
                      next[i] = e.target.value;
                      setTemplateVarValues(next);
                    }}
                    className="crm-form-input"
                  />
                ))}
              </div>
            )}

            {/* Inline Error Banner */}
            {templateSendError && (
              <div
                style={{
                  marginBottom: '16px',
                  padding: '12px 14px',
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <AlertCircle size={18} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div style={{ flex: 1, fontSize: '0.82rem', color: '#991B1B', lineHeight: '1.4' }}>
                    <div style={{ fontWeight: 700, marginBottom: '2px' }}>
                      {templateSendError.isConsentError ? 'Consent Policy Violation' : 'Template Send Failed'}
                    </div>
                    <div>{templateSendError.message}</div>
                    {templateSendError.isConsentError && (
                      <div style={{ marginTop: '4px', color: '#7F1D1D', fontSize: '0.78rem' }}>
                        Meta policy strictly requires verified customer consent before sending Marketing templates. The current contact consent status is <strong>{contactDetails?.consentStatus || 'Unknown'}</strong>.
                      </div>
                    )}
                  </div>
                </div>

                {templateSendError.isConsentError && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setShowConsentModal(true)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: '#0E7490',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <ShieldCheck size={14} />
                      <span>Record WhatsApp Consent</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="crm-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendSelectedTemplate}
                disabled={!selectedTemplate || sendingTemplate}
                className="crm-btn-primary"
              >
                {sendingTemplate ? 'Sending...' : 'Send Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Record WhatsApp Consent Modal */}
      {(contactDetails || activeConv) && (
        <RecordConsentModal
          contact={
            contactDetails || ({
              id: activeConv!.contactId,
              name: activeConv!.contactName || 'Contact',
              phone: activeConv!.contactPhone || '',
              companyId: activeConv!.companyId,
              category: 'Customers',
              consentStatus: (activeConv as any)!.contactConsentStatus || 'Unknown',
              createdAt: '',
              updatedAt: ''
            } as CrmContact)
          }
          isOpen={showConsentModal}
          onClose={() => setShowConsentModal(false)}
          onConsentRecorded={(updatedContact) => {
            setContactDetails(updatedContact);
            if (activeConv) {
              setActiveConv(prev => prev ? { ...prev, contactConsentStatus: updatedContact.consentStatus } : null);
            }
            setTemplateSendError(null);
            setShowConsentModal(false);
          }}
        />
      )}
    </div>
  );
};
