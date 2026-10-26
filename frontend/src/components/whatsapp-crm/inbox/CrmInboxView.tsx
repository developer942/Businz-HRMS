/**
 * WhatsApp CRM Inbox View for BUSINZ HRMS
 * Portions adapted from wacrm (https://github.com/ArnasDon/wacrm)
 * Copyright (c) 2026 Arnas Donauskas - MIT License
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Send,
  Check,
  CheckCheck,
  AlertCircle,
  Clock,
  User,
  Phone,
  Mail,
  Building,
  Tag,
  Plus,
  X,
  MessageSquare,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  UserCheck,
  Sparkles,
  RefreshCw,
  ArrowLeft
} from 'lucide-react';
import { crmService } from '../../../services/crmService';
import type {
  CrmConversation,
  CrmMessage,
  CrmContact,
  CrmTag,
  CrmConversationStatus
} from '../../../types/crm';
import { useHRMS } from '../../../context/HRMSContext';

interface CrmInboxViewProps {
  initialContactId?: string;
}

export const CrmInboxView: React.FC<CrmInboxViewProps> = ({ initialContactId }) => {
  const { currentUser, employees } = useHRMS();

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

  // Active Contact Sidebar State
  const [contactDetails, setContactDetails] = useState<CrmContact | null>(null);
  const [availableTags, setAvailableTags] = useState<CrmTag[]>([]);
  const [showAddTagModal, setShowAddTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load conversations on mount & filter change
  useEffect(() => {
    loadConversations();
    loadTags();
  }, [statusFilter]);

  // Handle initialContactId if passed from Contacts directory
  useEffect(() => {
    if (initialContactId) {
      handleOpenContactConversation(initialContactId);
    }
  }, [initialContactId]);

  // Load conversation details & messages when active conversation changes
  useEffect(() => {
    if (selectedConvId) {
      loadConversationData(selectedConvId);
      // Auto-poll messages every 6 seconds while chatting
      const interval = setInterval(() => {
        pollMessages(selectedConvId);
      }, 6000);
      return () => clearInterval(interval);
    } else {
      setActiveConv(null);
      setMessages([]);
      setContactDetails(null);
    }
  }, [selectedConvId]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    setLoadingConvs(true);
    try {
      const data = await crmService.getConversations({
        status: statusFilter === 'all' ? undefined : statusFilter,
        search: searchQuery || undefined
      });
      setConversations(data);
      if (data.length > 0 && !selectedConvId && !initialContactId) {
        if (typeof window !== 'undefined' && window.innerWidth > 768) {
          setSelectedConvId(data[0].id);
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

  const handleOpenContactConversation = async (contactId: string) => {
    try {
      // Find or create conversation
      const convs = await crmService.getConversations();
      const existing = convs.find(c => c.contactId === contactId);
      if (existing) {
        setSelectedConvId(existing.id);
      } else {
        // Refresh conversations
        await loadConversations();
      }
    } catch (err) {
      console.error('Error opening contact conversation:', err);
    }
  };

  const loadConversationData = async (convId: string) => {
    setLoadingMessages(true);
    try {
      const conv = await crmService.getConversationById(convId);
      setActiveConv(conv);

      if (conv?.contactId) {
        const contact = await crmService.getContactById(conv.contactId);
        setContactDetails(contact);
      }

      const msgs = await crmService.getMessages(convId);
      setMessages(msgs);

      // Mark conversation as read
      await crmService.markAsRead(convId);
      // update unread count locally
      setConversations(prev =>
        prev.map(c => (c.id === convId ? { ...c, unreadCount: 0 } : c))
      );
    } catch (err) {
      console.error('Error loading conversation data:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  const pollMessages = async (convId: string) => {
    try {
      const msgs = await crmService.getMessages(convId);
      setMessages(msgs);
    } catch (err) {
      console.error('Error polling messages:', err);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || !selectedConvId || sending) return;

    const text = inputText.trim();
    setInputText('');
    setSending(true);

    try {
      const newMsg = await crmService.sendMessage(selectedConvId, text);
      setMessages(prev => [...prev, newMsg]);

      // update conversation snippet in list
      setConversations(prev =>
        prev.map(c =>
          c.id === selectedConvId
            ? {
                ...c,
                lastMessageText: text,
                lastMessageTimestamp: new Date().toISOString()
              }
            : c
        )
      );
    } catch (err: any) {
      alert(`Message failed to send: ${err.message || 'WhatsApp API error'}`);
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
    } catch (err) {
      console.error('Failed to assign agent:', err);
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

  // Helper formatting functions
  const formatTime = (ts?: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (ts?: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return 'Today';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className={`crm-inbox-container ${selectedConvId ? 'mobile-show-chat' : ''}`}>
      {/* ============================================================ */}
      {/* 1. LEFT PANE: Conversations List */}
      {/* ============================================================ */}
      <div className="crm-inbox-left">
        {/* Search & Header */}
        <div style={{ padding: '16px', borderBottom: '1px solid #E7ECF3' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#1E293B' }}>Inbox</h3>
            <button
              onClick={loadConversations}
              title="Refresh"
              style={{
                background: 'none',
                border: 'none',
                color: '#64748B',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                padding: '4px'
              }}
            >
              <RefreshCw size={16} />
            </button>
          </div>

          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadConversations()}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                borderRadius: '10px',
                border: '1px solid #E2E8F0',
                fontSize: '0.85rem',
                outline: 'none',
                backgroundColor: '#FFFFFF',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Status Filter Tabs */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '10px' }}>
            {['all', 'open', 'snoozed', 'closed'].map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                style={{
                  flex: 1,
                  padding: '5px 0',
                  borderRadius: '6px',
                  border: 'none',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  textTransform: 'capitalize',
                  cursor: 'pointer',
                  backgroundColor: statusFilter === st ? '#0E7490' : '#E2E8F0',
                  color: statusFilter === st ? '#FFFFFF' : '#475569',
                  transition: 'all 0.15s ease'
                }}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation List Scroll Area */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingConvs ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
              Loading conversations...
            </div>
          ) : conversations.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
              <MessageSquare size={32} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
              <div>No conversations found</div>
            </div>
          ) : (
            conversations.map(conv => {
              const isSelected = conv.id === selectedConvId;
              return (
                <div
                  key={conv.id}
                  onClick={() => setSelectedConvId(conv.id)}
                  style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid #F1F5F9',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? '#ECFEFF' : 'transparent',
                    borderLeft: isSelected ? '4px solid #0E7490' : '4px solid transparent',
                    transition: 'background-color 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: '#0E7490',
                        color: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        fontSize: '0.85rem'
                      }}>
                        {conv.contactName ? conv.contactName.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1E293B' }}>
                          {conv.contactName || conv.contactPhone || 'Unknown'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                          {conv.contactPhone}
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                      {formatDate(conv.lastMessageTimestamp)}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                    <p style={{
                      margin: 0,
                      fontSize: '0.8rem',
                      color: isSelected ? '#0E7490' : '#64748B',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '180px'
                    }}>
                      {conv.lastMessageText || 'No messages yet'}
                    </p>
                    {conv.unreadCount > 0 && (
                      <span style={{
                        backgroundColor: '#0E7490',
                        color: '#FFFFFF',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '9999px'
                      }}>
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. MIDDLE PANE: Active Chat & Composer */}
      {/* ============================================================ */}
      <div className="crm-inbox-center">
        {activeConv ? (
          <>
            {/* Chat Header */}
            <div style={{
              padding: '14px 20px',
              borderBottom: '1px solid #E7ECF3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#FFFFFF',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                {/* Back button for mobile view */}
                <button
                  type="button"
                  onClick={() => setSelectedConvId(null)}
                  className="crm-mobile-back-btn"
                  title="Back to Inbox"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#0E7490',
                    cursor: 'pointer',
                    alignItems: 'center',
                    padding: '4px',
                    borderRadius: '8px',
                    flexShrink: 0
                  }}
                >
                  <ArrowLeft size={20} />
                </button>

                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  backgroundColor: '#CFFAFE',
                  color: '#0E7490',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 600,
                  fontSize: '0.95rem',
                  flexShrink: 0
                }}>
                  {activeConv.contactName ? activeConv.contactName.charAt(0).toUpperCase() : 'U'}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600, fontSize: '1rem', color: '#1E293B' }}>
                      {activeConv.contactName || activeConv.contactPhone}
                    </span>
                    {activeConv.contactCategory && (
                      <span style={{
                        fontSize: '0.72rem',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        backgroundColor: '#ECFEFF',
                        color: '#0E7490',
                        fontWeight: 600
                      }}>
                        {activeConv.contactCategory}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                    {activeConv.contactPhone}
                  </div>
                </div>
              </div>

              {/* Assign Agent Quick Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserCheck size={16} color="#64748B" />
                <select
                  value={activeConv.assignedEmployeeId || ''}
                  onChange={e => handleAssignAgent(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    fontSize: '0.82rem',
                    color: '#334155',
                    outline: 'none',
                    backgroundColor: '#F8FAFC'
                  }}
                >
                  <option value="">Unassigned</option>
                  {employees.map(emp => (
                    <option key={emp.id || emp.employeeId} value={emp.employeeId || emp.id}>
                      {emp.firstName} {emp.lastName} ({emp.designation || 'Staff'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Anti-spam Consent Warning Banner */}
            {contactDetails?.consentStatus === 'Opted Out' && (
              <div style={{
                backgroundColor: '#FEF2F2',
                color: '#991B1B',
                padding: '10px 16px',
                fontSize: '0.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderBottom: '1px solid #FEE2E2'
              }}>
                <ShieldAlert size={16} />
                <span><strong>Recipient Opted Out:</strong> WhatsApp policy prohibits promotional messages. Only respond to direct inquiries.</span>
              </div>
            )}

            {/* Message Thread Scroll Area */}
            <div style={{
              flex: 1,
              padding: '20px',
              overflowY: 'auto',
              backgroundColor: '#F7F9FC',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              {loadingMessages ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#94A3B8' }}>
                  Loading chat history...
                </div>
              ) : messages.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#94A3B8', fontSize: '0.88rem' }}>
                  <MessageSquare size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
                  <div>No messages yet in this conversation.</div>
                  <div style={{ fontSize: '0.78rem', marginTop: '4px' }}>Type a message below to start chatting.</div>
                </div>
              ) : (
                messages.map(msg => {
                  const isOutbound = msg.senderType === 'agent' || msg.senderType === 'bot' || msg.senderType === 'system';
                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: isOutbound ? 'flex-end' : 'flex-start'
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '70%',
                          padding: '10px 14px',
                          borderRadius: isOutbound ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                          backgroundColor: isOutbound ? '#0E7490' : '#FFFFFF',
                          color: isOutbound ? '#FFFFFF' : '#1E293B',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          fontSize: '0.9rem',
                          lineHeight: '1.4',
                          border: isOutbound ? 'none' : '1px solid #E2E8F0',
                          wordBreak: 'break-word'
                        }}
                      >
                        {msg.contentText}
                      </div>

                      {/* Message Meta Info (Time + Status) */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        marginTop: '3px',
                        fontSize: '0.7rem',
                        color: '#94A3B8'
                      }}>
                        <span>{formatTime(msg.createdAt)}</span>
                        {isOutbound && (
                          <span>
                            {msg.status === 'read' ? (
                              <CheckCheck size={14} color="#0891B2" />
                            ) : msg.status === 'delivered' ? (
                              <CheckCheck size={14} color="#94A3B8" />
                            ) : msg.status === 'failed' ? (
                              <AlertCircle size={14} color="#EF4444" />
                            ) : (
                              <Check size={14} color="#94A3B8" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Composer */}
            <form
              onSubmit={handleSendMessage}
              style={{
                padding: '14px 20px',
                borderTop: '1px solid #E7ECF3',
                backgroundColor: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                gap: '10px'
              }}
            >
              <input
                type="text"
                placeholder="Type your WhatsApp message..."
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                disabled={sending}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  fontSize: '0.9rem',
                  outline: 'none',
                  backgroundColor: '#F8FAFC'
                }}
              />
              <button
                type="submit"
                disabled={sending || !inputText.trim()}
                style={{
                  padding: '12px 20px',
                  backgroundColor: inputText.trim() && !sending ? '#0E7490' : '#E2E8F0',
                  color: inputText.trim() && !sending ? '#FFFFFF' : '#94A3B8',
                  borderRadius: '10px',
                  border: 'none',
                  fontWeight: 600,
                  fontSize: '0.88rem',
                  cursor: inputText.trim() && !sending ? 'pointer' : 'default',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <span>Send</span>
                <Send size={15} />
              </button>
            </form>
          </>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#94A3B8'
          }}>
            <MessageSquare size={48} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <h4 style={{ margin: '0 0 6px', color: '#475569' }}>Select a conversation</h4>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>Choose a chat from the left panel to begin messaging.</p>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 3. RIGHT PANE: Contact Details Sidebar */}
      {/* ============================================================ */}
      <div className="crm-inbox-right">
        {contactDetails ? (
          <>
            {/* Contact Profile Summary */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: '#ECFEFF',
                color: '#0E7490',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '1.4rem',
                margin: '0 auto 10px'
              }}>
                {contactDetails.name.charAt(0).toUpperCase()}
              </div>
              <h4 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#1E293B' }}>{contactDetails.name}</h4>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#64748B' }}>{contactDetails.designation || 'Contact'}</p>
              {contactDetails.companyName && (
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#94A3B8' }}>{contactDetails.companyName}</p>
              )}
            </div>

            {/* Anti-Spam Consent Status Card */}
            <div style={{
              padding: '12px',
              borderRadius: '12px',
              backgroundColor:
                contactDetails.consentStatus === 'Opted In'
                  ? '#ECFDF5'
                  : contactDetails.consentStatus === 'Opted Out'
                  ? '#FEF2F2'
                  : '#FFFBEB',
              border: `1px solid ${
                contactDetails.consentStatus === 'Opted In'
                  ? '#A7F3D0'
                  : contactDetails.consentStatus === 'Opted Out'
                  ? '#FECACA'
                  : '#FDE68A'
              }`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                {contactDetails.consentStatus === 'Opted In' ? (
                  <ShieldCheck size={18} color="#059669" />
                ) : contactDetails.consentStatus === 'Opted Out' ? (
                  <ShieldAlert size={18} color="#DC2626" />
                ) : (
                  <ShieldQuestion size={18} color="#D97706" />
                )}
                <span style={{
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color:
                    contactDetails.consentStatus === 'Opted In'
                      ? '#065F46'
                      : contactDetails.consentStatus === 'Opted Out'
                      ? '#991B1B'
                      : '#92400E'
                }}>
                  {contactDetails.consentStatus}
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748B' }}>
                Source: {contactDetails.consentSource || contactDetails.sourceType || 'Direct'}
              </p>
            </div>

            {/* Details List */}
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', marginBottom: '8px' }}>
                Contact Info
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#334155' }}>
                  <Phone size={15} color="#64748B" />
                  <span>{contactDetails.phone}</span>
                </div>
                {contactDetails.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#334155' }}>
                    <Mail size={15} color="#64748B" />
                    <span>{contactDetails.email}</span>
                  </div>
                )}
                {contactDetails.category && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.85rem', color: '#334155' }}>
                    <User size={15} color="#64748B" />
                    <span>{contactDetails.category}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Tags Section */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>
                  Tags
                </span>
                <button
                  onClick={() => setShowAddTagModal(true)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#0E7490',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '2px'
                  }}
                >
                  <Plus size={13} /> Add
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {contactDetails.tags && contactDetails.tags.length > 0 ? (
                  contactDetails.tags.map(t => (
                    <span
                      key={t.id}
                      style={{
                        fontSize: '0.75rem',
                        padding: '3px 8px',
                        borderRadius: '9999px',
                        backgroundColor: '#ECFEFF',
                        color: '#0E7490',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                    >
                      {t.name}
                      <X
                        size={12}
                        onClick={() => handleRemoveTag(t.id)}
                        style={{ cursor: 'pointer' }}
                      />
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>No tags assigned</span>
                )}
              </div>
            </div>

            {/* Notes Section */}
            {contactDetails.notes && (
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Notes
                </div>
                <div style={{
                  padding: '10px',
                  borderRadius: '8px',
                  backgroundColor: '#F8FAFC',
                  fontSize: '0.82rem',
                  color: '#475569',
                  border: '1px solid #E2E8F0'
                }}>
                  {contactDetails.notes}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', color: '#94A3B8', fontSize: '0.85rem', paddingTop: '40px' }}>
            No contact selected
          </div>
        )}
      </div>

      {/* Add Tag Modal */}
      {showAddTagModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            padding: '24px',
            width: '360px',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }}>
            <h4 style={{ margin: '0 0 16px', fontSize: '1.05rem', color: '#1E293B' }}>Assign or Create Tag</h4>

            {availableTags.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '8px' }}>Select Existing:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {availableTags.map(tag => (
                    <button
                      key={tag.id}
                      onClick={() => {
                        handleAddTag(tag.id);
                        setShowAddTagModal(false);
                      }}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '9999px',
                        backgroundColor: '#F1F5F9',
                        color: '#334155',
                        border: '1px solid #CBD5E1',
                        fontSize: '0.78rem',
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
              <div style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '6px' }}>Or Create New Tag:</div>
              <input
                type="text"
                placeholder="e.g. VIP Client, Urgent"
                value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.85rem',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setShowAddTagModal(false)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '8px',
                  border: '1px solid #E2E8F0',
                  backgroundColor: '#FFFFFF',
                  color: '#64748B',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateNewTag}
                disabled={!newTagName.trim()}
                style={{
                  padding: '8px 16px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#0E7490',
                  color: '#FFFFFF',
                  fontWeight: 600,
                  cursor: newTagName.trim() ? 'pointer' : 'default'
                }}
              >
                Create & Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
