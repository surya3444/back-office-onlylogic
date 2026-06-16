import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ShieldAlert, LogOut } from "lucide-react";

import { AuthProvider, useAuth } from "./lib/auth-context";
import { Loader } from "./components/ui";
import type { Action } from "./lib/permissions";

import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Leads from "./pages/Leads";
import Login from "./pages/Login";
import Projects from "./pages/Projects";
import ProjectDetail from "./pages/ProjectDetail";
import CRM from "./pages/CRM";
import ProductsAdmin from "./pages/ProductsAdmin";
import LeadPipeline from "./pages/LeadPipeline";
import FollowUps from "./pages/FollowUps";
import Settings from "./pages/Settings";
import Roles from "./pages/Roles";
import Members from "./pages/Members";
import AuditLog from "./pages/AuditLog";
import Profile from "./pages/Profile";

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

function Shell() {
  const { access } = useAuth();
  return (
    <BrowserRouter>
      {access === "loading" ? (
        <div className="h-screen bg-[#FCFBF8] flex items-center justify-center"><Loader label="Opening workspace" sub="Checking your access" /></div>
      ) : access === "noauth" ? (
        <Login />
      ) : access === "disabled" ? (
        <AccessNotice title="Account disabled" message="Your access has been turned off. Please contact an administrator." />
      ) : access === "noaccess" ? (
        <AccessNotice title="No access yet" message="Your account isn't part of this workspace. Ask an administrator to add you as a member." />
      ) : (
        <AppRoutes />
      )}
    </BrowserRouter>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Guard m="dashboard"><Dashboard /></Guard>} />
        <Route path="leads" element={<Guard m="leads"><Leads /></Guard>} />
        <Route path="pipeline" element={<Guard m="pipeline"><LeadPipeline /></Guard>} />
        <Route path="followups" element={<Guard m="followups"><FollowUps /></Guard>} />
        <Route path="crm" element={<Guard m="crm"><CRM /></Guard>} />
        <Route path="projects" element={<Guard m="projects"><Projects /></Guard>} />
        <Route path="projects/:id" element={<Guard m="projects"><ProjectDetail /></Guard>} />
        <Route path="products" element={<Guard m="products"><ProductsAdmin /></Guard>} />
        <Route path="settings" element={<Guard m="settings"><Settings /></Guard>} />
        <Route path="profile" element={<Profile />} />
        <Route path="roles" element={<AdminGuard><Roles /></AdminGuard>} />
        <Route path="members" element={<AdminGuard><Members /></AdminGuard>} />
        <Route path="activity" element={<AdminGuard><AuditLog /></AdminGuard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function Guard({ m, action = "read", children }: { m: string; action?: Action; children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can(m, action)) return <DeniedPanel />;
  return <>{children}</>;
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <DeniedPanel />;
  return <>{children}</>;
}

function DeniedPanel() {
  return (
    <div className="font-['Poppins',sans-serif] py-20 flex flex-col items-center text-center animate-fade-in">
      <div className="w-16 h-16 rounded-2xl bg-[#FFEDE9] text-[#FF5C49] flex items-center justify-center mb-4"><ShieldAlert size={28} /></div>
      <h2 className="text-[20px] font-bold text-[#13182B] mb-1.5">You don't have access to this section</h2>
      <p className="text-[#6B7283] text-[15px] max-w-sm">Your role doesn't include this area. Contact an administrator if you think this is a mistake.</p>
    </div>
  );
}

function AccessNotice({ title, message }: { title: string; message: string }) {
  const { signOutNow, user } = useAuth();
  return (
    <div className="min-h-screen bg-[#FCFBF8] flex flex-col items-center justify-center p-6 font-['Poppins',sans-serif] text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#FFEDE9] text-[#FF5C49] flex items-center justify-center mb-5"><ShieldAlert size={30} /></div>
      <h1 className="text-[24px] font-bold text-[#13182B] mb-2">{title}</h1>
      <p className="text-[#6B7283] text-[15px] max-w-md mb-2">{message}</p>
      {user?.email && <p className="font-mono text-[12.5px] text-[#9AA0AD] mb-6">Signed in as {user.email}</p>}
      <button onClick={signOutNow} className="flex items-center gap-2 bg-[#13182B] text-white px-5 py-2.5 rounded-xl font-semibold text-[14.5px] hover:-translate-y-0.5 transition-transform shadow-md"><LogOut size={16} /> Sign out</button>
    </div>
  );
}
