import { MotionConfig } from 'framer-motion';
import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Loading } from './components/ui';

// Route-level code splitting: /demo never loads the Firebase chunk.
const JoinPage = lazy(() => import('./pages/JoinPage'));
const PlayPage = lazy(() => import('./pages/PlayPage'));
const RejoinPage = lazy(() => import('./pages/RejoinPage'));
const MainLanding = lazy(() => import('./pages/MainLanding'));
const MainRoom = lazy(() => import('./pages/MainRoom'));
const DemoPage = lazy(() => import('./demo/DemoPage'));

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <Suspense fallback={<div className="cork min-h-screen"><Loading /></div>}>
          <Routes>
            <Route path="/" element={<JoinPage />} />
            <Route path="/play/:roomId" element={<PlayPage />} />
            <Route path="/rejoin/:roomId" element={<RejoinPage />} />
            <Route path="/main" element={<MainLanding />} />
            <Route path="/main/:roomId" element={<MainRoom />} />
            <Route path="/demo" element={<DemoPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </MotionConfig>
  );
}
