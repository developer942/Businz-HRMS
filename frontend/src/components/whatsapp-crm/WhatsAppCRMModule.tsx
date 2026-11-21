/**
 * WhatsApp CRM Master Module for BUSINZ HRMS
 * Apple iOS + WhatsApp Web Inspired Clean Design System
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Users,
  Send,
  FileText,
  TrendingUp,
  MoreHorizontal,
  ChevronDown,
  Check
} from 'lucide-react';
import { CrmInboxView } from './inbox/CrmInboxView';
import { CrmContactsDirectory } from './contacts/CrmContactsDirectory';
import { CrmBroadcastManager } from './broadcasts/CrmBroadcastManager';
import { CrmTemplateManager } from './templates/CrmTemplateManager';
import { CrmAnalyticsDashboard } from './analytics/CrmAnalyticsDashboard';
import { crmService } from '../../services/crmService';
import '../../styles/whatsapp-crm.css';

export type CrmTab = 'inbox' | 'contacts' | 'broadcasts' | 'templates' | 'analytics';

export const WhatsAppCRMModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<CrmTab>('inbox');
  const [targetContactIdForChat, setTargetContactIdForChat] = useState<string | undefined>(undefined);
  const [moreMenuOpen, setMoreMenuOpen] = useState<boolean>(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Live Meta API connection health state
  const [apiHealth, setApiHealth] = useState<{
    status: 'checking' | 'active' | 'auth_error' | 'disconnected';
    tooltip: string;
    details?: any;
  }>({
    status: 'checking',
    tooltip: 'Checking Meta WhatsApp API live connection...'
  });

  const checkLiveHealth = async () => {
    try {
      const res = await crmService.getHealth();
      if (res?.success && res.data?.connected) {
        setApiHealth({
          status: 'active',
          tooltip: `Meta API Active • Verified: ${res.data.verifiedName || 'VRM Structures'} (${res.data.displayPhoneNumber || '+91 78719 92830'})`,
          details: res.data
        });
      } else {
        const rawErr = res?.data?.error || res?.error || 'Connection failed';
        const isAuth = /oauth|token|190|expired|auth|session/i.test(rawErr);
        setApiHealth({
          status: isAuth ? 'auth_error' : 'disconnected',
          tooltip: isAuth
            ? `Meta API Auth Error: System User token is invalid or expired. Please refresh token in Settings > Integrations.`
            : `Meta API Disconnected: ${rawErr}`,
          details: res?.data
        });
      }
    } catch (err: any) {
      setApiHealth({
        status: 'disconnected',
        tooltip: 'Meta API Unreachable (Network connection error)'
      });
    }
  };

  useEffect(() => {
    checkLiveHealth();
    const interval = setInterval(checkLiveHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleStartChatFromDirectory = (contactId: string) => {
    setTargetContactIdForChat(contactId);
    setActiveTab('inbox');
    setMoreMenuOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    if (moreMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [moreMenuOpen]);

  const desktopTabs: { id: CrmTab; label: string; icon: React.ElementType }[] = [
    { id: 'inbox', label: 'Shared Inbox', icon: MessageSquare },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'broadcasts', label: 'Broadcasts', icon: Send },
    { id: 'templates', label: 'Templates', icon: FileText },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp }
  ];

  const moreTabs: { id: CrmTab; label: string; shortLabel: string; desc: string; icon: React.ElementType }[] = [
    {
      id: 'broadcasts',
      label: 'Broadcast Campaigns',
      shortLabel: 'Broadcasts',
      desc: 'Send approved templates to segments',
      icon: Send
    },
    {
      id: 'templates',
      label: 'WhatsApp Templates',
      shortLabel: 'Templates',
      desc: 'Create & sync Meta Cloud templates',
      icon: FileText
    },
    {
      id: 'analytics',
      label: 'Analytics & KPIs',
      shortLabel: 'Analytics',
      desc: 'Delivery, read & consent metrics',
      icon: TrendingUp
    }
  ];

  const isMoreTabActive = activeTab === 'broadcasts' || activeTab === 'templates' || activeTab === 'analytics';
  const activeMoreItem = moreTabs.find(t => t.id === activeTab);

  const selectTab = (tabId: CrmTab) => {
    setActiveTab(tabId);
    if (tabId !== 'inbox') {
      setTargetContactIdForChat(undefined);
    }
    setMoreMenuOpen(false);
  };

  return (
    <div className={`crm-module-wrapper ${activeTab === 'inbox' ? 'crm-module-inbox-mode' : ''}`}>
      {/* Compact Apple + WhatsApp Top Bar */}
      <div className="crm-top-bar">
        <div className="crm-brand-group">
          <div className="crm-brand-icon" aria-hidden="true">
            <MessageSquare size={18} />
          </div>
          <div className="crm-brand-text">
            <div className="crm-brand-title-row">
              <h1 className="crm-brand-title">WhatsApp CRM</h1>
              <span
                className={`crm-api-status-pill ${
                  apiHealth.status === 'active'
                    ? 'active'
                    : apiHealth.status === 'auth_error'
                    ? 'error'
                    : 'warning'
                }`}
                title={apiHealth.tooltip}
                onClick={checkLiveHealth}
                style={{ cursor: 'pointer' }}
              >
                <span className={`crm-api-status-dot ${apiHealth.status}`} />
                <span>
                  {apiHealth.status === 'checking'
                    ? 'Checking API...'
                    : apiHealth.status === 'active'
                    ? 'Meta API Active'
                    : apiHealth.status === 'auth_error'
                    ? 'Meta API Auth Error'
                    : 'Meta API Disconnected'}
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Desktop Segmented Navigation (>= 768px) */}
        <nav className="crm-desktop-nav" aria-label="WhatsApp CRM Sections">
          {desktopTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => selectTab(tab.id)}
                className={`crm-nav-pill ${isActive ? 'active' : ''}`}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Mobile Compact 3-Tab Navigation (< 768px): Inbox | Contacts | More */}
        <div className="crm-mobile-nav-wrap" ref={moreMenuRef}>
          <nav className="crm-mobile-nav" aria-label="WhatsApp CRM Mobile Navigation">
            <button
              type="button"
              onClick={() => selectTab('inbox')}
              className={`crm-mobile-nav-btn ${activeTab === 'inbox' ? 'active' : ''}`}
            >
              <MessageSquare size={15} />
              <span>Inbox</span>
            </button>

            <button
              type="button"
              onClick={() => selectTab('contacts')}
              className={`crm-mobile-nav-btn ${activeTab === 'contacts' ? 'active' : ''}`}
            >
              <Users size={15} />
              <span>Contacts</span>
            </button>

            <button
              type="button"
              onClick={() => setMoreMenuOpen(prev => !prev)}
              aria-expanded={moreMenuOpen}
              aria-haspopup="menu"
              className={`crm-mobile-nav-btn ${isMoreTabActive || moreMenuOpen ? 'active' : ''}`}
            >
              {activeMoreItem ? <activeMoreItem.icon size={15} /> : <MoreHorizontal size={15} />}
              <span>{activeMoreItem ? activeMoreItem.shortLabel : 'More'}</span>
              <ChevronDown size={13} style={{ opacity: 0.75 }} />
            </button>
          </nav>

          {/* Mobile "More" Dropdown Menu */}
          {moreMenuOpen && (
            <div className="crm-mobile-more-menu" role="menu">
              {moreTabs.map(item => {
                const Icon = item.icon;
                const isSelected = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    onClick={() => selectTab(item.id)}
                    className={`crm-mobile-more-item ${isSelected ? 'selected' : ''}`}
                  >
                    <div className="crm-mobile-more-icon">
                      <Icon size={16} />
                    </div>
                    <div className="crm-mobile-more-text">
                      <div className="crm-mobile-more-label">{item.label}</div>
                      <div className="crm-mobile-more-desc">{item.desc}</div>
                    </div>
                    {isSelected && <Check size={16} color="#16A34A" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Active Section Content */}
      <div className={`crm-section-body ${activeTab === 'inbox' ? 'crm-section-body-inbox' : ''}`}>
        {activeTab === 'inbox' && (
          <CrmInboxView initialContactId={targetContactIdForChat} />
        )}
        {activeTab === 'contacts' && (
          <CrmContactsDirectory onStartChat={handleStartChatFromDirectory} />
        )}
        {activeTab === 'broadcasts' && (
          <CrmBroadcastManager />
        )}
        {activeTab === 'templates' && (
          <CrmTemplateManager />
        )}
        {activeTab === 'analytics' && (
          <CrmAnalyticsDashboard />
        )}
      </div>
    </div>
  );
};

export default WhatsAppCRMModule;
