export type CourseLesson = {
  id: string;
  module_id: string;
  title: string;
  estimated_minutes: number;
  status: 'not_started' | 'started' | 'completed';
  last_block: number;
  revision: number;
  percent: number;
  question_preview: string | null;
};

export type CourseProgressData = {
  enrolled: boolean;
  percent: number;
  completedLessons: number;
  totalLessons: number;
  estimatedMinutes: number;
  completed: boolean;
  lastLessonId: string | null;
  lessons: CourseLesson[];
};

export type Course = {
  id: string;
  title: string;
  description: string;
  slug: string;
  version_id: string;
  version: number;
  progress: CourseProgressData;
};

export type CourseDetail = {
  course: Pick<Course, 'id' | 'title' | 'description' | 'slug'>;
  version: { id: string; version: number; pass_score: number | null };
  modules: { id: string; title: string; lessons: CourseLesson[] }[];
  progress: CourseProgressData;
  engagement: {
    streakDays: number;
    achievements: { id: 'first-reflection' | 'five-lessons' | 'first-course'; title: string; description: string; unlocked: boolean }[];
  };
};

export type QuestionFeedbackData = {
  verdict: 'correct' | 'incorrect' | 'recorded';
  explanation: string;
};

export type Question = {
  id: string;
  type: 'single_choice' | 'multiple_choice' | 'reflection';
  prompt: string;
  feedback?: QuestionFeedbackData;
  options: { id: string; label: string }[];
};

export type Attempt = {
  id: string;
  revision: number;
  submitted_at: string | null;
  score: number | null;
  passed: number;
  questions?: Question[];
  answers?: { question_id: string; answer_json: string }[];
  statistics?: { correctQuestions: number; objectiveQuestions: number; reflectionsWritten: number };
};

export type LessonProgress = { revision: number; last_block: number; status: string };
export type Lesson = {
  id: string;
  title: string;
  versionId: string;
  blocks: { title: string; text: string }[];
  questions: Question[];
  progress: LessonProgress;
  attempt: Attempt | null;
  passScore: number | null;
  course: { id: string; title: string; slug: string; versionId: string; progress: CourseProgressData };
  previousLessonId: string | null;
  nextLessonId: string | null;
};
