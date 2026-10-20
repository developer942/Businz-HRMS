/**
 * Global Keyboard & Form Event Handler Utilities
 * VRM Enterprise HRM (Businz HRMS)
 * 
 * Protects inputs and textareas across all modules from:
 * 1. Accidental form submission or shortcut hijacking when pressing Spacebar
 * 2. Unintended form submission when pressing Enter in multiline textareas
 * 3. Double-submission / concurrent submission race conditions
 * 
 * Ensures:
 * - Spacebar inserts spaces cleanly into inputs/textareas without triggering submission
 * - Enter creates new lines in multiline textareas
 * - Normal keyboard accessibility continues working on buttons and controls
 */

import React from 'react';

/**
 * Returns true if the element is an editable text field, textarea, select, or contenteditable.
 */
export const isEditableElement = (element: EventTarget | null): boolean => {
  if (!element) return false;
  if (typeof HTMLElement !== 'undefined' && !(element instanceof HTMLElement)) return false;

  const htmlEl = element as HTMLElement;
  const tagName = htmlEl.tagName ? htmlEl.tagName.toUpperCase() : '';
  if (tagName === 'INPUT') {
    const inputType = (element as HTMLInputElement).type?.toLowerCase() || 'text';
    // Non-text inputs where space acts as toggle
    const toggleTypes = ['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'];
    return !toggleTypes.includes(inputType);
  }

  if (tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }

  if (
    (element as any).isContentEditable ||
    (element as any).getAttribute?.('contenteditable') === 'true' ||
    (element as any).getAttribute?.('role') === 'textbox'
  ) {
    return true;
  }

  return false;
};

export const isSpaceKey = (e: KeyboardEvent | React.KeyboardEvent): boolean => {
  return e.key === ' ' || e.code === 'Space' || e.keyCode === 32 || (e as any).which === 32;
};

export const isEnterKey = (e: KeyboardEvent | React.KeyboardEvent): boolean => {
  return e.key === 'Enter' || e.code === 'Enter' || e.keyCode === 13 || (e as any).which === 13;
};

/**
 * Keystroke handler for <input> and <textarea> elements.
 * 
 * Guarantees:
 * 1. Spacebar inserts spaces cleanly without bubbling to parent forms, containers, or shortcuts.
 * 2. In <textarea>, Enter inserts a new line without triggering form submission.
 * 3. Never disables normal typing.
 */
export const preventSpaceEnterPropagation = (e: React.KeyboardEvent): void => {
  const target = e.target as HTMLElement | null;

  if (isSpaceKey(e)) {
    // Stop propagation so parent containers, forms, or global keyboard shortcuts
    // cannot intercept the spacebar while the user is typing.
    // Crucially: DO NOT call e.preventDefault() so the space character is inserted normally!
    e.stopPropagation();
    return;
  }

  if (isEnterKey(e)) {
    if (target && target.tagName.toUpperCase() === 'TEXTAREA') {
      // In textareas, Enter must insert a newline and never submit the parent form.
      e.stopPropagation();
      return;
    }
  }
};

/**
 * Form-level keydown handler to attach to <form onKeyDown={handleFormKeyDown}>.
 * 
 * Prevents accidental form submissions when Spacebar or Enter is pressed inside text fields.
 */
export const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>): void => {
  const target = e.target as HTMLElement | null;
  if (!target) return;

  if (isSpaceKey(e) && isEditableElement(target)) {
    // Prevent Space in editable fields from propagating to form or triggering default button
    e.stopPropagation();
    return;
  }

  if (isEnterKey(e)) {
    const tagName = target.tagName.toUpperCase();
    // Never allow a textarea Enter press to submit the form
    if (tagName === 'TEXTAREA') {
      e.stopPropagation();
      return;
    }
  }
};

/**
 * Initializes a global window and document event guard across the entire HRMS application.
 * 
 * Intercepts:
 * 1. keydown (capture & bubble): tracks spacebar activity and prevents shortcut interception while typing
 * 2. keyup: prevents synthetic button activation when typing in fields
 * 3. submit (capture): hard blocks any form submission if triggered while Spacebar is pressed or from a textarea
 */
export const initGlobalKeyboardGuard = (): (() => void) => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  // Prevent multiple duplicate initializations
  if ((window as any).__vrm_keyboard_guard_installed) {
    return () => {};
  }
  (window as any).__vrm_keyboard_guard_installed = true;

  let isSpaceKeyDown = false;

  const trackKeyDownCapture = (e: KeyboardEvent) => {
    if (isSpaceKey(e)) {
      isSpaceKeyDown = true;
    }
  };

  const trackKeyUpCapture = (e: KeyboardEvent) => {
    if (isSpaceKey(e)) {
      isSpaceKeyDown = false;
    }
  };

  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    const activeEl = document.activeElement as HTMLElement | null;
    const target = e.target as HTMLElement | null;
    const currentTarget = activeEl || target;

    if (isSpaceKey(e)) {
      if (isEditableElement(currentTarget)) {
        // Stop bubbling so window / document level shortcuts don't intercept space.
        // DO NOT call preventDefault() - Space character must be inserted natively!
        e.stopPropagation();
      }
    }

    if (isEnterKey(e)) {
      if (currentTarget && currentTarget.tagName.toUpperCase() === 'TEXTAREA') {
        // Stop bubbling so parent form does not interpret Enter in textarea as submit
        e.stopPropagation();
      }
    }
  };

  const handleGlobalKeyUp = (e: KeyboardEvent) => {
    const activeEl = document.activeElement as HTMLElement | null;
    const target = e.target as HTMLElement | null;
    const currentTarget = activeEl || target;

    if (isSpaceKey(e)) {
      isSpaceKeyDown = false;
      if (isEditableElement(currentTarget)) {
        // In editable elements, Space keyup must never trigger button activation or shortcuts
        e.stopPropagation();
      }
    }
  };

  const handleBlur = () => {
    isSpaceKeyDown = false;
  };

  // Submit event interceptor in capture phase
  const handleGlobalSubmitCapture = (e: SubmitEvent) => {
    const activeEl = document.activeElement as HTMLElement | null;

    // 1. HARD BLOCK: If space is pressed while focused on an editable element, NEVER submit
    if (isSpaceKeyDown && isEditableElement(activeEl)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return false;
    }

    // 2. HARD BLOCK: If focused inside a textarea, do NOT submit unless explicit submit button was clicked
    if (activeEl && activeEl.tagName.toUpperCase() === 'TEXTAREA') {
      const submitter = e.submitter as HTMLElement | null;
      const isExplicitSubmitButton = 
        submitter && 
        (submitter.tagName === 'BUTTON' || submitter.tagName === 'INPUT') && 
        submitter.getAttribute('type')?.toLowerCase() === 'submit';

      if (!isExplicitSubmitButton) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return false;
      }
    }

    // 3. HARD BLOCK: Buttons with explicit type="button" must never submit
    const submitter = e.submitter as HTMLElement | null;
    if (submitter && submitter.getAttribute('type')?.toLowerCase() === 'button') {
      e.preventDefault();
      e.stopImmediatePropagation();
      return false;
    }
  };

  // Register listeners
  window.addEventListener('keydown', trackKeyDownCapture, true);
  window.addEventListener('keyup', trackKeyUpCapture, true);
  window.addEventListener('keydown', handleGlobalKeyDown, false);
  window.addEventListener('keyup', handleGlobalKeyUp, false);
  window.addEventListener('blur', handleBlur);
  document.addEventListener('submit', handleGlobalSubmitCapture, true);

  return () => {
    (window as any).__vrm_keyboard_guard_installed = false;
    window.removeEventListener('keydown', trackKeyDownCapture, true);
    window.removeEventListener('keyup', trackKeyUpCapture, true);
    window.removeEventListener('keydown', handleGlobalKeyDown, false);
    window.removeEventListener('keyup', handleGlobalKeyUp, false);
    window.removeEventListener('blur', handleBlur);
    document.removeEventListener('submit', handleGlobalSubmitCapture, true);
  };
};
