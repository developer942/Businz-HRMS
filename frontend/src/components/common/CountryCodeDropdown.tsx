import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Check, Globe } from 'lucide-react';
import { COUNTRY_CODES, CountryCodeItem, findCountryByDialCode } from '../../data/countryCodes';

export interface CountryCodeDropdownProps {
  value: string; // e.g. "+91"
  onChange: (dialCode: string, country: CountryCodeItem) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const CountryCodeDropdown: React.FC<CountryCodeDropdownProps> = ({
  value = '+91',
  onChange,
  disabled = false,
  id,
  className,
  style,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [coords, setCoords] = useState<{ top: number; left: number; width: number; openUpward: boolean }>({
    top: 0,
    left: 0,
    width: 330,
    openUpward: false,
  });

  const [chosenCountry, setChosenCountry] = useState<CountryCodeItem>(() => findCountryByDialCode(value));

  useEffect(() => {
    if (value !== chosenCountry.dialCode) {
      setChosenCountry(findCountryByDialCode(value));
    }
  }, [value, chosenCountry.dialCode]);

  const selectedCountry = chosenCountry;

  // Filter countries alphabetically A to Z by search query
  const filteredCountries = useMemo(() => {
    if (!searchQuery.trim()) return COUNTRY_CODES;
    const q = searchQuery.toLowerCase().trim();
    return COUNTRY_CODES.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.dialCode.includes(q) ||
        c.dialCode.replace('+', '').includes(q)
    );
  }, [searchQuery]);

  // Recalculate popup position
  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownHeight = Math.min(340, window.innerHeight - 80);
    const dropdownWidth = Math.min(330, Math.max(260, window.innerWidth - 20));
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < dropdownHeight && rect.top > dropdownHeight;

    const top = openUpward
      ? Math.max(10, rect.top - dropdownHeight - 6)
      : Math.min(window.innerHeight - dropdownHeight - 10, rect.bottom + 6);

    const left = Math.max(10, Math.min(rect.left, window.innerWidth - dropdownWidth - 10));

    setCoords({
      top,
      left,
      width: dropdownWidth,
      openUpward,
    });
  };

  // Open/Close toggle
  const toggleDropdown = () => {
    if (disabled) return;
    if (!isOpen) {
      updatePosition();
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  // Reposition on scroll/resize
  useEffect(() => {
    if (isOpen) {
      updatePosition();
      const handleScrollResize = () => {
        updatePosition();
      };
      window.addEventListener('resize', handleScrollResize);
      window.addEventListener('scroll', handleScrollResize, true);
      return () => {
        window.removeEventListener('resize', handleScrollResize);
        window.removeEventListener('scroll', handleScrollResize, true);
      };
    }
  }, [isOpen]);

  // Click outside to close (supporting portal outside container)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current && !buttonRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Auto focus search input when opened & reset
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
      setActiveIndex(-1);
    } else {
      setSearchQuery('');
      setActiveIndex(-1);
    }
  }, [isOpen]);

  const handleSelectCountry = (country: CountryCodeItem) => {
    setChosenCountry(country);
    onChange(country.dialCode, country);
    setIsOpen(false);
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleDropdown();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      buttonRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => {
        const next = prev < filteredCountries.length - 1 ? prev + 1 : 0;
        // Scroll active item into view
        const itemEl = listRef.current?.children[next] as HTMLElement;
        itemEl?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => {
        const next = prev > 0 ? prev - 1 : filteredCountries.length - 1;
        const itemEl = listRef.current?.children[next] as HTMLElement;
        itemEl?.scrollIntoView({ block: 'nearest' });
        return next;
      });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < filteredCountries.length) {
        handleSelectCountry(filteredCountries[activeIndex]);
      }
    }
  };

  return (
    <div
      id={id}
      className={`country-code-dropdown-wrapper ${className || ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'stretch',
        position: 'relative',
        ...style,
      }}
    >
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={toggleDropdown}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title={`${selectedCountry.name} (${selectedCountry.dialCode})`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          padding: '0 12px',
          backgroundColor: '#F8FAFC',
          border: '1px solid #CBD5E1',
          borderRight: 'none',
          borderTopLeftRadius: '10px',
          borderBottomLeftRadius: '10px',
          color: '#0F172A',
          fontWeight: 700,
          fontSize: '0.88rem',
          letterSpacing: '0.02em',
          cursor: disabled ? 'not-allowed' : 'pointer',
          userSelect: 'none',
          outline: 'none',
          transition: 'all 0.15s ease',
          whiteSpace: 'nowrap',
          minWidth: '88px',
          height: '100%',
        }}
        onMouseEnter={(e) => {
          if (!disabled) e.currentTarget.style.backgroundColor = '#F1F5F9';
        }}
        onMouseLeave={(e) => {
          if (!disabled) e.currentTarget.style.backgroundColor = '#F8FAFC';
        }}
      >
        <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>{selectedCountry.flag}</span>
        <span style={{ fontSize: '0.88rem', color: '#0F172A', fontWeight: 700 }}>
          {selectedCountry.dialCode}
        </span>
        <ChevronDown
          size={14}
          color="#64748B"
          style={{
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </button>

      {/* Floating Popover Portal: Renders outside modal / cards into document.body */}
      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              maxHeight: '340px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: '12px',
              boxShadow: '0 20px 35px -5px rgba(0, 0, 0, 0.15), 0 10px 15px -3px rgba(0, 0, 0, 0.08)',
              zIndex: 999999,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              animation: 'countryDropdownFadeIn 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
              fontFamily: "'DM Sans', 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
            }}
          >
            {/* Search Header */}
            <div
              style={{
                padding: '10px 12px',
                borderBottom: '1px solid #E2E8F0',
                backgroundColor: '#F8FAFC',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Search size={15} color="#64748B" style={{ flexShrink: 0 }} />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Search country name or code (A-Z)..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setActiveIndex(-1);
                }}
                style={{
                  width: '100%',
                  border: 'none',
                  background: 'transparent',
                  outline: 'none',
                  fontSize: '16px',
                  color: '#1E293B',
                  fontWeight: 500,
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: '#94A3B8',
                    fontSize: '0.85rem',
                    padding: '2px 4px',
                    borderRadius: '4px',
                  }}
                  title="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Quick Header Info */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '5px 12px',
                backgroundColor: '#F1F5F9',
                fontSize: '0.72rem',
                color: '#64748B',
                fontWeight: 600,
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
                borderBottom: '1px solid #E2E8F0',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Globe size={11} color="#64748B" /> All Countries (A to Z)
              </span>
              <span>{filteredCountries.length} countries</span>
            </div>

            {/* Scrollable Countries List A to Z */}
            <div
              ref={listRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                maxHeight: '260px',
                padding: '6px',
                overscrollBehavior: 'contain',
              }}
            >
              {filteredCountries.length === 0 ? (
                <div
                  style={{
                    padding: '24px 16px',
                    textAlign: 'center',
                    fontSize: '0.84rem',
                    color: '#94A3B8',
                  }}
                >
                  No country found matching &quot;{searchQuery}&quot;
                </div>
              ) : (
                filteredCountries.map((country, index) => {
                  const isSelected =
                    country.dialCode === selectedCountry.dialCode &&
                    country.code === selectedCountry.code;
                  const isActive = index === activeIndex;

                  return (
                    <button
                      key={`${country.code}-${country.dialCode}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => handleSelectCountry(country)}
                      onMouseEnter={() => setActiveIndex(index)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        width: '100%',
                        padding: '7px 10px',
                        border: 'none',
                        borderRadius: '8px',
                        backgroundColor: isSelected
                          ? '#ECFEFF'
                          : isActive
                          ? '#F1F5F9'
                          : 'transparent',
                        color: isSelected ? '#0E7490' : '#1E293B',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background-color 0.1s ease',
                        gap: '8px',
                        outline: 'none',
                      }}
                    >
                      <span style={{ fontSize: '1.2rem', lineHeight: 1, flexShrink: 0 }}>
                        {country.flag}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          fontSize: '0.84rem',
                          fontWeight: isSelected ? 700 : 500,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {country.name}
                      </span>
                      <span
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          color: isSelected ? '#0E7490' : '#475569',
                          backgroundColor: isSelected ? '#CFFAFE' : '#E2E8F0',
                          padding: '2px 7px',
                          borderRadius: '6px',
                          flexShrink: 0,
                          fontFamily: 'monospace',
                        }}
                      >
                        {country.dialCode}
                      </span>
                      {isSelected && (
                        <Check size={14} color="#0E7490" style={{ flexShrink: 0, marginLeft: '2px' }} />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
