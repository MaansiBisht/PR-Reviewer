import { Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ReviewPage from './pages/ReviewPage';
import SettingsPage from './pages/SettingsPage';
import HistoryPage from './pages/HistoryPage';
import AnalyticsPage from './pages/AnalyticsPage';

function App() {
  return (
    <ThemeProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/review/:id" element={<ReviewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Layout>
    </ThemeProvider>
  );
}

export default App;
