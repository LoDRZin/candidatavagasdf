import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../platform/Auth';
import InterviewChat from './InterviewChat';

type InterviewChatModalProps = {
  isOpen: boolean;
  onClose: () => void;
  question: string;
  draft: string;
  canUseAi: boolean;
  onHandoff?: (message: string) => void;
};

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function InterviewChatModal({
  isOpen,
  onClose,
  question,
  draft,
  canUseAi,
  onHandoff,
}: InterviewChatModalProps) {
  const { user } = useAuth();
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!isOpen) return;

    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const appRoot = document.getElementById('root');
    const rootWasInert = appRoot?.inert ?? false;
    const previousOverflow = document.body.style.overflow;

    if (appRoot) appRoot.inert = true;
    document.body.style.overflow = 'hidden';

    const animation = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? null
      : overlayRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });

    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !overlayRef.current) return;
      const focusableElements = Array.from(
        overlayRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');

      if (focusableElements.length === 0) {
        event.preventDefault();
        overlayRef.current.focus();
        return;
      }

      const first = focusableElements[0]!;
      const last = focusableElements[focusableElements.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      animation?.cancel();
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (appRoot) appRoot.inert = rootWasInert;
      openerRef.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-opacity"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        background: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(4px)',
        transition: 'opacity 180ms ease-out',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="interview-chat-modal-title"
      tabIndex={-1}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="bg-[#F7F6F2] w-full max-w-3xl h-[80vh] rounded-lg shadow-2xl flex flex-col font-serif border border-[#E4E4E7]"
        style={{
          width: '100%',
          maxWidth: '48rem',
          height: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #E4E4E7',
          borderRadius: '0.5rem',
          background: '#F7F6F2',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
          color: '#1A4331',
          fontFamily: "Georgia, 'Times New Roman', serif",
        }}
      >
        <header
          style={{
            display: 'flex',
            flex: 'none',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #E4E4E7',
          }}
        >
          <h2
            id="interview-chat-modal-title"
            className="text-[#1A4331] font-semibold"
            style={{ margin: 0, color: '#1A4331', fontSize: '1.25rem', fontWeight: 600 }}
          >
            Assistente de Feedback
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Fechar assistente"
            onClick={onClose}
            style={{
              display: 'grid',
              width: '2.75rem',
              height: '2.75rem',
              flex: 'none',
              placeItems: 'center',
              border: '1px solid #E4E4E7',
              borderRadius: '0.5rem',
              background: '#F7F6F2',
              color: '#1A4331',
              cursor: 'pointer',
              font: 'inherit',
              fontSize: '1.5rem',
              lineHeight: 1,
            }}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div
          className="flex-1 overflow-hidden interview-chat-modal-body"
          style={{ flex: '1 1 0%', minHeight: 0, overflow: 'hidden' }}
        >
          <style>{`.interview-chat-modal-body > .interview-chat{height:100%;margin-top:0;border:0;border-radius:0;box-shadow:none}`}</style>
          <InterviewChat
            key={question}
            question={question}
            draft={draft}
            canUseAi={canUseAi}
            accessHref={user ? '/verificar-email' : '/login?returnTo=%2Fentrevistas'}
            onDraftSent={() => undefined}
            onHandoff={onHandoff}
          />
        </div>
      </section>
    </div>,
    document.body,
  );
}
