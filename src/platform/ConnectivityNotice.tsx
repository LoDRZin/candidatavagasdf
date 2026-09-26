import { useEffect, useState } from 'react';

export function ConnectivityNotice() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const onOnline = () => setOnline(true), onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);
  if (online) return null;
  return <aside className="connectivity-notice is-offline" role="status"><span>Você está sem conexão. Editor, guias e ferramentas locais podem funcionar; conta, candidaturas, cursos e IA precisam de internet.</span></aside>;
}
