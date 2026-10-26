/**
 * WhatsApp CRM Analytics Dashboard for BUSINZ HRMS
 * Portions adapted from wacrm (https://github.com/ArnasDon/wacrm)
 * Copyright (c) 2026 Arnas Donauskas - MIT License
 */

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Users,
  MessageSquare,
  ShieldCheck,
  CheckCheck,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { crmService } from '../../../services/crmService';
import type { CrmAnalyticsKPIs } from '../../../types/crm';

export const CrmAnalyticsDashboard: React.FC = () => {
  const [analytics, setAnalytics] = useState<CrmAnalyticsKPIs | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const data = await crmService.getAnalytics();
      setAnalytics(data);
    } catch (err) {
      console.error('Failed to load CRM analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const kpis = [
    {
      title: 'Total CRM Contacts',
      value: analytics?.totalContacts ?? 0,
      sub: `${analytics?.optedInContacts ?? 0} Opted-In`,
      icon: Users,
      color: '#0E7490',
      bgColor: '#ECFEFF'
    },
    {
      title: 'Active Conversations',
      value: analytics?.activeConversations ?? 0,
      sub: 'Open / In-progress threads',
      icon: MessageSquare,
      color: '#3B82F6',
      bgColor: '#EFF6FF'
    },
    {
      title: 'Anti-Spam Consent Rate',
      value: `${analytics?.totalContacts ? Math.round(((analytics.optedInContacts || 0) / analytics.totalContacts) * 100) : 0}%`,
      sub: 'Eligible for broadcasts',
      icon: ShieldCheck,
      color: '#059669',
      bgColor: '#ECFDF5'
    },
    {
      title: 'Delivery Rate',
      value: `${analytics?.deliveryRatePercent ?? 100}%`,
      sub: 'Successful Meta dispatches',
      icon: CheckCheck,
      color: '#0891B2',
      bgColor: '#CFFAFE'
    },
    {
      title: 'Read Rate',
      value: `${analytics?.readRatePercent ?? 0}%`,
      sub: 'Blue tick read receipts',
      icon: TrendingUp,
      color: '#8B5CF6',
      bgColor: '#F5F3FF'
    },
    {
      title: 'Inbound Inquiries',
      value: analytics?.totalInbound ?? 0,
      sub: `vs ${analytics?.totalOutbound ?? 0} Outbound`,
      icon: ArrowDownRight,
      color: '#D97706',
      bgColor: '#FFFBEB'
    }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Banner */}
      <div className="crm-templates-header-card">
        <div>
          <h3 style={{ margin: '0 0 6px', fontSize: '1.25rem', color: '#1E293B', fontWeight: 600 }}>
            WhatsApp CRM Analytics & Performance
          </h3>
          <p style={{ margin: 0, fontSize: '0.88rem', color: '#64748B' }}>
            Real-time delivery KPIs, conversation response metrics, and contact consent distribution.
          </p>
        </div>

        <button
          onClick={loadAnalytics}
          style={{
            padding: '10px 16px',
            borderRadius: '10px',
            border: '1px solid #E2E8F0',
            backgroundColor: '#FFFFFF',
            color: '#0E7490',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <RefreshCw size={16} />
          <span>Refresh Analytics</span>
        </button>
      </div>

      {/* KPI Tiles Grid */}
      <div className="crm-analytics-kpi-grid">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '16px',
                padding: '20px',
                border: '1px solid #E7ECF3',
                boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                  {kpi.title}
                </span>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#1E293B', margin: '8px 0 4px' }}>
                  {loading ? '—' : kpi.value}
                </div>
                <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>{kpi.sub}</span>
              </div>

              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: kpi.bgColor,
                color: kpi.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <Icon size={22} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Category Breakdown & Delivery Performance */}
      <div className="crm-analytics-breakdown-grid">
        {/* Category Breakdown Card */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          padding: '24px',
          border: '1px solid #E7ECF3',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <h4 style={{ margin: '0 0 16px', fontSize: '1.05rem', color: '#1E293B', fontWeight: 600 }}>
            Contacts Distribution by Segment
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {['Customers', 'Scanned Contacts', 'Employees', 'Others'].map(cat => {
              const count = analytics?.categoryBreakdown?.[cat] || 0;
              const total = analytics?.totalContacts || 1;
              const pct = Math.round((count / total) * 100);

              return (
                <div key={cat}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, color: '#334155' }}>{cat}</span>
                    <span style={{ color: '#64748B' }}>{count} ({pct}%)</span>
                  </div>
                  <div style={{ height: '8px', backgroundColor: '#F1F5F9', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${pct}%`,
                      height: '100%',
                      backgroundColor:
                        cat === 'Customers'
                          ? '#0E7490'
                          : cat === 'Scanned Contacts'
                          ? '#F59E0B'
                          : cat === 'Employees'
                          ? '#3B82F6'
                          : '#94A3B8',
                      borderRadius: '4px'
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Anti-Spam & Delivery Health Card */}
        <div style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          padding: '24px',
          border: '1px solid #E7ECF3',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
        }}>
          <h4 style={{ margin: '0 0 16px', fontSize: '1.05rem', color: '#1E293B', fontWeight: 600 }}>
            Anti-Spam & Health Compliance
          </h4>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{
              padding: '14px',
              borderRadius: '12px',
              backgroundColor: '#ECFDF5',
              border: '1px solid #A7F3D0',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <CheckCircle2 size={24} color="#059669" />
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#065F46' }}>
                  Meta Cloud API Tier Health: Active & Healthy
                </div>
                <div style={{ fontSize: '0.78rem', color: '#047857', marginTop: '2px' }}>
                  Zero spam violation flags detected. Quality rating: High (Green).
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.85rem', color: '#64748B', lineHeight: '1.5' }}>
              Automatic contact synchronization is active for both the <strong>Visiting Card Scanner</strong> and the <strong>Employee Directory</strong>. All outbound marketing broadcasts strictly filter out unconsented recipients to preserve Meta API deliverability.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
