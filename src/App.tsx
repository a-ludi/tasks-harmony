import { Routes, Route } from 'react-router-dom';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <Routes>
        <Route path="/" element={<p className="text-xl font-semibold">Tasks Harmony</p>} />
      </Routes>
    </div>
  );
}
