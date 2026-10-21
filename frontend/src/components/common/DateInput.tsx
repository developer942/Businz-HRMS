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
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        {...props}
        type="text"
        inputMode="numeric"
        placeholder={props.placeholder || 'DD/MM/YYYY'}
        className={className}
        style={{ ...style, paddingRight: '38px' }}
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
      <button
        type="button"
        aria-label="Open date picker"
        disabled={disabled}
        onClick={() => pickerRef.current?.showPicker?.()}
        style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', border: 0, background: 'transparent', cursor: disabled ? 'not-allowed' : 'pointer', color: '#64748B', padding: '4px' }}
      >
        <Calendar size={17} />
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={normalizeToYYYYMMDD(value)}
        min={typeof min === 'string' ? min : undefined}
        max={typeof max === 'string' ? max : undefined}
        onChange={event => {
          const iso = event.target.value;
          setDisplayValue(formatDateDDMMYYYY(iso));
          setError(null);
          inputRef.current?.setCustomValidity('');
          emitValue(iso);
        }}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
      {error && <div role="alert" style={{ color: '#B91C1C', fontSize: '0.72rem', marginTop: '4px' }}>{error}</div>}
    </div>
  );
};
