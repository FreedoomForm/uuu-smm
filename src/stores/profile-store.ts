import { makeStore } from '@/stores/make-store';

// ---------------------------------------------------------------------------
// PROFILE store — the viewer's own profile screen state: avatar, editable
// display name, test-taking background preset and its busy/confirm flags.
// Previously 6 loose useState hooks inside app-root.tsx.
// ---------------------------------------------------------------------------

interface ProfileData {
  // My profile photo URL (served by /api/users/[id]/avatar); null → initials
  myAvatar: string | null;
  avatarBusy: boolean;
  // Test-taking background preset key ('' = standard); loaded once per session
  // from GET /api/me together with the editable display name.
  myBgStyle: string;
  profileName: string;
  profileSaving: boolean;
  accBusy: boolean;
  deleteAccOpen: boolean;
}

const INITIAL: ProfileData = {
  myAvatar: null,
  avatarBusy: false,
  myBgStyle: '',
  profileName: '',
  profileSaving: false,
  accBusy: false,
  deleteAccOpen: false,
};

export const useProfileStore = makeStore(INITIAL);
