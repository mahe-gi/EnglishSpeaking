import * as FileSystem from "expo-file-system/legacy";
import { requireEnv } from "./env";

export interface User {
  id: string;
  firebaseUid: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  id: string;
  userId: string;
  careerStatus: string;
  goal: string;
  nativeLanguage: string;
  confidence: number;
  baselineScore: number | null;
  currentScore: number | null;
  totalSpeakingSeconds: number;
}

export interface BootstrapData {
  user: User;
  onboardingCompleted: boolean;
  assessmentCompleted: boolean;
  baselineAssessmentId: string | null;
}

export interface OnboardingInput {
  careerStatus: "COLLEGE_STUDENT" | "JOB_SEEKER" | "WORKING_PROFESSIONAL";
  goal: "JOB_INTERVIEWS" | "WORKPLACE_CONVERSATIONS" | "SPEAKING_CONFIDENCE";
  nativeLanguage:
    | "HINDI"
    | "TELUGU"
    | "TAMIL"
    | "KANNADA"
    | "MALAYALAM"
    | "MARATHI"
    | "BENGALI"
    | "OTHER";
  confidence: number;
}

export interface AssessmentSession {
  id: string;
  status: "IN_PROGRESS" | "ANALYZING" | "COMPLETED" | "ABANDONED";
  startedAt: string;
}

export interface AssessmentStartData {
  assessment: AssessmentSession;
  answeredSequences: number[];
}

export interface Utterance {
  id: string;
  sessionId: string;
  sequence: number;
  question: string;
  transcript: string | null;
  audioDurationMs: number | null;
  wordCount: number | null;
  wordsPerMinute: number | null;
  fillerCount: number | null;
  createdAt: string;
}

export interface AssessmentReport {
  sessionId: string;
  overallScore: number;
  subScores: {
    delivery: number;
    grammar: number;
    structure: number;
    vocabulary: number;
    communication: number;
    relevance: number;
  };
  metrics: {
    totalWordCount: number;
    totalSpeakingSeconds: number;
    averageWpm: number;
    totalFillerCount: number;
    aggregateFillerPercentage: number;
    deliveryScore: number;
  };
  strengths: string[];
  weaknesses: string[];
  feedback: string;
  completedAt: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export async function bootstrapUser(idToken: string): Promise<BootstrapData> {
  const apiBaseUrl = requireEnv(
    process.env.EXPO_PUBLIC_API_URL,
    "EXPO_PUBLIC_API_URL"
  );

  const response = await fetch(`${apiBaseUrl}/me`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
  });

  const json: ApiResponse<BootstrapData> = await response.json();

  if (!response.ok || !json.success || !json.data) {
    const errorMsg = json.error?.message || `Bootstrap failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return json.data;
}

export async function submitOnboarding(
  idToken: string,
  data: OnboardingInput
): Promise<Profile> {
  const apiBaseUrl = requireEnv(
    process.env.EXPO_PUBLIC_API_URL,
    "EXPO_PUBLIC_API_URL"
  );

  const response = await fetch(`${apiBaseUrl}/onboarding`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(data),
  });

  const json: ApiResponse<{ profile: Profile }> = await response.json();

  if (!response.ok || !json.success || !json.data) {
    const errorMsg = json.error?.message || `Onboarding failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return json.data.profile;
}

export async function startAssessment(idToken: string): Promise<AssessmentStartData> {
  const apiBaseUrl = requireEnv(
    process.env.EXPO_PUBLIC_API_URL,
    "EXPO_PUBLIC_API_URL"
  );

  const response = await fetch(`${apiBaseUrl}/assessments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
  });

  const json: ApiResponse<AssessmentStartData> = await response.json();

  if (!response.ok || !json.success || !json.data) {
    const errorMsg = json.error?.message || `Failed to start assessment with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return json.data;
}

export async function getAssessment(
  idToken: string,
  sessionId: string
): Promise<AssessmentStartData> {
  const apiBaseUrl = requireEnv(
    process.env.EXPO_PUBLIC_API_URL,
    "EXPO_PUBLIC_API_URL"
  );

  const response = await fetch(`${apiBaseUrl}/assessments/${sessionId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  const json: ApiResponse<AssessmentStartData> = await response.json();

  if (!response.ok || !json.success || !json.data) {
    const errorMsg = json.error?.message || `Failed to get assessment with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return json.data;
}

export async function uploadAssessmentResponse(
  idToken: string,
  sessionId: string,
  sequence: number,
  durationMs: number,
  audioUri: string
): Promise<Utterance> {
  const apiBaseUrl = requireEnv(
    process.env.EXPO_PUBLIC_API_URL,
    "EXPO_PUBLIC_API_URL"
  );

  const uploadResult = await FileSystem.uploadAsync(
    `${apiBaseUrl}/assessments/${sessionId}/responses`,
    audioUri,
    {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "audio",
      mimeType: "audio/m4a",
      parameters: {
        sequence: sequence.toString(),
        durationMs: durationMs.toString(),
      },
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    }
  );

  let json: ApiResponse<{ utterance: Utterance }>;
  try {
    json = JSON.parse(uploadResult.body);
  } catch {
    throw new Error(`Invalid server response (${uploadResult.status})`);
  }

  if (uploadResult.status >= 400 || !json.success || !json.data) {
    const errorMsg = json.error?.message || `Upload failed with status ${uploadResult.status}`;
    throw new Error(errorMsg);
  }

  return json.data.utterance;
}

export async function completeAssessment(
  idToken: string,
  sessionId: string
): Promise<AssessmentReport> {
  const apiBaseUrl = requireEnv(
    process.env.EXPO_PUBLIC_API_URL,
    "EXPO_PUBLIC_API_URL"
  );

  const response = await fetch(`${apiBaseUrl}/assessments/${sessionId}/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
  });

  const json: ApiResponse<{ report: AssessmentReport }> = await response.json();

  if (!response.ok || !json.success || !json.data) {
    const errorMsg =
      json.error?.message || `Assessment completion failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return json.data.report;
}

export interface PracticeGrammarIssue {
  original: string;
  correction: string;
  explanation: string;
}

export interface PracticeFeedbackData {
  summary: string;
  grammarIssues: PracticeGrammarIssue[];
  betterVersion: string;
  focusArea: "GRAMMAR" | "STRUCTURE" | "VOCABULARY" | "CLARITY" | "DELIVERY" | "RELEVANCE";
  encouragement: string;
}

export interface PracticeSessionSummary {
  speakingSeconds: number;
  averageWpm: number;
  fillerCount: number;
  primaryFocusArea: string;
  strength: string;
  nextPracticeSuggestion: string;
}

export interface PracticeTurnResponse {
  utterance: {
    sequence: number;
    question: string;
    transcript: string;
    metrics: {
      wordCount: number;
      wordsPerMinute: number;
      fillerCount: number;
    };
  };
  feedback: PracticeFeedbackData;
  nextTurn: {
    sequence: number;
    question: string;
  } | null;
  sessionCompleted: boolean;
  summary: PracticeSessionSummary | null;
}

export interface PracticeStartData {
  session: {
    id: string;
    status: "IN_PROGRESS" | "COMPLETED";
  };
  scenario: {
    id: string;
    title: string;
    difficulty: "EASY" | "MEDIUM" | "HARD";
    category: string;
  };
  answeredSequences: number[];
  nextTurn: {
    sequence: number;
    question: string;
    feedbackPending?: boolean;
    durationMs?: number;
  } | null;
  isNew: boolean;
}

export async function startPracticeSession(idToken: string): Promise<PracticeStartData> {
  const apiBaseUrl = requireEnv(
    process.env.EXPO_PUBLIC_API_URL,
    "EXPO_PUBLIC_API_URL"
  );

  const response = await fetch(`${apiBaseUrl}/practice/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
  });

  const json: ApiResponse<PracticeStartData> = await response.json();

  if (!response.ok || !json.success || !json.data) {
    const errorMsg =
      json.error?.message || `Failed to start practice session with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return json.data;
}

export async function uploadPracticeResponse(
  idToken: string,
  sessionId: string,
  sequence: number,
  durationMs: number,
  audioUri?: string | null
): Promise<PracticeTurnResponse> {
  const apiBaseUrl = requireEnv(
    process.env.EXPO_PUBLIC_API_URL,
    "EXPO_PUBLIC_API_URL"
  );

  if (audioUri) {
    const uploadResult = await FileSystem.uploadAsync(
      `${apiBaseUrl}/practice/sessions/${sessionId}/responses`,
      audioUri,
      {
        httpMethod: "POST",
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
        fieldName: "audio",
        mimeType: "audio/m4a",
        parameters: {
          sequence: sequence.toString(),
          durationMs: durationMs.toString(),
        },
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      }
    );

    let json: ApiResponse<PracticeTurnResponse>;
    try {
      json = JSON.parse(uploadResult.body);
    } catch {
      throw new Error(`Invalid server response (${uploadResult.status})`);
    }

    if (uploadResult.status >= 400 || !json.success || !json.data) {
      const errorMsg =
        json.error?.message || `Practice response upload failed with status ${uploadResult.status}`;
      throw new Error(errorMsg);
    }

    return json.data;
  }

  const response = await fetch(`${apiBaseUrl}/practice/sessions/${sessionId}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ sequence, durationMs }),
  });

  const json: ApiResponse<PracticeTurnResponse> = await response.json();

  if (!response.ok || !json.success || !json.data) {
    const errorMsg =
      json.error?.message || `Practice response upload failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return json.data;
}

export interface ProgressData {
  baseline: {
    score: number | null;
    assessedAt: string | null;
    dimensions: {
      delivery: number;
      grammar: number;
      structure: number;
      vocabulary: number;
      communication: number;
      relevance: number;
    } | null;
    wpm: number | null;
    fillerPercentage: number | null;
    weaknesses: string[];
  } | null;
  practice: {
    completedSessions: number;
    speakingSeconds: number;
    speakingMinutes: number;
    recentWpm: number | null;
    recentFillerPercentage: number | null;
  };
  focusAreas: {
    GRAMMAR: number;
    STRUCTURE: number;
    VOCABULARY: number;
    CLARITY: number;
    DELIVERY: number;
    RELEVANCE: number;
  };
  recentSessions: {
    id: string;
    scenarioId: string;
    scenarioTitle: string;
    scenarioCategory: string;
    completedAt: string | null;
    speakingSeconds: number;
    wpm: number;
    fillerCount: number;
    primaryFocusArea: string | null;
  }[];
}

export async function getUserProgress(idToken: string): Promise<ProgressData> {
  const apiBaseUrl = requireEnv(
    process.env.EXPO_PUBLIC_API_URL,
    "EXPO_PUBLIC_API_URL"
  );

  const response = await fetch(`${apiBaseUrl}/progress`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
  });

  const json: ApiResponse<ProgressData> = await response.json();

  if (!response.ok || !json.success || !json.data) {
    const errorMsg =
      json.error?.message || `Failed to fetch progress with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return json.data;
}

export interface PeerSlot {
  startAt: string;
  durationMinutes: number;
}

export interface PeerAvailabilityData {
  id: string;
  startsAt: string;
  status: "AVAILABLE" | "MATCHED" | "CANCELLED" | "EXPIRED";
}

export interface PeerMatchDetails {
  id: string;
  startsAt: string;
  durationMinutes: number;
  status: "SCHEDULED" | "ACTIVE" | "COMPLETED" | "MISSED" | "CANCELLED";
  role: "A" | "B";
  scenario: {
    id: string;
    title: string;
    category: string;
    initialQuestion: string;
  };
  partner: {
    label: string;
  };
}

export interface PeerBookingResponse {
  status: "WAITING" | "MATCHED";
  availability?: PeerAvailabilityData;
  match?: PeerMatchDetails;
}

export interface UpcomingMatchResponse {
  status?: "MATCHED";
  match: PeerMatchDetails | null;
  pendingAvailability: PeerAvailabilityData | null;
}

export interface PeerTokenData {
  serverUrl: string;
  participantToken: string;
  match: {
    id: string;
    role: "A" | "B";
    durationMinutes: number;
    scenario: {
      id: string;
      title: string;
      category: string;
      initialQuestion: string;
    };
  };
}

export async function getPeerSlots(idToken: string): Promise<PeerSlot[]> {
  const apiBaseUrl = requireEnv(process.env.EXPO_PUBLIC_API_URL, "EXPO_PUBLIC_API_URL");
  const response = await fetch(`${apiBaseUrl}/peer/slots`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
  });
  const json: ApiResponse<{ slots: PeerSlot[] }> = await response.json();
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error?.message || "Failed to fetch scheduled peer slots.");
  }
  return json.data.slots;
}

export async function bookPeerAvailability(idToken: string, startAt: string): Promise<PeerBookingResponse> {
  const apiBaseUrl = requireEnv(process.env.EXPO_PUBLIC_API_URL, "EXPO_PUBLIC_API_URL");
  const response = await fetch(`${apiBaseUrl}/peer/availability`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ startAt }),
  });
  const json: ApiResponse<PeerBookingResponse> = await response.json();
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error?.message || "Failed to book peer availability.");
  }
  return json.data;
}

export async function cancelPeerAvailability(idToken: string, availabilityId: string): Promise<void> {
  const apiBaseUrl = requireEnv(process.env.EXPO_PUBLIC_API_URL, "EXPO_PUBLIC_API_URL");
  const response = await fetch(`${apiBaseUrl}/peer/availability/${availabilityId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  const json: ApiResponse<{ success: boolean }> = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json.error?.message || "Failed to cancel availability.");
  }
}

export async function getUpcomingPeerMatch(idToken: string): Promise<UpcomingMatchResponse> {
  const apiBaseUrl = requireEnv(process.env.EXPO_PUBLIC_API_URL, "EXPO_PUBLIC_API_URL");
  const response = await fetch(`${apiBaseUrl}/peer/matches/upcoming`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
  });
  const json: ApiResponse<UpcomingMatchResponse> = await response.json();
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error?.message || "Failed to fetch upcoming peer match.");
  }
  return json.data;
}

export async function getPeerMatchToken(idToken: string, matchId: string): Promise<PeerTokenData> {
  const apiBaseUrl = requireEnv(process.env.EXPO_PUBLIC_API_URL, "EXPO_PUBLIC_API_URL");
  const response = await fetch(`${apiBaseUrl}/peer/matches/${matchId}/token`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  const json: ApiResponse<PeerTokenData> = await response.json();
  if (!response.ok || !json.success || !json.data) {
    throw new Error(json.error?.message || "Failed to generate LiveKit room token.");
  }
  return json.data;
}

export async function completePeerMatch(idToken: string, matchId: string): Promise<void> {
  const apiBaseUrl = requireEnv(process.env.EXPO_PUBLIC_API_URL, "EXPO_PUBLIC_API_URL");
  await fetch(`${apiBaseUrl}/peer/matches/${matchId}/complete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
}

export async function reportPeerPartner(
  idToken: string,
  matchId: string,
  reason: string,
  details?: string
): Promise<void> {
  const apiBaseUrl = requireEnv(process.env.EXPO_PUBLIC_API_URL, "EXPO_PUBLIC_API_URL");
  const response = await fetch(`${apiBaseUrl}/peer/matches/${matchId}/report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ reason, details }),
  });
  const json: ApiResponse<{ success: boolean }> = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json.error?.message || "Failed to submit report.");
  }
}

export async function blockPeerPartner(idToken: string, matchId: string): Promise<void> {
  const apiBaseUrl = requireEnv(process.env.EXPO_PUBLIC_API_URL, "EXPO_PUBLIC_API_URL");
  const response = await fetch(`${apiBaseUrl}/peer/matches/${matchId}/block`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  const json: ApiResponse<{ success: boolean }> = await response.json();
  if (!response.ok || !json.success) {
    throw new Error(json.error?.message || "Failed to block partner.");
  }
}
