import { handleAuth } from './auth';
import { handleCourses, handleAdminCourses } from './courses';
import { handleResumes } from './resumes';
import { handleStructure } from './structure';
import { handleCareer } from './career';
import { handleMaterials } from './materials';
import { handleFeedback } from './feedback';
import { handleInterviews } from './interviews';
import { handleReminders } from './reminders';
import { handleUsage } from './usage';
import { handleAdminUsers } from './admin-users';
import { handleChatHistory } from './chat-history';
import { HttpError, json, mutation, type PlatformEnv } from './http';
export async function handlePlatform(request: Request, env: PlatformEnv): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const matches = /^\/api\/(auth(?:\/|$)|account(?:\/|$)|courses(?:\/|$)|lessons\/|attempts\/|me\/(?:learning|career-profile|reminder-preferences|usage)|reminders(?:\/|$)|applications(?:\/|$)|career-stories(?:\/|$)|cover-letters(?:\/|$)|interviews(?:\/|$)|interview-questions(?:\/|$)|chat-conversations(?:\/|$)|feedback$|resumes(?:\/|$)|ai\/resume\/structure|admin\/(?:courses|users(?:\/|$)|usage$))/.test(path);
  if (!matches) return null;
  try {
    mutation(request, env);
    if (path.startsWith('/api/auth/') || path.startsWith('/api/account')) return await handleAuth(request, env);
    if (path === '/api/feedback') return await handleFeedback(request, env);
    if (path === '/api/me/usage') return await handleUsage(request, env);
    if (path.startsWith('/api/chat-conversations')) return await handleChatHistory(request, env);
    if (path === '/api/admin/usage' || path.startsWith('/api/admin/users')) return await handleAdminUsers(request, env);
    if (path === '/api/reminders' || path === '/api/me/reminder-preferences') return await handleReminders(request, env);
    if (path.startsWith('/api/interviews') || path.startsWith('/api/interview-questions')) return await handleInterviews(request, env);
    if (path.startsWith('/api/admin/courses')) return await handleAdminCourses(request, env);
    if (path.startsWith('/api/career-stories') || path.startsWith('/api/cover-letters') || /^\/api\/applications\/[^/]+\/stories(?:\/|$)/.test(path)) return await handleMaterials(request, env);
    if (path === '/api/me/career-profile' || path.startsWith('/api/applications')) return await handleCareer(request, env);
    if (path.startsWith('/api/resumes')) return await handleResumes(request, env);
    if (path === '/api/ai/resume/structure') return await handleStructure(request, env);
    return await handleCourses(request, env);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: { code: error.code, message: error.message } }, error.status);
    // No error object: third-party errors may contain credentials or submitted data.
    console.error(JSON.stringify({ event: 'platform_request_failed', route: path.split('/').slice(0, 3).join('/') }));
    return json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Não foi possível concluir. Tente novamente em instantes.' } }, 503);
  }
}
