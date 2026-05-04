import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { pageLoaders } from "@/lib/route-preload";

const Index = lazy(pageLoaders.index);
const NotFound = lazy(pageLoaders.notFound);
const Auth = lazy(pageLoaders.auth);
const Projects = lazy(pageLoaders.projects);
const Step1Company = lazy(pageLoaders.step1Company);
const Step2Product = lazy(pageLoaders.step2Product);
const Step3Countries = lazy(pageLoaders.step3Countries);
const Step4CountryDetail = lazy(pageLoaders.step4CountryDetail);
const Step6Report = lazy(pageLoaders.step6Report);
const DataSources = lazy(pageLoaders.dataSources);
const KcRecallLookup = lazy(pageLoaders.kcRecallLookup);

const queryClient = new QueryClient();

function DeprecatedProjectSafetyRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={id ? `/projects/${id}/countries` : "/projects"} replace />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">화면을 불러오는 중...</div>}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/projects/:id/company" element={<Step1Company />} />
            <Route path="/projects/:id/product" element={<Step2Product />} />
            <Route path="/projects/:id/countries" element={<Step3Countries />} />
            <Route path="/projects/:id/countries/:cc" element={<Step4CountryDetail />} />
            <Route path="/projects/:id/safety" element={<DeprecatedProjectSafetyRedirect />} />
            <Route path="/projects/:id/report" element={<Step6Report />} />
            <Route path="/data-sources" element={<DataSources />} />
            <Route path="/kc-recall" element={<KcRecallLookup />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
