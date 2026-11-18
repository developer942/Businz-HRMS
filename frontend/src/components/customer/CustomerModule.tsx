import React, { useState, useEffect } from 'react';
import { CustomerContact } from '../../types/customer';
import { AddCustomerView } from './AddCustomerView';
import { CustomerRecordsView } from './CustomerRecordsView';
import { SendWhatsAppModal } from './SendWhatsAppModal';
import { customerService } from '../../services/customerService';
import { useHRMS } from '../../context/HRMSContext';
import {
  Table,
  CheckCircle2,
  Camera,
  Contact2
} from 'lucide-react';

export type CustomerModuleTab = 'add_customer' | 'records';

interface CustomerModuleProps {
  initialTab?: CustomerModuleTab;
}

export const CustomerModule: React.FC<CustomerModuleProps> = ({
  initialTab = 'records'
}) => {
  const { currentUser } = useHRMS();
  const [activeTab, setActiveTab] = useState<CustomerModuleTab>(initialTab);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(0);

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
    { id: 'records', label: 'Contact Directory', icon: Table },
    { id: 'add_customer', label: 'Scan Visiting Card', icon: Camera }
  ];

  const handleTabSwitch = (nextTab: CustomerModuleTab) => {
    setActiveTab(nextTab);
    if (nextTab === 'records') {
      setRefreshTrigger(prev => prev + 1);
    }
  };

  return (
    <div className="customer-module-wrapper">
      {/* Compact Apple-Inspired Page Header with Segmented Tabs */}
      <div className="customer-unified-header">
        <div className="customer-header-left">
          <div className="customer-header-icon-box" aria-hidden="true">
            <Contact2 size={20} />
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h1 className="customer-header-title">Contact Card Scanner</h1>
              {isWhatsAppConfigured && (
                <span className="customer-whatsapp-badge">
                  <CheckCircle2 size={12} />
                  <span>WhatsApp Connected {configuredSender ? `(${configuredSender})` : ''}</span>
                </span>
              )}
            </div>
            <p className="customer-header-subtitle">
              Digitize visiting cards with AI OCR
            </p>
          </div>
        </div>

        {/* Segmented Navigation Tabs */}
        <div className="customer-segmented-tabs" role="tablist" aria-label="Contact Card Scanner Views">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleTabSwitch(tab.id)}
                className={`customer-segment-tab ${isActive ? 'active' : ''}`}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Keep AddCustomerView mounted so switching tabs never discards entered form state */}
      <div
        style={{
          display: activeTab === 'add_customer' ? 'block' : 'none',
          width: '100%'
        }}
      >
        <AddCustomerView
          onCustomerSaved={() => {
            setRefreshTrigger(prev => prev + 1);
          }}
          onNavigateToRecords={() => handleTabSwitch('records')}
        />
      </div>

      <div
        style={{
          display: activeTab === 'records' ? 'block' : 'none',
          width: '100%'
        }}
      >
        <CustomerRecordsView
          refreshTrigger={refreshTrigger}
          onOpenSendWhatsApp={c => setActiveSendCustomer(c)}
          onNavigateToAddCustomer={() => handleTabSwitch('add_customer')}
        />
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
            setRefreshTrigger(prev => prev + 1);
          }}
        />
      )}
    </div>
  );
};
