import React, { useState, useEffect } from 'react';
import { CustomerContact } from '../../types/customer';
import { AddCustomerView } from './AddCustomerView';
import { CustomerRecordsView } from './CustomerRecordsView';
import { WhatsAppTemplatesView } from './WhatsAppTemplatesView';
import { WhatsAppMessageHistoryView } from './WhatsAppMessageHistoryView';
import { SendWhatsAppModal } from './SendWhatsAppModal';
import { customerService } from '../../services/customerService';
import { useHRMS } from '../../context/HRMSContext';
import { 
  Users, 
  UserPlus, 
  Table, 
  MessageSquare, 
  History, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle,
  ExternalLink,
  Settings
} from 'lucide-react';

export type CustomerModuleTab = 'add_customer' | 'records' | 'templates' | 'history';

interface CustomerModuleProps {
  initialTab?: CustomerModuleTab;
}

export const CustomerModule: React.FC<CustomerModuleProps> = ({
  initialTab = 'records'
}) => {
  const { currentUser, setActiveModule } = useHRMS();
  const [activeTab, setActiveTab] = useState<CustomerModuleTab>(initialTab);

  // Send WhatsApp modal trigger from anywhere
  const [activeSendCustomer, setActiveSendCustomer] = useState<CustomerContact | null>(null);

  // WhatsApp API status indicator
  const [isWhatsAppConfigured, setIsWhatsAppConfigured] = useState<boolean>(false);
  const [configuredSender, setConfiguredSender] = useState<string | null>(null);

  useEffect(() => {
    checkConnectionStatus();
  }, [currentUser]);

  const checkConnectionStatus = async () => {
    try {
      const cfg = await customerService.getWhatsAppConfig(currentUser?.company_id || 'company-a');
      setIsWhatsAppConfigured(cfg.isConfigured);
      if (cfg.configuredSender) {
        setConfiguredSender(cfg.configuredSender);
      }
    } catch {
      setIsWhatsAppConfigured(false);
    }
  };

  const tabs: { id: CustomerModuleTab; label: string; icon: React.ElementType }[] = [
    { id: 'records', label: 'Customer Records', icon: Table },
    { id: 'add_customer', label: 'Add Customer', icon: UserPlus },
    { id: 'templates', label: 'WhatsApp Templates', icon: MessageSquare },
    { id: 'history', label: 'Message History', icon: History }
  ];

  return (
    <div className="customer-module-wrapper">
      {/* Module Title Header Card */}
      <div className="customer-header-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0, flex: '1 1 auto' }}>
          <div style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            backgroundColor: '#ECFEFF',
            color: '#0E7490',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            <Users size={24} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 700, color: '#1E293B', margin: '0 0 4px 0', wordBreak: 'break-word', lineHeight: 1.25 }}>
              Customer Data Collection
            </h1>
            <p style={{ fontSize: '0.85rem', color: '#64748B', margin: 0, wordBreak: 'break-word' }}>
              Field Customer Capture, Visiting Card OCR, and Meta WhatsApp Business Cloud Messaging
            </p>
          </div>
        </div>

        {/* WhatsApp Cloud API Connection Status Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', maxWidth: '100%', flexWrap: 'wrap' }}>
          {isWhatsAppConfigured ? (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '9999px',
              backgroundColor: '#DCFCE7',
              border: '1px solid #BBF7D0',
              color: '#15803D',
              fontSize: '0.8rem',
              fontWeight: 600,
              maxWidth: '100%',
              wordBreak: 'break-word'
            }}>
              <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
              <span>Meta WhatsApp Connected {configuredSender ? `(${configuredSender})` : ''}</span>
            </div>
          ) : (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '9999px',
              backgroundColor: '#FEF3C7',
              border: '1px solid #FDE68A',
              color: '#B45309',
              fontSize: '0.8rem',
              fontWeight: 600,
              maxWidth: '100%',
              flexWrap: 'wrap'
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              <span>WhatsApp Cloud API Pending</span>
              <button
                onClick={() => setActiveModule('settings')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0E7490',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  padding: 0
                }}
              >
                Configure in Settings
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modern Segmented Navigation Tabs */}
      <div className="customer-tabs-scroll-container">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="customer-tab-btn"
              style={{
                backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                color: isActive ? '#0E7490' : '#64748B',
                fontWeight: isActive ? 700 : 500,
                borderBottom: isActive ? '3px solid #0E7490' : '3px solid transparent'
              }}
            >
              <Icon size={17} color={isActive ? '#0E7490' : '#64748B'} style={{ flexShrink: 0 }} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Render Active View */}
      <div>
        {activeTab === 'add_customer' && (
          <AddCustomerView
            onCustomerSaved={() => {
              // Trigger reload in records
            }}
            onNavigateToRecords={() => setActiveTab('records')}
          />
        )}

        {activeTab === 'records' && (
          <CustomerRecordsView
            onOpenSendWhatsApp={(c) => setActiveSendCustomer(c)}
            onOpenMessageHistory={() => setActiveTab('history')}
            onNavigateToAddCustomer={() => setActiveTab('add_customer')}
          />
        )}

        {activeTab === 'templates' && (
          <WhatsAppTemplatesView />
        )}

        {activeTab === 'history' && (
          <WhatsAppMessageHistoryView />
        )}
      </div>

      {/* Send WhatsApp Modal from Records */}
      {activeSendCustomer && (
        <SendWhatsAppModal
          customer={activeSendCustomer}
          isOpen={Boolean(activeSendCustomer)}
          onClose={() => setActiveSendCustomer(null)}
          onSuccess={() => {
            setActiveSendCustomer(null);
            checkConnectionStatus();
          }}
        />
      )}
    </div>
  );
};
