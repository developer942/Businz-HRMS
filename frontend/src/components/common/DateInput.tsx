import React, { useEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { formatDateDDMMYYYY, normalizeToYYYYMMDD, parseDDMMYYYY } from '../../utils/dateUtils';

type DateInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue'> & {
  value?: string;
};

export const DateInput: React.FC<DateInputProps> = ({ value = '', onChange, onBlur, min, max, className, style, disabled, required, ...props }) => {
  const [displayValue, setDisplayValue] = useState(formatDateDDMMYYYY(value));
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => setDisplayValue(formatDateDDMMYYYY(value)), [value]);

  const emitValue = (isoValue: string) => {
    onChange?.({ target: { value: isoValue }, currentTarget: { value: isoValue } } as React.ChangeEvent<HTMLInputElement>);
  };

  const validate = (raw: string, input = inputRef.current) => {
    if (!raw.trim()) {
      const message = required ? 'Please enter a date in DD/MM/YYYY format.' : '';
      setError(message || null);
      input?.setCustomValidity(message);
      emitValue('');
      return;
    }
    const iso = parseDDMMYYYY(raw);
    if (!iso || (min && iso < String(min)) || (max && iso > String(max))) {
      const message = 'Please enter a valid date in DD/MM/YYYY format.';
      setError(message);
      input?.setCustomValidity(message);
      emitValue('');
      return;
    }
    setError(null);
    input?.setCustomValidity('');
    setDisplayValue(formatDateDDMMYYYY(iso));
    emitValue(iso);
  };

  return (
    <div style={{ position: 'relative', width: '100%', display: 'inline-block' }}>
      <input
        ref={inputRef}
        {...props}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={props.placeholder || 'DD/MM/YYYY'}
        className={className}
        style={{
          ...style,
          paddingRight: '44px',
          WebkitAppearance: 'none',
          boxSizing: 'border-box'
        }}
        value={displayValue}
        disabled={disabled}
        required={required}
        aria-invalid={Boolean(error)}
        onChange={event => {
          const next = event.target.value.replace(/[^\d/]/g, '').slice(0, 10);
          setDisplayValue(next);
          setError(null);
          event.currentTarget.setCustomValidity('');
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(next)) validate(next, event.currentTarget);
          else {
            if (next || required) event.currentTarget.setCustomValidity('Please enter a valid date in DD/MM/YYYY format.');
            emitValue('');
          }
        }}
        onBlur={event => {
          validate(displayValue);
          onBlur?.(event);
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: '44px',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          zIndex: 1,
          color: disabled ? '#CBD5E1' : '#64748B'
        }}
      >
        <Calendar size={18} style={{ pointerEvents: 'none' }} />
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-label="Pick date from calendar"
          disabled={disabled}
          value={normalizeToYYYYMMDD(value)}
          min={typeof min === 'string' ? min : undefined}
          max={typeof max === 'string' ? max : undefined}
          onChange={event => {
            const iso = event.target.value;
            if (iso) {
              setDisplayValue(formatDateDDMMYYYY(iso));
              setError(null);
              if (inputRef.current) inputRef.current.setCustomValidity('');
              emitValue(iso);
            }
          }}
          onClick={e => {
            // Prevent event bubbling so form is not submitted accidentally
            e.stopPropagation();
            try {
              if (pickerRef.current && typeof pickerRef.current.showPicker === 'function') {
                pickerRef.current.showPicker();
              }
            } catch {
              // Browser natively handles the tap on the input element
            }
          }}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            opacity: 0,
            cursor: disabled ? 'not-allowed' : 'pointer',
            zIndex: 2,
            border: 'none',
            background: 'transparent',
            padding: 0,
            margin: 0
          }}
        />
      </div>
      {error && <div role="alert" style={{ color: '#B91C1C', fontSize: '0.72rem', marginTop: '4px' }}>{error}</div>}
    </div>
  );
};
