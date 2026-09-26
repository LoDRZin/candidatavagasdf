// Limites por titular; mudanças exigem revisão da interface, exportação e cotas D1.
export const COLLECTION_LIMITS = {
  resumes: 100,
  applications: 500,
  eventsPerApplication: 1000,
  stories: 300,
  letters: 200,
  interviewsPerApplication: 20,
  questionsPerInterview: 50,
} as const;
