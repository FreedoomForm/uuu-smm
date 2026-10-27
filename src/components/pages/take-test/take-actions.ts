import { useTakeStore } from '@/stores/take-store';
import { navNow } from '@/stores/nav-store';
import { clearAiChat } from '@/stores/chat-store';

// ---------------------------------------------------------------------------
// TAKE-ACTIONS — the cross-store navigation action of the take-test screen.
// Previously an inline closure inside take-test-view.tsx; now a hook-free
// module action (getState reads) so Swiper slide commits, drum taps, search
// picks and the jump-input submit all share ONE implementation with no stale
// closures and no prop drilling.
// ---------------------------------------------------------------------------

/**
 * Navigate to a question and close any open AI chat sheet (the chat state is
 * cleared exactly like the old inline goToQuestion did: setChatOpen(false) +
 * the same four chat-store resets that clearAiChat performs).
 */
export function goToQuestion(idx: number) {
  useTakeStore.getState().setCurrentQuestionIdx(idx);
  if (navNow().chatOpen) {
    navNow().setChatOpen(false);
    clearAiChat();
  }
}
