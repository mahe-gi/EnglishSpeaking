export interface PracticeScenario {
  id: string;
  title: string;
  description: string;
  goal: "JOB_INTERVIEWS";
  careerStatuses: Array<"COLLEGE_STUDENT" | "JOB_SEEKER" | "WORKING_PROFESSIONAL">;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  category: "INTRODUCTION" | "PROJECT" | "BEHAVIORAL" | "SITUATIONAL";
  initialQuestion: string;
  focusAreas: string[];
}

export const PRACTICE_SCENARIOS: PracticeScenario[] = [
  {
    id: "tell-me-about-yourself",
    title: "Introduce Yourself",
    description: "Deliver a crisp, professional introduction highlighting your background, strengths, and goals.",
    goal: "JOB_INTERVIEWS",
    careerStatuses: ["COLLEGE_STUDENT", "JOB_SEEKER", "WORKING_PROFESSIONAL"],
    difficulty: "EASY",
    category: "INTRODUCTION",
    initialQuestion: "Tell me about yourself and what brings you to this interview today.",
    focusAreas: ["STRUCTURE", "CLARITY", "DELIVERY"],
  },
  {
    id: "recent-project-walkthrough",
    title: "Recent Project Walkthrough",
    description: "Explain a project you worked on, your specific role, and the measurable impact.",
    goal: "JOB_INTERVIEWS",
    careerStatuses: ["COLLEGE_STUDENT", "JOB_SEEKER", "WORKING_PROFESSIONAL"],
    difficulty: "EASY",
    category: "PROJECT",
    initialQuestion: "Walk me through a recent project you worked on. What was your role and what was the outcome?",
    focusAreas: ["STRUCTURE", "VOCABULARY", "CLARITY"],
  },
  {
    id: "why-should-we-hire-you",
    title: "Why Should We Hire You?",
    description: "Align your skills and enthusiasm with the value you bring to the organization.",
    goal: "JOB_INTERVIEWS",
    careerStatuses: ["COLLEGE_STUDENT", "JOB_SEEKER", "WORKING_PROFESSIONAL"],
    difficulty: "MEDIUM",
    category: "INTRODUCTION",
    initialQuestion: "Why should we hire you for this role over other candidates?",
    focusAreas: ["RELEVANCE", "CLARITY", "DELIVERY"],
  },
  {
    id: "key-strengths-and-impact",
    title: "Key Strengths & Impact",
    description: "Articulate your top strengths with concrete examples from past work.",
    goal: "JOB_INTERVIEWS",
    careerStatuses: ["COLLEGE_STUDENT", "JOB_SEEKER", "WORKING_PROFESSIONAL"],
    difficulty: "EASY",
    category: "BEHAVIORAL",
    initialQuestion: "What is your greatest professional strength, and can you share an example of when it helped you succeed?",
    focusAreas: ["STRUCTURE", "DELIVERY", "RELEVANCE"],
  },
  {
    id: "handling-a-challenge",
    title: "Overcoming a Challenge",
    description: "Describe a difficult situation, the specific action you took, and the resolution.",
    goal: "JOB_INTERVIEWS",
    careerStatuses: ["COLLEGE_STUDENT", "JOB_SEEKER", "WORKING_PROFESSIONAL"],
    difficulty: "MEDIUM",
    category: "BEHAVIORAL",
    initialQuestion: "Tell me about a difficult problem or obstacle you faced in your work or studies. How did you resolve it?",
    focusAreas: ["STRUCTURE", "CLARITY", "GRAMMAR"],
  },
  {
    id: "learning-from-a-mistake",
    title: "Learning from a Mistake",
    description: "Show accountability, problem-solving, and key learnings from a past error.",
    goal: "JOB_INTERVIEWS",
    careerStatuses: ["COLLEGE_STUDENT", "JOB_SEEKER", "WORKING_PROFESSIONAL"],
    difficulty: "MEDIUM",
    category: "BEHAVIORAL",
    initialQuestion: "Can you share an example of a mistake you made in a project or task, and what you learned from it?",
    focusAreas: ["STRUCTURE", "CLARITY", "DELIVERY"],
  },
  {
    id: "missed-deadline-communication",
    title: "Managing a Tight Deadline",
    description: "Explain how you manage time and communicate proactively when facing tight deadlines.",
    goal: "JOB_INTERVIEWS",
    careerStatuses: ["COLLEGE_STUDENT", "JOB_SEEKER", "WORKING_PROFESSIONAL"],
    difficulty: "MEDIUM",
    category: "SITUATIONAL",
    initialQuestion: "Imagine you realize you might miss an upcoming project deadline. How would you handle and communicate the situation?",
    focusAreas: ["STRUCTURE", "VOCABULARY", "RELEVANCE"],
  },
  {
    id: "team-disagreement",
    title: "Resolving a Disagreement",
    description: "Demonstrate empathy, constructive communication, and professional conflict resolution.",
    goal: "JOB_INTERVIEWS",
    careerStatuses: ["COLLEGE_STUDENT", "JOB_SEEKER", "WORKING_PROFESSIONAL"],
    difficulty: "HARD",
    category: "BEHAVIORAL",
    initialQuestion: "Tell me about a time you had a difference of opinion with a team member or classmate. How did you handle it?",
    focusAreas: ["CLARITY", "GRAMMAR", "RELEVANCE"],
  },
  {
    id: "why-this-role",
    title: "Why This Role?",
    description: "Demonstrate domain curiosity, career motivation, and company alignment.",
    goal: "JOB_INTERVIEWS",
    careerStatuses: ["COLLEGE_STUDENT", "JOB_SEEKER", "WORKING_PROFESSIONAL"],
    difficulty: "EASY",
    category: "INTRODUCTION",
    initialQuestion: "What motivated you to apply for this specific role, and what are you hoping to achieve here?",
    focusAreas: ["RELEVANCE", "DELIVERY", "CLARITY"],
  },
  {
    id: "area-for-improvement",
    title: "Areas for Improvement",
    description: "Discuss a genuine weakness with self-awareness and active steps you take to improve.",
    goal: "JOB_INTERVIEWS",
    careerStatuses: ["COLLEGE_STUDENT", "JOB_SEEKER", "WORKING_PROFESSIONAL"],
    difficulty: "MEDIUM",
    category: "BEHAVIORAL",
    initialQuestion: "What is an area or skill you are currently working to improve, and what steps are you taking?",
    focusAreas: ["CLARITY", "DELIVERY", "GRAMMAR"],
  },
  {
    id: "explaining-technical-concepts",
    title: "Explaining Technical Concepts Simply",
    description: "Simplify complex technical topics for cross-functional stakeholders.",
    goal: "JOB_INTERVIEWS",
    careerStatuses: ["COLLEGE_STUDENT", "JOB_SEEKER", "WORKING_PROFESSIONAL"],
    difficulty: "HARD",
    category: "SITUATIONAL",
    initialQuestion: "Explain a complex technical concept or project feature as if you were speaking to a non-technical manager.",
    focusAreas: ["CLARITY", "STRUCTURE", "VOCABULARY"],
  },
  {
    id: "quick-learning-experience",
    title: "Fast-Paced Learning",
    description: "Highlight adaptability, resourcefulness, and speed in picking up new technologies or workflows.",
    goal: "JOB_INTERVIEWS",
    careerStatuses: ["COLLEGE_STUDENT", "JOB_SEEKER", "WORKING_PROFESSIONAL"],
    difficulty: "EASY",
    category: "BEHAVIORAL",
    initialQuestion: "Tell me about a time you had to learn a completely new technology or process under tight time constraints.",
    focusAreas: ["STRUCTURE", "DELIVERY", "CLARITY"],
  },
];

export function getScenarioById(id: string): PracticeScenario | undefined {
  return PRACTICE_SCENARIOS.find((s) => s.id === id);
}

export function selectScenarioForUser(
  careerStatus?: string | null,
  recentScenarioId?: string | null
): PracticeScenario {
  const normalizedStatus =
    careerStatus === "COLLEGE_STUDENT" ||
    careerStatus === "JOB_SEEKER" ||
    careerStatus === "WORKING_PROFESSIONAL"
      ? careerStatus
      : "JOB_SEEKER";

  const matchingScenarios = PRACTICE_SCENARIOS.filter(
    (s) => s.careerStatuses.includes(normalizedStatus) && s.id !== recentScenarioId
  );

  const candidates = matchingScenarios.length > 0 ? matchingScenarios : PRACTICE_SCENARIOS;
  const randomIndex = Math.floor(Math.random() * candidates.length);
  return candidates[randomIndex] || PRACTICE_SCENARIOS[0]!;
}
