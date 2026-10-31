import React from 'react';

export const ModuleLoadingFallback: React.FC = () => {
  return (
    <div
      style={{
        padding: '24px',
        maxWidth: '1440px',
        margin: '0 auto',
        animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }}
    >
      {/* Title skeleton */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ height: '32px', width: '220px', background: '#E2E8F0', borderRadius: '8px' }} />
        <div style={{ height: '36px', width: '140px', background: '#E2E8F0', borderRadius: '10px' }} />
      </div>

      {/* KPI Cards Skeleton */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '24px',
        }}
      >
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              height: '96px',
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '14px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ height: '14px', width: '60%', background: '#F1F5F9', borderRadius: '4px' }} />
            <div style={{ height: '24px', width: '40%', background: '#E2E8F0', borderRadius: '6px' }} />
          </div>
        ))}
      </div>

      {/* Table / Content Skeleton */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: '16px',
          padding: '20px',
        }}
      >
        <div style={{ height: '38px', width: '100%', background: '#F8FAFC', borderRadius: '8px', marginBottom: '16px' }} />
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              height: '48px',
              width: '100%',
              background: i % 2 === 0 ? '#F8FAFC' : '#FFFFFF',
              borderRadius: '6px',
              marginBottom: '8px',
            }}
          />
        ))}
      </div>
    </div>
  );
};
